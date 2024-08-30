import { PropertyException } from './exception';
import { BufferData, IProperties, PropertyIdentifier } from './interface';
import {
	fourByteInteger,
	integerToFourUint8,
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
					throw new PropertyException('It is a Protocol Error to include the Payload Format Indicator more than once.', 0x01);
				}
				properties.payloadFormatIndicator = oneByteInteger(data);
				break;
			case PropertyIdentifier.MessageExpiryInterval:
				data.index++;
				if (properties.messageExpiryInterval != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Payload Format Indicator more than once.', 0x02);
				}
				properties.messageExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.ContentType:
				data.index++;
				if (properties.contentType) {
					throw new PropertyException('It is a Protocol Error to include the Content Type more than once.', 0x03);
				}
				properties.contentType = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ResponseTopic:
				data.index++;
				if (properties.responseTopic) {
					throw new PropertyException('It is a Protocol Error to include the Content Type more than once.', 0x08);
				}
				properties.responseTopic = utf8EncodedString(data);
				break;
			case PropertyIdentifier.CorrelationData:
				data.index++;
				if (properties.correlationData) {
					throw new PropertyException('It is a Protocol Error to include Correlation Data more than once.', 0x09);
				}
				properties.correlationData = utf8EncodedString(data);
				break;
			case PropertyIdentifier.SubscriptionIdentifier:
				data.index++;
				if (properties.subscriptionIdentifier) {
					throw new PropertyException('It is a Protocol Error to include the Subscription Identifier more than once.', 0x0b);
				}
				properties.subscriptionIdentifier = variableByteInteger(data, 4);
				if (properties.subscriptionIdentifier == 0) {
					throw new PropertyException('It is a Protocol Error if the Subscription Identifier has a value of 0. ', 0x0b);
				}
				break;
			case PropertyIdentifier.SessionExpiryInterval:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Session Expiry Interval more than once.', 0x11);
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.ClientIdentifier:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Assigned Client Identifier more than once.', 0x12);
				}
				properties.clientIdentifier = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ServerKeepAlive:
				data.index++;
				if (properties.serverKeepAlive != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Server Keep Alive more than once.', 0x13);
				}
				properties.serverKeepAlive = twoByteInteger(data);
				break;
			case PropertyIdentifier.AuthenticationMethod:
				data.index++;
				if (properties.AuthenticationMethod) {
					throw new PropertyException('It is a Protocol Error to include Authentication Method more than once.', 0x15);
				}
				properties.authenticationMethod = utf8EncodedString(data);
				break;
			case PropertyIdentifier.AuthenticationData:
				data.index++;
				if (properties.authenticationData) {
					throw new PropertyException('It is a Protocol Error to include Authentication Method more than once.', 0x16);
				}
				properties.authenticationData = utf8EncodedString(data);
				break;
			case PropertyIdentifier.RequestProblemInformation:
				data.index++;
				if (properties.requestProblemInformation !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException('It is a Protocol Error to include Request Problem Information more than once, or to have a value other than 0 or 1.', 0x17);
				}
				properties.requestProblemInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.WillDelayInterval:
				data.index++;
				if (properties.WillDelayInterval !== undefined) {
					throw new PropertyException('It is a Protocol Error to include the Will Delay Interval more than once. ', 0x18);
				}
				properties.WillDelayInterval = fourByteInteger(data);
				break;
			case PropertyIdentifier.RequestResponseInformation:
				data.index++;
				if (properties.requestResponseInformation !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException('It is Protocol Error to include the Request Response Information more than once, or to have a value other than 0 or 1.', 0x19);
				}
				properties.requestResponseInformation = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.ResponseInformation:
				data.index++;
				if (properties.responseInformation) {
					throw new PropertyException('It is a Protocol Error to include the Response Information more than once.', 0x1a);
				}
				properties.responseInformation = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ServerReference:
				data.index++;
				if (properties.serverReference) {
					throw new PropertyException('It is a Protocol Error to include the Response Information more than once.', 0x1c);
				}
				properties.serverReference = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ReasonString:
				data.index++;
				if (properties.reasonString) {
					throw new PropertyException('It is a Protocol Error to include Authentication Method more than once.', 0x1f);
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case PropertyIdentifier.ReceiveMaximum:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.', 0x21);
				}
				properties.receiveMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.TopicAliasMaximum:
				data.index++;
				if (properties.topicAliasMaximum != undefined) {
					throw new PropertyException('t is a Protocol Error to include the Topic Alias Maximum value more than once.', 0x22);
				}
				properties.topicAliasMaximum = twoByteInteger(data);
				break;
			case PropertyIdentifier.TopicAlias:
				data.index++;
				if (properties.topicAlias != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Topic Alias value more than once.', 0x23);
				}
				properties.topicAlias = twoByteInteger(data);
				break;
			case PropertyIdentifier.MaximumQoS:
				data.index++;
				if (properties.maximumQoS !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException('It is a Protocol Error to include Maximum QoS more than once, or to have a value other than 0 or 1.', 0x24);
				}
				properties.maximumQoS = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.RetainAvailable:
				data.index++;
				if (properties.retainAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException('It is a Protocol Error to include Retain Available more than once or to use a value other than 0 or 1.', 0x25);
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
					throw new PropertyException('It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.', 0x27);
				}
				properties.maximumPacketSize = fourByteInteger(data);
				break;
			case PropertyIdentifier.WildcardSubscriptionAvailable:
				data.index++;
				if (properties.wildcardSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException('It is a Protocol Error to include the Wildcard Subscription Available more than once or to send a value other than 0 or 1.', 0x28);
				}
				properties.wildcardSubscriptionAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.SubscriptionIdentifierAvailable:
				data.index++;
				if (properties.subscriptionIdentifierAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException(
						'It is a Protocol Error to include the Subscription Identifier Available more than once, or to send a value other than 0 or 1.',
						0x29,
					);
				}
				properties.subscriptionIdentifierAvailable = !!oneByteInteger(data);
				break;
			case PropertyIdentifier.SharedSubscriptionAvailable:
				data.index++;
				if (properties.sharedSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException('It is a Protocol Error to include the Shared Subscription Available more than once or to send a value other than 0 or 1.', 0x2a);
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

export function encodedProperties(id: PropertyIdentifier, data: any): Buffer {
	switch (id) {
		case PropertyIdentifier.PayloadFormatIndicator:
			return Buffer.from([PropertyIdentifier.PayloadFormatIndicator, data & 0xff]);
		case PropertyIdentifier.MessageExpiryInterval:
			return Buffer.from([PropertyIdentifier.MessageExpiryInterval, ...integerToFourUint8(data)]);
		case PropertyIdentifier.ContentType:
			return Buffer.from([PropertyIdentifier.ContentType, ...utf8decodedString(data)]);
		case PropertyIdentifier.ResponseTopic:
			return Buffer.from([PropertyIdentifier.ResponseTopic, ...utf8decodedString(data)]);
		case PropertyIdentifier.CorrelationData:
			return Buffer.from([PropertyIdentifier.CorrelationData, ...utf8decodedString(data)]);
		case PropertyIdentifier.SubscriptionIdentifier:
			return Buffer.from([PropertyIdentifier.SubscriptionIdentifier, ...stringToVariableByteInteger(data)]);
		case PropertyIdentifier.SessionExpiryInterval:
			return Buffer.from([PropertyIdentifier.SessionExpiryInterval, ...integerToFourUint8(data)]);
		case PropertyIdentifier.ClientIdentifier:
			return Buffer.from([PropertyIdentifier.ClientIdentifier, ...utf8decodedString(data)]);
		case PropertyIdentifier.ServerKeepAlive:
			return Buffer.from([PropertyIdentifier.ServerKeepAlive, ...integerToTwoUint8(data)]);
		case PropertyIdentifier.AuthenticationMethod:
			return Buffer.from([PropertyIdentifier.AuthenticationMethod, ...utf8decodedString(data)]);
		case PropertyIdentifier.AuthenticationData:
			return Buffer.from([PropertyIdentifier.AuthenticationData, ...utf8decodedString(data)]);
		case PropertyIdentifier.RequestProblemInformation:
			return Buffer.from([PropertyIdentifier.RequestProblemInformation, data & 0xff]);
		case PropertyIdentifier.WillDelayInterval:
			return Buffer.from([PropertyIdentifier.WillDelayInterval, ...integerToFourUint8(data)]);
		case PropertyIdentifier.RequestResponseInformation:
			return Buffer.from([PropertyIdentifier.RequestResponseInformation, data & 0xff]);
		case PropertyIdentifier.ResponseInformation:
			return Buffer.from([PropertyIdentifier.ResponseInformation, ...utf8decodedString(data)]);
		case PropertyIdentifier.ServerReference:
			return Buffer.from([PropertyIdentifier.ServerReference, ...utf8decodedString(data)]);
		case PropertyIdentifier.ReasonString:
			return Buffer.from([PropertyIdentifier.ReasonString, ...utf8decodedString(data)]);
		case PropertyIdentifier.ReceiveMaximum:
			return Buffer.from([PropertyIdentifier.ReceiveMaximum, ...integerToTwoUint8(data)]);
		case PropertyIdentifier.TopicAliasMaximum:
			return Buffer.from([PropertyIdentifier.TopicAliasMaximum, ...integerToTwoUint8(data)]);
		case PropertyIdentifier.TopicAlias:
			return Buffer.from([PropertyIdentifier.TopicAlias, ...integerToTwoUint8(data)]);
		case PropertyIdentifier.MaximumQoS:
			return Buffer.from([PropertyIdentifier.MaximumQoS, data & 0xff]);
		case PropertyIdentifier.RetainAvailable:
			return Buffer.from([PropertyIdentifier.RetainAvailable, data & 0xff]);
		case PropertyIdentifier.UserProperty:
			return Buffer.from([PropertyIdentifier.UserProperty, ...utf8decodedString(data.key), ...utf8decodedString(data.value)]);
		case PropertyIdentifier.MaximumPacketSize:
			return Buffer.from([PropertyIdentifier.MaximumPacketSize, ...integerToFourUint8(data)]);
		case PropertyIdentifier.WildcardSubscriptionAvailable:
			return Buffer.from([PropertyIdentifier.WildcardSubscriptionAvailable, data & 0xff]);
		case PropertyIdentifier.SubscriptionIdentifierAvailable:
			return Buffer.from([PropertyIdentifier.SubscriptionIdentifierAvailable, data & 0xff]);
		case PropertyIdentifier.SharedSubscriptionAvailable:
			return Buffer.from([PropertyIdentifier.SharedSubscriptionAvailable, data & 0xff]);
		default:
			return Buffer.alloc(0);
	}
}
