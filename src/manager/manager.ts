import net from 'net';
import {
  IAuthData,
  IConnectData,
  IDisconnectData,
  IPubAckData,
  IPubCompData,
  IPublishData,
  IPubRecData,
  IPubRelData,
  ISubscribeData,
  IUnsubscribeData,
  ProtocolVersion,
  QoSType,
  TIdentifier,
  TTopic,
} from '../interface';
import { MqttClient } from '../mqttClient';
import { isWildcardTopic, matchTopic } from '../topicFilters';

/**
 * Typed args + return for MQTT lifecycle events on a {@link TSocket}.
 * Source of truth for {@link MqttEvent} `on*` hooks and `socket.on(...)`.
 */
export interface TMqttSocketEventMap {
  connection: {
    args: [socket: TSocket];
    return: Promise<void>;
  };
  connect: {
    args: [data: IConnectData, client: MqttClient, clientManager: Manager];
    return: Promise<boolean | void>;
  };
  disconnect: {
    args: [data: IDisconnectData, client: MqttClient, clientManager: Manager];
    return: Promise<boolean | void>;
  };
  publish: {
    args: [data: IPublishData, client: MqttClient, clientManager: Manager];
    return: Promise<boolean | void>;
  };
  pubAck: {
    args: [data: IPubAckData, client: MqttClient, clientManager: Manager];
    return: Promise<boolean | void>;
  };
  pubRec: {
    args: [data: IPubRecData, client: MqttClient, clientManager: Manager];
    return: Promise<boolean | void>;
  };
  pubRel: {
    args: [data: IPubRelData, client: MqttClient, clientManager: Manager];
    return: Promise<boolean | void>;
  };
  pubComp: {
    args: [data: IPubCompData, client: MqttClient, clientManager: Manager];
    return: Promise<boolean | void>;
  };
  subscribe: {
    args: [data: ISubscribeData, client: MqttClient, clientManager: Manager];
    return: Promise<boolean | void>;
  };
  unsubscribe: {
    args: [data: IUnsubscribeData, client: MqttClient, clientManager: Manager];
    return: Promise<boolean | void>;
  };
  /** PINGREQ: no packet payload is forwarded — only the socket and manager. */
  ping: {
    args: [socket: TSocket, clientManager: Manager];
    return: Promise<boolean | void>;
  };
  auth: {
    args: [data: IAuthData, client: MqttClient, clientManager: Manager];
    return: Promise<boolean | void>;
  };
}

/** Listener signature for one MQTT socket event (args + return from {@link TMqttSocketEventMap}). */
export type TMqttSocketListener<E extends keyof TMqttSocketEventMap> = (...args: TMqttSocketEventMap[E]['args']) => TMqttSocketEventMap[E]['return'];

/** Typed `clientEmitAsync` callback used by packet handlers. */
export type TMqttClientEmitAsync = <E extends keyof TMqttSocketEventMap>(
  socket: TSocket,
  event: E,
  ...args: TMqttSocketEventMap[E]['args']
) => Promise<boolean>;

/** Common {@link net.Socket} events kept typed after `on` / `once` are remapped. */
interface TSocketNativeEventMap {
  data: { args: [buffer: Buffer]; return: void };
  end: { args: []; return: void };
  error: { args: [err: Error]; return: void };
  close: { args: [hadError: boolean]; return: void };
}

type TSocketEventMap = TMqttSocketEventMap & TSocketNativeEventMap;

/** Listener for `socket.on` / `once`: allows sync returns in addition to the mapped Promise return. */
type TSocketEventListener<E extends keyof TSocketEventMap> = (
  ...args: TSocketEventMap[E]['args']
) => TSocketEventMap[E]['return'] | Awaited<TSocketEventMap[E]['return']>;

/**
 * TCP (or WebSocket-adapted) socket with typed MQTT + native `on` / `once` overloads.
 *
 * @remarks
 * Implemented as `Omit<net.Socket, 'on' | 'once'> & …` so MQTT event keys do not replace
 * Socket’s built-in overloads (interface `extends` would wipe `data` / `error` / …).
 */
