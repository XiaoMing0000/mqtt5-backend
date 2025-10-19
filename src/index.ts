import net, { DropArgument, ListenOptions, Socket } from 'net';
import tls from 'tls';
import http from 'http';
import https from 'https';
import { WebSocketServer } from 'ws';
import WebSocketAdapter from './websocketAdapter';
import {
	AuthenticateException,
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
	QoSType,
} from './interface';
import { parseAllPacket } from './parse';
import { Manager, TClient } from './manager/manager';
import { MqttManager } from './mqttManager';

const mqttDefaultOptions: IMqttOptions = {
	protocolName: 'MQTT',
	protocolVersion: 5,
	assignedClientIdentifier: false,
	maximumQoS: QoSType.QoS2,
	retainAvailable: true,
	retainTTL: 30 * 60,
	maximumPacketSize: 1 << 20,
	topicAliasMaximum: 0xffff,
	wildcardSubscriptionAvailable: true,
};

class MqttEvent {
	options: IMqttOptions;
	private eventListeners: Array<{ event: string; listener: (...args: any[]) => Promise<boolean> }> = [];

	constructor(
		readonly server: net.Server,
		readonly clientManager: Manager,
		options: IMqttOptions = {},
	) {
		this.clientManager = clientManager;
		this.options = Object.assign({}, mqttDefaultOptions, options);
		this.mqttConnection = this.mqttConnection.bind(this);
	}

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

	close(callback?: (err?: Error) => void): this {
		this.server.close(callback);
		return this;
	}

	address() {
		return this.server.address();
	}

	getConnections(cb: (error: Error | null, count: number) => void): void {
		this.server.getConnections(cb);
	}

	ref(): this {
		this.server.ref();
		return this;
	}

	unref(): this {
		this.server.unref();
		return this;
	}

	get maxConnections() {
		return this.server.maxConnections;
	}
	set maxConnections(maxConnections: number) {
		this.server.maxConnections = maxConnections;
	}

	get listening(): boolean {
		return this.server.listening;
	}

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

	emit(event: 'close'): boolean;
	emit(event: 'connection', socket: Socket): boolean;
	emit(event: 'error', err: Error): boolean;
	emit(event: 'listening'): boolean;
	emit(event: 'drop', data?: DropArgument): boolean;
	emit(event: string | symbol, ...args: any[]): boolean {
		return this.server.emit(event, ...args);
	}

	on(event: 'close', listener: () => void): this;
	on(event: 'connection', listener: (socket: Socket) => void): this;
	on(event: 'error', listener: (err: Error) => void): this;
	on(event: 'listening', listener: () => void): this;
	on(event: 'drop', listener: (data?: DropArgument) => void): this;
	on(event: string, listener: (...args: any[]) => void): this {
		this.server.on(event, listener);
		return this;
	}

	once(event: 'close', listener: () => void): this;
	once(event: 'connection', listener: (socket: Socket) => void): this;
	once(event: 'error', listener: (err: Error) => void): this;
	once(event: 'listening', listener: () => void): this;
	once(event: 'drop', listener: (data?: DropArgument) => void): this;
	once(event: string, listener: (...args: any[]) => void): this {
		this.server.once(event, listener);
		return this;
	}

	prependListener(event: 'close', listener: () => void): this;
	prependListener(event: 'connection', listener: (socket: Socket) => void): this;
	prependListener(event: 'error', listener: (err: Error) => void): this;
	prependListener(event: 'listening', listener: () => void): this;
	prependListener(event: 'drop', listener: (data?: DropArgument) => void): this;
	prependListener(event: string, listener: (...args: any[]) => void): this {
		this.server.prependListener(event, listener);
		return this;
	}

	prependOnceListener(event: 'close', listener: () => void): this;
	prependOnceListener(event: 'connection', listener: (socket: Socket) => void): this;
	prependOnceListener(event: 'error', listener: (err: Error) => void): this;
	prependOnceListener(event: 'listening', listener: () => void): this;
	prependOnceListener(event: 'drop', listener: (data?: DropArgument) => void): this;
	prependOnceListener(event: string, listener: (...args: any[]) => void): this {
		this.server.prependOnceListener(event, listener);
		return this;
	}

	addClientEventListener(event: string, listener: (...args: any[]) => Promise<boolean>): this {
		this.eventListeners.push({ event, listener });
		return this;
	}
	async clientEmitAsync(client: TClient, event: string, ...args: any[]) {
		for (const listener of client.listeners(event)) {
			if (!((await listener(...args)) !== false)) {
				return false;
			}
		}
		return true;
	}

	private onClientEventListener(client: TClient) {
		this.eventListeners.forEach((eventListener) => {
			client.on(eventListener.event, eventListener.listener);
		});
		return this;
	}

