import net from 'net';
import {
	ConnectAckException,
	ConnectAckReasonCode,
	DisconnectException,
	DisconnectReasonCode,
	PubAckException,
	PubAckReasonCode,
	PubCompReasonCode,
	PubRecReasonCode,
	SubscribeAckException,
	SubscribeAckReasonCode,
	UnsubscribeAckReasonCode,
} from './exception';
import {
	AuthMethod,
	IAuthData,
	IConnAckData,
	IConnectData,
	IDisconnectData,
	IDisconnectProperties,
	IMqttOptions,
	IPubAckData,
	IPublishData,
	IPubRecData,
	IPubRelData,
	ISubAckData,
	ISubscribeData,
	IUnsubscribeData,
	MqttEvents,
	PacketType,
	QoSType,
} from './interface';
import {
	encodeConnAck,
	encodeDisconnect,
	encodePubControlPacket,
	encodePublishPacket,
	EncoderProperties,
	encodeSubAckPacket,
	encodeVariableByteInteger,
	integerToTwoUint8,
	parseAllPacket,
} from './parse';
import { topicToRegEx, verifyTopic } from './topicFilters';
import { Manager, TClient } from './manager/manager';
import { MemoryManager } from './manager/memoryManager';

export class MqttManager {
	static defaultProperties = {
		maximumQoS: 2,
		retainAvailable: true,
		retainTTL: 30 * 60,
		maximumPacketSize: 1 << 20,
		topicAliasMaximum: 65535,
		wildcardSubscriptionAvailable: false,
	};

	// 当前客户推送消息的 topic alisa name
	topicAliasNameMap: { [key: number]: string } = {};
	receiveCounter = 0;
	clientIdentifier = '';
	protected connData: IConnectData = {
		header: {
			packetType: PacketType.RESERVED,
			packetFlags: 0,
			remainingLength: 0,
			protocolName: '',
			protocolVersion: 0,
			keepAlive: 0,
		},
		connectFlags: {} as any,
		properties: {},
		payload: {
			clientIdentifier: '',
		},
	};
	authMethod: AuthMethod | undefined;

	constructor(
		private readonly client: TClient,
		private readonly clientManager: Manager,
	) {}
	/**
	 * 连接响应报文
	 * @returns
	 */
	public handleConnAck(connData: IConnectData, reasonCode?: ConnectAckReasonCode, reasonString?: string) {
		const connAckData: IConnAckData = {
			header: {
				packetType: PacketType.CONNACK,
				reserved: 0x00,
				reasonCode: reasonCode ?? 0x00,
			},
			acknowledgeFlags: {
				SessionPresent: false,
			},
			properties: {
				reasonString,
			},
		};

		if (this.connData.connectFlags.cleanStart) {
			connAckData.acknowledgeFlags.SessionPresent = false;
		} else {
			// TODO 校验服务端是否已经保存了此客户端表示的 ClientID 的 会话状态 Session State

			connAckData.acknowledgeFlags.SessionPresent = true;
		}

		if (!this.connData.properties.requestProblemInformation) {
			// 仅当 request problem information 为 0 时才能向用户发送 properties 3.1.2.11.7
		}

		connAckData.properties = {
			receiveMaximum: this.connData.properties.receiveMaximum,
			retainAvailable: MqttManager.defaultProperties.retainAvailable,
			maximumPacketSize: MqttManager.defaultProperties.maximumPacketSize,
			topicAliasMaximum: MqttManager.defaultProperties.topicAliasMaximum,
			wildcardSubscriptionAvailable: MqttManager.defaultProperties.wildcardSubscriptionAvailable,
			subscriptionIdentifierAvailable: true,
			sharedSubscriptionAvailable: true,
		};
		// TODO 是否支持订阅，需要在 subscribe 报文中校验
		// TODO 未作通配符

		const connPacket = encodeConnAck(connAckData);
		this.client.write(connPacket);
		if (reasonCode === ConnectAckReasonCode.UnsupportedProtocolVersion) {
			this.client.end();
		}
	}