export type TSocket = Omit<net.Socket, 'on' | 'once'> & {
  on<E extends keyof TSocketEventMap>(event: E, listener: TSocketEventListener<E>): TSocket;
  on(event: string | symbol, listener: (...args: any[]) => void): TSocket;
  once<E extends keyof TSocketEventMap>(event: E, listener: TSocketEventListener<E>): TSocket;
  once(event: string | symbol, listener: (...args: any[]) => void): TSocket;
};

/** Maps each MQTT client id to its live {@link MqttClient}. */
export type TClientMap = Map<TIdentifier, MqttClient>;

/** Maps each socket to its client identifier string (convenience view). */
export type ClientIdentifierMap = Map<MqttClient, string>;

/** Per-topic subscription options for a client (QoS, MQTT 5 options, protocol version). */
export type TSubscribeData = {
  qos: QoSType;
  date: number;
  subscriptionIdentifier?: number | Array<number>;
  noLocal: boolean;
  retainAsPublished: boolean;
  protocolVersion: ProtocolVersion;
  sharedGroup?: string;
};
/** Map from topic (or filter) to subscription metadata for one client. */
export type TSubscription = Map<TTopic, TSubscribeData>;

/**
 * Registry of live MQTT clients keyed by client identifier.
 *
 * @remarks
 * Look up a connected {@link MqttClient} (or its {@link TSocket}) by MQTT client id.
 */
export class ClientIdentifierManager {
  private readonly clientMap: TClientMap;
  constructor() {
    this.clientMap = new Map();
  }

  /**
   * @param identifier - MQTT client identifier string.
   * @returns Whether the given identifier is registered.
   */
  has(identifier: TIdentifier) {
    return this.clientMap.has(identifier);
  }

  /**
   * @param identifier - MQTT client identifier string.
   * @returns The underlying {@link TSocket} for that id, if connected.
   */
  geTSocket(identifier: TIdentifier) {
    return this.clientMap.get(identifier)?.socket;
  }
  /**
   * @param identifier - MQTT client identifier string.
   * @returns The {@link MqttClient} for that id, if connected.
   */
  getClient(identifier: TIdentifier) {
    return this.clientMap.get(identifier);
  }

  /**
   * Registers a client: associates identifier with the live session.
   *
   * @param identifier - MQTT client identifier.
   * @param client - Connected {@link MqttClient}.
   */
  set(identifier: TIdentifier, client: MqttClient): void {
    this.clientMap.set(identifier, client);
  }

  /**
   * Removes a client by identifier string.
   *
   * @param identifier - MQTT client identifier.
   * @returns Whether an entry was removed.
   */
  delete(identifier: TIdentifier) {
    return this.clientMap.delete(identifier);
  }

  /** Removes all client registrations. */
  clear() {
    this.clientMap.clear();
  }

  /** Number of registered clients (same as identifier map size). */
  get size() {
    return this.clientMap.size;
  }

  /**
   * @returns Iterator over registered client identifier strings.
   */
  clientKeys() {
    return this.clientMap.keys();
  }

  /**
   * @returns Iterator over registered client identifier strings.
   */
  identifierKeys() {
    return this.clientMap.keys();
  }

  /**
   * @returns Iterator over registered {@link MqttClient} instances.
   */
  clientValues() {
    return this.clientMap.values();
  }

  /**
   * @param callbackfn - Called for each {@link MqttClient} and its identifier.
   */
  clientForEach(callbackfn: (value: MqttClient, key: TIdentifier, map: Map<TIdentifier, MqttClient>) => void) {
    this.clientMap.forEach(callbackfn);
  }
}

export class TopicHashRegexManager {
  private readonly exact: Map<TTopic, Set<TIdentifier>> = new Map();
  private readonly blur: Map<TTopic, { topic: string; ids: Set<TIdentifier> }> = new Map();

  subscribe(topic: TTopic, identifier: TIdentifier, enableWildcard = true) {
    if (isWildcardTopic(topic) && enableWildcard) {
      this.blur.get(topic)?.ids.add(identifier) ?? this.blur.set(topic, { topic, ids: new Set([identifier]) });
    } else {
      this.exact.get(topic)?.add(identifier) ?? this.exact.set(topic, new Set([identifier]));
    }
  }

