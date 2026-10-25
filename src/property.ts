import {
  decodeBinaryData,
  decodeFourByteInteger,
  decodeOneByteInteger,
  decodeTwoByteInteger,
  decodeUtf8String,
  decodeUtf8StringPair,
  decodeVariableByteInteger,
  encodeBinaryData,
  encodeFourByteInteger,
  encodeOneByteInteger,
  encodeTwoByteInteger,
  encodeUTF8String,
  encodeVariableByteInteger,
  variableByteIntegerLength,
} from './dataRepresentations';
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
  PropertyDataMap,
  PropertyIdentifier,
  IConnectWillProperties,
  TPropertyIdentifier,
} from './interface';

/**
 * Parses MQTT 5.0 properties from a buffer of consecutive identifier/value pairs (the property list only).
 *
 * Callers typically pass the bytes that follow the Variable Byte Integer **Properties Length** in a packet (this buffer does not include that length prefix).
 * Unknown property identifiers cause parsing to stop at the current position.
 *
 * @param buffer - Raw bytes: property id octet(s) plus encoded value(s), as in the spec Properties Data
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed property bag (`IProperties`)
 */
function parseProperties(buffer: Buffer, index?: number): IProperties {
  const properties: IProperties = {};
  const data: BufferData = { buffer, index: index ? index : 0 };
  for (data.index; data.index < buffer.length; data.index) {
    switch (buffer[data.index]) {
      case PropertyIdentifier.payloadFormatIndicator:
        data.index++;
        if (properties.payloadFormatIndicator !== undefined) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Payload Format Indicator more than once.',
          );
        }
        properties.payloadFormatIndicator = decodeOneByteInteger(data);
        break;
      case PropertyIdentifier.messageExpiryInterval:
        data.index++;
        if (properties.messageExpiryInterval != undefined) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Message Expiry Interval more than once.',
          );
        }
        properties.messageExpiryInterval = decodeFourByteInteger(data);
        break;
      case PropertyIdentifier.contentType:
        data.index++;
        if (properties.contentType) {
          throw new DisconnectException(DisconnectReasonCode.ProtocolError, 'It is a Protocol Error to include the Content Type more than once.');
        }
        properties.contentType = decodeUtf8String(data);
        break;
      case PropertyIdentifier.responseTopic:
        data.index++;
        if (properties.responseTopic) {
          throw new DisconnectException(DisconnectReasonCode.ProtocolError, 'It is a Protocol Error to include the Content Type more than once.');
        }
        properties.responseTopic = decodeUtf8String(data);
        break;
      case PropertyIdentifier.correlationData:
        data.index++;
        if (properties.correlationData) {
          throw new DisconnectException(DisconnectReasonCode.ProtocolError, 'It is a Protocol Error to include Correlation Data more than once.');
        }
        properties.correlationData = decodeBinaryData(data);
        break;
      case PropertyIdentifier.subscriptionIdentifier:
        data.index++;
        const subscriptionIdentifier = decodeVariableByteInteger(data, 4);

        if (subscriptionIdentifier == 0) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error if the Subscription Identifier has a value of 0. ',
          );
        }
        (properties.subscriptionIdentifier ??= []).push(subscriptionIdentifier);
        break;
      case PropertyIdentifier.sessionExpiryInterval:
        data.index++;
        if (properties.sessionExpiryInterval != undefined) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Session Expiry Interval more than once.',
          );
        }
        properties.sessionExpiryInterval = decodeFourByteInteger(data);
        break;
      case PropertyIdentifier.assignedClientIdentifier:
        data.index++;
        if (properties.assignedClientIdentifier != undefined) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Assigned Client Identifier more than once.',
          );
        }
        properties.assignedClientIdentifier = decodeUtf8String(data);
        break;
      case PropertyIdentifier.serverKeepAlive:
        data.index++;
        if (properties.serverKeepAlive != undefined) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Server Keep Alive more than once.',
          );
        }
        properties.serverKeepAlive = decodeTwoByteInteger(data);
        break;
      case PropertyIdentifier.authenticationMethod:
        data.index++;
        if (properties.authenticationMethod) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include Authentication Method more than once.',
          );
        }
        properties.authenticationMethod = decodeUtf8String(data);
        break;
      case PropertyIdentifier.authenticationData:
        data.index++;
        if (properties.authenticationData) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include Authentication Method more than once.',
          );
        }
        properties.authenticationData = decodeUtf8String(data);
        break;
      case PropertyIdentifier.requestProblemInformation:
        data.index++;
        if (properties.requestProblemInformation !== undefined || data.buffer[data.index] > 1) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include Request Problem Information more than once, or to have a value other than 0 or 1.',
          );
        }
        properties.requestProblemInformation = !!decodeOneByteInteger(data);
        break;
      case PropertyIdentifier.willDelayInterval:
        data.index++;
        if (properties.willDelayInterval !== undefined) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Will Delay Interval more than once. ',
          );
        }
        properties.willDelayInterval = decodeFourByteInteger(data);
        break;
      case PropertyIdentifier.requestResponseInformation:
        data.index++;
        if (properties.requestResponseInformation !== undefined || data.buffer[data.index] > 1) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is Protocol Error to include the Request Response Information more than once, or to have a value other than 0 or 1.',
          );
        }
        properties.requestResponseInformation = !!decodeOneByteInteger(data);
        break;
      case PropertyIdentifier.responseInformation:
        data.index++;
        if (properties.responseInformation) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Response Information more than once.',
          );
        }
        properties.responseInformation = decodeUtf8String(data);
        break;
      case PropertyIdentifier.serverReference:
        data.index++;
        if (properties.serverReference) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Response Information more than once.',
          );
        }
        properties.serverReference = decodeUtf8String(data);
        break;
      case PropertyIdentifier.reasonString:
        data.index++;
        if (properties.reasonString) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include Authentication Method more than once.',
          );
        }
        properties.reasonString = decodeUtf8String(data);
        break;
      case PropertyIdentifier.receiveMaximum:
        data.index++;
        if (properties.receiveMaximum != undefined) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Receive Maximum value more than once or for it to have the value 0.',
          );
        }
        properties.receiveMaximum = decodeTwoByteInteger(data);
        break;
      case PropertyIdentifier.topicAliasMaximum:
        data.index++;
        if (properties.topicAliasMaximum != undefined) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Topic Alias Maximum value more than once.',
          );
        }
        properties.topicAliasMaximum = decodeTwoByteInteger(data);
        break;
      case PropertyIdentifier.topicAlias:
        data.index++;
        if (properties.topicAlias != undefined) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Topic Alias value more than once.',
          );
        }
        properties.topicAlias = decodeTwoByteInteger(data);
        break;
      case PropertyIdentifier.maximumQoS:
        data.index++;
        if (properties.maximumQoS !== undefined || data.buffer[data.index] > 1) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include Maximum QoS more than once, or to have a value other than 0 or 1.',
          );
        }
        properties.maximumQoS = !!decodeOneByteInteger(data);
        break;
      case PropertyIdentifier.retainAvailable:
        data.index++;
        if (properties.retainAvailable !== undefined || data.buffer[data.index] > 1) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include Retain Available more than once or to use a value other than 0 or 1.',
          );
        }
        properties.retainAvailable = !!decodeOneByteInteger(data);
        break;
      case PropertyIdentifier.userProperty: {
        data.index++;
        const { key, value } = decodeUtf8StringPair(data);
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
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Maximum Packet Size more than once, or for the value to be set to zero.',
          );
        }
        properties.maximumPacketSize = decodeFourByteInteger(data);
        break;
      case PropertyIdentifier.wildcardSubscriptionAvailable:
        data.index++;
        if (properties.wildcardSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Wildcard Subscription Available more than once or to send a value other than 0 or 1.',
          );
        }
        properties.wildcardSubscriptionAvailable = !!decodeOneByteInteger(data);
        break;
      case PropertyIdentifier.subscriptionIdentifierAvailable:
        data.index++;
        if (properties.subscriptionIdentifierAvailable !== undefined || data.buffer[data.index] > 1) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Subscription Identifier Available more than once, or to send a value other than 0 or 1.',
          );
        }
        properties.subscriptionIdentifierAvailable = !!decodeOneByteInteger(data);
        break;
      case PropertyIdentifier.sharedSubscriptionAvailable:
        data.index++;
        if (properties.sharedSubscriptionAvailable !== undefined || data.buffer[data.index] > 1) {
          throw new DisconnectException(
            DisconnectReasonCode.ProtocolError,
            'It is a Protocol Error to include the Shared Subscription Available more than once or to send a value other than 0 or 1.',
          );
        }
        properties.sharedSubscriptionAvailable = !!decodeOneByteInteger(data);
        break;
      default:
        // Unknown id: skip the rest of this property slice (callers pass bounded buffers)
        data.index = buffer.length;
        break;
    }
  }
  return properties;
}

