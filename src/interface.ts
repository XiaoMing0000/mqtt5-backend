import {
	AuthenticateReasonCode,
	ConnectAckReasonCode,
	DisconnectReasonCode,
	PubAckReasonCode,
	PubCompReasonCode,
	PubRecReasonCode,
	PubRelReasonCode,
	SubscribeAckReasonCode,
} from './exception';

export interface IMqttOptions {
	protocolName?: 'MQTT' | 'MQIsdp';
	protocolVersions?: Array<number>;
	automaticallyAssignedClientIdentifier?: boolean; // 自动分配客户端 id
	maximumQoS?: QoSType; // 最大 QoS
	retainAvailable?: boolean; // 保留消息
	retainTTL?: number; // 保留消息过期时间
	maximumPacketSize?: number; // 最大报文长度
	topicAliasMaximum?: number; // 主题别名最大值， 0 表示禁止客户端 publish 报文使用主题别名
	wildcardSubscriptionAvailable?: boolean; // 通配符订阅
	subscriptionIdentifierAvailable?: boolean; // 订阅标识符可用， false 禁止客户端订阅报文
	sharedSubscriptionAvailable?: boolean; // 共享订阅可用， false 禁止客户端订阅报文
	sessionExpiryInterval?: number; // 会话过期时间
	sendReasonMessage?: boolean;
	receiveMaximum?: number; // 接收最大值, 控制接受 PUBLISH QoS 1 和 QoS 2 报文数量
	serverKeepAlive?: number; // 服务端保持连接时间
}

// MQTT 报文类型
export enum PacketType {
	RESERVED = 0,
	CONNECT = 1,
	CONNACK,
	PUBLISH,
	PUBACK,
	PUBREC,
	PUBREL,
	PUBCOMP,
	SUBSCRIBE,
	SUBACK,
	UNSUBSCRIBE,
	UNSUBACK,
	PINGREQ,
	PINGRESP,
	DISCONNECT,
	AUTH,
}

export enum QoSType {
	QoS0 = 0,
	QoS1,
	QoS2,
}

export type TPropertyIdentifier = PropertyIdentifier | ConnAckPropertyIdentifier | PubCompPropertyIdentifier | PubAckPropertyIdentifier | SubAckPropertyIdentifier;

export type PropertyDataMap = {
	[0x01]: number;
	[0x02]: number;
	[0x03]: string;
	[0x08]: string;
	[0x09]: string;
	[0x0b]: number;
	[0x11]: number;
	[0x12]: string;
	[0x13]: number;
	[0x15]: string;
	[0x16]: string;
	[0x17]: number;
	[0x18]: number;
	[0x19]: number;
	[0x1a]: string;
	[0x1c]: string;
	[0x1f]: string;
	[0x21]: number;
	[0x22]: number;
	[0x23]: number;
	[0x24]: boolean;
	[0x25]: boolean;
	[0x26]: { [key: string]: any };
	[0x27]: number;
	[0x28]: boolean;
	[0x29]: boolean;
	[0x2a]: boolean;
};

export enum PropertyIdentifier {
	payloadFormatIndicator = 0x01,
	messageExpiryInterval = 0x02,
	contentType = 0x03,
	responseTopic = 0x08,
	correlationData = 0x09,
	subscriptionIdentifier = 0x0b,
	sessionExpiryInterval = 0x11,
	assignedClientIdentifier = 0x12,
	serverKeepAlive = 0x13,
	authenticationMethod = 0x15,
	authenticationData = 0x16,
	requestProblemInformation = 0x17,
	willDelayInterval = 0x18,
	requestResponseInformation = 0x19,
	responseInformation = 0x1a,
	serverReference = 0x1c,
	reasonString = 0x1f,
	receiveMaximum = 0x21,
	topicAliasMaximum = 0x22,
	topicAlias = 0x23,
	maximumQoS = 0x24,
	retainAvailable = 0x25,
	userProperty = 0x26,
	maximumPacketSize = 0x27,
	wildcardSubscriptionAvailable = 0x28,
	subscriptionIdentifierAvailable = 0x29,
	sharedSubscriptionAvailable = 0x2a,
}

