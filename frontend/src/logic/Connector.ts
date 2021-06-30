import {io as ioClient, Socket} from 'socket.io-client';
import {ListSubscribable, ObjectSubscribable} from "./Subscribable";
import {OperationType, RequestType, ServerStatusType} from "../../../common/SharedTypes";
import {Brand} from "./Brand";

// Module Configuration
const DEBUG_CONNECTION = false;
const API_FORCE_REMOTE_HOST = false;
const API_HOST = (typeof window !== "undefined") ? (window.location.hostname || 'localhost') : 'localhost';
const API_PORT = '1996';
const API_PATH_SIO = '/api/socket';

const log = DEBUG_CONNECTION ? console.log : () => null;
const err = console.error;

// managed by the client
export interface ConnectionStatus {
  connected: boolean,
  errorMessage: null | string,
  serverStatus: ServerStatusType,
}


class Connector {
  // UI-subscribable status
  public readonly connection = new ObjectSubscribable<ConnectionStatus>({
    connected: false,
    errorMessage: null,
    serverStatus: undefined,
  });
  public readonly operationsList = new ListSubscribable<OperationType>([]);

  // private fields
  private readonly apiHostUri: string;
  private serverSocket?: Socket = null;

  constructor() {
    this.apiHostUri = (API_HOST === 'localhost') ? `http://${API_HOST}:${API_PORT}` : `https://${API_HOST}`;
    if (API_FORCE_REMOTE_HOST) this.apiHostUri = Brand.AppURL;
    this.connectToServer();
  }

  // misc functions

  restPath = (path: string) => this.apiHostUri + (path.startsWith('/') ? '' : '/') + path;

  currentSocketUid: () => (string | null) = () => this.serverSocket && this.serverSocket.id;

  // -> server commands

  sendNewOperation(request: RequestType) {
    if (!this.serverSocket || !this.serverSocket.connected) return err(`Connector.sendNewOperation: disconnected`);
    this.serverSocket.emit('@ghk/op/add', request);
  }

  sendDeleteOperation(uid: string) {
    if (!this.serverSocket || !this.serverSocket.connected) return err(`Connector.sendDeleteOperation: disconnected`);
    this.serverSocket.emit('@ghk/op/del', uid);
  }

  sendAdminOperation(operationName: string) {
    if (!this.serverSocket || !this.serverSocket.connected) return err(`Connector.sendSpecialOperation: disconnected`);
    this.serverSocket.emit('@ghk/op/admin', operationName);
  }


  /// Private ///

  private connectToServer() {
    // disconnect and reset the connection state
    this.disconnect();
    this.connection.partialUpdate({connected: false, errorMessage: null});

    // create a stable websocket connection to the server
    if (DEBUG_CONNECTION) log(`Connector: connecting to: ${this.apiHostUri}`);
    this.serverSocket = ioClient(this.apiHostUri, {
      path: API_PATH_SIO,
      transports: ['websocket']
    });

    // socket connection/disconnection events
    this.serverSocket.on('connect', () => this.connection.partialUpdate({connected: true, errorMessage: null}));
    this.serverSocket.on('disconnect', () => this.connection.partialUpdate({connected: false, errorMessage: null}));
    this.serverSocket.on('connect_error', error => this.connection.partialUpdate({
      connected: false,
      errorMessage: (error || '((unknown))').toString(),
    }));
    if (DEBUG_CONNECTION)
      this.serverSocket.onAny((name, param1) => console.log(`Connector: '${name}'`, param1));

    // <- server messages
    this.serverSocket.on('@ghk:message', v => console.log('message from the server:', v));
    this.serverSocket.on('@ghk:status', serverStatus =>
      this.connection.partialUpdate({serverStatus: serverStatus}));
    this.serverSocket.on('@ghk:ops-list', (operationsList: OperationType[]) =>
      this.operationsList.replaceListContent(operationsList));
    this.serverSocket.on('@ghk:op-update', (operation: OperationType) =>
      this.operationsList.updateListItem(operation, item => item.uid === operation.uid));
  }

  private disconnect = () => this.serverSocket && this.serverSocket.disconnect();

}

export const connector = new Connector();