	public setAuth(callbackfn: AuthMethod) {
		this.authMethod = callbackfn;
	}

	/**
	 * 处理连接报
	 * @param buffer
	 */
	public connectHandle(connData: IConnectData) {
		this.connData = connData;
		if (this.authMethod) {
			this.authMethod(this.client, this.connData);
		}
		if (this.connData.connectFlags.cleanStart) {
			this.clientManager.clear(this.clientIdentifier || connData.payload.clientIdentifier);
			this.receiveCounter = 0;
		}

		this.clientManager.connect(this.clientIdentifier || connData.payload.clientIdentifier, connData, this.client);

		this.clientIdentifier = connData.payload.clientIdentifier;
		this.connData.properties.receiveMaximum ??= 0xffff;
		this.handleConnAck(this.connData);
	}

	public disconnectHandle(disconnectData: IDisconnectData) {
		this.client.end();
	}

	public handleDisconnect(reasonCode: DisconnectReasonCode, properties: IDisconnectProperties) {
		const disconnectPacket = encodeDisconnect({
			header: {
				packetType: PacketType.DISCONNECT,
				received: 0,
				remainingLength: 0,
				reasonCode: reasonCode,
			},
			properties: properties,
		});
		this.client.end(Buffer.from(disconnectPacket));
	}

	public pingReqHandle() {
		this.client.write(Buffer.from([PacketType.PINGRESP << 4, 0]));
	}

	public async publishHandle(pubData: IPublishData) {
		// 数据校验
		if (pubData.properties.topicAlias && pubData.properties.topicAlias > MqttManager.defaultProperties.topicAliasMaximum) {
			throw new PubAckException(
				'A Client MUST accept all Topic Alias values greater than 0 and less than or equal to the Topic Alias Maximum value that it sent in the CONNECT packet.',
				PubAckReasonCode.PacketIdentifierInUse,
			);
		}
		if (pubData.header.qosLevel > MqttManager.defaultProperties.maximumQoS) {
			throw new DisconnectException('The Client specified a QoS greater than the QoS specified in a Maximum QoS in the CONNACK.', DisconnectReasonCode.QoSNotSupported);
		}

		// 添加主题别名映射
		if (pubData.header.topicName && pubData.properties.topicAlias) {
			this.topicAliasNameMap[pubData.properties.topicAlias] = pubData.header.topicName;
		} else if (pubData.properties.topicAlias) {
			pubData.header.topicName = this.topicAliasNameMap[pubData.properties.topicAlias];
		}
		// 保留消息处理
		if (MqttManager.defaultProperties.retainAvailable && pubData.header.retain) {
			if (pubData.payload) {
				this.clientManager.addRetainMessage(pubData.header.topicName, pubData);
			} else {
				this.clientManager.deleteRetainMessage(pubData.header.topicName);
			}
		}

		delete pubData.properties.topicAlias;
		// TODO 向订阅者发布消息，未启动通配符订阅
		// 拷贝数据，隔离服务端和客户端 PUBACK 报文
		const receiveQos = pubData.header.qosLevel;
		const distributeData: IPublishData = JSON.parse(JSON.stringify(pubData));
		distributeData.header.udpFlag = false;
		this.clientManager.publish(distributeData.header.topicName, async (client, subFlags) => {
			if (subFlags.noLocal && client === this.client) {
				return;
			}
			if (subFlags.noLocal && client === this.client) {
				return;
			}
			// 如果使用通配符进行订阅，可能会匹配多个订阅，如果订阅标识符存在则必须将这些订阅标识符发送给用户
			const publishSubscriptionIdentifier: Array<number> = [];

			const minQoS = Math.min(subFlags.qos || 0, receiveQos);
			if (minQoS > QoSType.QoS0) {
				// 增加报文标识符，用来做publish消息结束校验数据来源
				// 向客户端分发 qos1 和 qos2 级别的消息，需要记录 packetIdentifier；
				// 分发 qos2 消息时当收到客户端返回 pubRec、PubComp 数据包需要校验 packetIdentifier;
				// 分发 qos1 消息时当收到客户端返回 pubAck 数据包需要校验 packetIdentifier;
				distributeData.header.packetIdentifier = this.clientManager.newPacketIdentifier(client);
				distributeData.header.udpFlag = false;
			}
			distributeData.header.qosLevel = minQoS;
			distributeData.properties.subscriptionIdentifier = publishSubscriptionIdentifier;
			distributeData.header.retain = subFlags.retainAsPublished ? distributeData.header.retain : false;
			const pubPacket = encodePublishPacket(distributeData);
			client.write(pubPacket);
		});

		// 响应推送者
		if (pubData.header.qosLevel === QoSType.QoS1) {
			this.handlePubAck(pubData);
		} else if (pubData.header.qosLevel === QoSType.QoS2) {
			this.handlePubRec(pubData);
		}
	}
	private handlePubAck(pubData: IPublishData) {
		this.receiveCounter++;
		if (this.receiveCounter > (this.connData.properties.receiveMaximum ?? 0xffff)) {
			throw new DisconnectException(
				'The Client MUST NOT send more than Receive Maximum QoS 1 and QoS 2 PUBLISH packets for which it has not received PUBACK, PUBCOMP, or PUBREC with a Reason Code of 128 or greater from the Server.',
				DisconnectReasonCode.ReceiveMaximumExceeded,
			);
		}

		const pubAckData: IPubAckData = {
			header: {
				packetType: PacketType.PUBACK,
				packetIdentifier: pubData.header.packetIdentifier ?? 0,
				received: 0x00,
				reasonCode: 0x00,
			},
			properties: {},
		};

		const pubAckPacket = encodePubControlPacket(pubAckData);
		this.client.write(pubAckPacket);
	}

