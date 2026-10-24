import { DisconnectReasonCode } from '../exception';
import { IDisconnectData, IPublishData, PacketType, ProtocolVersion, TIdentifier, TTopic } from '../interface';
import { MqttClient } from '../mqttClient';
import { Manager, MemorySessionManager, TopicManager, TSubscribeData, TSubscription } from './manager';
import { decodePacket, encodePacket } from '../packet';
import { isWildcardTopic, matchTopic } from '../topicFilters';
import Redis, { RedisOptions } from 'ioredis';
import { decodeUtf8String, encodeUTF8String } from '../dataRepresentations';

const CLIENT_TAKEOVER_CHANNEL = 'mqtt-client-takeover';
const CLIENT_OWNER_PREFIX = 'client-owner:';

class RedisSessionManager {
  private readonly redis: Redis;
  private readonly prefix = 'session:';
  private readonly batchSize = 500;
  private readonly sessionCache = new MemorySessionManager();

  /**
   * 空字符串用作会话标记字段。
   * MQTT Topic 不能为空，因此不会与合法 Topic 冲突。
   */
  private readonly sessionMarker = '';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  private encode(value: string): string {
    return Buffer.from(value).toString('base64url');
  }

  private decode(value: string): string {
    return Buffer.from(value, 'base64url').toString();
  }

  /**
   * 会话 Key：每个客户端一个 Hash，字段为 base64url(topic)，值为序列化后的订阅数据。
   */
  private sessionKey(identifier: TIdentifier): string {
    return `${this.prefix}${this.encode(identifier)}`;
  }

  /**
   * 从 Redis 载入指定客户端的全部订阅。
   *
   * 仅在写入路径（connect 水合内存缓存）中使用。
   */
  private async loadFromRedis(identifier: TIdentifier): Promise<TSubscription | undefined> {
    const entries = await this.redis.hgetall(this.sessionKey(identifier));

    // 会话标记字段不存在，说明 Redis 中无此会话。
    if (entries[this.sessionMarker] === undefined) {
      return undefined;
    }

    const subscription: TSubscription = new Map();

    for (const [field, value] of Object.entries(entries)) {
      if (field === this.sessionMarker) {
        continue;
      }

      subscription.set(this.decode(field), JSON.parse(value) as TSubscribeData);
    }

    return subscription;
  }

  /**
   * 判断会话是否存在。
   */
  has(identifier: TIdentifier): boolean {
    return this.sessionCache.has(identifier);
  }

  /**
   * 获取指定客户端的全部订阅。
   *
   * 读取内存缓存，避免在消息分发路径上访问 Redis。
   */
  get(identifier: TIdentifier): TSubscription | undefined {
    return this.sessionCache.get(identifier)?.subscription;
  }

  /**
   * 建立会话。
   *
   * 默认保留已有会话和订阅。
   * clearOldSession 为 true 时先删除旧会话。
   */
  async connect(identifier: TIdentifier, clearOldSession = false): Promise<void> {
    if (clearOldSession) {
      await this.clear(identifier);
    }

    if (await this.redis.persist(this.sessionKey(identifier))) {
      // session 存在

      // 从 Redis 水合内存缓存（进程重启后内存缓存为空）。
      const subscription = (await this.loadFromRedis(identifier)) ?? new Map<TTopic, TSubscribeData>();
      for (const [topic, data] of subscription) {
        this.sessionCache.subscribe(identifier, topic, data);
      }
    }
    await this.redis.hset(this.sessionKey(identifier), this.sessionMarker, '1');
    this.sessionCache.connect(identifier, 0, true);
  }

  /**
   * 断开客户端会话。
   *
   * expireSeconds:
   * - 未传入：立即删除会话和所有订阅。
   * - 0：立即删除会话和所有订阅。
   * - 大于 0：设置会话 Key 的过期时间。
   */
  async disconnect(identifier: TIdentifier, expireSeconds?: number): Promise<void> {
    if (expireSeconds === undefined || expireSeconds === 0) {
      await this.clear(identifier);
      return;
    }

    if (!Number.isSafeInteger(expireSeconds) || expireSeconds < 0) {
      throw new RangeError('expireSeconds must be a non-negative safe integer');
    }

    await this.redis.expire(this.sessionKey(identifier), expireSeconds);

    this.sessionCache.clear(identifier);
  }

