enum ReasonCode {
  Success = 0x00,
  // NormalDisconnection = 0x00,
  // GrantedQoS0 = 0x00,
  GrantedQoS1 = 0x01,
  GrantedQoS2 = 0x02,
  DisconnectWithWillMessage = 0x04,
  NoMatchingSubscribers = 0x10,
  NoSubscriptionExisted = 0x11,
  ContinueAuthentication = 0x18,
  Reauthenticate = 0x19,
  UnspecifiedError = 0x80,
  MalformedPacket = 0x81,
  ProtocolError = 0x82,
  ImplementationSpecificError = 0x83,
  UnsupportedProtocolVersion = 0x84,
  ClientIdentifierNotValid = 0x85,
  BadUserNameOrPassword = 0x86,
  NotAuthorized = 0x87,
  ServerUnavailable = 0x88,
  ServerBusy = 0x89,
  Banned = 0x8a,
  ServerShuttingDown = 0x8b,
  BadAuthenticationMethod = 0x8c,
  KeepAliveTimeout = 0x8d,
  SessionTakenOver = 0x8e,
  TopicFilterInvalid = 0x8f,
  TopicNameInvalid = 0x90,
  PacketIdentifierInUse = 0x91,
  PacketIdentifierNotFound = 0x92,
  ReceiveMaximumExceeded = 0x93,
  TopicAliasInvalid = 0x94,
  PacketTooLarge = 0x95,
  MessageRateTooHigh = 0x96,
  QuotaExceeded = 0x97,
  AdministrativeAction = 0x98,
  PayloadFormatInvalid = 0x99,
  RetainNotSupported = 0x9a,
  QoSNotSupported = 0x9b,
  UseAnotherServer = 0x9c,
  ServerMoved = 0x9d,
  SharedSubscriptionsNotSupported = 0x9e,
  ConnectionRateExceeded = 0x9f,
  MaximumConnectTime = 0xa0,
  SubscriptionIdentifiersNotSupported = 0xa1,
  WildcardSubscriptionsNotSupported = 0xa2,
}

/** MQTT 5 CONNACK reason codes (MQTT 5.0 specification). */
export enum ConnectAckReasonCode {
  Success = ReasonCode.Success,
  UnspecifiedError = ReasonCode.UnspecifiedError,
  MalformedPacket = ReasonCode.MalformedPacket,
  ProtocolError = ReasonCode.ProtocolError,
  ImplementationSpecificError = ReasonCode.ImplementationSpecificError,
  UnsupportedProtocolVersion = ReasonCode.UnsupportedProtocolVersion,
  ClientIdentifierNotValid = ReasonCode.ClientIdentifierNotValid,
  BadUserNameOrPassword = ReasonCode.BadUserNameOrPassword,
  NotAuthorized = ReasonCode.NotAuthorized,
  ServerUnavailable = ReasonCode.ServerUnavailable,
  ServerBusy = ReasonCode.ServerBusy,
  Banned = ReasonCode.Banned,
  BadAuthenticationMethod = ReasonCode.BadAuthenticationMethod,
  TopicNameInvalid = ReasonCode.TopicNameInvalid,
  PacketTooLarge = ReasonCode.PacketTooLarge,
  QuotaExceeded = ReasonCode.QuotaExceeded,
  PayloadFormatInvalid = ReasonCode.PayloadFormatInvalid,
  RetainNotSupported = ReasonCode.RetainNotSupported,
  QoSNotSupported = ReasonCode.QoSNotSupported,
  UseAnotherServer = ReasonCode.UseAnotherServer,
  ServerMoved = ReasonCode.ServerMoved,
  ConnectionRateExceeded = ReasonCode.ConnectionRateExceeded,
}