export enum ConnAckPropertyIdentifier {
	sessionExpiryInterval = 0x11,
	assignedClientIdentifier = 0x12,
	serverKeepAlive = 0x13,
	authenticationMethod = 0x15,
	authenticationData = 0x16,
	responseInformation = 0x1a,
	serverReference = 0x1c,
	reasonString = 0x1f,
	receiveMaximum = 0x21,
	topicAliasMaximum = 0x22,
	maximumQoS = 0x24,
	retainAvailable = 0x25,
	userProperty = 0x26,
	maximumPacketSize = 0x27,
	wildcardSubscriptionAvailable = 0x28,
	subscriptionIdentifierAvailable = 0x29,
	sharedSubscriptionAvailable = 0x2a,
}

export enum PubCompPropertyIdentifier {
	reasonString = 0x1f,
	userProperty = 0x26,
}

export enum PubAckPropertyIdentifier {
	reasonString = 0x1f,
	userProperty = 0x26,
}

export enum SubAckPropertyIdentifier {
	reasonString = 0x1f,
	userProperty = 0x26,
}

export interface BufferData {
	buffer: Buffer;
	index: number;
}

export interface IConnectFlags {
	username: boolean;
	password: boolean;
	willRetain: boolean;
	willQoS: number;
	willFlag: boolean;
	cleanStart: boolean;
	reserved: boolean;
}

export interface IProperties {
	payloadFormatIndicator?: number;
	messageExpiryInterval?: number;
	contentType?: string;
	responseTopic?: string;
	correlationData?: string;
	sessionExpiryInterval?: number;
	receiveMaximum?: number;
	maximumPacketSize?: number;
	topicAliasMaximum?: number;
	assignedClientIdentifier?: string;
	requestResponseInformation?: boolean;
	requestProblemInformation?: boolean;
	userProperty?: { [key: string]: any };
	authenticationMethod?: string;
	authenticationData?: string;
	willDelayInterval?: number;
	maximumQoS?: boolean;
	retainAvailable?: boolean;
	reasonString?: string;
	subscriptionIdentifier?: number | Array<number>;
	serverKeepAlive?: number;
	responseInformation?: string;
	serverReference?: string;
	topicAlias?: number;
	wildcardSubscriptionAvailable?: boolean;
	subscriptionIdentifierAvailable?: boolean;
	sharedSubscriptionAvailable?: boolean;
}

export interface IConnectProperties {
	sessionExpiryInterval?: number;
	authenticationMethod?: string;
	authenticationData?: string;
	requestProblemInformation?: boolean;
	requestResponseInformation?: boolean;
	receiveMaximum?: number;
	topicAliasMaximum?: number;
	userProperty?: { [key: string]: any };
	maximumPacketSize?: number;
}

export interface IConnectWillProperties {
	willDelayInterval?: number;
	payloadFormatIndicator?: number;
	messageExpiryInterval?: number;
	contentType?: string;
	responseTopic?: string;
	correlationData?: string;
	userProperty?: { [key: string]: any };
}

export interface IConnAckProperties {
	sessionExpiryInterval?: number;
	serverKeepAlive?: number;
	authenticationMethod?: string;
	authenticationData?: string;
	responseInformation?: string;
	serverReference?: string;
	reasonString?: string;
	assignedClientIdentifier?: string;
	receiveMaximum?: number;
	topicAliasMaximum?: number;
	maximumQoS?: boolean;
	retainAvailable?: boolean;
	userProperty?: { [key: string]: any };
	maximumPacketSize?: number;
	wildcardSubscriptionAvailable?: boolean;
	subscriptionIdentifierAvailable?: boolean;
	sharedSubscriptionAvailable?: boolean;
}

export interface IPublishProperties {
	payloadFormatIndicator?: number;
	messageExpiryInterval?: number;
	contentType?: string;
	responseTopic?: string;
	correlationData?: string;
	subscriptionIdentifier?: Array<number>;
	topicAliasMaximum?: number;
	userProperty?: { [key: string]: any };
	topicAlias?: number;
}