	onConnect(listener: (data: IConnectData, client: TClient, clientManager: Manager) => Promise<boolean>): this {
		return this.addClientEventListener('connect', listener);
	}
	onDisconnect(listener: (data: IDisconnectData, client: TClient, clientManager: Manager) => Promise<boolean>): this {
		return this.addClientEventListener('disconnect', listener);
	}

	onPing(listener: (client: TClient, clientManager: Manager) => Promise<boolean>): this {
		return this.addClientEventListener('ping', listener);
	}

	onPublish(listener: (data: IPublishData, client: TClient, clientManager: Manager) => Promise<boolean>): this {
		return this.addClientEventListener('publish', listener);
	}

	onPubRel(listener: (data: IPubRelData, client: TClient, clientManager: Manager) => Promise<boolean>): this {
		return this.addClientEventListener('pubRel', listener);
	}

	onPubRec(listener: (data: IPubRecData, client: TClient, clientManager: Manager) => Promise<boolean>): this {
		return this.addClientEventListener('pubRec', listener);
	}

	onPubComp(listener: (data: IPubRecData, client: TClient, clientManager: Manager) => Promise<boolean>): this {
		return this.addClientEventListener('pubComp', listener);
	}

	onSubscribe(listener: (data: ISubscribeData, client: TClient, clientManager: Manager) => Promise<boolean>): this {
		return this.addClientEventListener('subscribe', listener);
	}

	onUnsubscribe(listener: (data: IUnsubscribeData, client: TClient, clientManager: Manager) => Promise<boolean>): this {
		return this.addClientEventListener('unsubscribe', listener);
	}

	onAuth(listener: (data: IAuthData, client: TClient, clientManager: Manager) => Promise<boolean>): this {
		return this.addClientEventListener('auth', listener);
	}

	public mqttConnection(client: TClient) {
		const mqttManager = new MqttManager(client, this.clientManager, this.options);
		this.onClientEventListener(client);
		client.on('data', async (buffer) => {
			try {
				// 这一层捕获协议错误和未知错误
				const allPacketData = parseAllPacket(buffer);

				for (const data of allPacketData) {
					try {
						await mqttManager.commonHandle(data);

						switch (data.header.packetType) {
							case PacketType.CONNECT:
								console.log('connect', data);
								(await this.clientEmitAsync(client, 'connect', data, client, this.clientManager)) && (await mqttManager.connectHandle(data as IConnectData));
								break;
							case PacketType.PUBLISH: {
								await mqttManager.publishHandle(data as IPublishData, this.clientEmitAsync);
								break;
							}
							case PacketType.PUBACK:
								(await this.clientEmitAsync(client, 'pubAck', data, client, this.clientManager)) && (await mqttManager.pubAckHandle(data as IPubAckData));
								break;
							case PacketType.PUBREC:
								(await this.clientEmitAsync(client, 'pubRec', data, client, this.clientManager)) && (await mqttManager.pubRecHandle(data as IPubRecData));
								break;
							case PacketType.PUBREL:
								(await this.clientEmitAsync(client, 'pubRel', data, client, this.clientManager)) && (await mqttManager.pubRelHandle(data as IPubRelData));
								break;
							case PacketType.PUBCOMP:
								(await this.clientEmitAsync(client, 'pubComp', data, client, this.clientManager)) && (await mqttManager.pubCompHandle(data as IPubRecData));
								break;
							case PacketType.SUBSCRIBE:
								(await this.clientEmitAsync(client, 'subscribe', data, client, this.clientManager)) && (await mqttManager.subscribeHandle(data as ISubscribeData));
								break;
							case PacketType.UNSUBSCRIBE:
								(await this.clientEmitAsync(client, 'unsubscribe', data, client, this.clientManager)) && (await mqttManager.unsubscribeHandle(data as IUnsubscribeData));
								break;
							case PacketType.PINGREQ:
								(await this.clientEmitAsync(client, 'ping', client, this.clientManager)) && (await mqttManager.pingReqHandle());
								break;
							case PacketType.DISCONNECT:
								(await this.clientEmitAsync(client, 'disconnect', data, client, this.clientManager)) && (await mqttManager.disconnectHandle(data as IDisconnectData));
								break;
							case PacketType.AUTH:
								(await this.clientEmitAsync(client, 'auth', data, client, this.clientManager)) && (await mqttManager.authHandle(data as IAuthData));
								break;
							default:
								console.log('Unhandled packet type:', data);
						}
					} catch (error) {
						if (!this.options.sendReasonMessage) {
							delete (error as any).msg;
						}
						await catchMqttError(error, mqttManager, data);
						console.log('Capture Evnet Error:', error);
						break;
					}
				}
			} catch (error) {
				try {
					console.log('Capture Packet Error:', error);
					if (!this.options.sendReasonMessage) {
						delete (error as any).msg;
					}
					await catchMqttError(error, mqttManager);
				} catch (unknownError) {
					console.log(unknownError);
				}
			}
		});

		client.on('end', () => {
			console.log('Client disconnected');
		});

		client.on('error', (err) => {
			this.clientManager.disconnect(client);
			console.error('Client error:', err);
		});

		client.on('close', (hadError: boolean) => {
			// 异步处理will message，不阻塞主进程
			setImmediate(() => {
				mqttManager.publishWillMessage().catch((err) => {
					console.error('Error publishing will message:', err);
				});
			});
			// 立即清理客户端数据，避免阻塞
			this.clientManager.clearConnect(client);
			if (hadError) {
				console.log('Connection closed due to error!');
			} else {
				console.log('The connection was closed properly!');
			}
		});
	}
}

