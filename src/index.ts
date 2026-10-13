import net, { DropArgument, ListenOptions, Socket } from 'net';
import tls from 'tls';
import http from 'http';
import https from 'https';
import { WebSocketServer } from 'ws';
import WebSocketAdapter from './websocketAdapter';
import {
  AuthenticateException,
  AuthenticateReasonCode,
  ConnectAckException,
  ConnectAckReasonCode,
  DisconnectException,
  DisconnectReasonCode,
  PubAckException,
  PubAckReasonCode,
  PubCompException,
  PubCompReasonCode,
  PubRecException,
  PubRecReasonCode,
  PubRelException,
  PubRelReasonCode,
  SubscribeAckException,
  SubscribeAckReasonCode,
} from './exception';
import {
  IAuthData,
  IConnectData,
  IDisconnectData,
  IMqttOptions,
  IPubAckData,
  IPubCompData,
  IPublishData,
  IPubRecData,
  IPubRelData,
  ISubAckData,
  ISubscribeData,
  IUnsubscribeData,
  PacketType,
  PacketTypeData,
  ProtocolVersion,
  QoSType,
} from './interface';
import { StreamFramer } from './packet';
import { Manager, TMqttSocketEventMap, TMqttSocketListener, TSocket } from './manager/manager';
import { MqttClient } from './mqttClient';

/**
 * Default MQTT server feature flags and limits merged with user-supplied {@link IMqttOptions}.
 */
export const mqttDefaultOptions: Required<IMqttOptions> = {
  protocolName: 'MQTT',
  protocolVersions: [3, 4, 5],
  automaticallyAssignedClientIdentifier: true,
  maximumQoS: QoSType.QoS2,
  retainAvailable: true,
  retainTTL: 30 * 60,
  maximumPacketSize: 0xffffffff,
  topicAliasMaximum: 0xffff,
  wildcardSubscriptionAvailable: true,
  subscriptionIdentifierAvailable: true,
  sharedSubscriptionAvailable: false,
  sessionExpiryInterval: 0,
  receiveMaximum: 0xffff,
  serverKeepAlive: 0,
  qosRetryCount: 3,
  packetIdentifierTTL: 30 * 60,
  sendReasonMessage: true,
};

Object.freeze(mqttDefaultOptions);

/**
 * Bridges a low-level transport {@link net.Server} (or compatible) to MQTT sessions via {@link MqttClient}.
 * Exposes Node-style server APIs and registers per-socket MQTT lifecycle hooks.
 */
class MqttEvent {
  options: IMqttOptions;
  private eventListeners: Array<{ [E in keyof TMqttSocketEventMap]: { event: E; listener: TMqttSocketListener<E> } }[keyof TMqttSocketEventMap]> = [];

  /**
   * @param server - Underlying TCP/TLS/WebSocket server instance.
   * @param clientManager - Shared session and subscription store.
   * @param options - Partial MQTT options; merged with {@link mqttDefaultOptions}.
   */
  constructor(
    readonly server: net.Server,
    readonly clientManager: Manager,
    options: IMqttOptions = {},
  ) {
    this.options = Object.assign({}, mqttDefaultOptions, options);
    this.mqttConnection = this.mqttConnection.bind(this);
  }

  /**
   * Starts the underlying server listening; arguments match {@link net.Server.listen}.
   *
   * @param args - Forwarded to {@link net.Server.listen}.
   * @returns This instance for chaining.
   */
  listen(port?: number, hostname?: string, backlog?: number, listeningListener?: () => void): this;
  listen(port?: number, hostname?: string, listeningListener?: () => void): this;
  listen(port?: number, backlog?: number, listeningListener?: () => void): this;
  listen(port?: number, listeningListener?: () => void): this;
  listen(path: string, backlog?: number, listeningListener?: () => void): this;
  listen(path: string, listeningListener?: () => void): this;
  listen(options: ListenOptions, listeningListener?: () => void): this;
  listen(handle: any, backlog?: number, listeningListener?: () => void): this;
  listen(handle: any, listeningListener?: () => void): this;
  listen(...args: any): this {
    this.server.listen(...args);
    return this;
  }

