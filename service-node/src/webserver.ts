/**
 * This web server performs analysis requested by any client, and returns the results.
 */
import {createServer, Server} from "http";
import express, {Express, Request as ExpressRequest, Response as ExpressResponse} from "express";
import axios from "axios";
import cors from "cors";
import {generateId} from "base64id";

import {RedisCache} from "./utils/RedisCache";
import {ClientCommProxyType, ServerConnectionEventsType, SocketApiServer} from "./utils/SocketApiServer";
import {err, log, unixTimeNow} from "./utils/utils";
import {OperationType, ProgressType, RequestType, ServerStatusType} from "../../common/SharedTypes";


// Module Configuration - API_HOST, API_PORT are overridable by the Environment
const PUBLIC_APP_URL = 'https://www.stardust.fyi';
// where to find Redis
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');
// where to expose this service
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = parseInt(process.env.API_PORT || '1996');
const API_ADMIN_IPV4 = (process.env.ADMIN_IPV4 || 'unset').trim();
const API_PATH_SIO = '/api/socket';


// increment every time fields change in the PersistentStatusType (or descendents, such as OperationType)
const DATA_VERSION = 10;
const KEY_BACKEND_STATE = 'state:backend';


// Cors configuration, used by both Express (for POST) and Socket.IO
const CORS_CONFIG = {
  origin: [                   // limit CORS (default: enabled to *)
    `${PUBLIC_APP_URL}:443`,  // requests from the same domain
    'http://localhost:3000',  // requests from a localhost 'react serve'
  ],
  methods: ["GET", "POST"],
};


class Main implements ServerConnectionEventsType {
  public readonly socketApiServer: SocketApiServer;
  private readonly redisCache: RedisCache;

  // server-side state
  private restApiConcurrent: number = 0;
  private readonly operationsList: OperationType[] = []; // smart-persisted
  private readonly serverStatus: ServerStatusType = {
    clientsCount: 0,
    isRunning: false,
    opQueueFull: false,
  }

  /// Connection/Disconnection Events ///

  constructor(expressApp: Express, httpServer: Server) {
    this.socketApiServer = new SocketApiServer(API_PATH_SIO, CORS_CONFIG, httpServer, this as ServerConnectionEventsType);
    this.redisCache = new RedisCache('stardust', REDIS_HOST, REDIS_PORT);

    // add GET API responders
    expressApp.use(cors(CORS_CONFIG));
    expressApp.disable('x-powered-by'); // enable CORS for GET and POST, from the same domain and standard React/NextJs setups
    expressApp.get('/api/get/csv:*', (req: ExpressRequest, res: ExpressResponse) => this.apiRedisFetch<string>('csv:', req, res));
    expressApp.get('*', (req: ExpressRequest, res: ExpressResponse) => this.apiDelayDiscovery(req, res));

    // add POST responders (with JSON bodies)
    expressApp.use(express.json());
    expressApp.post('/api/example/post', (req: ExpressRequest, res: ExpressResponse) => this.examplePOST(req, res));

    // restore the former configuration, and continue the queue in case any op was pending
    this.restoreState().then(() => this.startNextOperation());
  }


  /// Websocket Connection/Disconnection Events ///

  clientConnected(socketUid: string, clientIpv4: string, clientComm: ClientCommProxyType): void {
    const isAdmin = (): boolean => clientIpv4 === API_ADMIN_IPV4;

    // receive client messages
    clientComm.onClientMessage('@ghk/op/add', conf => this.queueOperation(conf, socketUid, clientComm, false));
    clientComm.onClientMessage('@ghk/op/del', uid => {
      if (!isAdmin()) return clientComm.sendToClient('@ghk:message', `Operation cannot be deleted.`);
      this.deleteOperation(uid, clientComm);
    });
    clientComm.onClientMessage('@ghk/op/admin', operationName => {
      if (!isAdmin() || !this.adminOperation(operationName, socketUid, clientComm))
        return clientComm.sendToClient('@ghk:message', `Admin operation not permitted`);
    });

    // -> client: full status
    this.updateServerStatus({clientsCount: this.serverStatus.clientsCount + 1});
    clientComm.sendToClient('@ghk:ops-list', this.operationsList);
  }

  clientDisconnected(socketUid: string, reason: any): void {
    // -> clients: one disconnected
    this.updateServerStatus({clientsCount: this.serverStatus.clientsCount - 1});
  }


  /// REST API ///


  /// TEMP - LAZY ///

