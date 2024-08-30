import { PropertyException } from './exception';
import { BufferData, IProperties } from './interface';
import { fourByteInteger, oneByteInteger, twoByteInteger, utf8EncodedString, utf8StringPair, variableByteInteger } from './parse';

export function parseProperties(buffer: Buffer, index?: number) {
	const properties: IProperties = {};
	const data: BufferData = { buffer, index: index ? index : 0 };
	for (data.index; data.index < buffer.length; data.index) {
		switch (buffer[data.index]) {
			case 0x01:
				data.index++;
				if (properties.payloadFormatIndicator !== undefined) {
					throw new PropertyException('It is a Protocol Error to include the Payload Format Indicator more than once.', 0x01);
				}
				properties.payloadFormatIndicator = oneByteInteger(data);
				break;

			case 0x02:
				data.index++;
				if (properties.messageExpiryInterval != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Payload Format Indicator more than once.', 0x02);
				}
				properties.messageExpiryInterval = fourByteInteger(data);
				break;

			case 0x03:
				data.index++;
				if (properties.contentType) {
					throw new PropertyException('It is a Protocol Error to include the Content Type more than once.', 0x03);
				}
				properties.contentType = utf8EncodedString(data);
				break;
			case 0x08:
				data.index++;
				if (properties.contentType) {
					throw new PropertyException('It is a Protocol Error to include the Content Type more than once.', 0x08);
				}
				properties.responseTopic = utf8EncodedString(data);
				break;

			case 0x09:
				data.index++;
				if (properties.correlationData) {
					throw new PropertyException('It is a Protocol Error to include Correlation Data more than once.', 0x09);
				}
				properties.correlationData = utf8EncodedString(data);
				break;

			case 0x0b:
				data.index++;
				if (properties.subscriptionIdLength) {
					throw new PropertyException('It is a Protocol Error to include the Subscription Identifier more than once.', 0x0b);
				}
				properties.subscriptionIdLength = variableByteInteger(data, 4);
				if (properties.subscriptionIdLength == 0) {
					throw new PropertyException('It is a Protocol Error if the Subscription Identifier has a value of 0. ', 0x0b);
				}
				break;

			case 0x11:
				data.index++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Session Expiry Interval more than once.', 0x11);
				}
				properties.sessionExpiryInterval = fourByteInteger(data);
				break;
			case 0x12:
				data.index++;
				properties.clientIdentifier = utf8EncodedString(data);
				break;
			case 0x13:
				data.index++;
				if (properties.serverKeepAlive != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Server Keep Alive more than once.', 0x13);
				}
				properties.serverKeepAlive = twoByteInteger(data);
				break;
			case 0x15:
				data.index++;
				if (properties.authenticationData) {
					throw new PropertyException('It is a Protocol Error to include Authentication Method more than once.', 0x15);
				}
				properties.authenticationMethod = utf8EncodedString(data);
				break;
			case 0x16:
				data.index++;
				if (properties.authenticationData) {
					throw new PropertyException('It is a Protocol Error to include Authentication Method more than once.', 0x16);
				}
				properties.authenticationData = utf8EncodedString(data);
				break;
			case 0x17:
				data.index++;
				if (properties.requestProblemInformation !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException('It is a Protocol Error to include Request Problem Information more than once, or to have a value other than 0 or 1.', 0x17);
				}
				properties.requestProblemInformation = !!oneByteInteger(data);
				break;
			case 0x18:
				data.index++;
				if (properties.requestProblemInformation !== undefined) {
					throw new PropertyException('It is a Protocol Error to include the Will Delay Interval more than once. ', 0x18);
				}
				properties.willDelayLength = fourByteInteger(data);
				break;
			case 0x19:
				data.index++;
				if (properties.requestResponseInformation !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException('It is Protocol Error to include the Request Response Information more than once, or to have a value other than 0 or 1.', 0x19);
				}
				properties.requestResponseInformation = !!oneByteInteger(data);
				break;

			case 0x1a:
				data.index++;
				if (properties.responseInformation) {
					throw new PropertyException('It is a Protocol Error to include the Response Information more than once.', 0x1a);
				}
				properties.responseInformation = utf8EncodedString(data);
				break;

			case 0x1c:
				data.index++;
				if (properties.serverReference) {
					throw new PropertyException('It is a Protocol Error to include the Response Information more than once.', 0x1c);
				}
				properties.serverReference = utf8EncodedString(data);
				break;
			case 0x1f:
				data.index++;
				if (properties.authenticationData) {
					throw new PropertyException('It is a Protocol Error to include Authentication Method more than once.', 0x1f);
				}
				properties.reasonString = utf8EncodedString(data);
				break;
			case 0x21:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.', 0x21);
				}
				properties.receiveMaximum = twoByteInteger(data);
				break;
			case 0x22:
				data.index++;
				if (properties.receiveMaximum != undefined) {
					throw new PropertyException('t is a Protocol Error to include the Topic Alias Maximum value more than once.', 0x22);
				}
				properties.topicAliasMaximum = twoByteInteger(data);
				break;
			case 0x23:
				data.index++;
				if (properties.topicAlias != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Topic Alias value more than once.', 0x23);
				}
				properties.topicAlias = twoByteInteger(data);
				break;
			case 0x24:
				data.index++;
				if (properties.maximumQoS !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException('It is a Protocol Error to include Maximum QoS more than once, or to have a value other than 0 or 1.', 0x24);
				}
				properties.maximumQoS = !!oneByteInteger(data);
				break;
			case 0x25:
				data.index++;
				if (properties.retainAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException('It is a Protocol Error to include Retain Available more than once or to use a value other than 0 or 1.', 0x25);
				}
				properties.retainAvailable = !!oneByteInteger(data);
				break;
			case 0x26: {
				data.index++;
				const { key, value } = utf8StringPair(data);
				properties[key] = value;
				break;
			}
			case 0x27:
				data.index++;
				if (properties.maximumPacketSize != undefined) {
					throw new PropertyException('It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.', 0x27);
				}
				properties.maximumPacketSize = fourByteInteger(data);
				break;
			case 0x28:
				data.index++;
				if (properties.wildcardSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException('It is a Protocol Error to include the Wildcard Subscription Available more than once or to send a value other than 0 or 1.', 0x28);
				}
				properties.wildcardSubscriptionAvailable = !!oneByteInteger(data);
				break;
			case 0x29:
				data.index++;
				if (properties.subscriptionIdentifierAvailable !== undefined || data.buffer[data.index] > 1) {
					throw new PropertyException(
						'It is a Protocol Error to include the Subscription Identifier Available more than once, or to send a value other than 0 or 1.',
						0x29,
					);
				}
				properties.subscriptionIdentifierAvailable = !!oneByteInteger(data);
				break;
			case 0x2a:
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