/**
 * Parses the Properties field for an MQTT 5.0 CONNECT packet (variable header).
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed CONNECT properties (`IConnectProperties`)
 */
export function parseConnectProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IConnectProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 CONNACK packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed CONNACK properties (`IConnAckProperties`)
 */
export function parseConnAckProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IConnAckProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 DISCONNECT packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed DISCONNECT properties (`IDisconnectProperties`)
 */
export function parseDisconnectProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IDisconnectProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 SUBSCRIBE packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed SUBSCRIBE properties (`ISubscribeProperties`)
 */
export function parseSubscribeProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as ISubscribeProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 SUBACK packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed SUBACK properties (`ISubAckProperties`)
 */
export function parseSubAckProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as ISubAckProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 UNSUBSCRIBE packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed UNSUBSCRIBE properties (`IUnsubscribeProperties`)
 */
export function parseUnsubscribeProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IUnsubscribeProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 UNSUBACK packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed UNSUBACK properties (`IUnsubscribeAckProperties`)
 */
export function parseUnsubscribeAckProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IUnsubscribeAckProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 PUBLISH packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed PUBLISH properties (`IPublishProperties`)
 */
export function parsePublishProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IPublishProperties;
}

/**
 * Parses the Will Properties field inside the CONNECT payload (MQTT 5.0 Will properties).
 *
 * @param buffer - Raw bytes of the Will Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed Will properties (`IConnectWillProperties`)
 */
