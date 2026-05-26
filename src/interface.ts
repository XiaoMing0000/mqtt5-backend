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

/**
 * Server-side MQTT options advertised to clients (CONNACK properties and related limits).
 */
export interface IMqttOptions {
	/** Protocol name string in CONNECT (MQTT 3.1.1 uses `MQTT`; legacy may use `MQIsdp`). */
	protocolName?: 'MQTT' | 'MQIsdp';
	/** Protocol version numbers the server accepts. */
	protocolVersions?: Array<number>;
	/** When true, the server may assign a client identifier if none was provided. */
	automaticallyAssignedClientIdentifier?: boolean;
	/** Highest QoS level the server supports for publishes. */
	maximumQoS?: QoSType;
	/** Whether retained messages are available. */
	retainAvailable?: boolean;
	/** Time-to-live for retained messages (implementation-specific units). */
	retainTTL?: number;
	/** Maximum packet size in bytes; larger packets must not be sent. */
	maximumPacketSize?: number;
	/** Maximum topic alias value; `0` disallows topic aliases on client PUBLISH. */
	topicAliasMaximum?: number;
	/** Whether wildcard topic filters are allowed in SUBSCRIBE. */
	wildcardSubscriptionAvailable?: boolean;
	/** Whether subscription identifiers may appear in SUBSCRIBE; `false` forbids them. */
	subscriptionIdentifierAvailable?: boolean;
	/** Whether shared subscriptions are allowed; `false` forbids them in SUBSCRIBE. */
	sharedSubscriptionAvailable?: boolean;
	/** Session expiry interval offered or enforced by the server. */
	sessionExpiryInterval?: number;
	/** Whether the server sends detailed reason strings/messages where applicable. */
	sendReasonMessage?: boolean;
	/** Max number of concurrent QoS 1 and QoS 2 PUBLISH messages the server will send without acknowledgment. */
	receiveMaximum?: number;
	/** Server-suggested keep-alive interval in seconds. */
	serverKeepAlive?: number;
	/** Max retry count when the server delivers QoS 1/QoS 2 messages to the client. */
	qosRetryCount?: number;
}

/** MQTT control packet type (fixed header first nibble). */
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

/** MQTT Quality of Service level (0 = at most once, 1 = at least once, 2 = exactly once). */
export enum QoSType {
	QoS0 = 0,
	QoS1,
	QoS2,
}

/** Union of property identifier enums used across packet property maps. */
export type TPropertyIdentifier = PropertyIdentifier | ConnAckPropertyIdentifier | PubCompPropertyIdentifier | PubAckPropertyIdentifier | SubAckPropertyIdentifier;