  /**
   * 添加或更新订阅。
   */
  async subscribe(identifier: TIdentifier, topic: TTopic, data: TSubscribeData): Promise<void> {
    if (topic.length === 0) {
      throw new Error('Topic must not be empty');
    }

    if (!this.has(identifier)) {
      return;
    }

    await this.redis.hset(this.sessionKey(identifier), this.encode(topic), JSON.stringify(data));

    this.sessionCache.subscribe(identifier, topic, data);
  }

  /**
   * 取消订阅。
   *
   * 即使最后一个订阅被移除，也保留 sessionMarker。
   */
  async unsubscribe(identifier: TIdentifier, topic: TTopic): Promise<void> {
    await this.redis.hdel(this.sessionKey(identifier), this.encode(topic));

    this.sessionCache.unsubscribe(identifier, topic);
  }

  /**
   * 查询单个 Topic 的订阅信息。
   */
  isSubscribe(identifier: TIdentifier, topic: TTopic): TSubscribeData | undefined {
    return this.sessionCache.isSubscribe(identifier, topic);
  }

  /**
   * 删除指定客户端的会话及所有订阅。
   */
  async clear(identifier: TIdentifier): Promise<void> {
    await this.redis.unlink(this.sessionKey(identifier));

    this.sessionCache.clear(identifier);
  }

  /**
   * 清理 Redis 中全部 session:* Key。
   *
   * 注意：此方法会删除该 Redis 数据库中所有以 session:
   * 开头的 Key，不只限于当前实例创建的会话。
   *
   * 不关闭调用方管理的 Redis 连接。
   */
  async dispose(): Promise<void> {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', `${this.prefix}*`, 'COUNT', this.batchSize);

      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.unlink(...keys);
      }
    } while (cursor !== '0');
  }
}

type TRetainData = { buffer: Buffer; expireAt: number };
class RetainStore {
  private readonly redis: Redis;
  private readonly prefix = 'retain:';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  private retainKey(topic: TTopic): string {
    return `${this.prefix}${Buffer.from(topic).toString('base64url')}`;
  }

  private parseKey(key: string): TTopic {
    return Buffer.from(key.slice(this.prefix.length), 'base64url').toString();
  }

  private serialize(buffer: Buffer): string {
    return buffer.toString('base64');
  }

  private deserialize(value: string): Buffer {
    return Buffer.from(value, 'base64');
  }

  /**
   * 新增或更新保留消息。
   * ttl 为剩余存活时间，单位毫秒。
   * ttl <= 0 时删除保留消息。
   */
  async update(topic: TTopic, data: TRetainData): Promise<void> {
    const key = this.retainKey(topic);

    const ttl = data.expireAt - Date.now();

    if (ttl <= 0) {
      await this.redis.del(key);
      return;
    }

    await this.redis.set(key, this.serialize(data.buffer), 'PX', ttl);
  }

  /**
   * 删除指定 Topic 的保留消息。
   */
  async delete(topic: TTopic): Promise<void> {
    await this.redis.del(this.retainKey(topic));
  }

  /**
   * 获取指定 Topic 的保留消息。
   */
  async get(topic: TTopic): Promise<Buffer | undefined> {
    const value = await this.redis.get(this.retainKey(topic));

    if (value === null) {
      return undefined;
    }

    return this.deserialize(value);
  }

  /**
   * 删除所有保留消息，不影响 Redis 中其他业务数据。
   */
  async clear(): Promise<void> {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', `${this.prefix}*`, 'COUNT', 500);

      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== '0');
  }

  /**
   * 遍历所有尚未过期的保留消息。
   * TODO 当前遍历redis retain: 的方案需要优化
   */
  async *entries(): AsyncGenerator<[TTopic, Buffer]> {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', `${this.prefix}*`, 'COUNT', 500);

      cursor = nextCursor;

      if (keys.length === 0) {
        continue;
      }

      const values = await this.redis.mget(...keys);

      for (let i = 0; i < keys.length; i++) {
        const value = values[i];

        // Key 可能在 SCAN 后、MGET 前过期
        if (value === null) {
          continue;
        }

        yield [this.parseKey(keys[i]), this.deserialize(value)];
      }
    } while (cursor !== '0');
  }

  /**
   * 不关闭调用方管理的 Redis 连接。
   */
  async dispose(): Promise<void> {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', `${this.prefix}*`);

      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.unlink(...keys);
      }
    } while (cursor !== '0');
  }
}

class MessagesManager {
  private readonly subRedis: Redis;
  private readonly pubRedis: Redis;

  constructor(subRedis: Redis, pubRedis: Redis) {
    this.subRedis = subRedis;
    this.pubRedis = pubRedis;
    this.subRedis.subscribe('mqtt-message');
  }

