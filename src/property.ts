import { ConnectException, ConnectReasonCode, MqttBasicException } from './exception';
import { BufferData, ConnAckPropertyIdentifier, IProperties, PropertyIdentifier, TPropertyIdentifier } from './interface';
import {
	fourByteInteger,
	integerToFourUint8,
	integerToOneUint8,
	integerToTwoUint8,
	oneByteInteger,
	stringToVariableByteInteger,
	twoByteInteger,
	utf8decodedString,
	utf8EncodedString,
	utf8StringPair,
	variableByteInteger,
} from './parse';

export function parseProperties(buffer: Buffer, index?: number) {
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.PayloadFormatIndicator:
				data.index++;
				if (properties.payloadFormatIndicator !== undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Payload Format Indicator more than once.');
				}
				properties.payloadFormatIndicator = oneByteInteger(data);
				break;
			case PropertyIdentifier.MessageExpiryInterval:
				data.index++;
				if (properties.messageExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Payload Format Indicator more than once.');
				}
				properties.messageExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.ContentType:
				data.index++;
				if (properties.contentType) {
					throw new MqttBasicException('It is a Protocol Error to include the Content Type more than once.');
				}
				properties.contentType = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ResponseTopic:
				data.index++;
				if (properties.responseTopic) {
					throw new MqttBasicException('It is a Protocol Error to include the Content Type more than once.');
				}
				properties.responseTopic = utf8EncodedString(data);
				break;
			case PropertyIdentifier.CorrelationData:
				data.index++;
				if (properties.correlationData) {
					throw new MqttBasicException('It is a Protocol Error to include Correlation Data more than once.');
				}
				properties.correlationData = utf8EncodedString(data);
				break;
			case PropertyIdentifier.SubscriptionIdentifier:
				data.index++;
				if (properties.subscriptionIdentifier) {
					throw new MqttBasicException('It is a Protocol Error to include the Subscription Identifier more than once.');
				}
				properties.subscriptionIdentifier = variableByteInteger(data, 4);
				if (properties.subscriptionIdentifier == 0) {
					throw new MqttBasicException('It is a Protocol Error if the Subscription Identifier has a value of 0. ');
				}
				break;
			case PropertyIdentifier.SessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Session Expiry Interval more than once.');
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.ClientIdentifier:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Assigned Client Identifier more than once.');
				}
				properties.clientIdentifier = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ServerKeepAlive:
				data.index++;
				if (properties.serverKeepAlive != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Server Keep Alive more than once.');
				}
				properties.serverKeepAlive = twoByteInteger(data);
				break;
			case PropertyIdentifier.AuthenticationMethod:
				data.index++;
				if (properties.AuthenticationMethod) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationMethod = utf8EncodedString(data);
				break;
			case PropertyIdentifier.AuthenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationData = utf8EncodedString(data);
				break;
			case PropertyIdentifier.RequestProblemInformation:
				data.index++;
				if (properties.requestProblemInformation !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include Request Problem Information more than once, or to have a value other than 0 or 1.');
				}
				properties.requestProblemInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.WillDelayInterval:
				data.index++;
				if (properties.WillDelayInterval !== undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Will Delay Interval more than once. ');
				}
				properties.WillDelayInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.RequestResponseInformation:
				data.index++;
				if (properties.requestResponseInformation !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is Protocol Error to include the Request Response Information more than once, or to have a value other than 0 or 1.');
				}
				properties.requestResponseInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.ResponseInformation:
				data.index++;
				if (properties.responseInformation) {
					throw new MqttBasicException('It is a Protocol Error to include the Response Information more than once.');
				}
				properties.responseInformation = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ServerReference:
				data.index++;
				if (properties.serverReference) {
					throw new MqttBasicException('It is a Protocol Error to include the Response Information more than once.');
				}
				properties.serverReference = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ReasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ReceiveMaximum:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.');
				}
				properties.receiveMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.TopicAliasMaximum:
				data.index++;
				if (properties.topicAliasMaximum != undefined) {
					throw new MqttBasicException('t is a Protocol Error to include the Topic Alias Maximum value more than once.');
				}
				properties.topicAliasMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.TopicAlias:
				data.index++;
				if (properties.topicAlias != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Topic Alias value more than once.');
				}
				properties.topicAlias = twoByteInteger(data);
				break;
			case PropertyIdentifier.MaximumQoS:
				data.index++;
				if (properties.maximumQoS !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include Maximum QoS more than once, or to have a value other than 0 or 1.');
				}
				properties.maximumQoS = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.RetainAvailable:
				data.index++;
				if (properties.retainAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include Retain Available more than once or to use a value other than 0 or 1.');
				}
				properties.retainAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
				break;
			}
			case PropertyIdentifier.MaximumPacketSize:
				data.index++;
				if (properties.maximumPacketSize != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.');
				}
				properties.maximumPacketSize = fourByteInteger(data);
				break;
			case PropertyIdentifier.WildcardSubscriptionAvailable:
				data.index++;
				if (properties.wildcardSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include the Wildcard Subscription Available more than once or to send a value other than 0 or 1.');
				}
				properties.wildcardSubscriptionAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.SubscriptionIdentifierAvailable:
				data.index++;
				if (properties.subscriptionIdentifierAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include the Subscription Identifier Available more than once, or to send a value other than 0 or 1.');
				}
				properties.subscriptionIdentifierAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.SharedSubscriptionAvailable:
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
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.SessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new ConnectException('It is a Protocol Error to include the Session Expiry Interval more than once.', ConnectReasonCode.MalformedPacket);
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.AuthenticationMethod:
				data.index++;
				if (properties.AuthenticationMethod) {
					throw new ConnectException('It is a Protocol Error to include Authentication Method more than once.', ConnectReasonCode.MalformedPacket);
				}
				properties.authenticationMethod = utf8EncodedString(data);
				break;
			case PropertyIdentifier.AuthenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new ConnectException('It is a Protocol Error to include Authentication Method more than once.', ConnectReasonCode.MalformedPacket);
				}
				properties.authenticationData = utf8EncodedString(data);
				break;
			case PropertyIdentifier.RequestProblemInformation:
				data.index++;
				if (properties.requestProblemInformation !== undefined || data.buffer[data.index] > 1) {
					throw new ConnectException(
						'It is a Protocol Error to include Request Problem Information more than once, or to have a value other than 0 or 1.',
						ConnectReasonCode.MalformedPacket,
					);
				}
				properties.requestProblemInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.RequestResponseInformation:
				data.index++;
				if (properties.requestResponseInformation !== undefined || data.buffer[data.index] > 1) {
					throw new ConnectException(
						'It is Protocol Error to include the Request Response Information more than once, or to have a value other than 0 or 1.',
						ConnectReasonCode.MalformedPacket,
					);
				}
				properties.requestResponseInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.ReceiveMaximum:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new ConnectException(
						'It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.',
						ConnectReasonCode.MalformedPacket,
					);
				}
				properties.receiveMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.TopicAliasMaximum:
				data.index++;
				if (properties.topicAliasMaximum != undefined) {
					throw new ConnectException('t is a Protocol Error to include the Topic Alias Maximum value more than once.', ConnectReasonCode.MalformedPacket);
				}
				properties.topicAliasMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
				break;
			}
			case PropertyIdentifier.MaximumPacketSize:
				data.index++;
				if (properties.maximumPacketSize != undefined) {
					throw new ConnectException(
						'It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.',
						ConnectReasonCode.MalformedPacket,
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

export function parseConnAckProperties(buffer: Buffer, index?: number) {
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.SessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Session Expiry Interval more than once.');
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.ClientIdentifier:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Assigned Client Identifier more than once.');
				}
				properties.clientIdentifier = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ServerKeepAlive:
				data.index++;
				if (properties.serverKeepAlive != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Server Keep Alive more than once.');
				}
				properties.serverKeepAlive = twoByteInteger(data);
				break;
			case PropertyIdentifier.AuthenticationMethod:
				data.index++;
				if (properties.AuthenticationMethod) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationMethod = utf8EncodedString(data);
				break;
			case PropertyIdentifier.AuthenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationData = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ResponseInformation:
				data.index++;
				if (properties.responseInformation) {
					throw new MqttBasicException('It is a Protocol Error to include the Response Information more than once.');
				}
				properties.responseInformation = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ServerReference:
				data.index++;
				if (properties.serverReference) {
					throw new MqttBasicException('It is a Protocol Error to include the Response Information more than once.');
				}
				properties.serverReference = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ReasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ReceiveMaximum:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.');
				}
				properties.receiveMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.TopicAliasMaximum:
				data.index++;
				if (properties.topicAliasMaximum != undefined) {
					throw new MqttBasicException('t is a Protocol Error to include the Topic Alias Maximum value more than once.');
				}
				properties.topicAliasMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.MaximumQoS:
				data.index++;
				if (properties.maximumQoS !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include Maximum QoS more than once, or to have a value other than 0 or 1.');
				}
				properties.maximumQoS = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.RetainAvailable:
				data.index++;
				if (properties.retainAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include Retain Available more than once or to use a value other than 0 or 1.');
				}
				properties.retainAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
				break;
			}
			case PropertyIdentifier.MaximumPacketSize:
				data.index++;
				if (properties.maximumPacketSize != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.');
				}
				properties.maximumPacketSize = fourByteInteger(data);
				break;
			case PropertyIdentifier.WildcardSubscriptionAvailable:
				data.index++;
				if (properties.wildcardSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include the Wildcard Subscription Available more than once or to send a value other than 0 or 1.');
				}
				properties.wildcardSubscriptionAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.SubscriptionIdentifierAvailable:
				data.index++;
				if (properties.subscriptionIdentifierAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new MqttBasicException('It is a Protocol Error to include the Subscription Identifier Available more than once, or to send a value other than 0 or 1.');
				}
				properties.subscriptionIdentifierAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.SharedSubscriptionAvailable:
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
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.SessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Session Expiry Interval more than once.');
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.ServerReference:
				data.index++;
				if (properties.serverReference) {
					throw new MqttBasicException('It is a Protocol Error to include the Response Information more than once.');
				}
				properties.serverReference = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ReasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
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
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.SubscriptionIdentifier:
				data.index++;
				if (properties.subscriptionIdentifier) {
					throw new MqttBasicException('It is a Protocol Error to include the Subscription Identifier more than once.');
				}
				properties.subscriptionIdentifier = variableByteInteger(data, 4);
				if (properties.subscriptionIdentifier == 0) {
					throw new MqttBasicException('It is a Protocol Error if the Subscription Identifier has a value of 0. ');
				}
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