/** MQTT 5 DISCONNECT reason codes (MQTT 5.0 specification). */
export enum DisconnectReasonCode {
  NormalDisconnection = ReasonCode.Success,
  DisconnectWithWillMessage = ReasonCode.DisconnectWithWillMessage,
  UnspecifiedError = ReasonCode.UnspecifiedError,
  MalformedPacket = ReasonCode.MalformedPacket,
  ProtocolError = ReasonCode.ProtocolError,
  ImplementationSpecificError = ReasonCode.ImplementationSpecificError,
  NotAuthorized = ReasonCode.NotAuthorized,
  ServerBusy = ReasonCode.ServerBusy,
  ServerShuttingDown = ReasonCode.ServerShuttingDown,
  BadAuthenticationMethod = ReasonCode.BadAuthenticationMethod,
  KeepAliveTimeout = ReasonCode.KeepAliveTimeout,
  SessionTakenOver = ReasonCode.SessionTakenOver,
  TopicFilterInvalid = ReasonCode.TopicFilterInvalid,
  TopicNameInvalid = ReasonCode.TopicNameInvalid,
  ReceiveMaximumExceeded = ReasonCode.ReceiveMaximumExceeded,
  TopicAliasInvalid = ReasonCode.TopicAliasInvalid,
  PacketTooLarge = ReasonCode.PacketTooLarge,
  MessageRateTooHigh = ReasonCode.MessageRateTooHigh,
  QuotaExceeded = ReasonCode.QuotaExceeded,
  AdministrativeAction = ReasonCode.AdministrativeAction,
  PayloadFormatInvalid = ReasonCode.PayloadFormatInvalid,
  RetainNotSupported = ReasonCode.RetainNotSupported,
  QoSNotSupported = ReasonCode.QoSNotSupported,
  UseAnotherServer = ReasonCode.UseAnotherServer,
  ServerMoved = ReasonCode.ServerMoved,
  SharedSubscriptionsNotSupported = ReasonCode.SharedSubscriptionsNotSupported,
  ConnectionRateExceeded = ReasonCode.ConnectionRateExceeded,
  MaximumConnectTime = ReasonCode.MaximumConnectTime,
  SubscriptionIdentifiersNotSupported = ReasonCode.SubscriptionIdentifiersNotSupported,
  WildcardSubscriptionsNotSupported = ReasonCode.WildcardSubscriptionsNotSupported,
}

/** MQTT 5 SUBACK reason codes (per subscription, MQTT 5.0 specification). */
export enum SubscribeAckReasonCode {
  GrantedQoS0 = ReasonCode.Success,
  GrantedQoS1 = ReasonCode.GrantedQoS1,
  GrantedQoS2 = ReasonCode.GrantedQoS2,
  UnspecifiedError = ReasonCode.UnspecifiedError,
  ImplementationSpecificError = ReasonCode.ImplementationSpecificError,
  NotAuthorized = ReasonCode.NotAuthorized,
  TopicFilterInvalid = ReasonCode.TopicFilterInvalid,
  PacketIdentifierInUse = ReasonCode.PacketIdentifierInUse,
  QuotaExceeded = ReasonCode.QuotaExceeded,
  SharedSubscriptionsNotSupported = ReasonCode.SharedSubscriptionsNotSupported,
  SubscriptionIdentifiersNotSupported = ReasonCode.SubscriptionIdentifiersNotSupported,
  WildcardSubscriptionsNotSupported = ReasonCode.WildcardSubscriptionsNotSupported,
}

/** MQTT 5 UNSUBACK reason codes (MQTT 5.0 specification). */
export enum UnsubscribeAckReasonCode {
  Success = ReasonCode.Success,
  NoSubscriptionExisted = ReasonCode.NoSubscriptionExisted,
  UnspecifiedError = ReasonCode.UnspecifiedError,
  ImplementationSpecificError = ReasonCode.ImplementationSpecificError,
  NotAuthorized = ReasonCode.NotAuthorized,
  TopicFilterInvalid = ReasonCode.TopicFilterInvalid,
  PacketIdentifierInUse = ReasonCode.PacketIdentifierInUse,
}