	private handlePubRec(pubData: IPublishData) {
		const pubRecData: IPubRecData = {
			header: {
				packetType: PacketType.PUBREC,
				packetIdentifier: pubData.header.packetIdentifier ?? 0,
				received: 0x00,
				reasonCode: 0x00,
			},
			properties: {},
		};
		const pubRecPacket = encodePubControlPacket(pubRecData);
		this.client.write(pubRecPacket);
	}

	public pubAckHandle(pubAckData: IPubAckData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubAckData.header.packetIdentifier)) {
			throw new DisconnectException('PUBACK contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		// 释放报文标识符
		this.clientManager.deletePacketIdentifier(this.client, pubAckData.header.packetIdentifier);
	}

	public pubRelHandle(pubRelData: IPubRelData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubRelData.header.packetIdentifier)) {
			// TODO 未知的处理方式
			// throw new
		}
		this.handlePubComp(pubRelData);
	}

	private handlePubComp(pubRelData: IPubRelData) {
		this.receiveCounter++;
		if (this.receiveCounter > (this.connData.properties.receiveMaximum ?? 0xffff)) {
			throw new DisconnectException(
				'The Client MUST NOT send more than Receive Maximum QoS 1 and QoS 2 PUBLISH packets for which it has not received PUBACK, PUBCOMP, or PUBREC with a Reason Code of 128 or greater from the Server.',
				DisconnectReasonCode.ReceiveMaximumExceeded,
			);
		}
		const properties = new EncoderProperties();
		const compPacket = Buffer.from([
			PacketType.PUBCOMP << 4,
			...encodeVariableByteInteger(3 + properties.length),
			...integerToTwoUint8(pubRelData.header.packetIdentifier),
			PubCompReasonCode.Success,
			...properties.buffer,
		]);
		this.client.write(compPacket);
	}

	public pubRecHandle(pubRecData: IPubRecData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubRecData.header.packetIdentifier)) {
			throw new DisconnectException('PUBREC contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		if (pubRecData.header.reasonCode >= PubRecReasonCode.UnspecifiedError) {
			// TODO 数据错误如何处理
		}
		this.handlePubRel(pubRecData);
	}

	private handlePubRel(pubRecData: IPubRecData) {
		const properties = new EncoderProperties();
		const pubRelPacket = Buffer.from([
			(PacketType.PUBREL << 4) | 0x02,
			...encodeVariableByteInteger(3 + properties.length),
			...integerToTwoUint8(pubRecData.header.packetIdentifier),
			PubCompReasonCode.Success,
			...properties.buffer,
		]);
		this.client.write(pubRelPacket);
	}

	public pubCompHandle(pubCompData: IPubRecData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubCompData.header.packetIdentifier)) {
			throw new DisconnectException('PUBCOMP contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		// 释放报文标识符
		this.clientManager.deletePacketIdentifier(this.client, pubCompData.header.packetIdentifier);
	}

	public subscribeHandle(subData: ISubscribeData) {
		const topic = verifyTopic(subData.payload);
		if (!topic) {
			throw new SubscribeAckException('The topic filter format is incorrect and cannot be received by the server.', SubscribeAckReasonCode.TopicFilterInvalid);
		}

		// TODO 3.8.4 SUBSCRIBE Actions
		// 允许推送保留消息
		if (
			MqttManager.defaultProperties.retainAvailable &&
			(subData.options.retainHandling == 0 || (subData.options.retainHandling == 1 && !this.clientManager.isSubscribe(subData.payload)))
		) {
			const reg = topicToRegEx(subData.payload);
			if (reg) {
				const topicRegEx = new RegExp(reg);
				this.clientManager.forEachRetainMessage((topic, data) => {
					if (topicRegEx.test(topic)) {
						data.header.qosLevel = subData.options.qos;
						data.header.packetIdentifier = this.clientManager.newPacketIdentifier(this.client);
						const publishPacket = encodePublishPacket(data);
						this.client.write(publishPacket);
					}
				});
			}
		}
		this.clientManager.subscribe(this.clientIdentifier, subData.payload, {
			qos: subData.options.qos,
			date: new Date(),
			subscriptionIdentifier: subData.properties.subscriptionIdentifier,
			noLocal: subData.options.noLocal,
			retainAsPublished: subData.options.retainAsPublished,
		});
		const subAckData: ISubAckData = {
			header: {
				packetType: PacketType.SUBACK,
				retain: 0x00,
				packetIdentifier: subData.header.packetIdentifier,
			},
			properties: {},
			reasonCode: SubscribeAckReasonCode.GrantedQoS2,
		};
		this.handleSubAck(subAckData);
	}

	public handleSubAck(subAckData: ISubAckData) {
		const subAckPacket = encodeSubAckPacket(subAckData);
		this.client.write(subAckPacket);
	}

	public unsubscribeHandle(unsubscribeData: IUnsubscribeData) {
		const topic = verifyTopic(unsubscribeData.payload);
		if (!topic) {
			throw new SubscribeAckException('The topic filter format is incorrect and cannot be received by the server.', SubscribeAckReasonCode.TopicFilterInvalid);
		}

		this.clientManager.unsubscribe(this.clientIdentifier, unsubscribeData.payload);
		this.handleUnsubscribeAck(unsubscribeData);
	}

	public handleUnsubscribeAck(unsubscribeData: IUnsubscribeData) {
		let remainingLength = 1;
		const properties = new EncoderProperties();
		remainingLength += properties.length + 2;
		const unsubscribePacket = Buffer.from([
			PacketType.UNSUBACK << 4,
			...encodeVariableByteInteger(remainingLength),
			...integerToTwoUint8(unsubscribeData.header.packetIdentifier),
			...properties.buffer,
			UnsubscribeAckReasonCode.Success,
		]);
		this.client.write(unsubscribePacket);
	}

	public authHandle(authData: IAuthData) {
		// TODO auth 报文处理
	}
}
export class MqttServer extends net.Server {
	clientManager: MemoryManager;
	constructor(options: IMqttOptions) {
		super();

		this.clientManager = new MemoryManager();
		super.on('connection', this.mqttConnection);
	}

