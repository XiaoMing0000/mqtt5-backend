import {
	ConnectAckException,
	ConnectAckReasonCode,
	DisconnectException,
	MqttBasicException,
	PubAckException,
	PubAckReasonCode,
	PubRelException,
	SubscribeAckException,
} from './exception';
import {
	BufferData,
	IAuthProperties,
	IConnAckProperties,
	IConnectProperties,
	IDisconnectProperties,
	IPPubCompProperties,
	IProperties,
	IPublishAckProperties,
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

export function parseProperties(buffer: Buffer, index?: number) {
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.payloadFormatIndicator:
				data.index++;
				if (properties.payloadFormatIndicator !== undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Payload Format Indicator more than once.');
				}
				properties.payloadFormatIndicator = oneByteInteger(data);
				break;
			case PropertyIdentifier.messageExpiryInterval:
				data.index++;
				if (properties.messageExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Payload Format Indicator more than once.');
				}
				properties.messageExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.contentType:
				data.index++;
				if (properties.contentType) {
					throw new MqttBasicException('It is a Protocol Error to include the Content Type more than once.');
				}
				properties.contentType = utf8DecodedString(data);
				break;
			case PropertyIdentifier.responseTopic:
				data.index++;
				if (properties.responseTopic) {
					throw new MqttBasicException('It is a Protocol Error to include the Content Type more than once.');
				}
				properties.responseTopic = utf8DecodedString(data);
				break;
			case PropertyIdentifier.correlationData:
				data.index++;
				if (properties.correlationData) {
					throw new MqttBasicException('It is a Protocol Error to include Correlation Data more than once.');
				}
				properties.correlationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.subscriptionIdentifier:
				data.index++;
				if (properties.subscriptionIdentifier) {
					throw new MqttBasicException('It is a Protocol Error to include the Subscription Identifier more than once.');
				}
				properties.subscriptionIdentifier = variableByteInteger(data, 4);
				if (properties.subscriptionIdentifier == 0) {
					throw new MqttBasicException('It is a Protocol Error if the Subscription Identifier has a value of 0. ');
				}
				break;
			case PropertyIdentifier.sessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Session Expiry Interval more than once.');
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.clientIdentifier:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Assigned Client Identifier more than once.');
				}
				properties.clientIdentifier = utf8DecodedString(data);
				break;
			case PropertyIdentifier.serverKeepAlive:
				data.index++;
				if (properties.serverKeepAlive != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Server Keep Alive more than once.');
				}
				properties.serverKeepAlive = twoByteInteger(data);
				break;
			case PropertyIdentifier.authenticationMethod:
				data.index++;
				if (properties.authenticationMethod) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationMethod = utf8DecodedString(data);
				break;
			case PropertyIdentifier.authenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.requestProblemInformation:
				data.index++;
				if (properties.requestProblemInformation !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include Request Problem Information more than once, or to have a value other than 0 or 1.');
				}
				properties.requestProblemInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.willDelayInterval:
				data.index++;
				if (properties.willDelayInterval !== undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Will Delay Interval more than once. ');
				}
				properties.willDelayInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.requestResponseInformation:
				data.index++;
				if (properties.requestResponseInformation !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is Protocol Error to include the Request Response Information more than once, or to have a value other than 0 or 1.');
				}
				properties.requestResponseInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.responseInformation:
				data.index++;
				if (properties.responseInformation) {
					throw new MqttBasicException('It is a Protocol Error to include the Response Information more than once.');
				}
				properties.responseInformation = utf8DecodedString(data);
				break;
			case PropertyIdentifier.serverReference:
				data.index++;
				if (properties.serverReference) {
					throw new MqttBasicException('It is a Protocol Error to include the Response Information more than once.');
				}
				properties.serverReference = utf8DecodedString(data);
				break;
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8DecodedString(data);
				break;
			case PropertyIdentifier.receiveMaximum:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.');
				}
				properties.receiveMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.topicAliasMaximum:
				data.index++;
				if (properties.topicAliasMaximum != undefined) {
					throw new MqttBasicException('t is a Protocol Error to include the Topic Alias Maximum value more than once.');
				}
				properties.topicAliasMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.topicAlias:
				data.index++;
				if (properties.topicAlias != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Topic Alias value more than once.');
				}
				properties.topicAlias = twoByteInteger(data);
				break;
			case PropertyIdentifier.maximumQoS:
				data.index++;
				if (properties.maximumQoS !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include Maximum QoS more than once, or to have a value other than 0 or 1.');
				}
				properties.maximumQoS = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.retainAvailable:
				data.index++;
				if (properties.retainAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include Retain Available more than once or to use a value other than 0 or 1.');
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
					throw new MqttBasicException('It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.');
				}
				properties.maximumPacketSize = fourByteInteger(data);
				break;
			case PropertyIdentifier.wildcardSubscriptionAvailable:
				data.index++;
				if (properties.wildcardSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include the Wildcard Subscription Available more than once or to send a value other than 0 or 1.');
				}
				properties.wildcardSubscriptionAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.subscriptionIdentifierAvailable:
				data.index++;
				if (properties.subscriptionIdentifierAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include the Subscription Identifier Available more than once, or to send a value other than 0 or 1.');
				}
				properties.subscriptionIdentifierAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.sharedSubscriptionAvailable:
				data.index++;
				if (properties.sharedSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include the Shared Subscription Available more than once or to send a value other than 0 or 1.');
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

export function parseConnectProperties(buffer: Buffer, index?: number) {
	const properties: IConnectProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.sessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new ConnectAckException('It is a Protocol Error to include the Session Expiry Interval more than once.', ConnectAckReasonCode.MalformedPacket);
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.authenticationMethod:
				data.index++;
				if (properties.authenticationMethod) {
					throw new ConnectAckException('It is a Protocol Error to include Authentication Method more than once.', ConnectAckReasonCode.MalformedPacket);
				}
				properties.authenticationMethod = utf8DecodedString(data);
				break;
			case PropertyIdentifier.authenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new ConnectAckException('It is a Protocol Error to include Authentication Method more than once.', ConnectAckReasonCode.MalformedPacket);
				}
				properties.authenticationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.requestProblemInformation:
				data.index++;
				if (properties.requestProblemInformation !== undefined || data.buffer[data.index] > 1) {
					throw new ConnectAckException(
						'It is a Protocol Error to include Request Problem Information more than once, or to have a value other than 0 or 1.',
						ConnectAckReasonCode.MalformedPacket,
					);
				}
				properties.requestProblemInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.requestResponseInformation:
				data.index++;
				if (properties.requestResponseInformation !== undefined || data.buffer[data.index] > 1) {
					throw new ConnectAckException(
						'It is Protocol Error to include the Request Response Information more than once, or to have a value other than 0 or 1.',
						ConnectAckReasonCode.MalformedPacket,
					);
				}
				properties.requestResponseInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.receiveMaximum:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new ConnectAckException(
						'It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.',
						ConnectAckReasonCode.MalformedPacket,
					);
				}
				properties.receiveMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.topicAliasMaximum:
				data.index++;
				if (properties.topicAliasMaximum != undefined) {
					throw new ConnectAckException('t is a Protocol Error to include the Topic Alias Maximum value more than once.', ConnectAckReasonCode.MalformedPacket);
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
					throw new ConnectAckException(
						'It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.',
						ConnectAckReasonCode.MalformedPacket,
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
 * 客户端应用
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
					throw new MqttBasicException('It is a Protocol Error to include the Session Expiry Interval more than once.');
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.clientIdentifier:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Assigned Client Identifier more than once.');
				}
				properties.clientIdentifier = utf8DecodedString(data);
				break;
			case PropertyIdentifier.serverKeepAlive:
				data.index++;
				if (properties.serverKeepAlive != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Server Keep Alive more than once.');
				}
				properties.serverKeepAlive = twoByteInteger(data);
				break;
			case PropertyIdentifier.authenticationMethod:
				data.index++;
				if (properties.authenticationMethod) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationMethod = utf8DecodedString(data);
				break;
			case PropertyIdentifier.authenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.responseInformation:
				data.index++;
				if (properties.responseInformation) {
					throw new MqttBasicException('It is a Protocol Error to include the Response Information more than once.');
				}
				properties.responseInformation = utf8DecodedString(data);
				break;
			case PropertyIdentifier.serverReference:
				data.index++;
				if (properties.serverReference) {
					throw new MqttBasicException('It is a Protocol Error to include the Response Information more than once.');
				}
				properties.serverReference = utf8DecodedString(data);
				break;
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8DecodedString(data);
				break;
			case PropertyIdentifier.receiveMaximum:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.');
				}
				properties.receiveMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.topicAliasMaximum:
				data.index++;
				if (properties.topicAliasMaximum != undefined) {
					throw new MqttBasicException('t is a Protocol Error to include the Topic Alias Maximum value more than once.');
				}
				properties.topicAliasMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.maximumQoS:
				data.index++;
				if (properties.maximumQoS !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include Maximum QoS more than once, or to have a value other than 0 or 1.');
				}
				properties.maximumQoS = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.retainAvailable:
				data.index++;
				if (properties.retainAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include Retain Available more than once or to use a value other than 0 or 1.');
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
					throw new MqttBasicException('It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.');
				}
				properties.maximumPacketSize = fourByteInteger(data);
				break;
			case PropertyIdentifier.wildcardSubscriptionAvailable:
				data.index++;
				if (properties.wildcardSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include the Wildcard Subscription Available more than once or to send a value other than 0 or 1.');
				}
				properties.wildcardSubscriptionAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.subscriptionIdentifierAvailable:
				data.index++;
				if (properties.subscriptionIdentifierAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include the Subscription Identifier Available more than once, or to send a value other than 0 or 1.');
				}
				properties.subscriptionIdentifierAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.sharedSubscriptionAvailable:
				data.index++;
				if (properties.sharedSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include the Shared Subscription Available more than once or to send a value other than 0 or 1.');
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

export function parseDisconnectProperties(buffer: Buffer, index?: number) {
	const properties: IDisconnectProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.sessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new DisconnectException('It is a Protocol Error to include the Session Expiry Interval more than once.');
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.serverReference:
				data.index++;
				if (properties.serverReference) {
					throw new DisconnectException('It is a Protocol Error to include the Response Information more than once.');
				}
				properties.serverReference = utf8DecodedString(data);
				break;
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new DisconnectException('It is a Protocol Error to include Authentication Method more than once.');
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

export function parseSubscribeProperties(buffer: Buffer, index?: number) {
	const properties: ISubscribeProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.subscriptionIdentifier:
				data.index++;
				if (properties.subscriptionIdentifier) {
					throw new SubscribeAckException('It is a Protocol Error to include the Subscription Identifier more than once.');
				}
				properties.subscriptionIdentifier = variableByteInteger(data, 4);
				if (properties.subscriptionIdentifier == 0) {
					throw new SubscribeAckException('It is a Protocol Error if the Subscription Identifier has a value of 0. ');
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
 * 客户端应用
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
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
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
 * 客户端应用
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

export function parsePublishProperties(buffer: Buffer, index?: number) {
	const properties: IPublishProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.payloadFormatIndicator:
				data.index++;
				if (properties.payloadFormatIndicator !== undefined) {
					throw new PubAckException('It is a Protocol Error to include the Payload Format Indicator more than once.', PubAckReasonCode.PayloadFormatInvalid);
				}
				properties.payloadFormatIndicator = oneByteInteger(data);

				if (properties.payloadFormatIndicator !== undefined) {
					throw new PubAckException('It is a Protocol Error to include the Payload Format Indicator more than once.', PubAckReasonCode.PayloadFormatInvalid);
				}
				break;
			case PropertyIdentifier.messageExpiryInterval:
				data.index++;
				if (properties.messageExpiryInterval != undefined) {
					throw new PubAckException('It is a Protocol Error to include the Payload Format Indicator more than once.', PubAckReasonCode.UnspecifiedError);
				}
				properties.messageExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.contentType:
				data.index++;
				if (properties.contentType) {
					throw new PubAckException('It is a Protocol Error to include the Content Type more than once.', PubAckReasonCode.UnspecifiedError);
				}
				properties.contentType = utf8DecodedString(data);
				break;
			case PropertyIdentifier.responseTopic:
				data.index++;
				if (properties.responseTopic) {
					throw new PubAckException('It is a Protocol Error to include the Content Type more than once.', PubAckReasonCode.UnspecifiedError);
				}
				properties.responseTopic = utf8DecodedString(data);
				if (/[#+$]/.test(properties.responseTopic)) {
					throw new PubAckException('The Response Topic MUST NOT contain wildcard characters.', PubAckReasonCode.TopicNameInvalid);
				}
				break;
			case PropertyIdentifier.correlationData:
				data.index++;
				if (properties.correlationData) {
					throw new PubAckException('It is a Protocol Error to include Correlation Data more than once.', PubAckReasonCode.UnspecifiedError);
				}
				properties.correlationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.subscriptionIdentifier: {
				data.index++;
				const subscriptionIdentifier = variableByteInteger(data, 4);

				if (subscriptionIdentifier == 0) {
					throw new PubAckException('It is a Protocol Error if the Subscription Identifier has a value of 0. ', PubAckReasonCode.TopicNameInvalid);
				}
				(properties.subscriptionIdentifier ??= []).push(subscriptionIdentifier);
				break;
			}
			case PropertyIdentifier.topicAlias:
				data.index++;
				if (properties.topicAlias != undefined) {
					throw new PubAckException('It is a Protocol Error to include the Topic Alias value more than once.', PubAckReasonCode.TopicNameInvalid);
				}
				properties.topicAlias = twoByteInteger(data);
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
 * 客户端应用
 * @param buffer
 * @param index
 * @returns
 */
export function parsePublishAckProperties(buffer: Buffer, index?: number) {
	const properties: IPublishAckProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
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

export function parsePubRecProperties(buffer: Buffer, index?: number) {
	const properties: IPubRecProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
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

export function parsePubRelProperties(buffer: Buffer, index?: number) {
	const properties: IPubRelProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new PubRelException('It is a Protocol Error to include Authentication Method more than once.');
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

export function parsePubCompProperties(buffer: Buffer, index?: number) {
	const properties: IPPubCompProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
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

export function parseAuthProperties(buffer: Buffer, index?: number) {
	const properties: IAuthProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.authenticationMethod:
				data.index++;
				if (properties.authenticationMethod) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationMethod = utf8DecodedString(data);
				break;
			case PropertyIdentifier.authenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationData = utf8DecodedString(data);
				break;
			case PropertyIdentifier.reasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
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

export function parseWillProperties(buffer: Buffer, index?: number) {
	const properties: IWillProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.payloadFormatIndicator:
				data.index++;
				if (properties.payloadFormatIndicator !== undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Payload Format Indicator more than once.', ConnectAckReasonCode.PayloadFormatInvalid);
				}
				properties.payloadFormatIndicator = oneByteInteger(data);
				break;
			case PropertyIdentifier.messageExpiryInterval:
				data.index++;
				if (properties.messageExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Payload Format Indicator more than once.', ConnectAckReasonCode.UnspecifiedError);
				}
				properties.messageExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.contentType:
				data.index++;
				if (properties.contentType) {
					throw new MqttBasicException('It is a Protocol Error to include the Content Type more than once.');
				}
				properties.contentType = utf8DecodedString(data);
				break;
			case PropertyIdentifier.responseTopic:
				data.index++;
				if (properties.responseTopic) {
					throw new MqttBasicException('It is a Protocol Error to include the Content Type more than once.');
				}
				properties.responseTopic = utf8DecodedString(data);
				break;
			case PropertyIdentifier.willDelayInterval:
				data.index++;
				if (properties.willDelayInterval !== undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Will Delay Interval more than once. ');
				}
				properties.willDelayInterval = fourByteInteger(data);
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