  async publish(identifier: string, topic: string, pubData: IPublishData) {
    await this.pubRedis.publish(
      'mqtt-message',
      Buffer.concat([encodeUTF8String(identifier), encodeUTF8String(topic), encodePacket(pubData, ProtocolVersion.V5)]),
    );
  }

  async message(broadcastCallback: (identifier: string, topic: string, pubBuffer: Buffer) => Promise<void>) {
    this.subRedis.on('messageBuffer', (channel, message) => {
      if (channel.toString() !== 'mqtt-message') {
        return;
      }

      const data = {
        index: 0,
        buffer: message,
      };
      const identifier = decodeUtf8String(data);
      const topic = decodeUtf8String(data);

      broadcastCallback(identifier, topic, message.subarray(data.index));
    });
  }
}

/**
 * 跨进程会话接管协调：以 Redis 所有权 key 作为单一事实来源，配合共享频道广播。
 * 当同一 client identifier 连到其他进程时，本进程据此断开旧连接（SessionTakenOver）。
 */
class ClientTakeoverManager {
  private readonly redis: Redis;
  private readonly subRedis: Redis;

  constructor(redis: Redis, subRedis: Redis) {
    this.redis = redis;
    this.subRedis = subRedis;
    this.subRedis.subscribe(CLIENT_TAKEOVER_CHANNEL);
  }

  private ownerKey(identifier: TIdentifier): string {
    return `${CLIENT_OWNER_PREFIX}${Buffer.from(identifier).toString('base64url')}`;
  }

  /** 原子抢占所有权：后写者胜，对应 MQTT「新连接接管旧连接」语义。 */
  async claim(identifier: TIdentifier, token: string): Promise<void> {
    await this.redis.set(this.ownerKey(identifier), token);
  }

  /** 释放所有权：仅当仍由本人持有时才删除，避免误删新所有者的 key。 */
  async release(identifier: TIdentifier, token: string): Promise<void> {
    await this.redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      1,
      this.ownerKey(identifier),
      token,
    );
  }

  /** 当前所有者 token，无则返回 null。 */
  async owner(identifier: TIdentifier): Promise<string | null> {
    return this.redis.get(this.ownerKey(identifier));
  }

  /** 广播接管通知：所有进程据此重新校验自己对 `identifier` 的所有权。 */
  async publish(identifier: TIdentifier): Promise<void> {
    await this.redis.publish(CLIENT_TAKEOVER_CHANNEL, encodeUTF8String(identifier));
  }

  message(onTakeover: (identifier: TIdentifier) => void): void {
    this.subRedis.on('messageBuffer', (channel, message) => {
      if (channel.toString() !== CLIENT_TAKEOVER_CHANNEL) {
        return;
      }

      const data = { index: 0, buffer: message };
      onTakeover(decodeUtf8String(data));
    });
  }
}

/**
 * In-memory MQTT client and session manager backed by a topic trie for subscription routing.
 *
 * Features:
 * - Route-based topic matching via a trie (`+` single-level, `#` multi-level)
 * - Session persistence with optional expiry after disconnect when `sessionExpiryInterval` is greater than 0
 * - Retain messages with TTL and periodic cleanup
 * - Shared subscriptions: round-robin selection per group using an internal cursor map
 * - Timers: retain cleanup (~1 min), keep-alive expiry (~1 s), session cleanup (~10 s)
 */

export class RedisManager extends Manager {
  private readonly sessionStore: RedisSessionManager;
  private readonly retainStore: RetainStore;
  private readonly messageManager: MessagesManager;
  private readonly clientTakeoverManager: ClientTakeoverManager;
  private readonly topicManager = new TopicManager();

  private pubRedis: Redis;
  private subRedis: Redis;

  constructor(options: RedisOptions) {
    super();
    this.pubRedis = new Redis(options);
    this.subRedis = new Redis(options);
    this.retainStore = new RetainStore(this.pubRedis);
    this.sessionStore = new RedisSessionManager(this.pubRedis);
    this.messageManager = new MessagesManager(this.subRedis, this.pubRedis);
    this.clientTakeoverManager = new ClientTakeoverManager(this.pubRedis, this.subRedis);

    this.messageManager.message(this.broadcastMessage.bind(this));
    this.clientTakeoverManager.message(this.handleRemoteTakeover.bind(this));
  }

  /**
   * 客户端是否连接
   * @param identifier
   * @returns
   */
  async isConnected(identifier: TIdentifier): Promise<boolean> {
    return !!this.clientIdentifierManager.getClient(identifier);
  }