  /**
   * Stops accepting new connections and disposes the {@link Manager}.
   *
   * @param callback - Optional error-first callback when the server has closed.
   * @returns This instance for chaining.
   */
  close(callback?: (err?: Error) => void): this {
    this.server.close(callback);
    this.clientManager.dispose().catch((err) => {
      console.error('dispose socket manager error:', err);
    });
    return this;
  }

  /**
   * @returns The bound address of the underlying server, or `null` / string depending on socket type.
   */
  address() {
    return this.server.address();
  }

  /**
   * @param cb - Receives the current number of concurrent connections.
   */
  getConnections(cb: (error: Error | null, count: number) => void): void {
    this.server.getConnections(cb);
  }

  /**
   * Keeps the process alive while the server is idle.
   * @returns This instance for chaining.
   */
  ref(): this {
    this.server.ref();
    return this;
  }

  /**
   * Allows the process to exit if this server is the only active handle.
   * @returns This instance for chaining.
   */
  unref(): this {
    this.server.unref();
    return this;
  }

  /** Maximum concurrent connections allowed by the underlying server. */
  get maxConnections() {
    return this.server.maxConnections;
  }
  set maxConnections(maxConnections: number) {
    this.server.maxConnections = maxConnections;
  }

  /** Whether the underlying server is currently accepting connections. */
  get listening(): boolean {
    return this.server.listening;
  }

  /**
   * Registers a listener on the underlying server.
   *
   * @param event - Event name.
   * @param listener - Handler invoked when the event fires.
   * @returns This instance for chaining.
   */
  addListener(event: string, listener: (...args: any[]) => void): this;
  addListener(event: 'close', listener: () => void): this;
  addListener(event: 'connection', listener: (socket: Socket) => void): this;
  addListener(event: 'error', listener: (err: Error) => void): this;
  addListener(event: 'listening', listener: () => void): this;
  addListener(event: 'drop', listener: (data?: DropArgument) => void): this;
  addListener(event: string, listener: (...args: any[]) => void): this {
    this.server.addListener(event, listener);
    return this;
  }

  /**
   * Emits an event on the underlying server.
   *
   * @param event - Event name or symbol.
   * @param args - Event payload.
   * @returns `true` if any listener handled the event.
   */
  emit(event: 'close'): boolean;
  emit(event: 'connection', socket: Socket): boolean;
  emit(event: 'error', err: Error): boolean;
  emit(event: 'listening'): boolean;
  emit(event: 'drop', data?: DropArgument): boolean;
  emit(event: string | symbol, ...args: any[]): boolean {
    return this.server.emit(event, ...args);
  }

  /**
   * Subscribes to an event on the underlying server.
   *
   * @param event - Event name.
   * @param listener - Handler invoked on each occurrence.
   * @returns This instance for chaining.
   */
  on(event: 'close', listener: () => void): this;
  on(event: 'connection', listener: (socket: Socket) => void): this;
  on(event: 'error', listener: (err: Error) => void): this;
  on(event: 'listening', listener: () => void): this;
  on(event: 'drop', listener: (data?: DropArgument) => void): this;
  on(event: string, listener: (...args: any[]) => void): this {
    this.server.on(event, listener);
    return this;
  }

  /**
   * Subscribes once; the listener is removed after the first invocation.
   *
   * @param event - Event name.
   * @param listener - Handler invoked at most once.
   * @returns This instance for chaining.
   */
  once(event: 'close', listener: () => void): this;
  once(event: 'connection', listener: (socket: Socket) => void): this;
  once(event: 'error', listener: (err: Error) => void): this;
  once(event: 'listening', listener: () => void): this;
  once(event: 'drop', listener: (data?: DropArgument) => void): this;
  once(event: string, listener: (...args: any[]) => void): this {
    this.server.once(event, listener);
    return this;
  }

  /**
   * Adds a listener that runs before existing listeners for the same event.
   *
   * @param event - Event name.
   * @param listener - Handler to prepend.
   * @returns This instance for chaining.
   */
  prependListener(event: 'close', listener: () => void): this;
  prependListener(event: 'connection', listener: (socket: Socket) => void): this;
  prependListener(event: 'error', listener: (err: Error) => void): this;
  prependListener(event: 'listening', listener: () => void): this;
  prependListener(event: 'drop', listener: (data?: DropArgument) => void): this;
  prependListener(event: string, listener: (...args: any[]) => void): this {
    this.server.prependListener(event, listener);
    return this;
  }