  unsubscribe(topic: TTopic, identifier: TIdentifier, enableWildcard = true) {
    if (isWildcardTopic(topic) && enableWildcard) {
      const data = this.blur.get(topic);
      if (data) {
        data.ids.delete(identifier);
        !data.ids.size && this.blur.delete(topic);
      }
    } else {
      const ids = this.exact.get(topic);
      if (ids) {
        ids.delete(identifier);
        !ids.size && this.exact.delete(topic);
      }
    }
  }

  *getMatchBlur(topic: TTopic, enableWildcard = true) {
    // 精准匹配
    const idSet = this.exact.get(topic);
    if (idSet) {
      for (const id of idSet) {
        yield [id, topic];
      }
    }

    // 通配符匹配
    if (enableWildcard) {
      for (const [wildcardTopic, data] of this.blur) {
        if (matchTopic(topic, wildcardTopic)) {
          for (const id of data.ids) {
            yield [id, data.topic];
          }
        }
      }
    }
  }
}
interface IRouteNode {
  clients: Map<TIdentifier, TTopic>;
  child?: IRoute;
}

interface IRoute {
  [key: string]: IRouteNode;
}
export class TopicTrieManager {
  private route: IRoute = {};

  subscribe(topic: TTopic, id: TIdentifier): void {
    const nodes = topic.split('/');
    let route = this.route;

    for (let i = 0; i < nodes.length; i++) {
      const level = nodes[i];
      const current = (route[level] ??= { clients: new Map() });

      if (i === nodes.length - 1) {
        current.clients.set(id, topic);
      } else {
        route = current.child ??= {};
      }
    }
  }

  unsubscribe(topic: TTopic, id: TIdentifier): void {
    const nodes = topic.split('/');

    const remove = (route: IRoute, index: number): void => {
      const level = nodes[index];
      const node = route[level];
      if (!node) return;

      if (index === nodes.length - 1) {
        node.clients.delete(id);
      } else if (node.child) {
        remove(node.child, index + 1);
      }

      if (!node.clients.size && !Object.keys(node.child ?? {}).length) {
        delete route[level];
      }
    };

    remove(this.route, 0);
  }

  /** 返回 [客户端 ID, 匹配的订阅过滤器] */

  /** 逐条返回 [客户端 ID, 匹配的订阅过滤器] */
  *matchTopic(topic: TTopic): Generator<[TIdentifier, TTopic]> {
    const nodes = topic.split('/');
    const isSystemTopic = nodes[0].startsWith('$');

    const collect = function* (node?: IRouteNode): Generator<[TIdentifier, TTopic]> {
      if (!node) return;

      for (const [id, filter] of node.clients) {
        yield [id, filter];
      }
    };

    function* match(route: IRoute, index: number): Generator<[TIdentifier, TTopic]> {
      const level = nodes[index];
      const isLast = index === nodes.length - 1;

      // # 匹配零层或多层
      if (!(index === 0 && isSystemTopic)) {
        yield* collect(route['#']);
      }

      const descend = function* (key: string): Generator<[TIdentifier, TTopic]> {
        const node = route[key];
        if (!node) return;

        if (isLast) {
          yield* collect(node);

          // sensor/# 也匹配 sensor
          if (key !== '#') {
            yield* collect(node.child?.['#']);
          }
        } else if (node.child) {
          yield* match(node.child, index + 1);
        }
      };

      yield* descend(level);

      // + 匹配一个层级，但根层不能匹配 $ 开头的主题
      if (!(index === 0 && isSystemTopic)) {
        yield* descend('+');
      }
    }

    yield* match(this.route, 0);
  }
}

/**
 * Abstract base for MQTT session/subscription/publish backends (memory, Redis, etc.).
 *
 * @remarks
 * Subclasses implement connection state, subscriptions, retained messages, and may delegate packet-id storage to {@link ClientIdentifierManager}.
 * This class owns the registry of live clients and a 30-minute sweep that expires unused outbound
 * packet identifiers across all of them. QoS 1/2 resend timers are not managed here: each
 * {@link MqttClient} owns its own `publishQosRetry` / `receiveQos2Retry` trackers.
 */
export abstract class Manager {
  readonly clientIdentifierManager: ClientIdentifierManager;
  // private readonly packetIdentifierCleanupTimer: NodeJS.Timeout;