  /**
   * 建立连接
   * @param identifier
   * @param connData
   * @param client
   */
  public async connect(identifier: TIdentifier, client: MqttClient): Promise<void> {
    // 跨进程会话接管：先抢占所有权，再广播，最后才本地注册与水合。
    await this.clientTakeoverManager.claim(identifier, client.connectionToken);
    await this.clientTakeoverManager.publish(identifier);

    // 如果同一 Client ID 被新连接替换，先移除旧连接的路由，避免重复路由。
    const oldSubscriptions = this.sessionStore.get(identifier);
    for (const [topic, _data] of oldSubscriptions ?? []) {
      this.topicManager.unsubscribe(topic, identifier);
    }

    await this.sessionStore.connect(identifier);

    const subscription = this.sessionStore.get(identifier) ?? new Map<TTopic, TSubscribeData>();

    this.clientIdentifierManager.set(identifier, client);

    for (const [topic, _data] of subscription) {
      this.topicManager.subscribe(topic, identifier);
    }
  }

  // 断开连接但保留持久会话；离线客户端不应继续参与在线消息路由。
  public async disconnect(identifier: TIdentifier, disconnectData?: IDisconnectData): Promise<void> {
    const client = this.clientIdentifierManager.getClient(identifier);

    if (!client || client.isDisconnect) {
      return;
    }

    client.isDisconnect = true;

    // 释放所有权（仅当仍持有时），让后续连接能干净接管。
    void this.clientTakeoverManager.release(identifier, client.connectionToken);

    client.handleDisconnect(
      disconnectData ?? {
        header: {
          packetType: PacketType.DISCONNECT,
          received: 0,
          remainingLength: 0,
          reasonCode: DisconnectReasonCode.NormalDisconnection,
        },
        properties: {},
      },
    );

    this.clientIdentifierManager.delete(identifier);

    const subscription = this.sessionStore.get(identifier);
    for (const [topic, _data] of subscription ?? []) {
      this.topicManager.unsubscribe(topic, identifier);
    }
    await this.sessionStore.disconnect(
      identifier,
      client.connData.properties.sessionExpiryInterval ? client.connData.properties.sessionExpiryInterval : undefined,
    );
  }

  public async subscribe(identifier: TIdentifier, topic: TTopic, data: TSubscribeData): Promise<void> {
    // 先确认持久化成功，再更新内存缓存与路由。
    await this.sessionStore.subscribe(identifier, topic, data);
    this.topicManager.subscribe(topic, identifier);
  }

  public async isSubscribe(identifier: TIdentifier, topic: TTopic): Promise<boolean> {
    return this.sessionStore.isSubscribe(identifier, topic) !== undefined;
  }

  public async unsubscribe(identifier: TIdentifier, topic: TTopic): Promise<void> {
    await this.sessionStore.unsubscribe(identifier, topic);
    // sessionStore.unsubscribe 已同步删除内存缓存中的订阅，需移除路由（幂等）。
    this.topicManager.unsubscribe(topic, identifier);
  }

  public async clearSession(identifier: TIdentifier): Promise<void> {
    const subscription = this.sessionStore.get(identifier);
    for (const [topic, _data] of subscription ?? []) {
      this.topicManager.unsubscribe(topic, identifier);
    }

    await this.sessionStore.clear(identifier);
  }

  public async hasSession(identifier: TIdentifier): Promise<boolean> {
    return this.sessionStore.has(identifier);
  }

  public async addRetainMessage(topic: TTopic, pubData: IPublishData, retainTTL?: number): Promise<void> {
    const ttl = retainTTL ?? 3600;

    await this.retainStore.update(topic, {
      buffer: encodePacket(pubData, ProtocolVersion.V5),
      expireAt: Date.now() + ttl * 1000,
    });
  }

  public async deleteRetainMessage(topic: TTopic): Promise<void> {
    await this.retainStore.delete(topic);
  }
  public async getRetainMessage(topic: string): Promise<IPublishData | undefined> {
    const pubBuffer = await this.retainStore.get(topic);
    if (pubBuffer) {
      return decodePacket(pubBuffer, ProtocolVersion.V5) as IPublishData;
    }
  }

