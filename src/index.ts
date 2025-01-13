import net from 'net';
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

export class MqttServer extends net.Server {
	clientManager: Manager;
	options: IMqttOptions;
	private eventListeners: Array<{ event: string; listener: (...args: any[]) => Promise<boolean> }> = [];
	constructor(clientManager: Manager, options: IMqttOptions = {}) {
		super();
		this.clientManager = clientManager;
		this.options = Object.assign({}, mqttDefaultOptions, options);
		super.on('connection', this.mqttConnection);
	}

	addClientEventListener(event: string, listener: (...args: any[]) => Promise<boolean>): this {
		this.eventListeners.push({ event, listener });
		return this;
	}
	async clientEmitAsync(client: TClient, event: string, ...args: any[]) {
		for (const listener of client.listeners(event)) {
			if (!(await listener(...args))) {
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

	private mqttConnection(client: TClient) {
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
								(await this.clientEmitAsync(client, 'connect', data, client, this.clientManager)) && (await mqttManager.connectHandle(data as IConnectData));
								break;
							case PacketType.PUBLISH:
								(await this.clientEmitAsync(client, 'publish', data, client, this.clientManager)) && (await mqttManager.publishHandle(data as IPublishData));
								break;
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
						console.log('Capture Error:', error);
						if (!this.options.sendReasonMessage) {
							delete (error as any).msg;
						}
						await catchMqttError(error, mqttManager, data);
						break;
					}
				}
			} catch (error) {
				try {
					console.log('Capture Error:', error);
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
			this.clientManager.clearConnect(client);
			if (hadError) {
				console.log('Connection closed due to error!');
			} else {
				console.log('The connection was closed properly!');
			}
		});
	}
}

export async function catchMqttError(error: unknown, mqttManager: MqttManager, data?: PacketTypeData) {
	if (error instanceof DisconnectException) {
		await mqttManager.handleDisconnect(error.code as DisconnectReasonCode, { reasonString: error.msg });
	} else if (error instanceof ConnectAckException) {
		await mqttManager.handleConnAck(data as IConnectData, error.code as ConnectAckReasonCode, error.msg);
	} else if (error instanceof SubscribeAckException && data) {
		const subAckData: ISubAckData = {
			header: {
				packetType: PacketType.SUBACK,
				retain: 0x00,
				packetIdentifier: data.header.packetType ?? 0,
			},
			properties: {
				reasonString: error.msg,
			},
			reasonCode: error.code as SubscribeAckReasonCode,
		};
		await mqttManager.handleSubAck(subAckData);
	} else if (error instanceof PubAckException && data) {
		const pubAckData: IPubAckData = {
			header: {
				packetType: PacketType.PUBACK,
				received: 0x00,
				packetIdentifier: data.header.packetType ?? 0,
				reasonCode: error.code as PubAckReasonCode,
			},
			properties: {
				reasonString: error.msg,
			},
		};
		await mqttManager.pubAckHandle(pubAckData);
	} else if (error instanceof PubRecException && data) {
		const pubRecData: IPubRecData = {
			header: {
				packetType: PacketType.PUBREC,
				received: 0x00,
				packetIdentifier: data.header.packetType ?? 0,
				reasonCode: error.code as PubRecReasonCode,
			},
			properties: {
				reasonString: error.msg,
			},
		};
		await mqttManager.pubRecHandle(pubRecData);
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
				packetIdentifier: data.header.packetType ?? 0,
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