  private async examplePOST(req: ExpressRequest, res: ExpressResponse) {
    let inputRequest: { text: string } = req.body;
    axios.post(`https://some api...`, {text: inputRequest.text,},
      {
        headers: {
          // 'X-Api-Key': ...,
          // 'Accept': 'audio/mpeg',
          // 'Content-Type': 'application/json',
        },
        // responseType: 'arraybuffer',
        timeout: 2 * 60 * 1000,
      })
      .then(_ => {
        // if (response.status === 200 && response.data instanceof ...) {
        //   const audioData: Buffer = response.data;
        //   res.type('audio/mpeg').send(audioData);
        // } else {
        //   log(`lazyTTS: received a non-200 answer (${response.status})`);
        //   res.status(401).json({error: 'non-200 answer', code: response.status});
        // }
      })
      .catch(error => {
        // err(`lazyTTS: POST error`, error);
        res.status(400).json({error: error, code: 400});
      });
  }


  // return an object from the database as a JSON HTTP
  private apiRedisFetch<T>(keyPrefix: string, req: ExpressRequest, res: ExpressResponse, minLen: number = 20, maxLen: number = 30) {
    this._withApiDelay(500, async () => {
      // extract the db key from the url
      const keyIndex = req.path.indexOf(keyPrefix);
      const dbKey = req.path.slice(keyIndex);
      if (keyIndex === -1 || dbKey.length < minLen || dbKey.length > maxLen) {
        err(`apiRedisFetch: wrong key in "${req.path}"`);
        return res.send({error: 400});
      }

      // associate to a local object
      const opUid = dbKey.slice(keyPrefix.length).split('.')[0];
      const operation = this.operationsList.find(op => op.uid === opUid);
      if (!operation) {
        err(`apiRedisFetch: could not find operation with UID: "${opUid}" in our list of ${this.operationsList.length} operations`);
        return res.send({error: 400});
      }

      // retrieve data from the DB
      const object: T = await this.redisCache.getJSON<T>(dbKey);  // key requested by the REST call
      if (!object) {
        err(`apiRedisFetch: could not retrieve object for op "${operation.uid}", key "${dbKey}"`);
        return res.send({error: 400});
      }

      // Heuristics for the type
      if (typeof object === 'string' && object.indexOf('\n') !== -1) {
        // for CSV raw strings, allow the browser to download the file
        const req = operation.request;
        res.setHeader('content-type', 'text/csv');
        res.attachment(`kpis-${req.opQuery.replace('/', '_')}-${req.opCode}-${req.limitStarsPerUser}spu.csv`);
      } else {
        // send object as json
        res.setHeader('content-type', 'application/json');
      }
      res.send(object);
    });
  }

  private apiDelayDiscovery(_: ExpressRequest, res: ExpressResponse) {
    return this._withApiDelay(1000, () => res.send({error: 404}));
  }

  private _withApiDelay = (delayMs: number, apiWorker: () => void) => {
    // force a delay, to avoid hammering on the API (1s per pending call, including the first)
    this.restApiConcurrent++;
    new Promise(resolve => setTimeout(resolve, this.restApiConcurrent * delayMs))
      .then(() => apiWorker())
      .finally(() => this.restApiConcurrent--);
  };


  /// Client Operations ///

  private canQueueNewOps = () => {
    const pendingOpsCount = () => this.operationsList.filter(op => op.progress.state !== 2).length;
    return pendingOpsCount() < 5;
  }

  private queueOperation(req: RequestType, socketUid: string, clientComm: ClientCommProxyType, ignoreQueueLimit: boolean) {
    if (!ignoreQueueLimit && !this.canQueueNewOps())
      return clientComm.sendToClient('@ghk:message', 'Cannot add more. Wait for the current queue to clear.')

    // validate the input object
    if (!req.opQuery || typeof req.opCode !== 'number' || typeof req.opQuery !== "string")
      return clientComm.sendToClient('@ghk:message', 'Error with the request.');
    req.maxResults = Math.max(1, Math.min(parseInt(req.maxResults as unknown as string), 100000));
    req.limitStarsPerUser = Math.min(parseInt(req.limitStarsPerUser as unknown as string), 400);

    // create a new UID
    let uid = null;
    const existingUIDs: string[] = this.operationsList.map(op => op.uid);
    while (uid === null || existingUIDs.includes(uid)) uid = generateId();

    // create the new operation
    this.operationsList.unshift({
      uid: uid,
      request: req,
      progress: {state: 0, t_q: unixTimeNow(), t_s: 0, t_e: 0, p_i: 0, p_c: 0, p: 0},
      funnel: [],
      filters: [],
      outputs: [],
      reqByUid: socketUid,
    });
    this.notifyListChanged();

    // update the queue status (shall implement update-on-change only)
    this.updateServerStatus({opQueueFull: !this.canQueueNewOps()});

    // save the queue
    this.persistStateAsync();

    // start the operation if not busy
    if (!this.serverStatus.isRunning)
      this.startNextOperation();
  }