  public async matchRetainMessage(topic: TTopic, callbackfn: (data: IPublishData) => Promise<void>) {
    if (!isWildcardTopic(topic)) {
      const pubBuffer = await this.retainStore.get(topic);
      if (pubBuffer) {
        await callbackfn(decodePacket(pubBuffer, ProtocolVersion.V5) as IPublishData);
      }
      return;
    } else {
      for await (const [key, buffer] of this.retainStore.entries()) {
        if (matchTopic(key, topic)) {
          await callbackfn(decodePacket(buffer, ProtocolVersion.V5) as IPublishData);
        }
      }
    }
  }

  /**
   * Fan-out: matches `topic` against the trie (`+` / `#`), applies no-local and shared-subscription rules, encodes PUBLISH packets, and writes to subscribers.
   *
   * A `#` match does not stop the walk, so a broader filter and a deeper filter both match. Each selected subscription is delivered as its own PUBLISH. Shared groups pick one subscriber per group via round-robin; QoS is the minimum of that subscription and the publish QoS.
   *
   * @param clientIdentifier - Publisher's client id (used for no-local checks).
   * @param topic - Publish topic name.
   * @param pubData - PUBLISH payload and headers.
   */
  public async publish(sourceIdentifier: TIdentifier, topic: TTopic, pubData: IPublishData) {
    console.log('publish: ', Buffer.concat([encodeUTF8String(sourceIdentifier), encodeUTF8String(topic), encodePacket(pubData, ProtocolVersion.V5)]));
    this.messageManager.publish(topic, sourceIdentifier, pubData);
  }

  /**
   * 处理跨进程接管通知：断开本进程内 `identifier` 的旧连接，
   * 除非它就是刚声明所有权的那个连接（token 相同）。
   */
  private handleRemoteTakeover(identifier: TIdentifier): void {
    const client = this.clientIdentifierManager.getClient(identifier);

    if (!client || client.isDisconnect) {
      return;
    }

    void (async () => {
      const owner = await this.clientTakeoverManager.owner(identifier);

      if (owner !== null && owner !== client.connectionToken) {
        await this.disconnect(identifier, {
          header: {
            packetType: PacketType.DISCONNECT,
            received: 0,
            remainingLength: 0,
            reasonCode: DisconnectReasonCode.SessionTakenOver,
          },
          properties: {},
        });
      }
    })();
  }

  private async broadcastMessage(topic: TTopic, sourceIdentifier: TIdentifier, pubBuffer: Buffer) {
    const pubData = decodePacket(pubBuffer, ProtocolVersion.V5) as IPublishData;

    const publishData = (targetIdentifier: TIdentifier, targetTopic: TTopic) => {
      const targetClient = this.clientIdentifierManager.getClient(targetIdentifier);
      const targetClientSubscribeData = this.sessionStore.get(targetIdentifier)?.get(targetTopic);

      if (!targetClient || !targetClientSubscribeData) {
        return;
      }

      // [MQTT-3.8.3-3] Bit 2 of the Subscription Options represents the No Local option. If the value is 1, Application Messages MUST NOT be forwarded to a connection with a ClientID equal to the ClientID of the publishing connection.
      if (targetClientSubscribeData && targetClientSubscribeData.noLocal && sourceIdentifier === targetIdentifier) {
        return;
      }
      const distributeData: IPublishData = decodePacket(pubBuffer, ProtocolVersion.V5) as IPublishData;
      const qos = Math.min(targetClientSubscribeData.qos || 0, pubData.header.qosLevel);

      // [MQTT-3.3.1-3] The value of the DUP flag from an incoming PUBLISH packet is not propagated when the PUBLISH packet is sent to subscribers by the Server. The DUP flag in the outgoing PUBLISH packet is set independently to the incoming PUBLISH packet, its value MUST be determined solely by whether the outgoing PUBLISH packet is a retransmission.
      distributeData.header.dupFlag = false;

      distributeData.header.qosLevel = qos;
      distributeData.header.retain = targetClientSubscribeData.retainAsPublished ? distributeData.header.retain : false;
      if (targetClientSubscribeData.subscriptionIdentifier !== undefined) {
        distributeData.properties.subscriptionIdentifier = Array.isArray(targetClientSubscribeData.subscriptionIdentifier)
          ? targetClientSubscribeData.subscriptionIdentifier
          : [targetClientSubscribeData.subscriptionIdentifier];
      } else {
        delete distributeData.properties.subscriptionIdentifier;
      }
      targetClient.handlePublish(distributeData);
    };

    // 非通配符主题
    for (const [targetIdentifier, targetTopic] of this.topicManager.matchTopic(topic) ?? []) {
      publishData(targetIdentifier, targetTopic);
    }
  }
}