/** Maps MQTT 5 property identifiers (byte keys) to decoded value types. */
export type PropertyDataMap = {
	[0x01]: number;
	[0x02]: number;
	[0x03]: string;
	[0x08]: string;
	[0x09]: string | Buffer;
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

/** MQTT 5 property identifiers for general/CONNECT/PUBLISH-side properties. */
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

/** Property identifiers allowed in CONNACK. */
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

/** Property identifiers allowed in PUBCOMP. */
export enum PubCompPropertyIdentifier {
	reasonString = 0x1f,
	userProperty = 0x26,
}

/** Property identifiers allowed in PUBACK. */
export enum PubAckPropertyIdentifier {
	reasonString = 0x1f,
	userProperty = 0x26,
}

/** Property identifiers allowed in SUBACK. */
export enum SubAckPropertyIdentifier {
	reasonString = 0x1f,
	userProperty = 0x26,
}

/** Ordered list of user property key/value pairs (MQTT 5 user properties). */
export type TUserProperty = Array<{ key: string; value: string }>;

/** Cursor into a buffer for incremental parsing or serialization. */
export interface BufferData {
	buffer: Buffer;
	index: number;
}

/** CONNECT packet connect flags (username, password, will, clean start, etc.). */
export interface IConnectFlags {
	username: boolean;
	password: boolean;
	willRetain: boolean;
	willQoS: number;
	willFlag: boolean;
	cleanStart: boolean;
	reserved: boolean;
}

/** Decoded MQTT 5 properties for mixed/general use (CONNECT-related and overlaps). */
export interface IProperties {
	payloadFormatIndicator?: number;
	messageExpiryInterval?: number;
	contentType?: string;
	responseTopic?: string;
	correlationData?: string | Buffer;
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

/** Properties on the CONNECT packet (client to server). */
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

/** Will message properties embedded in CONNECT. */
export interface IConnectWillProperties {
	willDelayInterval?: number;
	payloadFormatIndicator?: number;
	messageExpiryInterval?: number;
	contentType?: string;
	responseTopic?: string;
	correlationData?: string | Buffer;
	userProperty?: { [key: string]: any };
}

/** Properties on CONNACK. */
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

/** Properties on PUBLISH. */
export interface IPublishProperties {
	payloadFormatIndicator?: number;
	messageExpiryInterval?: number;
	messageExpiryTimestamp?: number;
	contentType?: string;
	responseTopic?: string;
	correlationData?: string | Buffer;
	subscriptionIdentifier?: Array<number>;
	topicAliasMaximum?: number;
	userProperty?: { [key: string]: any };
	topicAlias?: number;
}

/** Properties on DISCONNECT. */
export interface IDisconnectProperties {
	sessionExpiryInterval?: number;
	serverReference?: string;
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

/** Properties on SUBSCRIBE. */
export interface ISubscribeProperties {
	subscriptionIdentifier?: number;
	userProperty?: { [key: string]: any };
}

/** Properties on SUBACK. */
export interface ISubAckProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

/** Properties on UNSUBSCRIBE and UNSUBACK. */
export interface IUnsubscribeProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

/** Properties on UNSUBACK. */
export interface IUnsubscribeAckProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

/** Properties on PUBACK. */
export interface IPubAckProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

/** Properties on PUBREC. */
export interface IPubRecProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

/** Properties on PUBREL. */
export interface IPubRelProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

/** Properties on PUBCOMP. */
export interface IPubCompProperties {
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

/** Properties on AUTH. */
export interface IAuthProperties {
	authenticationMethod?: string;
	authenticationData?: string;
	reasonString?: string;
	userProperty?: { [key: string]: any };
}

/** Will message properties (standalone shape). */
export interface IWillProperties {
	payloadFormatIndicator?: number;
	messageExpiryInterval?: number;
	contentType?: string;
	responseTopic?: string;
	willDelayInterval?: number;
	userProperty?: { [key: string]: any };
}

/** Union of decoded packet payload shapes for the listed control packet types. */
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

/** Decoded PINGREQ/PINGRESP payload (header only). */
export interface IPingData {
	header: {
		packetType: PacketType;
	};
}

/** MQTT protocol version byte as sent in CONNECT (`3` = 3.1, `4` = 3.1.1, `5` = MQTT 5). */
export enum ProtocolVersion {
	V3_1 = 3,
	V3_1_1 = 4,
	V5 = 5,
}

/** Decoded CONNECT packet. */
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
		willPayload?: Buffer;
		username?: string;
		password?: Buffer;
	};
}

/** Decoded CONNACK packet. */
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

/** Decoded PUBLISH packet. */
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

/** Decoded SUBSCRIBE packet. */
export interface ISubscribeData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		packetIdentifier: number;
	};
	properties: ISubscribeProperties;
	payload: string;
	payloads?: Array<{
		topicFilter: string;
		options: {
			qos: QoSType;
			noLocal: boolean;
			retainAsPublished: boolean;
			retainHandling: number;
			retain: number;
		};
	}>;
	options: {
		qos: QoSType;
		noLocal: boolean;
		retainAsPublished: boolean;
		retainHandling: number;
		retain: number;
	};
}

/** Decoded SUBACK packet. */
export interface ISubAckData {
	header: {
		packetType: PacketType;
		retain: number;
		packetIdentifier: number;
	};
	properties: ISubAckProperties;
	reasonCode: SubscribeAckReasonCode;
	reasonCodes?: SubscribeAckReasonCode[];
}

/** Decoded UNSUBACK packet. */
export interface IUnsubAckData {
	header: {
		packetType: PacketType;
		retain: number;
		packetIdentifier: number;
	};
	properties: IUnsubscribeProperties;
	reasonCode: SubscribeAckReasonCode;
}

/** Decoded UNSUBSCRIBE packet. */
export interface IUnsubscribeData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		packetIdentifier: number;
	};
	properties: IUnsubscribeProperties;
	payload: string;
	payloads?: string[];
}

/** Decoded DISCONNECT packet. */
export interface IDisconnectData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		reasonCode: DisconnectReasonCode;
	};
	properties: IDisconnectProperties;
}

/** Decoded PUBACK packet. */
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

/** Decoded PUBREL packet. */
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

/** Decoded PUBREC packet. */
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

/** Decoded PUBCOMP packet. */
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

/** Decoded AUTH packet. */
export interface IAuthData {
	header: {
		packetType: PacketType;
		received: number;
		remainingLength?: number;
		reasonCode: AuthenticateReasonCode;
	};
	properties: IAuthProperties;
}
