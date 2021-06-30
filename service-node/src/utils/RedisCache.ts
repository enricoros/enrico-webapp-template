/**
 * This file interfaces with Redis and provides a caching function for JS objects.
 * If the requested object ID is missing, or the TTL is expired, the Retrieval function
 * is used to update the cache.
 *
 */

import {createClient as createRedisClient, Commands as RedisCommands, RedisClient} from 'redis';
import {promisify} from "util";


// The following code replaces 'async-redis', and 'redis-commands', which use an outdated redis and have security issues
type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
type RedisWithoutCommands = Omit<RedisClient, keyof RedisCommands<boolean>>;

interface PromisifiedRedis extends RedisWithoutCommands, RedisCommands<Promise<any>> {
}

function makeRedisAsync(client: RedisClient): PromisifiedRedis {
  // noinspection SpellCheckingInspection
  const redisCommands = [
    'acl', 'append', 'asking', 'auth', 'bgrewriteaof', 'bgsave', 'bitcount', 'bitfield', 'bitfield_ro', 'bitop', 'bitpos', 'blmove',
    'blpop', 'brpop', 'brpoplpush', 'bzpopmax', 'bzpopmin', 'client', 'cluster', 'command', 'config', 'copy', 'dbsize', 'debug', 'decr',
    'decrby', 'del', 'discard', 'dump', 'echo', 'eval', 'evalsha', 'exec', 'exists', 'expire', 'expireat', 'failover', 'flushall',
    'flushdb', 'geoadd', 'geodist', 'geohash', 'geopos', 'georadius', 'georadius_ro', 'georadiusbymember', 'georadiusbymember_ro',
    'geosearch', 'geosearchstore', 'get', 'getbit', 'getdel', 'getex', 'getrange', 'getset', 'hdel', 'hello', 'hexists', 'hget',
    'hgetall', 'hincrby', 'hincrbyfloat', 'hkeys', 'hlen', 'hmget', 'hmset', 'host:', 'hrandfield', 'hscan', 'hset', 'hsetnx',
    'hstrlen', 'hvals', 'incr', 'incrby', 'incrbyfloat', 'info', 'keys', 'lastsave', 'latency', 'lindex', 'linsert', 'llen', 'lmove',
    'lolwut', 'lpop', 'lpos', 'lpush', 'lpushx', 'lrange', 'lrem', 'lset', 'ltrim', 'memory', 'mget', 'migrate', 'module', 'monitor',
    'move', 'mset', 'msetnx', 'multi', 'object', 'persist', 'pexpire', 'pexpireat', 'pfadd', 'pfcount', 'pfdebug', 'pfmerge',
    'pfselftest', 'ping', 'post', 'psetex', 'psubscribe', 'psync', 'pttl', 'publish', 'pubsub', 'punsubscribe', 'quit', 'randomkey',
    'readonly', 'readwrite', 'rename', 'renamenx', 'replconf', 'replicaof', 'reset', 'restore', 'restore-asking', 'role', 'rpop',
    'rpoplpush', 'rpush', 'rpushx', 'sadd', 'save', 'scan', 'scard', 'script', 'sdiff', 'sdiffstore', 'select', 'set', 'setbit',
    'setex', 'setnx', 'setrange', 'shutdown', 'sinter', 'sinterstore', 'sismember', 'slaveof', 'slowlog', 'smembers', 'smismember',
    'smove', 'sort', 'spop', 'srandmember', 'srem', 'sscan', 'stralgo', 'strlen', 'subscribe', 'substr', 'sunion', 'sunionstore',
    'swapdb', 'sync', 'time', 'touch', 'ttl', 'type', 'unlink', 'unsubscribe', 'unwatch', 'wait', 'watch', 'xack', 'xadd', 'xautoclaim',
    'xclaim', 'xdel', 'xgroup', 'xinfo', 'xlen', 'xpending', 'xrange', 'xread', 'xreadgroup', 'xrevrange', 'xsetid', 'xtrim', 'zadd',
    'zcard', 'zcount', 'zdiff', 'zdiffstore', 'zincrby', 'zinter', 'zinterstore', 'zlexcount', 'zmscore', 'zpopmax', 'zpopmin',
    'zrandmember', 'zrange', 'zrangebylex', 'zrangebyscore', 'zrangestore', 'zrank', 'zrem', 'zremrangebylex', 'zremrangebyrank',
    'zremrangebyscore', 'zrevrange', 'zrevrangebylex', 'zrevrangebyscore', 'zrevrank', 'zscan', 'zscore', 'zunion', 'zunionstore'
  ];
  // explicitly exclude commands from decoration because they can misbehave
  const skipCommands = ['batch', 'multi'];
  const commandsToPromisify = redisCommands.filter(c => !skipCommands.includes(c));

  // take all the methods of RedisClient and promisify as many as possible
  for (const command in client) {
    // noinspection JSUnfilteredForInLoop
    if (typeof client[command] === 'function' && commandsToPromisify.includes(command)) {
      // noinspection JSUnfilteredForInLoop
      client[command] = promisify(client[command]).bind(client);
    }
  }

  return client as unknown as PromisifiedRedis;
}