async function catchMqttError(error: unknown, mqttManager: MqttManager, data?: PacketTypeData) {
	if (error instanceof DisconnectException) {
		await mqttManager.handleDisconnect(error.code as DisconnectReasonCode, { reasonString: error.msg });
	} else if (error instanceof ConnectAckException) {
		await mqttManager.handleConnAck(data as IConnectData, error.code as ConnectAckReasonCode, error.msg);
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
		await mqttManager.handleSubAck(subAckData);
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
		await mqttManager.handlePubAck(pubAckData);
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
		await mqttManager.handlePubRec(pubRecData);
	} else if (error instanceof PubRelException && data) {
		const pubRelData: IPubRelData = {
			header: {
				packetType: PacketType.PUBREC,
				received: 0x00,
				packetIdentifier: data.header.packetType ?? 0,
				reasonCode: error.code as PubRelReasonCode,
			},
			properties: {
				reasonString: error.msg,
			},
		};
		await mqttManager.pubRelHandle(pubRelData);
	} else if (error instanceof PubCompException && data) {
		const pubCompData: IPubCompData = {
			header: {
				packetType: PacketType.PUBREC,
				received: 0x00,
				packetIdentifier: (data as IPubCompData).header.packetIdentifier ?? 0,
				reasonCode: error.code as PubCompReasonCode,
			},
			properties: {
				reasonString: error.msg,
			},
		};
		await mqttManager.handlePubComp(pubCompData);
	} else if (error instanceof AuthenticateException) {
		// TODO auth 异常处理
		// const authData: IAuthData = {
		// 	header: {
		// 		packetType: PacketType.AUTH,
		// 		received: 0x00,
		// 		reasonCode: error.code as AuthenticateReasonCode,
		// 	},
		// 	properties: {},
		// };
		// await mqttManager.handleAuth(authData);
	} else {
		throw error;
	}
}

export class MqttServer extends MqttEvent {
	constructor(clientManager: Manager, options: IMqttOptions = {}) {
		const server = net.createServer();
		super(server, clientManager, options);
		this.server.on('connection', this.mqttConnection);
	}

	listen(...args: any): this {
		this.server.listen(...args);
		return this;
	}
}

// MQTT over TLS/SSL
export class MqttServerTLS extends MqttEvent {
	server: tls.Server;
	constructor(tlsOptions: tls.TlsOptions, clientManager: Manager, options: IMqttOptions = {}) {
		const server = tls.createServer(tlsOptions);
		super(server, clientManager, options);
		this.server = server;
		this.server.on('secureConnection', this.mqttConnection);
	}

	listen(...args: any): this {
		this.server.listen(...args);
		return this;
	}
}

// MQTT over WebSocket (HTTP)
export class MqttServerWebSocket extends MqttEvent {
	private httpServer: http.Server;
	constructor(clientManager: Manager, options: IMqttOptions = {}) {
		const httpServer = http.createServer();
		const wss = new WebSocketServer({ server: httpServer });
		super(wss as any, clientManager, options);
		this.httpServer = httpServer;
		wss.on('connection', (ws) => {
			const adapter = new WebSocketAdapter(ws as any);
			this.mqttConnection(adapter);
		});
	}

	listen(...args: any): this {
		this.httpServer.listen(...args);
		return this;
	}
}

// MQTT over WebSocket (HTTPS/TLS)
export class MqttServerWebSocketSecure extends MqttEvent {
	httpServer: https.Server;
	constructor(httpsOptions: https.ServerOptions, clientManager: Manager, options: IMqttOptions = {}) {
		const httpServer = https.createServer(httpsOptions);
		const wss = new WebSocketServer({ server: httpServer });
		super(wss as any, clientManager, options);
		this.httpServer = httpServer;
		wss.on('connection', (ws) => {
			const adapter = new WebSocketAdapter(ws as any);
			this.mqttConnection(adapter);
		});
	}

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
export * from './parse';
export * from './property';
export * from './mqttManager';
export * from './utils';
export * from './topicFilters';

