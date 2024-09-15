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
	PayloadFormatIndicator = 0x01,
	MessageExpiryInterval = 0x02,
	ContentType = 0x03,
	ResponseTopic = 0x08,
	CorrelationData = 0x09,
	SubscriptionIdentifier = 0x0b,
	SessionExpiryInterval = 0x11,
	ClientIdentifier = 0x12,
	ServerKeepAlive = 0x13,
	AuthenticationMethod = 0x15,
	AuthenticationData = 0x16,
	RequestProblemInformation = 0x17,
	WillDelayInterval = 0x18,
	RequestResponseInformation = 0x19,
	ResponseInformation = 0x1a,
	ServerReference = 0x1c,
	ReasonString = 0x1f,
	ReceiveMaximum = 0x21,
	TopicAliasMaximum = 0x22,
	TopicAlias = 0x23,
	MaximumQoS = 0x24,
	RetainAvailable = 0x25,
	UserProperty = 0x26,
	MaximumPacketSize = 0x27,
	WildcardSubscriptionAvailable = 0x28,
	SubscriptionIdentifierAvailable = 0x29,
	SharedSubscriptionAvailable = 0x2a,
}

export enum ConnAckPropertyIdentifier {
	SessionExpiryInterval = 0x11,
	ClientIdentifier = 0x12,
	ServerKeepAlive = 0x13,
	AuthenticationMethod = 0x15,
	AuthenticationData = 0x16,
	ResponseInformation = 0x1a,
	ServerReference = 0x1c,
	ReasonString = 0x1f,
	ReceiveMaximum = 0x21,
	TopicAliasMaximum = 0x22,
	MaximumQoS = 0x24,
	RetainAvailable = 0x25,
	UserProperty = 0x26,
	MaximumPacketSize = 0x27,
	WildcardSubscriptionAvailable = 0x28,
	SubscriptionIdentifierAvailable = 0x29,
	SharedSubscriptionAvailable = 0x2a,
}

export enum PubCompPropertyIdentifier {
	ReasonString = 0x1f,
	UserProperty = 0x26,
}

export enum PubAckPropertyIdentifier {
	ReasonString = 0x1f,
	UserProperty = 0x26,
}

export enum SubAckPropertyIdentifier {
	ReasonString = 0x1f,
	UserProperty = 0x26,
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
	requestResponseInformation?: boolean;
	requestProblemInformation?: boolean;
	clientIdentifier?: string;
	userProperty?: { [key: string]: any };
	authenticationMethod?: string;
	authenticationData?: string;
	willDelayInterval?: number;
	maximumQoS?: boolean;
	retainAvailable?: boolean;
	reasonString?: string;
	subscriptionIdentifier?: number;
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

export interface IConnAckProperties {
	sessionExpiryInterval?: number;
	clientIdentifier?: string;
	serverKeepAlive?: number;
	authenticationMethod?: string;
	authenticationData?: string;
	responseInformation?: string;
	serverReference?: string;
	reasonString?: string;
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
	subscriptionIdentifier?: number;
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
	userProperty?: { [key: string]: any };
}

export interface IUnsubscribeAckProperties {
	userProperty?: { [key: string]: any };
}

export interface IPublishProperties {
	payloadFormatIndicator?: number;
	messageExpiryInterval?: number;
	contentType?: string;
	responseTopic?: string;
	correlationData?: string;
	subscriptionIdentifier?: number;
	topicAlias?: number;
	userProperty?: { [key: string]: any };
}

export interface IPublishAckProperties {
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

export interface IPPubCompProperties {
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

export interface IConnectData {
	header: {
		packetType: PacketType;
		packetFlags: number;
		remainingLength: number;
		protocolName: string;
		protocolVersion: number;
		keepAlive: number;
	};
	connectFlags: IConnectFlags;
	properties: IConnectProperties;
	payload: {
		clientIdentifier: string;
		willProperties?: IProperties;
		willTopic?: string;
		willPayload?: string;
		username?: string;
		password?: string;
	};
}

export interface IPublishData {
	header: {
		packetType: PacketType;
		udpFlag: boolean;
		qosLevel: number;
		retain: boolean;
		remainingLength: number;
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
		remainingLength: number;
		packetIdentifier: number;
	};
	properties: ISubscribeProperties;
	payload: string;
	qos: QoSType;
}

export interface IUnsubscribeData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength: number;
		packetIdentifier: number;
	};
	properties: IUnsubscribeProperties;
	payload: string;
}

export interface IDisconnectData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength: number;
		reasonCode: number;
	};
	properties: IDisconnectProperties;
}

export interface IPubRelData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength: number;
		packetIdentifier: number;
		reasonCode: number;
	};
	properties: IDisconnectProperties;
}
