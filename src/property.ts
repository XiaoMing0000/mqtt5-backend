import { DisconnectException, DisconnectReasonCode } from './exception';
import {
	BufferData,
	IAuthProperties,
	IConnAckProperties,
	IConnectProperties,
	IDisconnectProperties,
	IPubCompProperties,
	IProperties,
	IPubAckProperties,
	IPublishProperties,
	IPubRecProperties,
	IPubRelProperties,
	ISubAckProperties,
	ISubscribeProperties,
	IUnsubscribeAckProperties,
	IUnsubscribeProperties,
	IWillProperties,
	PropertyDataMap,
	PropertyIdentifier,
	IConnectWillProperties,
} from './interface';
import {
	fourByteInteger,
	integerToFourUint8,
	integerToOneUint8,
	integerToTwoUint8,
	oneByteInteger,
	stringToVariableByteInteger,
	twoByteInteger,
	encodeUTF8String,
	utf8DecodedString,
	utf8StringPair,
	variableByteInteger,
	encodeVariableByteInteger,
} from './parse';

/**
 * 解析所有报文属性
 * @param buffer
 * @param index
 * @returns
 */
export function parseProperties(buffer: Buffer, index?: number) {
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.payloadFormatIndicator:
				data.index++;
				if (properties.payloadFormatIndicator !== undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Payload Format Indicator more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.payloadFormatIndicator = oneByteInteger(data);
				break;
			case PropertyIdentifier.messageExpiryInterval:
				data.index++;
				if (properties.messageExpiryInterval != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Payload Format Indicator more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.messageExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.contentType:
				data.index++;
				if (properties.contentType) {
					throw new DisconnectException('It is a Protocol Error to include the Content Type more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.contentType = utf8DecodedString(data);
				break;
			case PropertyIdentifier.responseTopic:
				data.index++;
				if (properties.responseTopic) {
					throw new DisconnectException('It is a Protocol Error to include the Content Type more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.responseTopic = utf8DecodedString(data);
				break;
			case PropertyIdentifier.correlationData:
				data.index++;
				if (properties.correlationData) {
					throw new DisconnectException('It is a Protocol Error to include Correlation Data more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.correlationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.subscriptionIdentifier:
				data.index++;
				if (properties.subscriptionIdentifier) {
					throw new DisconnectException('It is a Protocol Error to include the Subscription Identifier more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.subscriptionIdentifier = variableByteInteger(data, 4);
				if (properties.subscriptionIdentifier == 0) {
					throw new DisconnectException('It is a Protocol Error if the Subscription Identifier has a value of 0. ', DisconnectReasonCode.ProtocolError);
				}
				break;
			case PropertyIdentifier.sessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Session Expiry Interval more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.clientIdentifier:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Assigned Client Identifier more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.clientIdentifier = utf8DecodedString(data);
				break;
			case PropertyIdentifier.serverKeepAlive:
				data.index++;
				if (properties.serverKeepAlive != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Server Keep Alive more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.serverKeepAlive = twoByteInteger(data);
				break;
			case PropertyIdentifier.authenticationMethod:
				data.index++;
				if (properties.authenticationMethod) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.authenticationMethod = utf8DecodedString(data);
				break;
			case PropertyIdentifier.authenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.authenticationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.requestProblemInformation:
				data.index++;
				if (properties.requestProblemInformation !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is a Protocol Error to include Request Problem Information more than once, or to have a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.requestProblemInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.willDelayInterval:
				data.index++;
				if (properties.willDelayInterval !== undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Will Delay Interval more than once. ', DisconnectReasonCode.ProtocolError);
				}
				properties.willDelayInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.requestResponseInformation:
				data.index++;
				if (properties.requestResponseInformation !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is Protocol Error to include the Request Response Information more than once, or to have a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.requestResponseInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.responseInformation:
				data.index++;
				if (properties.responseInformation) {
					throw new DisconnectException('It is a Protocol Error to include the Response Information more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.responseInformation = utf8DecodedString(data);
				break;
			case PropertyIdentifier.serverReference:
				data.index++;
				if (properties.serverReference) {
					throw new DisconnectException('It is a Protocol Error to include the Response Information more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.serverReference = utf8DecodedString(data);
				break;
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.reasonString = utf8DecodedString(data);
				break;
			case PropertyIdentifier.receiveMaximum:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.receiveMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.topicAliasMaximum:
				data.index++;
				if (properties.topicAliasMaximum != undefined) {
					throw new DisconnectException('t is a Protocol Error to include the Topic Alias Maximum value more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.topicAliasMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.topicAlias:
				data.index++;
				if (properties.topicAlias != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Topic Alias value more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.topicAlias = twoByteInteger(data);
				break;
			case PropertyIdentifier.maximumQoS:
				data.index++;
				if (properties.maximumQoS !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException('It is a Protocol Error to include Maximum QoS more than once, or to have a value other than 0 or 1.', DisconnectReasonCode.ProtocolError);
				}
				properties.maximumQoS = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.retainAvailable:
				data.index++;
				if (properties.retainAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is a Protocol Error to include Retain Available more than once or to use a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.retainAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			case PropertyIdentifier.maximumPacketSize:
				data.index++;
				if (properties.maximumPacketSize != undefined) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.maximumPacketSize = fourByteInteger(data);
				break;
			case PropertyIdentifier.wildcardSubscriptionAvailable:
				data.index++;
				if (properties.wildcardSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Wildcard Subscription Available more than once or to send a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.wildcardSubscriptionAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.subscriptionIdentifierAvailable:
				data.index++;
				if (properties.subscriptionIdentifierAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Subscription Identifier Available more than once, or to send a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.subscriptionIdentifierAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.sharedSubscriptionAvailable:
				data.index++;
				if (properties.sharedSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Shared Subscription Available more than once or to send a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.sharedSubscriptionAvailable = !!oneByteInteger(data);
				break;
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 connect 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parseConnectProperties(buffer: Buffer, index?: number) {
	const properties: IConnectProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.sessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Session Expiry Interval more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.authenticationMethod:
				data.index++;
				if (properties.authenticationMethod) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.authenticationMethod = utf8DecodedString(data);
				break;
			case PropertyIdentifier.authenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.authenticationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.requestProblemInformation:
				data.index++;
				if (properties.requestProblemInformation !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is a Protocol Error to include Request Problem Information more than once, or to have a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.requestProblemInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.requestResponseInformation:
				data.index++;
				if (properties.requestResponseInformation !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is Protocol Error to include the Request Response Information more than once, or to have a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.requestResponseInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.receiveMaximum:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.receiveMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.topicAliasMaximum:
				data.index++;
				if (properties.topicAliasMaximum != undefined) {
					throw new DisconnectException('t is a Protocol Error to include the Topic Alias Maximum value more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.topicAliasMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			case PropertyIdentifier.maximumPacketSize:
				data.index++;
				if (properties.maximumPacketSize != undefined) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.maximumPacketSize = fourByteInteger(data);
				break;
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 connack 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parseConnAckProperties(buffer: Buffer, index?: number) {
	const properties: IConnAckProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.sessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Session Expiry Interval more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.clientIdentifier:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Assigned Client Identifier more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.clientIdentifier = utf8DecodedString(data);
				break;
			case PropertyIdentifier.serverKeepAlive:
				data.index++;
				if (properties.serverKeepAlive != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Server Keep Alive more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.serverKeepAlive = twoByteInteger(data);
				break;
			case PropertyIdentifier.authenticationMethod:
				data.index++;
				if (properties.authenticationMethod) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.authenticationMethod = utf8DecodedString(data);
				break;
			case PropertyIdentifier.authenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.authenticationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.responseInformation:
				data.index++;
				if (properties.responseInformation) {
					throw new DisconnectException('It is a Protocol Error to include the Response Information more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.responseInformation = utf8DecodedString(data);
				break;
			case PropertyIdentifier.serverReference:
				data.index++;
				if (properties.serverReference) {
					throw new DisconnectException('It is a Protocol Error to include the Response Information more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.serverReference = utf8DecodedString(data);
				break;
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.reasonString = utf8DecodedString(data);
				break;
			case PropertyIdentifier.receiveMaximum:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.receiveMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.topicAliasMaximum:
				data.index++;
				if (properties.topicAliasMaximum != undefined) {
					throw new DisconnectException('t is a Protocol Error to include the Topic Alias Maximum value more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.topicAliasMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.maximumQoS:
				data.index++;
				if (properties.maximumQoS !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException('It is a Protocol Error to include Maximum QoS more than once, or to have a value other than 0 or 1.', DisconnectReasonCode.ProtocolError);
				}
				properties.maximumQoS = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.retainAvailable:
				data.index++;
				if (properties.retainAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is a Protocol Error to include Retain Available more than once or to use a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.retainAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			case PropertyIdentifier.maximumPacketSize:
				data.index++;
				if (properties.maximumPacketSize != undefined) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.maximumPacketSize = fourByteInteger(data);
				break;
			case PropertyIdentifier.wildcardSubscriptionAvailable:
				data.index++;
				if (properties.wildcardSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Wildcard Subscription Available more than once or to send a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.wildcardSubscriptionAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.subscriptionIdentifierAvailable:
				data.index++;
				if (properties.subscriptionIdentifierAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Subscription Identifier Available more than once, or to send a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.subscriptionIdentifierAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.sharedSubscriptionAvailable:
				data.index++;
				if (properties.sharedSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new DisconnectException(
						'It is a Protocol Error to include the Shared Subscription Available more than once or to send a value other than 0 or 1.',
						DisconnectReasonCode.ProtocolError,
					);
				}
				properties.sharedSubscriptionAvailable = !!oneByteInteger(data);
				break;
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 disconnect 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parseDisconnectProperties(buffer: Buffer, index?: number) {
	const properties: IDisconnectProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.sessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Session Expiry Interval more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.serverReference:
				data.index++;
				if (properties.serverReference) {
					throw new DisconnectException('It is a Protocol Error to include the Response Information more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.serverReference = utf8DecodedString(data);
				break;
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.reasonString = utf8DecodedString(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 subscribe 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parseSubscribeProperties(buffer: Buffer, index?: number) {
	const properties: ISubscribeProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.subscriptionIdentifier:
				data.index++;
				if (properties.subscriptionIdentifier) {
					throw new DisconnectException('It is a Protocol Error to include the Subscription Identifier more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.subscriptionIdentifier = variableByteInteger(data, 4);
				if (properties.subscriptionIdentifier == 0) {
					throw new DisconnectException('It is a Protocol Error if the Subscription Identifier has a value of 0. ');
				}
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 suback 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parseSubAckProperties(buffer: Buffer, index?: number) {
	const properties: ISubAckProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.reasonString = utf8DecodedString(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 unsubscribe 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parseUnsubscribeProperties(buffer: Buffer, index?: number) {
	const properties: IUnsubscribeProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 unsubscribe ack 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parseUnsubscribeAckProperties(buffer: Buffer, index?: number) {
	const properties: IUnsubscribeAckProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 publish 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parsePublishProperties(buffer: Buffer, index?: number) {
	const properties: IPublishProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.payloadFormatIndicator:
				data.index++;
				if (properties.payloadFormatIndicator !== undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Payload Format Indicator more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.payloadFormatIndicator = oneByteInteger(data);
				break;
			case PropertyIdentifier.messageExpiryInterval:
				data.index++;
				if (properties.messageExpiryInterval != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Payload Format Indicator more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.messageExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.contentType:
				data.index++;
				if (properties.contentType) {
					throw new DisconnectException('It is a Protocol Error to include the Content Type more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.contentType = utf8DecodedString(data);
				break;
			case PropertyIdentifier.responseTopic:
				data.index++;
				if (properties.responseTopic) {
					throw new DisconnectException('It is a Protocol Error to include the Content Type more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.responseTopic = utf8DecodedString(data);
				if (/[#+$]/.test(properties.responseTopic)) {
					throw new DisconnectException('The Response Topic MUST NOT contain wildcard characters.', DisconnectReasonCode.ProtocolError);
				}
				break;
			case PropertyIdentifier.correlationData:
				data.index++;
				if (properties.correlationData) {
					throw new DisconnectException('It is a Protocol Error to include Correlation Data more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.correlationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.subscriptionIdentifier: {
				data.index++;
				const subscriptionIdentifier = variableByteInteger(data, 4);

				if (subscriptionIdentifier == 0) {
					throw new DisconnectException('It is a Protocol Error if the Subscription Identifier has a value of 0. ', DisconnectReasonCode.ProtocolError);
				}
				(properties.subscriptionIdentifier ??= []).push(subscriptionIdentifier);
				break;
			}
			case PropertyIdentifier.topicAliasMaximum:
				data.index++;
				if (properties.topicAliasMaximum != undefined) {
					throw new DisconnectException('t is a Protocol Error to include the Topic Alias Maximum value more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.topicAliasMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			case PropertyIdentifier.topicAlias:
				data.index++;
				if (properties.topicAlias != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Topic Alias value more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.topicAlias = twoByteInteger(data);
				break;
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 connect 报文的 payload 内部的 will 属性
 * @param buffer
 * @param index
 * @returns
 */
export function parseConnectWillProperties(buffer: Buffer, index?: number) {
	const properties: IConnectWillProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.willDelayInterval:
				data.index++;
				if (properties.willDelayInterval !== undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Will Delay Interval more than once. ', DisconnectReasonCode.ProtocolError);
				}
				properties.willDelayInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.payloadFormatIndicator:
				data.index++;
				if (properties.payloadFormatIndicator !== undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Payload Format Indicator more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.payloadFormatIndicator = oneByteInteger(data);
				break;
			case PropertyIdentifier.messageExpiryInterval:
				data.index++;
				if (properties.messageExpiryInterval != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Payload Format Indicator more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.messageExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.contentType:
				data.index++;
				if (properties.contentType) {
					throw new DisconnectException('It is a Protocol Error to include the Content Type more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.contentType = utf8DecodedString(data);
				break;
			case PropertyIdentifier.responseTopic:
				data.index++;
				if (properties.responseTopic) {
					throw new DisconnectException('It is a Protocol Error to include the Content Type more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.responseTopic = utf8DecodedString(data);
				if (/[#+$]/.test(properties.responseTopic)) {
					throw new DisconnectException('The Response Topic MUST NOT contain wildcard characters.', DisconnectReasonCode.ProtocolError);
				}
				break;
			case PropertyIdentifier.correlationData:
				data.index++;
				if (properties.correlationData) {
					throw new DisconnectException('It is a Protocol Error to include Correlation Data more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.correlationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 puback 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parsePubAckProperties(buffer: Buffer, index?: number) {
	const properties: IPubAckProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.reasonString = utf8DecodedString(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 pubrec 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parsePubRecProperties(buffer: Buffer, index?: number) {
	const properties: IPubRecProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.reasonString = utf8DecodedString(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 pubrel 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parsePubRelProperties(buffer: Buffer, index?: number) {
	const properties: IPubRelProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.reasonString = utf8DecodedString(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 pubcomp 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parsePubCompProperties(buffer: Buffer, index?: number) {
	const properties: IPubCompProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.reasonString = utf8DecodedString(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 auth 报文的属性
 * @param buffer
 * @param index
 * @returns
 */
export function parseAuthProperties(buffer: Buffer, index?: number) {
	const properties: IAuthProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.authenticationMethod:
				data.index++;
				if (properties.authenticationMethod) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.authenticationMethod = utf8DecodedString(data);
				break;
			case PropertyIdentifier.authenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.authenticationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.', DisconnectReasonCode.ProtocolError);
				}
				properties.reasonString = utf8DecodedString(data);
				break;
			case PropertyIdentifier.userProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				if (!properties.userProperty) {
					properties.userProperty = {
						[key]: value,
					};
				} else {
					properties.userProperty[key] = value;
				}
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

/**
 * 解析 subscribe 报文的属性
 * @param id
 * @param data
 * @returns
 */
export function encodeProperties<K extends keyof PropertyDataMap>(id: K, data: PropertyDataMap[K]): Array<number> {
	switch (id) {
		case PropertyIdentifier.payloadFormatIndicator:
			return [PropertyIdentifier.payloadFormatIndicator, integerToOneUint8(data as number)];
		case PropertyIdentifier.messageExpiryInterval:
			return [PropertyIdentifier.messageExpiryInterval, ...integerToFourUint8(data as number)];
		case PropertyIdentifier.contentType:
			return [PropertyIdentifier.contentType, ...encodeUTF8String(data as string)];
		case PropertyIdentifier.responseTopic:
			return [PropertyIdentifier.responseTopic, ...encodeUTF8String(data as string)];
		case PropertyIdentifier.correlationData:
			return [PropertyIdentifier.correlationData, ...encodeUTF8String(data as string)];
		case PropertyIdentifier.subscriptionIdentifier:
			if (Array.isArray(data)) {
				const buffer: Array<number> = [];
				data.map((item) => buffer.push(PropertyIdentifier.subscriptionIdentifier, ...encodeVariableByteInteger(item)));
				return buffer;
			}
			return [PropertyIdentifier.subscriptionIdentifier, ...stringToVariableByteInteger(data as string)];
		case PropertyIdentifier.sessionExpiryInterval:
			return [PropertyIdentifier.sessionExpiryInterval, ...integerToFourUint8(data as number)];
		case PropertyIdentifier.clientIdentifier:
			return [PropertyIdentifier.clientIdentifier, ...encodeUTF8String(data as string)];
		case PropertyIdentifier.serverKeepAlive:
			return [PropertyIdentifier.serverKeepAlive, ...integerToTwoUint8(data as number)];
		case PropertyIdentifier.authenticationMethod:
			return [PropertyIdentifier.authenticationMethod, ...encodeUTF8String(data as string)];
		case PropertyIdentifier.authenticationData:
			return [PropertyIdentifier.authenticationData, ...encodeUTF8String(data as string)];
		case PropertyIdentifier.requestProblemInformation:
			return [PropertyIdentifier.requestProblemInformation, integerToOneUint8(data as number)];
		case PropertyIdentifier.willDelayInterval:
			return [PropertyIdentifier.willDelayInterval, ...integerToFourUint8(data as number)];
		case PropertyIdentifier.requestResponseInformation:
			return [PropertyIdentifier.requestResponseInformation, integerToOneUint8(data as number)];
		case PropertyIdentifier.responseInformation:
			return [PropertyIdentifier.responseInformation, ...encodeUTF8String(data as string)];
		case PropertyIdentifier.serverReference:
			return [PropertyIdentifier.serverReference, ...encodeUTF8String(data as string)];
		case PropertyIdentifier.reasonString:
			return [PropertyIdentifier.reasonString, ...encodeUTF8String(data as string)];
		case PropertyIdentifier.receiveMaximum:
			return [PropertyIdentifier.receiveMaximum, ...integerToTwoUint8(data as number)];
		case PropertyIdentifier.topicAliasMaximum:
			return [PropertyIdentifier.topicAliasMaximum, ...integerToTwoUint8(data as number)];
		case PropertyIdentifier.topicAlias:
			return [PropertyIdentifier.topicAlias, ...integerToTwoUint8(data as number)];
		case PropertyIdentifier.maximumQoS:
			return [PropertyIdentifier.maximumQoS, integerToOneUint8(data as number)];
		case PropertyIdentifier.retainAvailable:
			return [PropertyIdentifier.retainAvailable, integerToOneUint8(data as number)];
		case PropertyIdentifier.userProperty: {
			const buffer: Array<number> = [];
			const userPropertyData = data as IProperties['userProperty'];
			for (const key in userPropertyData) {
				buffer.push(...[PropertyIdentifier.userProperty, ...encodeUTF8String(key), ...encodeUTF8String(userPropertyData[key])]);
			}
			return buffer;
		}
		case PropertyIdentifier.maximumPacketSize:
			return [PropertyIdentifier.maximumPacketSize, ...integerToFourUint8(data as number)];
		case PropertyIdentifier.wildcardSubscriptionAvailable:
			return [PropertyIdentifier.wildcardSubscriptionAvailable, integerToOneUint8(data as number)];
		case PropertyIdentifier.subscriptionIdentifierAvailable:
			return [PropertyIdentifier.subscriptionIdentifierAvailable, integerToOneUint8(data as number)];
		case PropertyIdentifier.sharedSubscriptionAvailable:
			return [PropertyIdentifier.sharedSubscriptionAvailable, integerToOneUint8(data as number)];
		default:
			return [];
	}
}