  private deleteOperation(uid: string, clientComm: ClientCommProxyType) {
    const operationIndex = this.operationsList.findIndex(op => op.uid === uid);
    if (operationIndex === -1)
      return clientComm.sendToClient('@ghk:message', `Operation cannot be deleted. Not found.`);
    const operation = this.operationsList[operationIndex];
    if (operation.progress.state === 1)
      return clientComm.sendToClient('@ghk:message', `Operation cannot be deleted. In progress.`);

    // remove the operation
    this.operationsList.splice(operationIndex, 1);
    this.notifyListChanged();

    // save the queue
    this.persistStateAsync();
  }

  private adminOperation(operationName: string, socketUid: string, clientComm: ClientCommProxyType): boolean {
    switch (operationName) {
      case 'reseed':
        const requests: RequestType[] = [];
        for (let i = this.operationsList.length - 1; i >= 0; i--) {
          // skip in-progress operations (being worked on by some async already)
          const operation = this.operationsList[i];
          if (operation.progress.state === 1)
            continue;
          // save the request and delete the operation
          requests.push(operation.request);
          this.deleteOperation(operation.uid, clientComm);
        }
        // re-submit the requests in the same order
        for (let request of requests) {
          // skip starrings for all
          // request.starsHistory = false;
          this.queueOperation(request, socketUid, clientComm, true);
        }
        return true;

      default:
        err(`adminOperation: ${operationName} not supported`);
        return false;
    }
  }

  private startNextOperation() {
    if (this.serverStatus.isRunning)
      return err('startNextOperation: already running something else. FIX THIS');

    // find the next operation to start (reversing for FIFO)
    const operation = this.operationsList.slice().reverse().find(op => op.progress.state === 0);
    if (!operation)
      return log(`startNextOperation: no more operations to be started in the queue right now (${this.operationsList.length} total)`);

    // server: notify running
    this.updateServerStatus({isRunning: true});

    // for finding the time elapsed
    // const startTime = unixTimeNow();

    // 4 callbacks invokes asynchronously after the async operation is started
    /*const onProgressUpdate = (update: Partial<ProgressType>) => {
      Object.assign(operation.progress, update);
      this.notifyOperationChanged(operation);
    }
    const onAddFunnel = (entry: FunnelType) => {
      operation.funnel.push(entry);
      this.notifyOperationChanged(operation);
    }
    const onAddFilters = (filters: string[]) => {
      operation.filters.push(...filters);
      this.notifyOperationChanged(operation);
    }
    const onOutputAsync = async (phase: PhaseType, data: object | object[]): Promise<any> => {
      // choose what to save and how to transform it
      let key = null;
      let csvConvert = false;
      if (phase === PhaseType.TopicsStats) {
        key = `topics:${operation.uid}`;
      } else if (phase === PhaseType.Stats) {
        key = `csv:${operation.uid}.${operation.outputs.length}`;
        csvConvert = true;
      } else
        return;

      // convert to CSV if required
      if (csvConvert) {
        // data comes in Array formats (and not empty)
        if (!Array.isArray(data) || data.length < 1) {
          operation.progress.error = `Insufficient data or other data issue (${phase})`;
          return this.notifyOperationChanged(operation);
        }

        // save to db
        const csvContents: string = (new JSON_To_CSV_Parser()).parse(data);
        await this.redisCache.setPersistentJSON<string>(key, csvContents);

        // add an 'output' to the operation
        operation.outputs.push({
          format: "csv-stats",
          rows: data.length,
          cols: Object.keys(data[0]).length,
          size: csvContents.length,
          key: key,
        });
        this.notifyOperationChanged(operation);
        log(`\nCSV of phase ${phase} saved to db as: '${key}'. Added operation output:`, operation.outputs[operation.outputs.length - 1]);
        return;
      }

      // save to DB, not adding as an 'output'
      await this.redisCache.setPersistentJSON<object | object[]>(key, data);
      log(`\nOutput of phase ${phase} saved to db as: '${key}'`);
    };
    const onFulfilled = () => {
      log(`\nAnalysis of '${operation.request.opQuery}' complete in ${unixTimeNow() - startTime} seconds`);
    };
    const onRejected = (reason: any) => {
      err(`\nERROR: Analysis of '${operation.request.opQuery}' FAILED after ${unixTimeNow() - startTime} seconds, because:`, reason);
      operation.progress.error = (reason || '(unknown)').toString();
    };
    const andFinally = () => {
      // operation: done & stopped
      operation.progress.state = 2;
      operation.progress.t_e = unixTimeNow();
      this.notifyOperationChanged(operation);

      // save the queue
      this.persistStateAsync();

      // server: notify not running
      this.updateServerStatus({isRunning: false, opQueueFull: !this.canQueueNewOps()});

      // start another operation (if there's any in line)
      this.startNextOperation();
    };*/

    // long-lasting function (up to a day)
    // this.gitHubAnalyzer.analyzeAsync(operation.request, {
    //   updateProgress: onProgressUpdate,
    //   addFunnel: onAddFunnel,
    //   addFilters: onAddFilters,
    //   addOutput: onOutputAsync,
    // })
    //   .then(onFulfilled)
    //   .catch(onRejected)
    //   .finally(andFinally);
  }


