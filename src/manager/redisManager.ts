import { DisconnectReasonCode } from '../exception';
import { IDisconnectData, IPublishData, PacketType, ProtocolVersion, TIdentifier, TTopic } from '../interface';
import { MqttClient } from '../mqttClient';
import { Manager, TopicManager, TSubscribeData, TSubscription } from './manager';
import { decodePacket, encodePacket } from '../packet';
import { isWildcardTopic, matchTopic } from '../topicFilters';
import Redis, { RedisOptions } from 'ioredis';
import { decodeUtf8String, encodeUTF8String } from '../dataRepresentations';

class SessionManager {
  private readonly redis: Redis;
  private readonly prefix = 'session:';
  private readonly batchSize = 500;

  /**
   * 空字符串用作会话标记。
   * MQTT Topic 不能为空，因此不会与合法 Topic 冲突。
   */
  private readonly sessionMarker = '';

  constructor(redis: Redis) {
    this.redis = redis;
    // this.dispose();
  }

  private encode(value: string): string {
    return Buffer.from(value).toString('base64url');
  }

  private sessionKey(identifier: TIdentifier): string {
    return `${this.prefix}${this.encode(identifier)}`;
  }

  private subscriptionPrefix(identifier: TIdentifier): string {
    return `${this.sessionKey(identifier)}:`;
  }

  private subscriptionKey(identifier: TIdentifier, topic: TTopic): string {
    return `${this.subscriptionPrefix(identifier)}${this.encode(topic)}`;
  }

  /**
   * 执行 Pipeline 并检查命令错误。
   */
  private async execPipeline(pipeline: ReturnType<Redis['pipeline']>, message: string): Promise<void> {
    const results = await pipeline.exec();

    if (results === null || results.some(([error]) => error !== null)) {
      throw new Error(message);
    }
  }

  // 重置过期时间
  async subscriptionKeyPersist(identifier: TIdentifier, topic: TTopic) {
    this.redis.persist(this.subscriptionKey(identifier, topic));
  }

  /**
   * 获取会话中的全部 Topic。
   * 过滤掉用于标记会话存在的空字符串。
   */
  private async getTopics(identifier: TIdentifier): Promise<TTopic[]> {
    const members = await this.redis.smembers(this.sessionKey(identifier));

    return members.filter((topic) => topic !== this.sessionMarker);
  }

  /**
   * 删除指定客户端的会话及所有订阅。
   */
  async clear(identifier: TIdentifier): Promise<void> {
    const sessionKey = this.sessionKey(identifier);
    const topics = await this.getTopics(identifier);

    for (let i = 0; i < topics.length; i += this.batchSize) {
      const batch = topics.slice(i, i + this.batchSize);
      const keys = batch.map((topic) => this.subscriptionKey(identifier, topic));

      if (keys.length > 0) {
        await this.redis.unlink(...keys);
      }
    }

    await this.redis.unlink(sessionKey);
  }

  /**
   * 判断会话是否存在。
   */
  async has(identifier: TIdentifier): Promise<boolean> {
    return (await this.redis.sismember(this.sessionKey(identifier), this.sessionMarker)) === 1;
  }

  /**
   * 获取指定客户端的全部订阅。
   */
  async get(identifier: TIdentifier): Promise<TSubscription | undefined> {
    if (!(await this.has(identifier))) {
      return undefined;
    }

    const topics = await this.getTopics(identifier);
    const subscription: TSubscription = new Map();

    for (let i = 0; i < topics.length; i += this.batchSize) {
      const batch = topics.slice(i, i + this.batchSize);
      const keys = batch.map((topic) => this.subscriptionKey(identifier, topic));

      if (keys.length === 0) {
        continue;
      }

      const values = await this.redis.mget(...keys);

      for (let j = 0; j < batch.length; j++) {
        const value = values[j];

        // 订阅 Key 可能已过期或被并发删除。
        if (value === null) {
          continue;
        }

        subscription.set(batch[j], JSON.parse(value) as TSubscribeData);
      }
    }

    return subscription;
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

    await this.redis.multi().sadd(this.sessionKey(identifier), this.sessionMarker).persist(this.sessionKey(identifier)).exec();
  }

