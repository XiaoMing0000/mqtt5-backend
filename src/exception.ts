/** MQTT 5 CONNACK reason codes (MQTT 5.0 specification). */
export enum ConnectAckReasonCode {
	Success = 0x00,
	ConnectionRefused = 0x01,
	ConnectIdentifierRejected = 0x02,
	ServerUnavailable = 0x03,
	UnspecifiedError = 0x80,
	MalformedPacket = 0x81,
	ProtocolError = 0x82,
	ImplementationSpecificError = 0x83,
	UnsupportedProtocolVersion = 0x84,
	ClientIdentifierNotValid = 0x85,
	BadUserNameOrPassword = 0x86,
	NotAuthorized = 0x87,
	ServeUnavailable = 0x88,
	ServerBusy = 0x89,
	Banned = 0x8a,
	BadAuthenticationMethod = 0x8c,
	TopicNameInvalid = 0x90,
	PacketTooLarge = 0x95,
	QuotaExceeded = 0x97,
	PayloadFormatInvalid = 0x99,
	RetainNotSupported = 0x9a,
	QoSNotSupported = 0x9b,
	UseAnother = 0x9c,
	ServerMoved = 0x9d,
	ConnectionRateExceeded = 0x9f,
}

/** MQTT 5 DISCONNECT reason codes (MQTT 5.0 specification). */
export enum DisconnectReasonCode {
	NormalDisconnection = 0x00,
	DisconnectWithWillMessage = 0x04,
	UnspecifiedError = 0x80,
	MalformedPacket = 0x81,
	ProtocolError = 0x82,
	ImplementationSpecificError = 0x83,
	NotAuthorized = 0x87,
	ServerBusy = 0x89,
	ServerShuttingDown = 0x8b,
	SessionTakenOver = 0x8e,
	TopicFilterInvalid = 0x8f,
	TopicNameInvalid = 0x90,
	ReceiveMaximumExceeded = 0x93,
	TopicAliasInvalid = 0x94,
	PacketTooLarge = 0x95,
	MessageRateTooHigh = 0x96,
	QuotaExceeded = 0x97,
	AdministrativeAction = 0x98,
	PayloadFormatInvalid = 0x99,
	RetainNotSupported = 0x9a,
	QoSNotSupported = 0x9b,
	UseAnother = 0x9c,
	ServerMoved = 0x9d,
	SharedSubscriptionsNotSupported = 0x9e,
	ConnectionRateExceeded = 0x9f,
	MaximumConnectTime = 0xa0,
	SubscriptionIdentifiersNotSupported = 0xa1,
	WildcardSubscriptionsNotSupported = 0xa2,
}

/** MQTT 5 SUBACK reason codes (per subscription, MQTT 5.0 specification). */
export enum SubscribeAckReasonCode {
	GrantedQoS0 = 0x00,
	GrantedQoS1 = 0x01,
	GrantedQoS2 = 0x02,
	UnspecifiedError = 0x80,
	ImplementationSpecificError = 0x83,
	NotAuthorized = 0x87,
	TopicFilterInvalid = 0x8f,
	PacketIdentifierInUse = 0x91,
	QuotaExceeded = 0x97,
	SharedSubscriptionsNotSupported = 0x9e,
	SubscriptionIdentifiersNotSupported = 0xa1,
	WildcardSubscriptionsNotSupported = 0xa2,
}

/** MQTT 5 UNSUBACK reason codes (MQTT 5.0 specification). */
export enum UnsubscribeAckReasonCode {
	Success = 0x00,
	NoSubscriptionFound = 0x11,
	UnspecifiedError = 0x80,
	ImplementationSpecificError = 0x83,
	NotAuthorized = 0x87,
	TopicFilterInvalid = 0x8f,
	PacketIdentifierInUse = 0x91,
}

/** MQTT 5 PUBACK reason codes (QoS 1 publish, MQTT 5.0 specification). */
export enum PubAckReasonCode {
	Success = 0x00,
	NoMatchingSubscribers = 0x10,
	UnspecifiedError = 0x80,
	ImplementationSpecificError = 0x83,
	NotAuthorized = 0x87,
	TopicNameInvalid = 0x90,
	PacketIdentifierInUse = 0x91,
	QuotaExceeded = 0x97,
	PayloadFormatInvalid = 0x99,
}

/** MQTT 5 PUBREC reason codes (QoS 2 publish, MQTT 5.0 specification). */
export enum PubRecReasonCode {
	Success = 0x00,
	NoMatchingSubscribers = 0x10,
	UnspecifiedError = 0x80,
	ImplementationSpecificError = 0x83,
	NotAuthorized = 0x87,
	TopicNameInvalid = 0x90,
	PacketIdentifierInUse = 0x91,
	QuotaExceeded = 0x97,
	PayloadFormatInvalid = 0x99,
}

/** MQTT 5 PUBREL reason codes (MQTT 5.0 specification). */
export enum PubRelReasonCode {
	Success = 0x00,
	PacketIdentifierNotFound = 0x92,
}

/** MQTT 5 PUBCOMP reason codes (MQTT 5.0 specification). */
export enum PubCompReasonCode {
	Success = 0x00,
	PacketIdentifierNotFound = 0x92,
}

/** MQTT 5 AUTH reason codes (MQTT 5.0 specification). */
export enum AuthenticateReasonCode {
	Success = 0x00,
	ContinueAuthentication = 0x18,
	Reauthenticate = 0x19,
}