  /// State Persistence ///

  private async restoreState() {
    const state = await this.redisCache.getJSON<PersistentStatusType>(KEY_BACKEND_STATE);
    if (!state)
      return;

    // check the version, abandon if different
    if (state.dataVersion !== DATA_VERSION)
      return err(`Restoring State from version ${state.dataVersion} data, while we support version ${DATA_VERSION}. Skipped.`);

    // TEMP patches
    state.operationsList.forEach(op => {
      // when renamed (and negated) omitStarHistory into starsHistory
      if (op.request && op.request.hasOwnProperty('omitStarHistory') && !op.request.hasOwnProperty('starsHistory')) {
        op.request.starsHistory = !(op.request['omitStarHistory'] === true);
        delete op.request['omitStarHistory'];
      }
    });

    // restore Operations List
    this.operationsList.length = 0;
    for (let operation of state.operationsList) {
      // if the operation was in progress, reset the progress
      if (operation.progress.state == 1) {
        const resetProgress: Partial<ProgressType> = {state: 0, t_s: 0, p_i: 0, p: 0, error: undefined};
        Object.assign(operation.progress, resetProgress);
      }
      this.operationsList.push(operation);
    }
  }

  private persistStateAsync(): void {
    const state: PersistentStatusType = {
      dataVersion: DATA_VERSION,
      operationsList: this.operationsList,
    };
    this.redisCache.setPersistentJSON<PersistentStatusType>(KEY_BACKEND_STATE, state).then(() => {
      // ignore, as we save asynchronously
    });
  }


  /// Other Private ///

  private notifyListChanged = () => this.socketApiServer.sendAll('@ghk:ops-list', this.operationsList);
  // private notifyOperationChanged = (operation: OperationType) => this.socketSendAll('@ghk:op-update', operation);
  private updateServerStatus = (update: Partial<ServerStatusType>) => this.updateAndNotify(this.serverStatus, '@ghk:status', update);

  private updateAndNotify = <T>(target: T, messageName: string, update: Partial<T>): void => {
    Object.assign(target, update);
    this.socketApiServer.sendAll(messageName, target);
  }
}

interface PersistentStatusType {
  dataVersion: number,
  operationsList: OperationType[],
}

// utility function
const printAppRoutes = (appName, httpServer, expressApp, socketIO) => {
  const host = httpServer.address().address;
  const port = httpServer.address().port;
  // noinspection HttpUrlsUsage
  const base = `http://${host}:${port}`;
  log(`${appName} running on '${base}'. Routes:`);
  if (socketIO)
    log(" - [S.IO] " + socketIO.path() + " (" + base + socketIO.path() + "/, send client js: " + socketIO.serveClient() + ")");
  if (expressApp && expressApp._router)
    expressApp._router.stack.forEach(r => {
      if (r.route && r.route.path) {
        const methods = Object.keys(r.route.methods).join(", ");
        log(" - [" + methods.toUpperCase() + " ] " + r.route.path + " (" + base + r.route.path + ")");
      }
    });
  log();
};


/** main logic **/

// Add segfault handler, to print some sort of backtrace in case of issues
const SegfaultHandler = require('segfault-handler');
SegfaultHandler.registerHandler("crash.log");

// Server for Socket.IO and REST calls
const expressApp = express();
const httpServer: Server = createServer(expressApp);

const main = new Main(expressApp, httpServer);

httpServer.listen(API_PORT, API_HOST, () =>
  printAppRoutes('stardust-api', httpServer, expressApp, main.socketApiServer.getSocketIoServer()));