/** MQTT 5 PUBACK reason codes (QoS 1 publish, MQTT 5.0 specification). */
export enum PubAckReasonCode {
  Success = ReasonCode.Success,
  NoMatchingSubscribers = ReasonCode.NoMatchingSubscribers,
  UnspecifiedError = ReasonCode.UnspecifiedError,
  ImplementationSpecificError = ReasonCode.ImplementationSpecificError,
  NotAuthorized = ReasonCode.NotAuthorized,
  TopicNameInvalid = ReasonCode.TopicNameInvalid,
  PacketIdentifierInUse = ReasonCode.PacketIdentifierInUse,
  QuotaExceeded = ReasonCode.QuotaExceeded,
  PayloadFormatInvalid = ReasonCode.PayloadFormatInvalid,
}

/** MQTT 5 PUBREC reason codes (QoS 2 publish, MQTT 5.0 specification). */
export enum PubRecReasonCode {
  Success = ReasonCode.Success,
  NoMatchingSubscribers = ReasonCode.NoMatchingSubscribers,
  UnspecifiedError = ReasonCode.UnspecifiedError,
  ImplementationSpecificError = ReasonCode.ImplementationSpecificError,
  NotAuthorized = ReasonCode.NotAuthorized,
  TopicNameInvalid = ReasonCode.TopicNameInvalid,
  PacketIdentifierInUse = ReasonCode.PacketIdentifierInUse,
  QuotaExceeded = ReasonCode.QuotaExceeded,
  PayloadFormatInvalid = ReasonCode.PayloadFormatInvalid,
}

/** MQTT 5 PUBREL reason codes (MQTT 5.0 specification). */
export enum PubRelReasonCode {
  Success = ReasonCode.Success,
  PacketIdentifierNotFound = ReasonCode.PacketIdentifierNotFound,
}

/** MQTT 5 PUBCOMP reason codes (MQTT 5.0 specification). */
export enum PubCompReasonCode {
  Success = ReasonCode.Success,
  PacketIdentifierNotFound = ReasonCode.PacketIdentifierNotFound,
}

/** MQTT 5 AUTH reason codes (MQTT 5.0 specification). */
export enum AuthenticateReasonCode {
  Success = ReasonCode.Success,
  ContinueAuthentication = ReasonCode.ContinueAuthentication,
  Reauthenticate = ReasonCode.Reauthenticate,
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
class MqttBasicException extends Error {
  private _code: TErrorCode;
  private _msg: string;

  /**
   * @param msg - Human-readable description of the failure.
   * @param code - MQTT 5 reason code. Defaults to {@link ConnectAckReasonCode.UnspecifiedError}.
   */
  constructor(code: TErrorCode = ConnectAckReasonCode.UnspecifiedError, msg?: string) {
    super(); // No argument: application text lives on `msg`, not `Error.message`
    this._code = code;
    this._msg = msg ?? '';
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
  constructor(code: ConnectAckReasonCode = ConnectAckReasonCode.UnspecifiedError, msg?: string) {
    super(code, msg);
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
  constructor(code: DisconnectReasonCode = DisconnectReasonCode.UnspecifiedError, msg?: string) {
    super(code, msg);
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
  constructor(code: SubscribeAckReasonCode = SubscribeAckReasonCode.UnspecifiedError, msg?: string) {
    super(code, msg);
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
  constructor(code: PubAckReasonCode = PubAckReasonCode.UnspecifiedError, msg?: string) {
    super(code, msg);
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
  constructor(code: PubRecReasonCode = PubRecReasonCode.UnspecifiedError, msg?: string) {
    super(code, msg);
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
  constructor(code: PubRelReasonCode = PubRelReasonCode.PacketIdentifierNotFound, msg?: string) {
    super(code, msg);
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
  constructor(code: PubCompReasonCode = PubCompReasonCode.PacketIdentifierNotFound, msg?: string) {
    super(code, msg);
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
  constructor(code: AuthenticateReasonCode = AuthenticateReasonCode.ContinueAuthentication, msg?: string) {
    super(code, msg);
  }
}