export interface IDisconnectProperties {
	sessionExpiryInterval?: number;
	serverReference?: string;
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

export interface ISubscribeProperties {
	subscriptionIdentifier?: number;
	userProperty?: { [key: string]: any };
}

export interface ISubAckProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

export interface IUnsubscribeProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

export interface IUnsubscribeAckProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

export interface IPubAckProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

export interface IPubRecProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

export interface IPubRelProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

export interface IPubCompProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

export interface IAuthProperties {
	authenticationMethod?: string;
	authenticationData?: string;
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

export interface IWillProperties {
	payloadFormatIndicator?: number;
	messageExpiryInterval?: number;
	contentType?: string;
	responseTopic?: string;
	willDelayInterval?: number;
	userProperty?: { [key: string]: any };
}

export type PacketTypeData =
	| IPingData
	| IConnectData
	| IConnAckData
	| IPublishData
	| ISubscribeData
	| ISubAckData
	| IUnsubscribeData
	| IDisconnectData
	| IPubAckData
	| IPubRelData
	| IPubRecData
	| IPubCompData;

export interface IPingData {
	header: {
		packetType: PacketType;
	};
}

export enum ProtocolVersion {
	V3_1 = 3,
	V3_1_1 = 4,
	V5 = 5,
}

export interface IConnectData {
	header: {
		packetType: PacketType;
		packetFlags: number;
		remainingLength?: number;
		protocolName: 'MQTT' | 'MQIsdp' | string;
		protocolVersion: number;
		keepAlive: number;
	};
	connectFlags: IConnectFlags;
	properties: IConnectProperties;
	payload: {
		clientIdentifier: string;
		willProperties?: IConnectWillProperties;
		willTopic?: string;
		willPayload?: string;
		username?: string;
		password?: string;
	};
}

export interface IConnAckData {
	header: {
		packetType: PacketType;
		reserved: number;
		reasonCode: ConnectAckReasonCode;
	};
	acknowledgeFlags: {
		SessionPresent: boolean;
	};
	properties: IConnAckProperties;
}

export interface IPublishData {
	header: {
		packetType: PacketType;
		dupFlag: boolean;
		qosLevel: QoSType;
		retain: boolean;
		remainingLength?: number;
		packetIdentifier?: number;
		topicName: string;
	};
	properties: IPublishProperties;
	payload: string;
}

export interface ISubscribeData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		packetIdentifier: number;
	};
	properties: ISubscribeProperties;
	payload: string;
	options: {
		qos: QoSType;
		noLocal: boolean;
		retainAsPublished: boolean;
		retainHandling: number;
		retain: number;
	};
}

export interface ISubAckData {
	header: {
		packetType: PacketType;
		retain: number;
		packetIdentifier: number;
	};
	properties: ISubAckProperties;
	reasonCode: SubscribeAckReasonCode;
}

export interface IUnsubAckData {
	header: {
		packetType: PacketType;
		retain: number;
		packetIdentifier: number;
	};
	properties: IUnsubscribeProperties;
	reasonCode: SubscribeAckReasonCode;
}

export interface IUnsubscribeData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		packetIdentifier: number;
	};
	properties: IUnsubscribeProperties;
	payload: string;
}

export interface IDisconnectData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		reasonCode: DisconnectReasonCode;
	};
	properties: IDisconnectProperties;
}

export interface IPubAckData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		packetIdentifier: number;
		reasonCode: PubAckReasonCode;
	};
	properties: IPubAckProperties;
}

export interface IPubRelData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		packetIdentifier: number;
		reasonCode: PubRelReasonCode;
	};
	properties: IPubRelProperties;
}

export interface IPubRecData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		packetIdentifier: number;
		reasonCode: PubRecReasonCode;
	};
	properties: IPubRecProperties;
}

export interface IPubCompData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		packetIdentifier: number;
		reasonCode: PubCompReasonCode;
	};
	properties: IPubCompProperties;
}

export interface IAuthData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		reasonCode: AuthenticateReasonCode;
	};
	properties: IAuthProperties;
}