  constructor() {
    this.clientIdentifierManager = new ClientIdentifierManager();
  }

  /**
   * @param key - Client identifier string.
   * @returns True if considered connected.
   */
  abstract isConnected(identifier: TIdentifier): Promise<boolean>;

  /**
   * Establishes or restores a session for an incoming connection.
   *
   * @param clientIdentifier - MQTT client id.
   * @param connData - CONNECT payload-derived session options.
   * @param client - Live {@link MqttClient} for this session.
   */
  abstract connect(identifier: TIdentifier, client: MqttClient): Promise<void>;

  /**
   * Gracefully closes the transport for a client id or the given {@link MqttClient}.
   *
   * @param clientIdentifier - Client id string, or the {@link MqttClient} to end.
   */
  abstract disconnect(identifier: TIdentifier, disconnectData?: IDisconnectData, protocolVersion?: ProtocolVersion): void;

  /**
   * @param clientIdentifier - MQTT client id.
   * @returns Whether a non-expired session exists for this client.
   */
  abstract hasSession(identifier: TIdentifier): Promise<boolean>;

  /**
   * Removes all subscription state for a client.
   *
   * @param clientIdentifier - Subscriber client id.
   */
  abstract clearSession(identifier: TIdentifier): Promise<void>;

  /**
   * Adds or updates a topic subscription for a client.
   *
   * @param clientIdentifier - Subscriber client id.
   * @param topic - Topic filter or name.
   * @param data - QoS and MQTT 5 subscription options.
   */
  abstract subscribe(identifier: TIdentifier, topic: TTopic, data: TSubscribeData): Promise<void>;

  /**
   * Removes a topic subscription for a client.
   *
   * @param clientIdentifier - Subscriber client id.
   * @param topic - Topic to unsubscribe.
   */
  abstract unsubscribe(identifier: TIdentifier, topic: TTopic): Promise<void>;

  /**
   * @param clientIdentifier - Client id.
   * @param topic - Topic to check.
   * @returns Whether the client is subscribed to that topic.
   */
  abstract isSubscribe(identifier: TIdentifier, topic: TTopic): Promise<boolean>;

  /**
   * Publishes a message to matching subscribers (implementation handles fan-out and QoS).
   *
   * @param clientIdentifier - Publishing client id (source).
   * @param topic - Publish topic.
   * @param pubData - Payload and MQTT 5 publish properties.
   */
  abstract publish(identifier: TIdentifier, topic: TTopic, pubData: IPublishData): void;

  /** Retained message store: add or replace retained message for a topic (optional TTL). */
  abstract addRetainMessage(topic: string, pubData: IPublishData, retainTTL?: number): Promise<void>;

  /** Removes the retained message for a topic, if any. */
  abstract deleteRetainMessage(topic: string): Promise<void>;

  /** @returns Retained payload for the topic, if present. */
  abstract getRetainMessage(topic: string): Promise<IPublishData | undefined>;

  /**
   * Iterates retained messages, optionally scoped to one topic prefix/filter.
   *
   * @param callbackfn - Async handler per topic.
   * @param topic - If set, restricts iteration (implementation-defined).
   */
  abstract matchRetainMessage(topic: TTopic, callbackfn: (data: IPublishData) => Promise<void>): Promise<void>;

  /**
   * Releases backend resources (default: no-op; override in concrete managers).
   */
  public async dispose(): Promise<void> {}
}

export class ClientPacketIdentifierManager extends Map<number, number> {
  private dynamicId = 0;
  private readonly ttl: number;
  constructor(ttl: number) {
    super();
    this.ttl = ttl * 1000;
  }

  public newPacketIdentifier() {
    this.dynamicId = this.dynamicId > 0 ? --this.dynamicId : 0;
    this.set(this.dynamicId, Date.now() + this.ttl);
    return this.dynamicId;
  }

  public clearExpiredIdentifiers() {
    const now = Date.now();
    for (const [id, ttl] of this.entries()) {
      if (ttl < now) {
        this.delete(id);
      }
    }
  }

  public set receiveMaximum(v: number) {
    this.dynamicId = v + 1;
  }
}