  /**
   * 断开客户端会话。
   *
   * expireSeconds:
   * - 未传入：立即删除会话和所有订阅。
   * - 0：立即删除会话和所有订阅。
   * - 大于 0：设置会话及所有订阅 Key 的过期时间。
   */
  async disconnect(identifier: TIdentifier, expireSeconds?: number): Promise<void> {
    if (expireSeconds === undefined || expireSeconds === 0) {
      await this.clear(identifier);
      return;
    }

    if (!Number.isSafeInteger(expireSeconds) || expireSeconds < 0) {
      throw new RangeError('expireSeconds must be a non-negative safe integer');
    }

    const sessionKey = this.sessionKey(identifier);
    const topics = await this.getTopics(identifier);

    const keys = [sessionKey, ...topics.map((topic) => this.subscriptionKey(identifier, topic))];

    for (let i = 0; i < keys.length; i += this.batchSize) {
      const batch = keys.slice(i, i + this.batchSize);
      const pipeline = this.redis.pipeline();

      for (const key of batch) {
        pipeline.expire(key, expireSeconds);
      }

      await this.execPipeline(pipeline, `Failed to set session expiration for client: ${identifier}`);
    }
  }

  /**
   * 添加或更新订阅。
   */
  async subscribe(identifier: TIdentifier, topic: TTopic, data: TSubscribeData): Promise<void> {
    if (topic.length === 0) {
      throw new Error('Topic must not be empty');
    }

    if (!(await this.has(identifier))) {
      return;
    }

    const key = this.subscriptionKey(identifier, topic);
    const sessionKey = this.sessionKey(identifier);
    const pipeline = this.redis.pipeline();

    pipeline.set(key, JSON.stringify(data));
    pipeline.sadd(sessionKey, topic);

    await this.execPipeline(pipeline, `Failed to save subscription for topic: ${topic}`);
  }

  /**
   * 取消订阅。
   *
   * 即使最后一个订阅被移除，也保留 sessionMarker。
   */
  async unsubscribe(identifier: TIdentifier, topic: TTopic): Promise<void> {
    const pipeline = this.redis.pipeline();

    pipeline.unlink(this.subscriptionKey(identifier, topic));
    pipeline.srem(this.sessionKey(identifier), topic);

    await this.execPipeline(pipeline, `Failed to remove subscription for topic: ${topic}`);
  }

  /**
   * 查询单个 Topic 的订阅信息。
   */
  async isSubscribe(identifier: TIdentifier, topic: TTopic): Promise<TSubscribeData | undefined> {
    const value = await this.redis.get(this.subscriptionKey(identifier, topic));

    if (value === null) {
      return undefined;
    }

    return JSON.parse(value) as TSubscribeData;
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
  async dispose(): Promise<void> {}
}

class MessagesManager {
  private readonly topicIds: Map<TTopic, Set<TIdentifier>> = new Map();
  private readonly subRedis: Redis;
  private readonly pubRedis: Redis;

  constructor(subRedis: Redis, pubRedis: Redis) {
    this.subRedis = subRedis;
    this.pubRedis = pubRedis;
    this.subRedis.subscribe('mqtt-message');
  }
  // async subscribe(topic: TTopic, identifier: TIdentifier) {
  //   if (isWildcardTopic(topic)) {
  //     // TODO 主题转换
  //     await this.subRedis.psubscribe(topic);
  //   } else {
  //     await this.subRedis.subscribe(topic);
  //   }
  //   this.topicIds.get(topic)?.add(identifier) ?? this.topicIds.set(topic, new Set(identifier));
  // }

  // async unsubscribe(topic: TTopic, identifier: TIdentifier) {
  //   if (isWildcardTopic(topic)) {
  //     // TODO 主题转换
  //     await this.subRedis.punsubscribe(topic);
  //   } else {
  //     await this.subRedis.unsubscribe(topic);
  //   }
  //   const ids = this.topicIds.get(topic);
  //   if (ids) {
  //     ids.delete(identifier) && !ids.size && this.topicIds.delete(topic);
  //   }
  // }

  async publish(identifier: string, topic: string, pubData: IPublishData) {
    await this.pubRedis.publish(
      'mqtt-message',
      Buffer.concat([encodeUTF8String(identifier), encodeUTF8String(topic), encodePacket(pubData, ProtocolVersion.V5)]),
    );
  }

