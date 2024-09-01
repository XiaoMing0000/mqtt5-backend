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

export type TPropertyIdentifier = PropertyIdentifier | ConnAckPropertyIdentifier;

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
	userProperty?: string;
	authenticationMethod?: string;
	authenticationData?: string;
	WillDelayInterval?: number;
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
	[key: string]: any;
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
	properties: IProperties;
	payload: {
		clientIdentifier: string;
		willProperties?: IProperties;
		willTopic?: string;
		willPayload?: string;
		username?: string;
		password?: string;
	};
}