  /**
   * Prepends a one-shot listener removed after the first invocation.
   *
   * @param event - Event name.
   * @param listener - Handler to prepend.
   * @returns This instance for chaining.
   */
  prependOnceListener(event: 'close', listener: () => void): this;
  prependOnceListener(event: 'connection', listener: (socket: Socket) => void): this;
  prependOnceListener(event: 'error', listener: (err: Error) => void): this;
  prependOnceListener(event: 'listening', listener: () => void): this;
  prependOnceListener(event: 'drop', listener: (data?: DropArgument) => void): this;
  prependOnceListener(event: string, listener: (...args: any[]) => void): this {
    this.server.prependOnceListener(event, listener);
    return this;
  }

  /**
   * Registers a hook invoked for each new MQTT socket when that event is emitted on the socket.
   *
   * @param event - Client event name (e.g. `connect`, `publish`).
   * @param listener - Async handler; return `false` to abort default handling where applicable.
   * @returns This instance for chaining.
   */
  addClientEventListener<E extends keyof TMqttSocketEventMap>(event: E, listener: TMqttSocketListener<E>): this {
    this.eventListeners.push({ event, listener } as (typeof this.eventListeners)[number]);
    return this;
  }

  /**
   * Runs all listeners for `event` on `socket` in order; stops if any returns `false`.
   *
   * @param socket - MQTT socket emitting the event.
   * @param event - Client event name.
   * @param args - Arguments passed to each listener.
   * @returns `false` if a listener returned `false`; otherwise `true`.
   */
  async clientEmitAsync<E extends keyof TMqttSocketEventMap>(socket: TSocket, event: E, ...args: TMqttSocketEventMap[E]['args']) {
    for (const listener of socket.listeners(event)) {
      if (!((await listener(...args)) !== false)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Attaches all {@link addClientEventListener} hooks to the given socket.
   *
   * @param socket - Connected MQTT socket.
   * @returns This instance for chaining.
   */
  private onClientEventListener(socket: TSocket) {
    this.eventListeners.forEach((eventListener) => {
      socket.on(eventListener.event, eventListener.listener);
    });
    return this;
  }

  /**
   * @param listener - Invoked once per new MQTT socket after the socket is accepted.
   * @returns This instance for chaining.
   */
  onConnection(listener: TMqttSocketListener<'connection'>): this {
    return this.addClientEventListener('connection', listener);
  }

  /**
   * @param listener - Invoked for the CONNECT packet; return `false` to reject.
   * @returns This instance for chaining.
   */
  onConnect(listener: TMqttSocketListener<'connect'>): this {
    return this.addClientEventListener('connect', listener);
  }

  /**
   * @param listener - Invoked for DISCONNECT packets; return `false` to abort default handling.
   * @returns This instance for chaining.
   */
  onDisconnect(listener: TMqttSocketListener<'disconnect'>): this {
    return this.addClientEventListener('disconnect', listener);
  }

  /**
   * @param listener - Invoked for PINGREQ; return `false` to skip default PINGRESP.
   * @returns This instance for chaining.
   */
  onPing(listener: TMqttSocketListener<'ping'>): this {
    return this.addClientEventListener('ping', listener);
  }

  /**
   * @param listener - Invoked for PUBLISH; return `false` to abort handling.
   * @returns This instance for chaining.
   */
  onPublish(listener: TMqttSocketListener<'publish'>): this {
    return this.addClientEventListener('publish', listener);
  }

  /**
   * @param listener - Invoked for PUBREL (QoS 2).
   * @returns This instance for chaining.
   */
  onPubRel(listener: TMqttSocketListener<'pubRel'>): this {
    return this.addClientEventListener('pubRel', listener);
  }

  /**
   * @param listener - Invoked for PUBREC (QoS 2).
   * @returns This instance for chaining.
   */
  onPubRec(listener: TMqttSocketListener<'pubRec'>): this {
    return this.addClientEventListener('pubRec', listener);
  }

  /**
   * @param listener - Invoked for PUBCOMP (QoS 2 completion).
   * @returns This instance for chaining.
   */
  onPubComp(listener: TMqttSocketListener<'pubComp'>): this {
    return this.addClientEventListener('pubComp', listener);
  }

  /**
   * @param listener - Invoked for SUBSCRIBE; return `false` to skip default SUBACK.
   * @returns This instance for chaining.
   */
  onSubscribe(listener: TMqttSocketListener<'subscribe'>): this {
    return this.addClientEventListener('subscribe', listener);
  }

  /**
   * @param listener - Invoked for UNSUBSCRIBE.
   * @returns This instance for chaining.
   */
  onUnsubscribe(listener: TMqttSocketListener<'unsubscribe'>): this {
    return this.addClientEventListener('unsubscribe', listener);
  }

  /**
   * @param listener - Invoked for MQTT 5 AUTH packets.
   * @returns This instance for chaining.
   */
  onAuth(listener: TMqttSocketListener<'auth'>): this {
    return this.addClientEventListener('auth', listener);
  }

  /**
   * Binds packet parsing, {@link MqttClient} dispatch, and user hooks for one MQTT socket transport.
   *
   * @param socket - Socket-like transport (TCP or {@link WebSocketAdapter}).
   */
  public async mqttConnection(socket: TSocket) {
    const client = new MqttClient(socket, this.clientManager, this.options as Required<IMqttOptions>);
    this.onClientEventListener(socket);

    await this.clientEmitAsync(socket, 'connection', socket);
    let protocolVersion = ProtocolVersion.V5;
    const framer = new StreamFramer();
    socket.on('data', async (buffer) => {
      try {
        const allPacketData = framer.push(buffer, protocolVersion);

        for (const data of allPacketData) {
          try {
            await client.commonHandle(data);
            if (!(data.header.packetType === PacketType.PINGREQ || data.header.packetType === PacketType.PINGRESP)) {
              await client.updateKeepaliveTime();
            }
            switch (data.header.packetType) {
              case PacketType.CONNECT:
                protocolVersion = (data as IConnectData).header.protocolVersion;
                await client.connectHandle(data as IConnectData, this.clientEmitAsync);
                break;
              case PacketType.PUBLISH: {
                await client.publishHandle(data as IPublishData, this.clientEmitAsync);
                break;
              }
              case PacketType.PUBACK:
                (await this.clientEmitAsync(socket, 'pubAck', data as IPubAckData, client, this.clientManager)) &&
                  (await client.pubAckHandle(data as IPubAckData));
                break;
              case PacketType.PUBREC:
                (await this.clientEmitAsync(socket, 'pubRec', data as IPubRecData, client, this.clientManager)) &&
                  (await client.pubRecHandle(data as IPubRecData));
                break;
              case PacketType.PUBREL:
                (await this.clientEmitAsync(socket, 'pubRel', data as IPubRelData, client, this.clientManager)) &&
                  (await client.pubRelHandle(data as IPubRelData));
                break;
              case PacketType.PUBCOMP:
                (await this.clientEmitAsync(socket, 'pubComp', data as IPubCompData, client, this.clientManager)) &&
                  (await client.pubCompHandle(data as IPubCompData));
                break;
              case PacketType.SUBSCRIBE:
                (await this.clientEmitAsync(socket, 'subscribe', data as ISubscribeData, client, this.clientManager)) &&
                  (await client.subscribeHandle(data as ISubscribeData));
                break;
              case PacketType.UNSUBSCRIBE:
                (await this.clientEmitAsync(socket, 'unsubscribe', data as IUnsubscribeData, client, this.clientManager)) &&
                  (await client.unsubscribeHandle(data as IUnsubscribeData));
                break;
              case PacketType.PINGREQ:
                (await this.clientEmitAsync(socket, 'ping', socket, this.clientManager)) && (await client.pingReqHandle());
                break;
              case PacketType.DISCONNECT:
                (await this.clientEmitAsync(socket, 'disconnect', data as IDisconnectData, client, this.clientManager)) &&
                  (await client.disconnectHandle(data as IDisconnectData));
                break;
              case PacketType.AUTH:
                (await this.clientEmitAsync(socket, 'auth', data as IAuthData, client, this.clientManager)) &&
                  (await client.authHandle(data as IAuthData));
                break;
              default:
                console.log('Unhandled packet type:', data);
            }
          } catch (error: any) {
            if (!this.options.sendReasonMessage) {
              delete (error as any).msg;
            }
            await catchMqttError(error, client, data);
            console.error('Capture Event Error:', (error.message ?? error.msg ?? error._msg) || 'Unknown error');
            break;
          }
        }
      } catch (error) {
        try {
          console.log('Capture Packet Error:', error);
          if (!this.options.sendReasonMessage) {
            delete (error as any).msg;
          }
          await catchMqttError(error, client, undefined);
        } catch (unknownError) {
          console.log(unknownError);
        }
      }
    });

    socket.on('end', () => {
      // console.log('Client disconnected');
    });

    socket.on('error', (err) => {
      client.handleDisconnect(DisconnectReasonCode.UnspecifiedError, { reasonString: err.message });
      console.error('Client error:', err.message);
    });

    socket.on('close', (hadError: boolean) => {
      // Clear socket state synchronously so the close path stays non-blocking.
      this.clientManager.clearConnect(client);
      // Defer will message publish so it does not block the close handler.
      setImmediate(() => {
        client.publishWillMessage(this.clientEmitAsync).catch((err) => {
          console.error('Error publishing will message:', err.message);
        });
      });
      if (hadError) {
        console.error('Connection closed due to error!');
      }
    });
  }
}

/**
 * Maps structured MQTT exceptions from handlers into wire-level responses via {@link MqttClient}.
 *
 * @param error - Thrown exception subclass from `./exception`.
 * @param client - Active connection session for the socket.
 * @param data - Parsed packet associated with the error, when applicable.
 */
async function catchMqttError(error: unknown, client: MqttClient, data?: PacketTypeData) {
  if (error instanceof DisconnectException) {
    await client.handleDisconnect(error.code as DisconnectReasonCode, { reasonString: error.msg });
  } else if (error instanceof ConnectAckException) {
    await client.handleConnAck(data as IConnectData, error.code as ConnectAckReasonCode, error.msg);
  } else if (error instanceof SubscribeAckException && data) {
    const subAckData: ISubAckData = {
      header: {
        packetType: PacketType.SUBACK,
        retain: 0x00,
        packetIdentifier: (data as ISubscribeData).header.packetIdentifier ?? 0,
      },
      properties: {
        reasonString: error.msg,
      },
      reasonCode: error.code as SubscribeAckReasonCode,
    };
    await client.handleSubAck(subAckData);
  } else if (error instanceof PubAckException && data) {
    if ((data as IPublishData).header.qosLevel === QoSType.QoS0) {
      return;
    }
    const pubAckData: IPubAckData = {
      header: {
        packetType: PacketType.PUBACK,
        received: 0x00,
        packetIdentifier: (data as IPublishData).header.packetIdentifier ?? 0,
        reasonCode: error.code as PubAckReasonCode,
      },
      properties: {
        reasonString: error.msg,
      },
    };
    await client.handlePubAck(pubAckData);
  } else if (error instanceof PubRecException && data) {
    const pubRecData: IPubRecData = {
      header: {
        packetType: PacketType.PUBREC,
        received: 0x00,
        packetIdentifier: (data as IPublishData).header.packetIdentifier ?? 0,
        reasonCode: error.code as PubRecReasonCode,
      },
      properties: {
        reasonString: error.msg,
      },
    };
    await client.handlePubRec(pubRecData);
  } else if (error instanceof PubRelException && data) {
    const pubRelData: IPubRelData = {
      header: {
        packetType: PacketType.PUBREL,
        received: 0x00,
        packetIdentifier: (data as IPubRelData).header.packetIdentifier ?? 0,
        reasonCode: error.code as PubRelReasonCode,
      },
      properties: {
        reasonString: error.msg,
      },
    };
    await client.pubRelHandle(pubRelData);
  } else if (error instanceof PubCompException && data) {
    const pubCompData: IPubCompData = {
      header: {
        packetType: PacketType.PUBCOMP,
        received: 0x00,
        packetIdentifier: (data as IPubCompData).header.packetIdentifier ?? 0,
        reasonCode: error.code as PubCompReasonCode,
      },
      properties: {
        reasonString: error.msg,
      },
    };
    await client.handlePubComp(pubCompData);
  } else if (error instanceof AuthenticateException) {
    const authData: IAuthData = {
      header: {
        packetType: PacketType.AUTH,
        received: 0x00,
        reasonCode: error.code as AuthenticateReasonCode,
      },
      properties: {
        reasonString: error.msg,
      },
    };
    await client.authHandle(authData);
  } else {
    throw error;
  }
}

/**
 * Plain TCP MQTT server using {@link net.createServer}.
 */
export class MqttServer extends MqttEvent {
  /**
   * @param clientManager - Shared session and subscription store.
   * @param options - Partial MQTT options; merged with {@link mqttDefaultOptions}.
   */
  constructor(
    readonly clientManager: Manager,
    options: IMqttOptions = {},
  ) {
    const server = net.createServer();
    super(server, clientManager, options);

    this.server.on('connection', this.mqttConnection);
  }

  /**
   * @param args - Forwarded to {@link net.Server.listen}.
   * @returns This instance for chaining.
   */
  listen(...args: any): this {
    this.server.listen(...args);
    return this;
  }
}

/**
 * MQTT server over TLS; accepts secure TCP connections via {@link tls.createServer}.
 */
export class MqttServerTLS extends MqttEvent {
  server: tls.Server;

  /**
   * @param tlsOptions - TLS key, cert, and related options.
   * @param clientManager - Shared session and subscription store.
   * @param options - Partial MQTT options; merged with {@link mqttDefaultOptions}.
   */
  constructor(tlsOptions: tls.TlsOptions, clientManager: Manager, options: IMqttOptions = {}) {
    const server = tls.createServer(tlsOptions);
    super(server, clientManager, options);
    this.server = server;
    this.server.on('secureConnection', this.mqttConnection);
  }

  /**
   * @param args - Forwarded to {@link tls.Server.listen}.
   * @returns This instance for chaining.
   */
  listen(...args: any): this {
    this.server.listen(...args);
    return this;
  }
}

/**
 * MQTT over WebSocket on plain HTTP; the embedded {@link WebSocketServer} negotiates the `mqtt` subprotocol.
 */
export class MqttServerWebSocket extends MqttEvent {
  private httpServer: http.Server;

  /**
   * @param clientManager - Shared session and subscription store.
   * @param options - Partial MQTT options; merged with {@link mqttDefaultOptions}.
   */
  constructor(clientManager: Manager, options: IMqttOptions = {}) {
    const httpServer = http.createServer();
    const wss = new WebSocketServer({
      server: httpServer,
      handleProtocols: (protocols) => {
        return protocols.has('mqtt') ? 'mqtt' : false;
      },
    });
    super(wss as any, clientManager, options);
    this.httpServer = httpServer;
    wss.on('connection', (ws) => {
      const adapter = new WebSocketAdapter(ws as any);
      this.mqttConnection(adapter);
    });
  }

  /**
   * @param args - Forwarded to {@link http.Server.listen}.
   * @returns This instance for chaining.
   */
  listen(...args: any): this {
    this.httpServer.listen(...args);
    return this;
  }
}

/**
 * MQTT over WebSocket on HTTPS; same subprotocol selection as {@link MqttServerWebSocket}.
 */
export class MqttServerWebSocketSecure extends MqttEvent {
  httpServer: https.Server;

  /**
   * @param httpsOptions - TLS and HTTP server options for {@link https.createServer}.
   * @param clientManager - Shared session and subscription store.
   * @param options - Partial MQTT options; merged with {@link mqttDefaultOptions}.
   */
  constructor(httpsOptions: https.ServerOptions, clientManager: Manager, options: IMqttOptions = {}) {
    const httpServer = https.createServer(httpsOptions);
    const wss = new WebSocketServer({
      server: httpServer,
      handleProtocols: (protocols) => {
        return protocols.has('mqtt') ? 'mqtt' : false;
      },
    });
    super(wss as any, clientManager, options);
    this.httpServer = httpServer;
    wss.on('connection', (ws) => {
      const adapter = new WebSocketAdapter(ws as any);
      this.mqttConnection(adapter);
    });
  }

  /**
   * @param args - Forwarded to {@link https.Server.listen}.
   * @returns This instance for chaining.
   */
  listen(...args: any): this {
    this.httpServer.listen(...args);
    return this;
  }
}

export * from './exception';
export * from './interface';
export * from './manager/manager';
export * from './manager/memoryManager';
export * from './manager/redisManager';
export * from './manager/redis2Manager';
export * from './packet';
export * from './dataRepresentations';
export * from './property';
export * from './mqttClient';
export * from './utils';
export * from './topicFilters';
