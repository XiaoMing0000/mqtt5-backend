import { DisconnectReasonCode } from '../exception';
import { IDisconnectData, IPublishData, PacketType, ProtocolVersion, TIdentifier, TTopic } from '../interface';
import { MqttClient } from '../mqttClient';
import { Manager, MemorySessionManager, TopicManager, TSubscribeData } from './manager';
import { decodePacket, encodePacket } from '../packet';
import { isWildcardTopic, matchTopic } from '../topicFilters';

type TRetainData = { buffer: Buffer; expireAt: number };
class RetainStore {
  private readonly retainStore = new Map<TTopic, TRetainData>();
  private readonly clearRetainTimer: NodeJS.Timeout;

  constructor() {
    // Periodically clear expired entries.
    this.clearRetainTimer = setInterval(() => {
      const now = Date.now();
      this.retainStore.forEach((data, topic) => {
        if (data.expireAt <= now && data.expireAt !== 0) {
          this.retainStore.delete(topic);
        }
      });
    }, 1000 * 60);
  }

  update(topic: TTopic, data: TRetainData) {
    this.retainStore.set(topic, data);
  }

  delete(topic: TTopic) {
    this.retainStore.delete(topic);
  }

  get(topic: TTopic) {
    return this.retainStore.get(topic);
  }

  clear() {
    this.retainStore.clear();
  }

  entries() {
    return this.retainStore.entries();
  }

  dispose() {
    this.retainStore.clear();
    clearInterval(this.clearRetainTimer);
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

export class MemoryManager extends Manager {
  private readonly sessionStore: MemorySessionManager = new MemorySessionManager();
  private readonly retainStore: RetainStore = new RetainStore();
  private readonly topicManager = new TopicManager();

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
   * Registers a client connection and restores routing for any persisted session.
   *
   * @param identifier - MQTT client identifier string.
   * @param client - Live {@link MqttClient} for this session.
   */
  public async connect(identifier: TIdentifier, client: MqttClient): Promise<void> {
    this.clientIdentifierManager.set(identifier, client);
    this.sessionStore.connect(identifier, client.connData.properties.sessionExpiryInterval ?? 0);
    this.sessionStore.get(identifier)?.subscription.forEach((_, topic) => {
      this.topicManager.subscribe(topic, identifier);
    });
  }

  // Disconnect without clearing the session.
  public async disconnect(identifier: TIdentifier, disconnectData?: IDisconnectData) {
    const client = this.clientIdentifierManager.getClient(identifier);
    if (client && !client.isDisconnect) {
      client.isDisconnect = true;
      client.clearPendingRetries();
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
      this.sessionStore.get(identifier)?.subscription.forEach((_, topic) => {
        this.topicManager.unsubscribe(topic, identifier);
      });
      this.sessionStore.disconnect(identifier);
    }
  }

  public async subscribe(identifier: TIdentifier, topic: TTopic, data: TSubscribeData) {
    this.sessionStore.subscribe(identifier, topic, data);

    this.topicManager.subscribe(topic, identifier);
  }

  public async isSubscribe(identifier: TIdentifier, topic: TTopic): Promise<boolean> {
    return !!this.sessionStore.isSubscribe(identifier, topic);
  }

  public async unsubscribe(identifier: TIdentifier, topic: TTopic): Promise<void> {
    this.sessionStore.unsubscribe(identifier, topic);
    this.topicManager.unsubscribe(topic, identifier);
  }

  public async clearSession(identifier: TIdentifier): Promise<void> {
    this.sessionStore.get(identifier)?.subscription.forEach((_data, topic) => {
      this.topicManager.unsubscribe(topic, identifier);
    });
    this.sessionStore.clear(identifier);
  }

  public async hasSession(identifier: TIdentifier): Promise<boolean> {
    return this.sessionStore.has(identifier);
  }

  public async addRetainMessage(topic: TTopic, pubData: IPublishData, retainTTL?: number): Promise<void> {
    this.retainStore.update(topic, {
      buffer: encodePacket(pubData, ProtocolVersion.V5),
      expireAt: retainTTL ? Date.now() + 1000 * retainTTL : Date.now() + 1000 * 3600,
    });
  }
  public async deleteRetainMessage(topic: string): Promise<void> {
    this.retainStore.delete(topic);
  }
  public async getRetainMessage(topic: string): Promise<IPublishData | undefined> {
    const data = this.retainStore.get(topic);
    if (data) {
      if (data.expireAt === 0 || data.expireAt > Date.now()) {
        return decodePacket(data.buffer, ProtocolVersion.V5) as IPublishData;
      } else {
        this.retainStore.delete(topic);
      }
    }
  }

  public async matchRetainMessage(topic: TTopic, callbackfn: (data: IPublishData) => Promise<void>) {
    const now = Date.now();
    if (!isWildcardTopic(topic)) {
      const data = this.retainStore.get(topic);
      if (data) {
        if (data.expireAt < now) {
          this.retainStore.delete(topic);
        } else {
          await callbackfn(decodePacket(data.buffer, ProtocolVersion.V5) as IPublishData);
        }
      }
      return;
    } else {
      for (const [key, data] of this.retainStore.entries()) {
        if (data.expireAt < now) {
          this.retainStore.delete(key);
          continue;
        }
        matchTopic(key, topic) && (await callbackfn(decodePacket(data.buffer, ProtocolVersion.V5) as IPublishData));
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
  public publish(sourceIdentifier: TIdentifier, topic: TTopic, pubData: IPublishData) {
    const pubBuffer = encodePacket(pubData, ProtocolVersion.V5);

    const publishData = (targetIdentifier: TIdentifier, targetTopic: TTopic) => {
      const targetClient = this.clientIdentifierManager.getClient(targetIdentifier);
      const targetClientSubscribeData = this.sessionStore.get(targetIdentifier)?.subscription.get(targetTopic);

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