/**
 * Within Redis, the keys will be scoped in the following fashion:
 *  - ${scopeName}:${uid}
 * where scopeName is provided in the constructor, and uid are the unique IDs (keys) of the objects being cached
 */
export class RedisCache {
  private readonly redisClient: PromisifiedRedis;
  private readonly scopeName: string;

  constructor(scopeName: string, host: string, port: number) {
    this.scopeName = scopeName;
    this.redisClient = makeRedisAsync(createRedisClient(port, host));
    this.redisClient.on("error", err => console.log('RedisCache: redis client error:', err));
  }

  getJSON = async <T>(uniqueKey: string): Promise<T | undefined> => {
    const stringValue: string | null = (await this.redisClient.get(this.scopedKey(uniqueKey))) as unknown as string;
    if (stringValue == null)
      return undefined;
    return JSON.parse(stringValue);
  }

  setPersistentJSON = async <T>(uniqueKey: string, object: T) =>
    await this.redisClient.set(this.scopedKey(uniqueKey), JSON.stringify(object));

  /**
   * Cache wrapper for JSON objects, up to a certain TTL
   * @param uniqueKey Unique ID of the cached object
   * @param expiration The expiration of uniqueKey, in seconds (0 to never expire) - NOTE: this doesn't change existing keys
   * @param invalidate invalidate the cache, if true
   * @param producer An Async function that resolves the object, if missing from the cache
   */
  cachedJSON = async <T>(uniqueKey: string, expiration: number, invalidate: boolean, producer: () => Promise<T | null>): Promise<T | null> => {
    const key = this.scopedKey(uniqueKey);

    // return the cached key if it exists
    if (!invalidate) {
      const cachedValue: string | null = (await this.redisClient.get(key)) as unknown as string;
      if (cachedValue !== null)
        return JSON.parse(cachedValue);
    }

    // resolve the non-cached result (and bail if null)
    const result: T = await producer();
    if (result == null)
      return result;  // NOTE: shall we save this in the cache, so the resolved is not re-invoked?

    // save to cache
    if (expiration == 0)
      await this.redisClient.set(key, JSON.stringify(result));
    else
      await this.redisClient.set(key, JSON.stringify(result), 'EX', expiration);
    return result;
  };

  // PRIVATE //

  private scopedKey = (key: string): string => this.scopeName + ':' + key;

  /*async testRedis() {
    await this.redisClient.set('test:key', 'val');
    const value = await this.redisClient.get('test:key');
    // @ts-ignore
    const success = value === 'val';
    assert(success, 'Redis client: error comparing the value');
    await this.redisClient.del('test:key');
  };*/
}
