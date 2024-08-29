import { variableByteInteger } from '.';

interface IProperties {
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

export function parseProperties(buffer: Buffer) {
	const properties: IProperties = {};
	for (let i = 0; i < buffer.length; i) {
		switch (buffer[i]) {
			case 0x01:
				i++;
				if (properties.payloadFormatIndicator !== undefined) {
					throw new Error('It is a Protocol Error to include the Payload Format Indicator more than once.');
				}
				properties.payloadFormatIndicator = buffer[i++];
				break;

			case 0x02:
				i++;
				if (properties.messageExpiryInterval != undefined) {
					throw new Error('It is a Protocol Error to include the Payload Format Indicator more than once.');
				}
				properties.messageExpiryInterval = buffer.readInt32BE(i);
				i += 4;
				break;

			case 0x03:
				i++;
				if (properties.contentType) {
					throw new Error('It is a Protocol Error to include the Content Type more than once.');
				}
				const contentTypeLength = (buffer[i++] << 8) | buffer[i++];
				properties.contentType = buffer.slice(i, i + contentTypeLength).toString();
				i += contentTypeLength;
				break;
			case 0x08:
				i++;
				if (properties.contentType) {
					throw new Error('It is a Protocol Error to include the Content Type more than once.');
				}
				const responseTopicLength = (buffer[i++] << 8) | buffer[i++];
				properties.responseTopic = buffer.slice(i, i + responseTopicLength).toString();
				i += responseTopicLength;
				break;

			case 0x09:
				i++;
				const subscriptionIdLength = variableByteInteger(buffer, i, 4);
				i = subscriptionIdLength.offset;
				if (subscriptionIdLength.value == 0) {
					throw new Error('It is a Protocol Error if the Subscription Identifier has a value of 0.');
				}
				if (properties.subscriptionIdentifier) {
					properties.subscriptionIdentifier.push(subscriptionIdLength.value);
				}
				break;

			case 0x0b:
				i++;
				const correlationDataLength = (buffer[i++] << 8) | buffer[i++];

				properties.correlationData = buffer.slice(i, i + correlationDataLength).toString();
				i += correlationDataLength;
				break;

			case 0x11:
				if (properties.sessionExpiryInterval != undefined) {
					throw new Error('It is a Protocol Error to include the Session Expiry Interval more than once.');
				}
				i++;
				properties.sessionExpiryInterval = (buffer[i++] << 24) | (buffer[i++] << 16) | (buffer[i++] << 8) | buffer[i++];
				break;
			case 0x12:
				i++;
				const idLength = (buffer[i++] << 8) | buffer[i++];
				properties.clientIdentifier = buffer.slice(i, i + idLength).toString();
				i += idLength;
				break;
			case 0x13:
				i++;
				if (properties.sessionExpiryInterval != undefined) {
					throw new Error('It is a Protocol Error to include the Server Keep Alive more than once.');
				}
				properties.serverKeepAlive = (buffer[i++] << 8) | buffer[i++];
				break;
			case 0x15:
				i++;
				if (properties.authenticationData) {
					throw new Error('It is a Protocol Error to include Authentication Method more than once.');
				}
				const authMethodLength = (buffer[i++] << 8) | buffer[i++];
				properties.authenticationMethod = buffer.slice(i, i + authMethodLength).toString();
				i += authMethodLength;
				break;
			case 0x16:
				i++;
				if (properties.authenticationData) {
					throw new Error('It is a Protocol Error to include Authentication Method more than once.');
				}
				const authDataLength = (buffer[i++] << 8) | buffer[i++];
				properties.authenticationData = buffer.slice(i, i + authDataLength).toString();
				i += authDataLength;
				break;
			case 0x17:
				i++;
				if (properties.requestProblemInformation !== undefined || buffer[i] > 1) {
					throw new Error('It is a Protocol Error to include Request Problem Information more than once, or to have a value other than 0 or 1.');
				}
				properties.requestProblemInformation = !!(buffer[i++] & 1);
				break;
			case 0x18:
				i++;
				if (properties.requestProblemInformation !== undefined) {
					throw new Error('It is a Protocol Error to include the Will Delay Interval more than once. ');
				}
				properties.willDelayLength = buffer.readInt32BE(i);
				i += 4;
				break;
			case 0x19:
				i++;
				if (properties.requestResponseInformation !== undefined || buffer[i] > 1) {
					throw new Error('It is Protocol Error to include the Request Response Information more than once, or to have a value other than 0 or 1.');
				}
				properties.requestResponseInformation = !!(buffer[i++] & 1);
				break;

			case 0x1a:
				i++;
				if (properties.responseInformation) {
					throw new Error('It is a Protocol Error to include the Response Information more than once.');
				}
				const responseInformationLength = (buffer[i++] << 8) | buffer[i++];
				properties.responseInformation = buffer.slice(i, i + responseInformationLength).toString();
				i += responseInformationLength;
				break;

			case 0x1c:
				i++;
				if (properties.serverReference) {
					throw new Error('It is a Protocol Error to include the Response Information more than once.');
				}
				const serverReferenceLength = (buffer[i++] << 8) | buffer[i++];
				properties.serverReference = buffer.slice(i, i + serverReferenceLength).toString();
				i += serverReferenceLength;
				break;
			case 0x1f:
				i++;
				if (properties.authenticationData) {
					throw new Error('It is a Protocol Error to include Authentication Method more than once.');
				}
				const reasonStringLength = (buffer[i++] << 8) | buffer[i++];
				properties.reasonString = buffer.slice(i, i + reasonStringLength).toString();
				i += reasonStringLength;
				break;
				break;
			case 0x21:
				i++;
				if (properties.receiveMaximum != undefined) {
					throw new Error('It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.');
				}
				properties.receiveMaximum = (buffer[i++] << 8) | buffer[i++];
				break;
			case 0x22:
				if (properties.receiveMaximum != undefined) {
					throw new Error('t is a Protocol Error to include the Topic Alias Maximum value more than once.');
				}
				i++;
				properties.topicAliasMaximum = (buffer[i++] << 8) | buffer[i++];
				break;
			case 0x23:
				i++;
				if (properties.topicAlias != undefined) {
					throw new Error('It is a Protocol Error to include the Topic Alias value more than once.');
				}
				properties.topicAlias = (buffer[i++] << 8) | buffer[i++];
				break;
			case 0x24:
				i++;
				if (properties.maximumQoS !== undefined || buffer[i] > 1) {
					throw new Error('It is a Protocol Error to include Maximum QoS more than once, or to have a value other than 0 or 1.');
				}
				properties.maximumQoS = !!(buffer[i++] & 1);
				break;
			case 0x25:
				i++;
				if (properties.retainAvailable !== undefined || buffer[i] > 1) {
					throw new Error('It is a Protocol Error to include Retain Available more than once or to use a value other than 0 or 1.');
				}
				properties.retainAvailable = !!(buffer[i++] & 1);
				break;
			case 0x26:
				i++;
				const keyLength = (buffer[i++] << 8) | buffer[i++];
				const key = buffer.slice(i, i + keyLength).toString();
				i += keyLength;
				const valueLength = (buffer[i++] << 8) | buffer[i++];
				const value = buffer.slice(i, i + valueLength).toString();
				i += valueLength;
				properties[key] = value;
				break;
			case 0x27:
				if (properties.maximumPacketSize != undefined) {
					throw new Error('It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.');
				}
				i++;
				properties.maximumPacketSize = (buffer[i++] << 24) | (buffer[i++] << 16) | (buffer[i++] << 8) | buffer[i++];
				break;
			case 0x28:
				i++;
				if (properties.wildcardSubscriptionAvailable !== undefined || buffer[i] > 1) {
					throw new Error('It is a Protocol Error to include the Wildcard Subscription Available more than once or to send a value other than 0 or 1.');
				}
				properties.wildcardSubscriptionAvailable = !!(buffer[i++] & 1);
				break;
			case 0x29:
				i++;
				if (properties.subscriptionIdentifierAvailable !== undefined || buffer[i] > 1) {
					throw new Error('It is a Protocol Error to include the Subscription Identifier Available more than once, or to send a value other than 0 or 1.');
				}
				properties.subscriptionIdentifierAvailable = !!(buffer[i++] & 1);
				break;
			case 0x29:
				i++;
				if (properties.sharedSubscriptionAvailable !== undefined || buffer[i] > 1) {
					throw new Error('It is a Protocol Error to include the Shared Subscription Available more than once or to send a value other than 0 or 1.');
				}
				properties.sharedSubscriptionAvailable = !!(buffer[i++] & 1);
				break;
			default:
				i = buffer.length;
				break;
		}
	}
	return properties;
}
