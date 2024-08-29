// MQTT 报文类型
export enum PacketType {
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

export interface BufferData {
	buffer: Buffer;
	index: number;
}

export interface IConnectFlags {
	username: boolean;
	password: boolean;
	willRetain: boolean;
	qos: number;
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
	willDelayLength?: number;
	maximumQoS?: boolean;
	retainAvailable?: boolean;
	reasonString?: string;
	subscriptionIdentifier?: Array<number>;
	serverKeepAlive?: number;
	responseInformation?: string;
	serverReference?: string;
	topicAlias?: number;
	wildcardSubscriptionAvailable?: boolean;
	subscriptionIdentifierAvailable?: boolean;
	sharedSubscriptionAvailable?: boolean;
	[key: string]: any;
}