export function parseConnectWillProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IConnectWillProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 PUBACK packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed PUBACK properties (`IPubAckProperties`)
 */
export function parsePubAckProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IPubAckProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 PUBREC packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed PUBREC properties (`IPubRecProperties`)
 */
export function parsePubRecProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IPubRecProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 PUBREL packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed PUBREL properties (`IPubRelProperties`)
 */
export function parsePubRelProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IPubRelProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 PUBCOMP packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed PUBCOMP properties (`IPubCompProperties`)
 */
export function parsePubCompProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IPubCompProperties;
}

/**
 * Parses the Properties field for an MQTT 5.0 AUTH packet.
 *
 * @param buffer - Raw bytes of the Properties field
 * @param index - Optional start offset in `buffer` (defaults to 0)
 * @returns Parsed AUTH properties (`IAuthProperties`)
 */
export function parseAuthProperties(buffer: Buffer, index?: number) {
  return parseProperties(buffer, index) as IAuthProperties;
}

/**
 * Encodes a single MQTT 5.0 property (identifier plus value) to on-the-wire bytes.
 *
 * For {@link PropertyIdentifier.userProperty}, `data` is a key/value map and may expand to multiple identifier blocks.
 * For {@link PropertyIdentifier.subscriptionIdentifier} with an array, emits one property block per element.
 *
 * @param id - Property identifier (`PropertyIdentifier`)
 * @param data - Value whose shape matches `PropertyDataMap[id]`
 * @returns Byte sequence: property id followed by encoded value(s); empty array if `id` is not handled
 */