	on<K extends keyof MqttEvents>(event: K, listener: (data: MqttEvents[K]) => void) {
		return super.on(event, listener);
	}

	private mqttConnection(client: TClient) {
		const mqttManager = new MqttManager(client, this.clientManager);
		client.on('data', (buffer) => {
			try {
				// 这一层捕获协议错误和未知错误
				const allPacketData = parseAllPacket(buffer);
				for (const data of allPacketData) {
					try {
						switch (data.header.packetType) {
							case PacketType.CONNECT:
								this.emit('connect', data as IConnAckData);
								mqttManager.connectHandle(data as IConnectData);
								break;
							case PacketType.PUBLISH:
								this.emit('publish', data as IPublishData);
								mqttManager.publishHandle(data as IPublishData);
								break;
							case PacketType.PUBACK:
								mqttManager.pubAckHandle(data as IPubAckData);
								break;
							case PacketType.PUBREC:
								mqttManager.pubRecHandle(data as IPubRecData);
								break;
							case PacketType.PUBREL:
								mqttManager.pubRelHandle(data as IPubRelData);
								break;
							case PacketType.PUBCOMP:
								mqttManager.pubCompHandle(data as IPubRecData);
								break;
							case PacketType.SUBSCRIBE:
								this.emit('subscribe', data as ISubscribeData);
								mqttManager.subscribeHandle(data as ISubscribeData);
								break;
							case PacketType.UNSUBSCRIBE:
								this.emit('unsubscribe', data as IUnsubscribeData);
								mqttManager.unsubscribeHandle(data as IUnsubscribeData);
								break;
							case PacketType.PINGREQ:
								mqttManager.pingReqHandle();
								break;
							case PacketType.DISCONNECT:
								this.emit('disconnect', data as IDisconnectData);
								mqttManager.disconnectHandle(data as IDisconnectData);
								break;
							case PacketType.AUTH:
								this.emit('connect', data as IConnAckData);
								mqttManager.authHandle(data as IAuthData);
								break;
							default:
								console.log('Unhandled packet type:', data);
						}
					} catch (error) {
						if (error instanceof DisconnectException) {
							mqttManager.handleDisconnect(error.code as DisconnectReasonCode, { reasonString: error.msg });
						} else if (error instanceof ConnectAckException) {
							mqttManager.handleConnAck(data as IConnectData, error.code as ConnectAckReasonCode, error.msg);
						} else if (error instanceof SubscribeAckException) {
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
							mqttManager.handleSubAck(subAckData);
						} else if (error instanceof PubAckException) {
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
							mqttManager.pubAckHandle(pubAckData);
						} else {
							throw error;
						}
					}
				}
			} catch (error) {
				if (error instanceof DisconnectException) {
					mqttManager.handleDisconnect(error.code as DisconnectReasonCode, { reasonString: error.msg });
				} else {
					mqttManager.handleDisconnect(DisconnectReasonCode.UnspecifiedError, { reasonString: 'Internal Server Error.' });
				}
			}
		});

		client.on('end', () => {
			console.log('Client disconnected');
			client.end();
		});

		client.on('error', (err) => {
			this.clientManager.disconnect(client);
			console.error('Client error:', err);
		});

		client.on('close', (hadError: boolean) => {
			this.clientManager.disconnect(client);
			if (hadError) {
				console.log('Connection closed due to error!');
			} else {
				console.log('The connection was closed properly!');
			}
		});
	}
}
