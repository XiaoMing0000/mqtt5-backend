import {
	DisconnectException,
	DisconnectReasonCode,
	ConnectAckReasonCode,
	PubAckException,
	PubAckReasonCode,
	PubCompReasonCode,
	PubRecReasonCode,
	SubscribeAckException,
	SubscribeAckReasonCode,
	UnsubscribeAckReasonCode,
	ConnectAckException,
} from './exception';
import {
	IConnectData,
	PacketType,
	IMqttOptions,
	PacketTypeData,
	IConnAckData,
	IDisconnectData,
	IDisconnectProperties,
	IPublishData,
	QoSType,
	IPubAckData,
	IPubRecData,
	IPubRelData,
	ISubscribeData,
	ISubAckData,
	IUnsubscribeData,
	IAuthData,
} from './interface';
import { TClient, Manager } from './manager/manager';
import {
	encodeConnAck,
	encodeDisconnect,
	encodePublishPacket,
	encodePubControlPacket,
	EncoderProperties,
	encodeVariableByteInteger,
	integerToTwoUint8,
	encodeSubAckPacket,
} from './parse';
import { verifyTopic, isWildcardTopic, topicToRegEx } from './topicFilters';
import { generateClientIdentifier } from './utils';

/**
 * 报文消息处理方法命名规则
 * 1. 服务端接口客户端报文： packetType + Handle
 * 		e.g. connectHandle、subscribeHandle、publishHandle
 * 2. 服务端向客户端发送报文：handle + PacketType
 * 		e.g. handleConnAck、handleDisconnect、handlePublish
 */

export class MqttManager {
	// 当前客户推送消息的 topic alisa name
	topicAliasNameMap: { [key: number]: string } = {};
	receiveCounter = 0;
	clientIdentifier = '';
	isAuth = false;
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

	constructor(
		private readonly client: TClient,
		private readonly clientManager: Manager,
		private readonly options: IMqttOptions,
	) {}

	public async commonHandle(data: PacketTypeData) {
		if (this.isAuth && data.header.packetType !== PacketType.AUTH) {
			throw new DisconnectException('The Server is not authorized to accept the CONNECT packet.', DisconnectReasonCode.NotAuthorized);
		}
	}

	/**
	 * 连接响应报文
	 * @returns
	 */
	public async handleConnAck(connData: IConnectData, reasonCode?: ConnectAckReasonCode, reasonString?: string) {
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
			if (this.clientManager.clientIdentifierManager.getIdendifier(this.connData.payload.clientIdentifier)) {
				connAckData.acknowledgeFlags.SessionPresent = true;
			}
		}

		if (!this.connData.properties.requestProblemInformation) {
			// 仅当 request problem information 为 0 时才能向用户发送 properties 3.1.2.11.7
		}

		connAckData.properties = {
			receiveMaximum: this.connData.properties.receiveMaximum,
			retainAvailable: this.options.retainAvailable,
			maximumPacketSize: this.options.maximumPacketSize,
			topicAliasMaximum: this.options.topicAliasMaximum,
			wildcardSubscriptionAvailable: this.options.wildcardSubscriptionAvailable,
			subscriptionIdentifierAvailable: true,
			sharedSubscriptionAvailable: true,
		};
		if (this.options.maximumQoS !== QoSType.QoS2) {
			connAckData.properties.maximumQoS = !!this.options.maximumQoS;
		}
		if (this.options.assignedClientIdentifier && !this.connData.payload.clientIdentifier) {
			connAckData.properties.clientIdentifier = this.clientIdentifier;
			this.connData.payload.clientIdentifier = this.clientIdentifier;
		}

		// TODO 是否支持订阅，需要在 subscribe 报文中校验