  async message(broadcastCallback: (identifier: string, topic: string, pubBuffer: Buffer) => Promise<void>) {
    this.subRedis.on('messageBuffer', (channel, message) => {
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
  private readonly sessionStore: SessionManager;
  private readonly retainStore: RetainStore;
  private readonly messageManager: MessagesManager;

  /**
   * 当前在线客户端的订阅缓存。
   * publish() 保持同步，不在消息分发路径中访问 Redis。
   */
  private readonly activeSubscriptions = new Map<TIdentifier, TSubscription>();
  private readonly topicManager = new TopicManager();

  private pubRedis: Redis;
  private subRedis: Redis;

  constructor(options: RedisOptions) {
    super();
    this.pubRedis = new Redis(options);
    this.subRedis = new Redis(options);
    this.retainStore = new RetainStore(this.pubRedis);
    this.sessionStore = new SessionManager(this.pubRedis);
    this.messageManager = new MessagesManager(this.subRedis, this.pubRedis);

    this.messageManager.message(this.broadcastMessage.bind(this));
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
    // 如果同一 Client ID 被新连接替换，先移除旧连接的路由，避免重复路由。
    const oldSubscriptions = this.activeSubscriptions.get(identifier);
    for (const [topic, _data] of oldSubscriptions ?? []) {
      await this.topicManager.unsubscribe(topic, identifier);
    }

    await this.sessionStore.connect(identifier);

    const subscription = (await this.sessionStore.get(identifier)) ?? new Map<TTopic, TSubscribeData>();

    this.clientIdentifierManager.set(identifier, client);
    this.activeSubscriptions.set(identifier, subscription);

    for (const [topic, _data] of subscription) {
      this.topicManager.subscribe(topic, identifier);
      await this.sessionStore.subscriptionKeyPersist(identifier, topic);
    }
  }

  // 断开连接但保留持久会话；离线客户端不应继续参与在线消息路由。
  public async disconnect(identifier: TIdentifier, disconnectData?: IDisconnectData): Promise<void> {
    const client = this.clientIdentifierManager.getClient(identifier);

    if (!client || client.isDisconnect) {
      return;
    }

    client.isDisconnect = true;

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

    const subscription = this.activeSubscriptions.get(identifier);
    for (const [topic, _data] of subscription ?? []) {
      await this.topicManager.unsubscribe(topic, identifier);
    }
    this.activeSubscriptions.delete(identifier);
    this.sessionStore.disconnect(
      identifier,
      client.connData.properties.sessionExpiryInterval ? client.connData.properties.sessionExpiryInterval : undefined,
    );
  }

  public async subscribe(identifier: TIdentifier, topic: TTopic, data: TSubscribeData): Promise<void> {
    // 先确认持久化成功，再更新在线缓存与路由。
    await this.sessionStore.subscribe(identifier, topic, data);
    this.topicManager.subscribe(topic, identifier);

    const subscription = this.activeSubscriptions.get(identifier);
    if (!subscription || !this.clientIdentifierManager.getClient(identifier)) {
      return;
    }
    subscription.set(topic, data);
  }

  public async isSubscribe(identifier: TIdentifier, topic: TTopic): Promise<boolean> {
    return (await this.sessionStore.isSubscribe(identifier, topic)) !== undefined;
  }

  public async unsubscribe(identifier: TIdentifier, topic: TTopic): Promise<void> {
    await this.sessionStore.unsubscribe(identifier, topic);

    const subscription = this.activeSubscriptions.get(identifier);
    if (subscription?.has(topic)) {
      subscription.delete(topic);
      await this.topicManager.unsubscribe(topic, identifier);
    }
  }

  public async clearSession(identifier: TIdentifier): Promise<void> {
    const subscription = this.activeSubscriptions.get(identifier);
    for (const [topic, _data] of subscription ?? []) {
      await this.topicManager.unsubscribe(topic, identifier);
    }
    this.activeSubscriptions.delete(identifier);

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

  private async broadcastMessage(topic: TTopic, sourceIdentifier: TIdentifier, pubBuffer: Buffer) {
    const pubData = decodePacket(pubBuffer, ProtocolVersion.V5) as IPublishData;

    const publishData = async (targetIdentifier: TIdentifier, targetTopic: TTopic) => {
      const targetClient = this.clientIdentifierManager.getClient(targetIdentifier);
      // const targetClientSubscribeData = await this.sessionStore.get(targetIdentifier)
      const targetClientSubscribeData = (await this.sessionStore.get(targetIdentifier))?.get(targetTopic);

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