function encodeProperties<K extends keyof PropertyDataMap>(id: K, data: PropertyDataMap[K]): Array<number> {
  switch (id) {
    case PropertyIdentifier.payloadFormatIndicator:
      return [PropertyIdentifier.payloadFormatIndicator, encodeOneByteInteger(data as number)];
    case PropertyIdentifier.messageExpiryInterval:
      return [PropertyIdentifier.messageExpiryInterval, ...encodeFourByteInteger(data as number)];
    case PropertyIdentifier.contentType:
      return [PropertyIdentifier.contentType, ...encodeUTF8String(data as string)];
    case PropertyIdentifier.responseTopic:
      return [PropertyIdentifier.responseTopic, ...encodeUTF8String(data as string)];
    case PropertyIdentifier.correlationData:
      if (Buffer.isBuffer(data)) {
        return [PropertyIdentifier.correlationData, ...encodeBinaryData(data)];
      }
      return [PropertyIdentifier.correlationData, ...encodeUTF8String(data as string)];
    case PropertyIdentifier.subscriptionIdentifier:
      if (Array.isArray(data)) {
        const buffer: Array<number> = [];
        data.map((item) => buffer.push(PropertyIdentifier.subscriptionIdentifier, ...encodeVariableByteInteger(item)));
        return buffer;
      }
      return [PropertyIdentifier.subscriptionIdentifier, ...encodeUTF8String(data as string)];
    case PropertyIdentifier.sessionExpiryInterval:
      return [PropertyIdentifier.sessionExpiryInterval, ...encodeFourByteInteger(data as number)];
    case PropertyIdentifier.assignedClientIdentifier:
      return [PropertyIdentifier.assignedClientIdentifier, ...encodeUTF8String(data as string)];
    case PropertyIdentifier.serverKeepAlive:
      return [PropertyIdentifier.serverKeepAlive, ...encodeTwoByteInteger(data as number)];
    case PropertyIdentifier.authenticationMethod:
      return [PropertyIdentifier.authenticationMethod, ...encodeUTF8String(data as string)];
    case PropertyIdentifier.authenticationData:
      return [PropertyIdentifier.authenticationData, ...encodeUTF8String(data as string)];
    case PropertyIdentifier.requestProblemInformation:
      return [PropertyIdentifier.requestProblemInformation, encodeOneByteInteger(data as number)];
    case PropertyIdentifier.willDelayInterval:
      return [PropertyIdentifier.willDelayInterval, ...encodeFourByteInteger(data as number)];
    case PropertyIdentifier.requestResponseInformation:
      return [PropertyIdentifier.requestResponseInformation, encodeOneByteInteger(data as number)];
    case PropertyIdentifier.responseInformation:
      return [PropertyIdentifier.responseInformation, ...encodeUTF8String(data as string)];
    case PropertyIdentifier.serverReference:
      return [PropertyIdentifier.serverReference, ...encodeUTF8String(data as string)];
    case PropertyIdentifier.reasonString:
      return [PropertyIdentifier.reasonString, ...encodeUTF8String(data as string)];
    case PropertyIdentifier.receiveMaximum:
      return [PropertyIdentifier.receiveMaximum, ...encodeTwoByteInteger(data as number)];
    case PropertyIdentifier.topicAliasMaximum:
      return [PropertyIdentifier.topicAliasMaximum, ...encodeTwoByteInteger(data as number)];
    case PropertyIdentifier.topicAlias:
      return [PropertyIdentifier.topicAlias, ...encodeTwoByteInteger(data as number)];
    case PropertyIdentifier.maximumQoS:
      return [PropertyIdentifier.maximumQoS, encodeOneByteInteger(data as number)];
    case PropertyIdentifier.retainAvailable:
      return [PropertyIdentifier.retainAvailable, encodeOneByteInteger(data as number)];
    case PropertyIdentifier.userProperty: {
      const array: number[] = [];
      const userPropertyData = data as IProperties['userProperty'];
      for (const key in userPropertyData) {
        if (typeof userPropertyData[key] === 'string') {
          array.push(PropertyIdentifier.userProperty, ...encodeUTF8String(key), ...encodeUTF8String(userPropertyData[key]));
        } else if (Array.isArray(userPropertyData[key])) {
          for (const value of userPropertyData[key]) {
            array.push(PropertyIdentifier.userProperty, ...encodeUTF8String(key), ...encodeUTF8String(value));
          }
        }
      }
      return array;
    }
    case PropertyIdentifier.maximumPacketSize:
      return [PropertyIdentifier.maximumPacketSize, ...encodeFourByteInteger(data as number)];
    case PropertyIdentifier.wildcardSubscriptionAvailable:
      return [PropertyIdentifier.wildcardSubscriptionAvailable, encodeOneByteInteger(data as number)];
    case PropertyIdentifier.subscriptionIdentifierAvailable:
      return [PropertyIdentifier.subscriptionIdentifierAvailable, encodeOneByteInteger(data as number)];
    case PropertyIdentifier.sharedSubscriptionAvailable:
      return [PropertyIdentifier.sharedSubscriptionAvailable, encodeOneByteInteger(data as number)];
    default:
      return [];
  }
}

/**
 * Accumulates MQTT 5 property bytes and builds the prefixed property length + payload for the wire format.
 */
export class EncoderProperties {
  private propertyLength: number = 0;
  private properties: number[][] = [];

  /**
   * Appends one property (identifier + value) using the shared encoder from `property.ts`.
   * @param identifier - Property identifier enum value.
   * @param data - Typed value for that property.
   */
  add<K extends TPropertyIdentifier>(identifier: K, data: PropertyDataMap[K]) {
    const list = encodeProperties(identifier, data);
    this.properties.push(list);
    this.propertyLength += list.length;
  }

  /**
   * Adds all defined entries from a properties object (skips `undefined` fields).
   * @param properties - Partial property bag keyed by logical names.
   */
  push(properties: IProperties) {
    for (const key in properties) {
      if (properties[key as keyof IProperties] === undefined) {
        continue;
      }
      this.add(PropertyIdentifier[key as keyof typeof PropertyIdentifier], properties[key as keyof IProperties] as any);
    }
  }

  /**
   * Serialized property block: Variable Byte Integer (property length) followed by encoded properties.
   * @returns A `Buffer` ready to append after fixed header / other fields as required by the packet type.
   */
  get buffer() {
    return Buffer.concat([Buffer.from(encodeVariableByteInteger(this.propertyLength)), Buffer.from(this.properties.flat())]);
  }

  /**
   * Total size on the wire for the property section: raw property bytes plus the Variable Byte Integer that prefixes them.
   * @returns Octet count for length-prefix + properties.
   */
  get length() {
    return this.propertyLength + variableByteIntegerLength(this.propertyLength);
  }
}