		const connPacket = encodeConnAck(connAckData);
		this.client.write(connPacket);
		if (reasonCode === ConnectAckReasonCode.UnsupportedProtocolVersion) {
			this.client.end();
		}
	}

	/**
	 * 处理连接报
	 * @param buffer
	 */
	public async connectHandle(connData: IConnectData) {
		this.connData = connData;

		if (!connData.payload.clientIdentifier) {
			if (this.options.assignedClientIdentifier) {
				this.clientIdentifier = generateClientIdentifier();
			} else {
				throw new ConnectAckException('Client Identifier not valid', ConnectAckReasonCode.ClientIdentifierNotValid);
			}
		} else {
			this.clientIdentifier = connData.payload.clientIdentifier;
		}

		if (connData.header.protocolName !== this.options.protocolName || connData.header.protocolVersion !== this.options.protocolVersion) {
			throw new DisconnectException('Unsupported Protocol Version.', DisconnectReasonCode.ProtocolError);
		}

		if (this.connData.connectFlags.cleanStart) {
			await this.clientManager.clearSubscribe(this.clientIdentifier);
			this.receiveCounter = 0;
		}

		if (this.connData.connectFlags.willFlag) {
			// TODO 遗嘱消息处理
		}

		if (this.connData.properties.authenticationMethod) {
			this.isAuth = true;
		}

		this.connData.properties.receiveMaximum ??= 0xffff;
		await this.handleConnAck(this.connData);

		await this.clientManager.connect(this.clientIdentifier || connData.payload.clientIdentifier, connData, this.client);
	}

	public async disconnectHandle(disconnectData: IDisconnectData) {
		this.client.end();
	}

	public async handleDisconnect(reasonCode: DisconnectReasonCode, properties: IDisconnectProperties) {
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

	public async pingReqHandle() {
		await this.clientManager.ping(this.clientIdentifier);
		this.client.write(Buffer.from([PacketType.PINGRESP << 4, 0]));
	}

	public async publishHandle(pubData: IPublishData) {
		// 数据校验
		if (pubData.properties.topicAlias && pubData.properties.topicAlias > (this.options.topicAliasMaximum ?? 0xffff)) {
			throw new PubAckException(
				'A Client MUST accept all Topic Alias values greater than 0 and less than or equal to the Topic Alias Maximum value that it sent in the CONNECT packet.',
				PubAckReasonCode.PacketIdentifierInUse,
			);
		}

		if (pubData.header.qosLevel > (this.options.maximumQoS ?? QoSType.QoS0)) {
			throw new DisconnectException('The Client specified a QoS greater than the QoS specified in a Maximum QoS in the CONNACK.', DisconnectReasonCode.QoSNotSupported);
		}

		if (pubData.header.qosLevel > QoSType.QoS0) {
			this.receiveCounter++;
			// publish 消息数量校验,限流控制
			if (this.receiveCounter > (this.connData.properties.receiveMaximum ?? 0xffff)) {
				throw new DisconnectException(
					'The Client MUST NOT send more than Receive Maximum QoS 1 and QoS 2 PUBLISH packets for which it has not received PUBACK, PUBCOMP, or PUBREC with a Reason Code of 128 or greater from the Server.',
					DisconnectReasonCode.ReceiveMaximumExceeded,
				);
			}
		}

		// TODO 最大报文长度校验
		// if((pubData.header.remainingLength ?? 0)  > (this.connData.properties.maximumPacketSize ?? 1 << 20)) {
		// 	throw new DisconnectException('The Server has received a Control Packet during the current Connection that contains more data than it was willing to process.', DisconnectReasonCode.PacketTooLarge);
		// }

		if (pubData.properties.topicAlias) {
			if (pubData.properties.topicAlias > (this.options.topicAliasMaximum ?? 0xffff)) {
				throw new DisconnectException(
					'The Client or Server has received a PUBLISH packet containing a Topic Alias which is greater than the Maximum Topic Alias it sent in the CONNECT or CONNACK packet.',
					DisconnectReasonCode.TopicAliasInvalid,
				);
			}
			// 添加主题别名映射
			if (pubData.header.topicName) {
				this.topicAliasNameMap[pubData.properties.topicAlias] = pubData.header.topicName;
			} else {
				pubData.header.topicName = this.topicAliasNameMap[pubData.properties.topicAlias];
			}
		}

		// 保留消息处理
		if (this.options.retainAvailable && pubData.header.retain) {
			if (pubData.payload) {
				this.clientManager.addRetainMessage(pubData.header.topicName, pubData, this.options.retainTTL);
			} else {
				this.clientManager.deleteRetainMessage(pubData.header.topicName);
			}
		} else if (!this.options.retainAvailable && pubData.header.retain) {
			throw new DisconnectException('The Server does not support retained messages, and Will Retain was set to 1.', DisconnectReasonCode.RetainNotSupported);
		}

		delete pubData.properties.topicAlias;

		this.clientManager.publish(this.clientIdentifier, pubData.header.topicName, pubData);

		// 响应推送者
		if (pubData.header.qosLevel === QoSType.QoS1) {
			await this.handlePubAck(pubData);
		} else if (pubData.header.qosLevel === QoSType.QoS2) {
			await this.handlePubRec(pubData);
		}
	}

	public async handlePublish(client: TClient, pubData: IPublishData) {
		if (pubData.header.qosLevel > QoSType.QoS0) {
			pubData.header.packetIdentifier = this.clientManager.newPacketIdentifier(client);
			pubData.header.udpFlag = false;
		}
		pubData.header.retain = false;
		const pubPacket = encodePublishPacket(pubData);
		client.write(pubPacket);
	}

	private async handlePubAck(pubData: IPublishData) {
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

	private async handlePubRec(pubData: IPublishData) {
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

	public async pubAckHandle(pubAckData: IPubAckData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubAckData.header.packetIdentifier)) {
			throw new DisconnectException('PUBACK contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		// 释放报文标识符
		this.clientManager.deletePacketIdentifier(this.client, pubAckData.header.packetIdentifier);
	}

	public async pubRelHandle(pubRelData: IPubRelData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubRelData.header.packetIdentifier)) {
			// TODO 未知的处理方式
			// throw new
		}
		await this.handlePubComp(pubRelData);
	}

	private async handlePubComp(pubRelData: IPubRelData) {
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

	public async pubRecHandle(pubRecData: IPubRecData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubRecData.header.packetIdentifier)) {
			throw new DisconnectException('PUBREC contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		if (pubRecData.header.reasonCode >= PubRecReasonCode.UnspecifiedError) {
			// TODO 数据错误如何处理
		}
		this.handlePubRel(pubRecData);
	}

	private async handlePubRel(pubRecData: IPubRecData) {
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

	public async pubCompHandle(pubCompData: IPubRecData) {
		if (!this.clientManager.hasPacketIdentifier(this.client, pubCompData.header.packetIdentifier)) {
			throw new DisconnectException('PUBCOMP contained unknown packet identifier!', DisconnectReasonCode.ProtocolError);
		}
		// 释放报文标识符
		this.clientManager.deletePacketIdentifier(this.client, pubCompData.header.packetIdentifier);
	}

	public async subscribeHandle(subData: ISubscribeData) {
		const topic = verifyTopic(subData.payload);
		if (!topic) {
			throw new SubscribeAckException('The topic filter format is incorrect and cannot be received by the server.', SubscribeAckReasonCode.TopicFilterInvalid);
		}

		// TODO 3.8.4 SUBSCRIBE Actions
		// 允许推送保留消息
		if (
			this.options.retainAvailable &&
			(subData.options.retainHandling == 0 || (subData.options.retainHandling == 1 && !(await this.clientManager.isSubscribe(subData.payload))))
		) {
			if (!isWildcardTopic(subData.payload)) {
				const retainData = await this.clientManager.getRetainMessage(subData.payload);
				if (retainData) {
					retainData.header.qosLevel = Math.min(retainData.header.qosLevel, subData.options.qos);
					await this.handlePublish(this.client, retainData);
				}
			} else {
				const reg = topicToRegEx(subData.payload);
				if (reg) {
					const topicRegEx = new RegExp(reg);
					await this.clientManager.forEachRetainMessage(async (topic, data) => {
						if (topicRegEx.test(topic)) {
							data.header.qosLevel = Math.min(data.header.qosLevel, subData.options.qos);
							await this.handlePublish(this.client, data);
						}
					});
				}
			}
		}
		await this.clientManager.subscribe(this.clientIdentifier, subData.payload, {
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

	public async handleSubAck(subAckData: ISubAckData) {
		const subAckPacket = encodeSubAckPacket(subAckData);
		this.client.write(subAckPacket);
	}

	public async unsubscribeHandle(unsubscribeData: IUnsubscribeData) {
		const topic = verifyTopic(unsubscribeData.payload);
		if (!topic) {
			throw new SubscribeAckException('The topic filter format is incorrect and cannot be received by the server.', SubscribeAckReasonCode.TopicFilterInvalid);
		}

		await this.clientManager.unsubscribe(this.clientIdentifier, unsubscribeData.payload);
		this.handleUnsubscribeAck(unsubscribeData);
	}

	public async handleUnsubscribeAck(unsubscribeData: IUnsubscribeData) {
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

	public async authHandle(authData: IAuthData) {
		// TODO auth 报文处理
	}
}
