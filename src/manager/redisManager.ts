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
   * Empty string used as the session marker field.
   * MQTT topics cannot be empty, so this never collides with a legal topic.
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
   * Session key: one Redis hash per client, keyed by base64url(topic) with serialized subscription data as values.
   */
  private sessionKey(identifier: TIdentifier): string {
    return `${this.prefix}${this.encode(identifier)}`;
  }

  /**
   * Loads all subscriptions for a client from Redis.
   *
   * Used only on the write path (connect hydration of the in-memory cache).
   */
  private async loadFromRedis(identifier: TIdentifier): Promise<TSubscription | undefined> {
    const entries = await this.redis.hgetall(this.sessionKey(identifier));

    // If the session marker field is absent, the session does not exist in Redis.
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
   * Whether a session exists for the client.
   */
  has(identifier: TIdentifier): boolean {
    return this.sessionCache.has(identifier);
  }

  /**
   * Returns all subscriptions for a client.
   *
   * Reads the in-memory cache to avoid hitting Redis on the message fan-out path.
   */
  get(identifier: TIdentifier): TSubscription | undefined {
    return this.sessionCache.get(identifier)?.subscription;
  }

  /**
   * Establishes a session.
   *
   * Existing sessions and subscriptions are kept by default.
   * When `clearOldSession` is true, the old session is deleted first.
   */
  async connect(identifier: TIdentifier, clearOldSession = false): Promise<void> {
    if (clearOldSession) {
      await this.clear(identifier);
    }

    if (await this.redis.persist(this.sessionKey(identifier))) {
      // Session exists.

      // Hydrate the in-memory cache from Redis (it is empty after a process restart).
      const subscription = (await this.loadFromRedis(identifier)) ?? new Map<TTopic, TSubscribeData>();
      for (const [topic, data] of subscription) {
        this.sessionCache.subscribe(identifier, topic, data);
      }
    }
    await this.redis.hset(this.sessionKey(identifier), this.sessionMarker, '1');
    this.sessionCache.connect(identifier, 0, true);
  }

  /**
   * Disconnects a client session.
   *
   * @param identifier - MQTT client identifier string.
   * @param expireSeconds - Session expiry:
   * - omitted: deletes the session and all subscriptions immediately.
   * - `0`: deletes the session and all subscriptions immediately.
   * - greater than 0: sets the expiry of the session key.
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
   * Adds or updates a subscription.
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
   * Removes a subscription.
   *
   * The session marker is kept even when the last subscription is removed.
   */
  async unsubscribe(identifier: TIdentifier, topic: TTopic): Promise<void> {
    await this.redis.hdel(this.sessionKey(identifier), this.encode(topic));

    this.sessionCache.unsubscribe(identifier, topic);
  }

  /**
   * Looks up the subscription information for a single topic.
   */
  isSubscribe(identifier: TIdentifier, topic: TTopic): TSubscribeData | undefined {
    return this.sessionCache.isSubscribe(identifier, topic);
  }

  /**
   * Deletes the session and all subscriptions for a client.
   */
  async clear(identifier: TIdentifier): Promise<void> {
    await this.redis.unlink(this.sessionKey(identifier));

    this.sessionCache.clear(identifier);
  }

  /**
   * Cleans up all `session:*` keys in Redis.
   *
   * Note: this deletes every key starting with `session:` in the Redis database,
   * not only sessions created by the current instance.
   *
   * Does not close the Redis connection managed by the caller.
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
   * Adds or updates a retained message.
   * `ttl` is the remaining time-to-live in milliseconds.
   * When `ttl <= 0`, the retained message is deleted.
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
   * Deletes the retained message for a topic.
   */
  async delete(topic: TTopic): Promise<void> {
    await this.redis.del(this.retainKey(topic));
  }

  /**
   * Returns the retained message for a topic.
   */
  async get(topic: TTopic): Promise<Buffer | undefined> {
    const value = await this.redis.get(this.retainKey(topic));

    if (value === null) {
      return undefined;
    }

    return this.deserialize(value);
  }

  /**
   * Deletes all retained messages without affecting other business data in Redis.
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
   * Iterates over all non-expired retained messages.
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

        // The key may expire between SCAN and MGET.
        if (value === null) {
          continue;
        }

        yield [this.parseKey(keys[i]), this.deserialize(value)];
      }
    } while (cursor !== '0');
  }

  /**
   * Does not close the Redis connection managed by the caller.
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
 * Cross-process session takeover coordination: uses a Redis ownership key as the single source of
 * truth, combined with a shared-channel broadcast. When the same client identifier connects to
 * another process, this process disconnects the old connection (SessionTakenOver).
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

  /** Atomically claims ownership: last writer wins, matching MQTT "new connection takes over old connection" semantics. */
  async claim(identifier: TIdentifier, token: string): Promise<void> {
    await this.redis.set(this.ownerKey(identifier), token);
  }

  /** Releases ownership: deletes the key only if still owned by the caller, avoiding deleting a new owner's key. */
  async release(identifier: TIdentifier, token: string): Promise<void> {
    await this.redis.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      1,
      this.ownerKey(identifier),
      token,
    );
  }

  /** Returns the current owner token, or null if there is none. */
  async owner(identifier: TIdentifier): Promise<string | null> {
    return this.redis.get(this.ownerKey(identifier));
  }

  /** Broadcasts a takeover notice so every process revalidates its ownership of `identifier`. */
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
   * Whether a live client is registered for the given identifier.
   *
   * @param identifier - MQTT client identifier string.
   * @returns `true` if a client is currently connected under `identifier`.
   */
  async isConnected(identifier: TIdentifier): Promise<boolean> {
    return !!this.clientIdentifierManager.getClient(identifier);
  }

  /**
   * Establishes a connection, claiming ownership and restoring routing.
   *
   * @param identifier - MQTT client identifier string.
   * @param client - Live {@link MqttClient} for this session.
   */
  public async connect(identifier: TIdentifier, client: MqttClient): Promise<void> {
    // Cross-process session takeover: claim ownership first, then broadcast, then register and hydrate locally.
    await this.clientTakeoverManager.claim(identifier, client.connectionToken);
    await this.clientTakeoverManager.publish(identifier);

    // If the same client id is replaced by a new connection, remove the old connection's routing first to avoid duplicate routes.
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

  // Disconnect but keep the persistent session; offline clients should not keep participating in online message routing.
  public async disconnect(identifier: TIdentifier, disconnectData?: IDisconnectData): Promise<void> {
    const client = this.clientIdentifierManager.getClient(identifier);

    if (!client || client.isDisconnect) {
      return;
    }

    client.isDisconnect = true;
    client.clearPendingRetries();

    // Release ownership (only if still held) so a later connection can take over cleanly.
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
    // Persist first; only then update the in-memory cache and routing.
    await this.sessionStore.subscribe(identifier, topic, data);
    this.topicManager.subscribe(topic, identifier);
  }

  public async isSubscribe(identifier: TIdentifier, topic: TTopic): Promise<boolean> {
    return this.sessionStore.isSubscribe(identifier, topic) !== undefined;
  }

  public async unsubscribe(identifier: TIdentifier, topic: TTopic): Promise<void> {
    await this.sessionStore.unsubscribe(identifier, topic);
    // sessionStore.unsubscribe already removed the subscription from the in-memory cache; remove the route (idempotent).
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
   * Handles a cross-process takeover notice: disconnects the old connection for `identifier`
   * in this process, unless it is the connection that just claimed ownership (same token).
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

    // Non-wildcard topic
    for (const [targetIdentifier, targetTopic] of this.topicManager.matchTopic(topic) ?? []) {
      publishData(targetIdentifier, targetTopic);
    }
  }
}