export function parseSubAckProperties(buffer: Buffer, index?: number) {
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.ReasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
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
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

export function parseUnsubscribeAckProperties(buffer: Buffer, index?: number) {
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.ReasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
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
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.PayloadFormatIndicator:
				data.index++;
				if (properties.payloadFormatIndicator !== undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Payload Format Indicator more than once.', ConnectReasonCode.PayloadFormatInvalid);
				}
				properties.payloadFormatIndicator = oneByteInteger(data);
				break;
			case PropertyIdentifier.MessageExpiryInterval:
				data.index++;
				if (properties.messageExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Payload Format Indicator more than once.', ConnectReasonCode.UnspecifiedError);
				}
				properties.messageExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.ContentType:
				data.index++;
				if (properties.contentType) {
					throw new MqttBasicException('It is a Protocol Error to include the Content Type more than once.');
				}
				properties.contentType = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ResponseTopic:
				data.index++;
				if (properties.responseTopic) {
					throw new MqttBasicException('It is a Protocol Error to include the Content Type more than once.');
				}
				properties.responseTopic = utf8EncodedString(data);
				break;
			case PropertyIdentifier.CorrelationData:
				data.index++;
				if (properties.correlationData) {
					throw new MqttBasicException('It is a Protocol Error to include Correlation Data more than once.');
				}
				properties.correlationData = utf8EncodedString(data);
				break;
			case PropertyIdentifier.SubscriptionIdentifier:
				data.index++;
				if (properties.subscriptionIdentifier) {
					throw new MqttBasicException('It is a Protocol Error to include the Subscription Identifier more than once.');
				}
				properties.subscriptionIdentifier = variableByteInteger(data, 4);
				if (properties.subscriptionIdentifier == 0) {
					throw new MqttBasicException('It is a Protocol Error if the Subscription Identifier has a value of 0. ');
				}
				break;
			case PropertyIdentifier.TopicAlias:
				data.index++;
				if (properties.topicAlias != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Topic Alias value more than once.');
				}
				properties.topicAlias = twoByteInteger(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

export function parsePublishAckProperties(buffer: Buffer, index?: number) {
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.ReasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
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
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.ReasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
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
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.ReasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
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
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.ReasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
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
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.AuthenticationMethod:
				data.index++;
				if (properties.AuthenticationMethod) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationMethod = utf8EncodedString(data);
				break;
			case PropertyIdentifier.AuthenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.authenticationData = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ReasonString:
				data.index++;
				if (properties.reasonString) {
					throw new MqttBasicException('It is a Protocol Error to include Authentication Method more than once.');
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
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
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case PropertyIdentifier.PayloadFormatIndicator:
				data.index++;
				if (properties.payloadFormatIndicator !== undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Payload Format Indicator more than once.', ConnectReasonCode.PayloadFormatInvalid);
				}
				properties.payloadFormatIndicator = oneByteInteger(data);
				break;
			case PropertyIdentifier.MessageExpiryInterval:
				data.index++;
				if (properties.messageExpiryInterval != undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Payload Format Indicator more than once.', ConnectReasonCode.UnspecifiedError);
				}
				properties.messageExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.ContentType:
				data.index++;
				if (properties.contentType) {
					throw new MqttBasicException('It is a Protocol Error to include the Content Type more than once.');
				}
				properties.contentType = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ResponseTopic:
				data.index++;
				if (properties.responseTopic) {
					throw new MqttBasicException('It is a Protocol Error to include the Content Type more than once.');
				}
				properties.responseTopic = utf8EncodedString(data);
				break;
			case PropertyIdentifier.WillDelayInterval:
				data.index++;
				if (properties.WillDelayInterval !== undefined) {
					throw new MqttBasicException('It is a Protocol Error to include the Will Delay Interval more than once. ');
				}
				properties.WillDelayInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.UserProperty: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
				break;
			}
			default:
				data.index = buffer.length;
				break;
		}
	}
	return properties;
}

export function encodedProperties(id: TPropertyIdentifier, data: any): Array<number> {
	switch (id) {
		case PropertyIdentifier.PayloadFormatIndicator:
			return [PropertyIdentifier.PayloadFormatIndicator, integerToOneUint8(data)];
		case PropertyIdentifier.MessageExpiryInterval:
			return [PropertyIdentifier.MessageExpiryInterval, ...integerToFourUint8(data)];
		case PropertyIdentifier.ContentType:
			return [PropertyIdentifier.ContentType, ...utf8decodedString(data)];
		case PropertyIdentifier.ResponseTopic:
			return [PropertyIdentifier.ResponseTopic, ...utf8decodedString(data)];
		case PropertyIdentifier.CorrelationData:
			return [PropertyIdentifier.CorrelationData, ...utf8decodedString(data)];
		case PropertyIdentifier.SubscriptionIdentifier:
			return [PropertyIdentifier.SubscriptionIdentifier, ...stringToVariableByteInteger(data)];
		case PropertyIdentifier.SessionExpiryInterval:
			return [PropertyIdentifier.SessionExpiryInterval, ...integerToFourUint8(data)];
		case PropertyIdentifier.ClientIdentifier:
			return [PropertyIdentifier.ClientIdentifier, ...utf8decodedString(data)];
		case PropertyIdentifier.ServerKeepAlive:
			return [PropertyIdentifier.ServerKeepAlive, ...integerToTwoUint8(data)];
		case PropertyIdentifier.AuthenticationMethod:
			return [PropertyIdentifier.AuthenticationMethod, ...utf8decodedString(data)];
		case PropertyIdentifier.AuthenticationData:
			return [PropertyIdentifier.AuthenticationData, ...utf8decodedString(data)];
		case PropertyIdentifier.RequestProblemInformation:
			return [PropertyIdentifier.RequestProblemInformation, integerToOneUint8(data)];
		case PropertyIdentifier.WillDelayInterval:
			return [PropertyIdentifier.WillDelayInterval, ...integerToFourUint8(data)];
		case PropertyIdentifier.RequestResponseInformation:
			return [PropertyIdentifier.RequestResponseInformation, integerToOneUint8(data)];
		case PropertyIdentifier.ResponseInformation:
			return [PropertyIdentifier.ResponseInformation, ...utf8decodedString(data)];
		case PropertyIdentifier.ServerReference:
			return [PropertyIdentifier.ServerReference, ...utf8decodedString(data)];
		case PropertyIdentifier.ReasonString:
			return [PropertyIdentifier.ReasonString, ...utf8decodedString(data)];
		case PropertyIdentifier.ReceiveMaximum:
			return [PropertyIdentifier.ReceiveMaximum, ...integerToTwoUint8(data)];
		case PropertyIdentifier.TopicAliasMaximum:
			return [PropertyIdentifier.TopicAliasMaximum, ...integerToTwoUint8(data)];
		case PropertyIdentifier.TopicAlias:
			return [PropertyIdentifier.TopicAlias, ...integerToTwoUint8(data)];
		case PropertyIdentifier.MaximumQoS:
			return [PropertyIdentifier.MaximumQoS, integerToOneUint8(data)];
		case PropertyIdentifier.RetainAvailable:
			return [PropertyIdentifier.RetainAvailable, integerToOneUint8(data)];
		case PropertyIdentifier.UserProperty:
			return [PropertyIdentifier.UserProperty, ...utf8decodedString(data.key), ...utf8decodedString(data.value)];
		case PropertyIdentifier.MaximumPacketSize:
			return [PropertyIdentifier.MaximumPacketSize, ...integerToFourUint8(data)];
		case PropertyIdentifier.WildcardSubscriptionAvailable:
			return [PropertyIdentifier.WildcardSubscriptionAvailable, integerToOneUint8(data)];
		case PropertyIdentifier.SubscriptionIdentifierAvailable:
			return [PropertyIdentifier.SubscriptionIdentifierAvailable, integerToOneUint8(data)];
		case PropertyIdentifier.SharedSubscriptionAvailable:
			return [PropertyIdentifier.SharedSubscriptionAvailable, integerToOneUint8(data)];
		default:
			return [];
	}
}
