export enum ConnectAckReasonCode {
	Success = 0x00,
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

export enum UnsubscribeAckReasonCode {
	Success = 0x00,
	NoSubscriptionFound = 0x11,
	UnspecifiedError = 0x80,
	ImplementationSpecificError = 0x83,
	NotAuthorized = 0x87,
	TopicFilterInvalid = 0x8f,
	PacketIdentifierInUse = 0x91,
}

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

export enum PubRelReasonCode {
	Success = 0x00,
	PacketIdentifierNotFound = 0x92,
}

export enum PubCompReasonCode {
	Success = 0x00,
	PacketIdentifierNotFound = 0x92,
}

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

export class MqttBasicException extends Error {
	private _code: TErrorCode;
	private _msg: string;
	constructor(msg: string, code: TErrorCode = ConnectAckReasonCode.UnspecifiedError) {
		super();
		this._code = code;
		this._msg = msg;
	}

	get code() {
		return this._code;
	}

	get msg() {
		return this._msg;
	}
}

export class ConnectAckException extends MqttBasicException {
	constructor(msg: string, code: ConnectAckReasonCode = ConnectAckReasonCode.UnspecifiedError) {
		super(msg, code);
	}
}

export class DisconnectException extends MqttBasicException {
	constructor(msg: string, code: DisconnectReasonCode = DisconnectReasonCode.UnspecifiedError) {
		super(msg, code);
	}
}

export class SubscribeAckException extends MqttBasicException {
	constructor(msg: string, code: SubscribeAckReasonCode = SubscribeAckReasonCode.UnspecifiedError) {
		super(msg, code);
	}
}

export class PubAckException extends MqttBasicException {
	constructor(msg: string, code: PubAckReasonCode = PubAckReasonCode.UnspecifiedError) {
		super(msg, code);
	}
}