type TErrorCode =
	| ConnectAckReasonCode
	| DisconnectReasonCode
	| SubscribeAckReasonCode
	| UnsubscribeAckReasonCode
	| PubAckReasonCode
	| PubRecReasonCode
	| PubRelReasonCode
	| PubCompReasonCode
	| AuthenticateReasonCode;

/**
 * Base class for MQTT protocol errors carrying a wire reason code and a human-readable message.
 *
 * Use {@link MqttBasicException.msg} for display; the inherited `Error.message` is intentionally unset.
 */
export class MqttBasicException extends Error {
	private _code: TErrorCode;
	private _msg: string;

	/**
	 * @param msg - Human-readable description of the failure.
	 * @param code - MQTT 5 reason code. Defaults to {@link ConnectAckReasonCode.UnspecifiedError}.
	 */
	constructor(msg: string, code: TErrorCode = ConnectAckReasonCode.UnspecifiedError) {
		super(); // No argument: application text lives on `msg`, not `Error.message`
		this._code = code;
		this._msg = msg;
	}

	/**
	 * @returns The MQTT 5 reason code for this error.
	 */
	get code() {
		return this._code;
	}

	/**
	 * @returns The human-readable error message.
	 */
	get msg() {
		return this._msg;
	}
}

/**
 * Thrown while handling a CONNECT/CONNACK flow when the outcome must be expressed as a CONNACK reason code.
 */
export class ConnectAckException extends MqttBasicException {
	/**
	 * @param msg - Human-readable description of the failure.
	 * @param code - CONNACK reason code. Defaults to {@link ConnectAckReasonCode.UnspecifiedError}.
	 */
	constructor(msg: string, code: ConnectAckReasonCode = ConnectAckReasonCode.UnspecifiedError) {
		super(msg, code);
	}
}

/**
 * Thrown when a DISCONNECT must be signaled with a specific disconnect reason code.
 */
export class DisconnectException extends MqttBasicException {
	/**
	 * @param msg - Human-readable description of the failure.
	 * @param code - DISCONNECT reason code. Defaults to {@link DisconnectReasonCode.UnspecifiedError}.
	 */
	constructor(msg: string, code: DisconnectReasonCode = DisconnectReasonCode.UnspecifiedError) {
		super(msg, code);
	}
}

/**
 * Thrown while handling SUBSCRIBE/SUBACK when a subscription result must use a SUBACK reason code.
 */
export class SubscribeAckException extends MqttBasicException {
	/**
	 * @param msg - Human-readable description of the failure.
	 * @param code - SUBACK reason code. Defaults to {@link SubscribeAckReasonCode.UnspecifiedError}.
	 */
	constructor(msg: string, code: SubscribeAckReasonCode = SubscribeAckReasonCode.UnspecifiedError) {
		super(msg, code);
	}
}

/**
 * Thrown for QoS 1 publish handling when the outcome is expressed as a PUBACK reason code.
 */
export class PubAckException extends MqttBasicException {
	/**
	 * @param msg - Human-readable description of the failure.
	 * @param code - PUBACK reason code. Defaults to {@link PubAckReasonCode.UnspecifiedError}.
	 */
	constructor(msg: string, code: PubAckReasonCode = PubAckReasonCode.UnspecifiedError) {
		super(msg, code);
	}
}

/**
 * Thrown during QoS 2 publish handling when the outcome is expressed as a PUBREC reason code.
 */
export class PubRecException extends MqttBasicException {
	/**
	 * @param msg - Human-readable description of the failure.
	 * @param code - PUBREC reason code. Defaults to {@link PubRecReasonCode.UnspecifiedError}.
	 */
	constructor(msg: string, code: PubRecReasonCode = PubRecReasonCode.UnspecifiedError) {
		super(msg, code);
	}
}

/**
 * Thrown when the server processes a client PUBREC and must respond with a PUBREL reason code.
 */
export class PubRelException extends MqttBasicException {
	/**
	 * @param msg - Human-readable description of the failure.
	 * @param code - PUBREL reason code. Defaults to {@link PubRelReasonCode.PacketIdentifierNotFound}.
	 */
	constructor(msg: string, code: PubRelReasonCode = PubRelReasonCode.PacketIdentifierNotFound) {
		super(msg, code);
	}
}

/**
 * Thrown when the server parses a client PUBREL and must use a PUBCOMP reason code in the outcome.
 */
export class PubCompException extends MqttBasicException {
	/**
	 * @param msg - Human-readable description of the failure.
	 * @param code - PUBCOMP reason code. Defaults to {@link PubCompReasonCode.PacketIdentifierNotFound}.
	 */
	constructor(msg: string, code: PubCompReasonCode = PubCompReasonCode.PacketIdentifierNotFound) {
		super(msg, code);
	}
}

/**
 * Thrown during MQTT 5 enhanced authentication (AUTH packet) when a specific authenticate reason code applies.
 */
export class AuthenticateException extends MqttBasicException {
	/**
	 * @param msg - Human-readable description of the failure.
	 * @param code - AUTH reason code. Defaults to {@link AuthenticateReasonCode.ContinueAuthentication}.
	 */
	constructor(msg: string, code: AuthenticateReasonCode = AuthenticateReasonCode.ContinueAuthentication) {
		super(msg, code);
	}
}
