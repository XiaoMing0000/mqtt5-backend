import {
  parseProperties,
  parseConnectProperties,
  parsePublishProperties,
  parseSubscribeProperties,
  parseDisconnectProperties,
  parseAuthProperties,
  parseConnAckProperties,
  parsePubAckProperties,
  parsePubRecProperties,
  parsePubRelProperties,
  parsePubCompProperties,
  parseSubAckProperties,
  parseUnsubscribeProperties,
  parseUnsubscribeAckProperties,
  parseConnectWillProperties,
  encodeProperties,
} from '../property';
import { PropertyIdentifier } from '../interface';
import { DisconnectException, DisconnectReasonCode } from '../exception';
import {
  encodeBinaryData,
  encodeUTF8String,
  encodeVariableByteInteger,
  integerToFourUint8,
  integerToOneUint8,
  integerToTwoUint8,
} from '../parse';

/** Concatenate property byte sequences into one Buffer. */
function propBuffer(...chunks: Array<number | number[]>): Buffer {
  const bytes: number[] = [];
  for (const chunk of chunks) {
    if (typeof chunk === 'number') bytes.push(chunk);
    else bytes.push(...chunk);
  }
  return Buffer.from(bytes);
}

function utf8Property(id: PropertyIdentifier, value: string): number[] {
  return [id, ...encodeUTF8String(value)];
}

function binaryProperty(id: PropertyIdentifier, value: Buffer): number[] {
  return [id, ...encodeBinaryData(value)];
}

function oneByteProperty(id: PropertyIdentifier, value: number): number[] {
  return [id, integerToOneUint8(value)];
}

function twoByteProperty(id: PropertyIdentifier, value: number): number[] {
  return [id, ...integerToTwoUint8(value)];
}

function fourByteProperty(id: PropertyIdentifier, value: number): number[] {
  return [id, ...integerToFourUint8(value)];
}

function expectProtocolError(fn: () => unknown) {
  expect(fn).toThrow(DisconnectException);
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DisconnectException);
    expect((error as DisconnectException).code).toBe(DisconnectReasonCode.ProtocolError);
  }
}

describe('property', () => {
  describe('parseProperties', () => {
    test('should parse empty buffer', () => {
      expect(parseProperties(Buffer.from([]))).toEqual({});
    });

    test('should parse from a non-zero index', () => {
      const buffer = propBuffer([0x00, 0x00], oneByteProperty(PropertyIdentifier.payloadFormatIndicator, 0x01));
      expect(parseProperties(buffer, 2).payloadFormatIndicator).toBe(0x01);
    });

    test('should stop at unknown property identifier', () => {
      const buffer = propBuffer(oneByteProperty(PropertyIdentifier.payloadFormatIndicator, 0x01), [0xfe, 0x01]);
      const result = parseProperties(buffer);
      expect(result.payloadFormatIndicator).toBe(0x01);
      expect(Object.keys(result)).toEqual(['payloadFormatIndicator']);
    });

    describe('payloadFormatIndicator', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.payloadFormatIndicator, 0x01)));
        expect(result.payloadFormatIndicator).toBe(0x01);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(
              oneByteProperty(PropertyIdentifier.payloadFormatIndicator, 0x01),
              oneByteProperty(PropertyIdentifier.payloadFormatIndicator, 0x00),
            ),
          ),
        );
      });
    });

    describe('messageExpiryInterval', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(fourByteProperty(PropertyIdentifier.messageExpiryInterval, 0xff)));
        expect(result.messageExpiryInterval).toBe(0xff);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(
              fourByteProperty(PropertyIdentifier.messageExpiryInterval, 1),
              fourByteProperty(PropertyIdentifier.messageExpiryInterval, 2),
            ),
          ),
        );
      });
    });

    describe('contentType', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(utf8Property(PropertyIdentifier.contentType, 'application/json')));
        expect(result.contentType).toBe('application/json');
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(utf8Property(PropertyIdentifier.contentType, 'a'), utf8Property(PropertyIdentifier.contentType, 'b')),
          ),
        );
      });
    });

    describe('responseTopic', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(utf8Property(PropertyIdentifier.responseTopic, 'response/topic')));
        expect(result.responseTopic).toBe('response/topic');
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(utf8Property(PropertyIdentifier.responseTopic, 'a'), utf8Property(PropertyIdentifier.responseTopic, 'b')),
          ),
        );
      });
    });

    describe('correlationData', () => {
      test('parses valid binary value', () => {
        const data = Buffer.from([0x01, 0x02, 0x03]);
        const result = parseProperties(propBuffer(binaryProperty(PropertyIdentifier.correlationData, data)));
        expect(result.correlationData).toEqual(data);
      });

      test('throws on duplicate', () => {
        const data = Buffer.from([0x01]);
        expectProtocolError(() =>
          parseProperties(
            propBuffer(binaryProperty(PropertyIdentifier.correlationData, data), binaryProperty(PropertyIdentifier.correlationData, data)),
          ),
        );
      });
    });

    describe('subscriptionIdentifier', () => {
      test('parses a single identifier into an array', () => {
        const result = parseProperties(propBuffer([PropertyIdentifier.subscriptionIdentifier, ...encodeVariableByteInteger(1)]));
        expect(result.subscriptionIdentifier).toEqual([1]);
      });

      test('parses multiple identifiers', () => {
        const result = parseProperties(
          propBuffer(
            [PropertyIdentifier.subscriptionIdentifier, ...encodeVariableByteInteger(1)],
            [PropertyIdentifier.subscriptionIdentifier, ...encodeVariableByteInteger(2)],
          ),
        );
        expect(result.subscriptionIdentifier).toEqual([1, 2]);
      });

      test('throws when value is 0', () => {
        expectProtocolError(() => parseProperties(propBuffer([PropertyIdentifier.subscriptionIdentifier, 0x00])));
      });
    });

    describe('sessionExpiryInterval', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(fourByteProperty(PropertyIdentifier.sessionExpiryInterval, 0xff)));
        expect(result.sessionExpiryInterval).toBe(0xff);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(
              fourByteProperty(PropertyIdentifier.sessionExpiryInterval, 1),
              fourByteProperty(PropertyIdentifier.sessionExpiryInterval, 2),
            ),
          ),
        );
      });
    });

    describe('assignedClientIdentifier', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(utf8Property(PropertyIdentifier.assignedClientIdentifier, 'client-id')));
        expect(result.assignedClientIdentifier).toBe('client-id');
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(
              utf8Property(PropertyIdentifier.assignedClientIdentifier, 'a'),
              utf8Property(PropertyIdentifier.assignedClientIdentifier, 'b'),
            ),
          ),
        );
      });
    });

    describe('serverKeepAlive', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(twoByteProperty(PropertyIdentifier.serverKeepAlive, 0x1234)));
        expect(result.serverKeepAlive).toBe(0x1234);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(twoByteProperty(PropertyIdentifier.serverKeepAlive, 1), twoByteProperty(PropertyIdentifier.serverKeepAlive, 2)),
          ),
        );
      });
    });

    describe('authenticationMethod', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(utf8Property(PropertyIdentifier.authenticationMethod, 'PLAIN')));
        expect(result.authenticationMethod).toBe('PLAIN');
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(
              utf8Property(PropertyIdentifier.authenticationMethod, 'a'),
              utf8Property(PropertyIdentifier.authenticationMethod, 'b'),
            ),
          ),
        );
      });
    });

    describe('authenticationData', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(utf8Property(PropertyIdentifier.authenticationData, 'auth-data')));
        expect(result.authenticationData).toBe('auth-data');
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(utf8Property(PropertyIdentifier.authenticationData, 'a'), utf8Property(PropertyIdentifier.authenticationData, 'b')),
          ),
        );
      });
    });

    describe('requestProblemInformation', () => {
      test('parses 0 as false', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.requestProblemInformation, 0)));
        expect(result.requestProblemInformation).toBe(false);
      });

      test('parses 1 as true', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.requestProblemInformation, 1)));
        expect(result.requestProblemInformation).toBe(true);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(
              oneByteProperty(PropertyIdentifier.requestProblemInformation, 0),
              oneByteProperty(PropertyIdentifier.requestProblemInformation, 1),
            ),
          ),
        );
      });

      test('throws when value is greater than 1', () => {
        expectProtocolError(() => parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.requestProblemInformation, 2))));
      });
    });

    describe('willDelayInterval', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(fourByteProperty(PropertyIdentifier.willDelayInterval, 0xff)));
        expect(result.willDelayInterval).toBe(0xff);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(fourByteProperty(PropertyIdentifier.willDelayInterval, 1), fourByteProperty(PropertyIdentifier.willDelayInterval, 2)),
          ),
        );
      });
    });

    describe('requestResponseInformation', () => {
      test('parses 0 as false', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.requestResponseInformation, 0)));
        expect(result.requestResponseInformation).toBe(false);
      });

      test('parses 1 as true', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.requestResponseInformation, 1)));
        expect(result.requestResponseInformation).toBe(true);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(
              oneByteProperty(PropertyIdentifier.requestResponseInformation, 0),
              oneByteProperty(PropertyIdentifier.requestResponseInformation, 1),
            ),
          ),
        );
      });

      test('throws when value is greater than 1', () => {
        expectProtocolError(() => parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.requestResponseInformation, 2))));
      });
    });

    describe('responseInformation', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(utf8Property(PropertyIdentifier.responseInformation, 'info')));
        expect(result.responseInformation).toBe('info');
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(utf8Property(PropertyIdentifier.responseInformation, 'a'), utf8Property(PropertyIdentifier.responseInformation, 'b')),
          ),
        );
      });
    });

    describe('serverReference', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(utf8Property(PropertyIdentifier.serverReference, 'mqtt://broker')));
        expect(result.serverReference).toBe('mqtt://broker');
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(utf8Property(PropertyIdentifier.serverReference, 'a'), utf8Property(PropertyIdentifier.serverReference, 'b')),
          ),
        );
      });
    });

    describe('reasonString', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(utf8Property(PropertyIdentifier.reasonString, 'Disconnect reason')));
        expect(result.reasonString).toBe('Disconnect reason');
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(propBuffer(utf8Property(PropertyIdentifier.reasonString, 'a'), utf8Property(PropertyIdentifier.reasonString, 'b'))),
        );
      });
    });

    describe('receiveMaximum', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(twoByteProperty(PropertyIdentifier.receiveMaximum, 0x1234)));
        expect(result.receiveMaximum).toBe(0x1234);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(twoByteProperty(PropertyIdentifier.receiveMaximum, 1), twoByteProperty(PropertyIdentifier.receiveMaximum, 2)),
          ),
        );
      });
    });

    describe('topicAliasMaximum', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(twoByteProperty(PropertyIdentifier.topicAliasMaximum, 0x0100)));
        expect(result.topicAliasMaximum).toBe(0x0100);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(twoByteProperty(PropertyIdentifier.topicAliasMaximum, 1), twoByteProperty(PropertyIdentifier.topicAliasMaximum, 2)),
          ),
        );
      });
    });

    describe('topicAlias', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(twoByteProperty(PropertyIdentifier.topicAlias, 0x000a)));
        expect(result.topicAlias).toBe(0x000a);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(propBuffer(twoByteProperty(PropertyIdentifier.topicAlias, 1), twoByteProperty(PropertyIdentifier.topicAlias, 2))),
        );
      });
    });

    describe('maximumQoS', () => {
      test('parses 0 as false', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.maximumQoS, 0)));
        expect(result.maximumQoS).toBe(false);
      });

      test('parses 1 as true', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.maximumQoS, 1)));
        expect(result.maximumQoS).toBe(true);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.maximumQoS, 0), oneByteProperty(PropertyIdentifier.maximumQoS, 1))),
        );
      });

      test('throws when value is greater than 1', () => {
        expectProtocolError(() => parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.maximumQoS, 2))));
      });
    });

    describe('retainAvailable', () => {
      test('parses 0 as false', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.retainAvailable, 0)));
        expect(result.retainAvailable).toBe(false);
      });

      test('parses 1 as true', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.retainAvailable, 1)));
        expect(result.retainAvailable).toBe(true);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(oneByteProperty(PropertyIdentifier.retainAvailable, 0), oneByteProperty(PropertyIdentifier.retainAvailable, 1)),
          ),
        );
      });

      test('throws when value is greater than 1', () => {
        expectProtocolError(() => parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.retainAvailable, 2))));
      });
    });

    describe('userProperty', () => {
      test('parses a single key/value pair', () => {
        const result = parseProperties(
          propBuffer([PropertyIdentifier.userProperty, ...encodeUTF8String('key'), ...encodeUTF8String('value')]),
        );
        expect(result.userProperty).toEqual({ key: 'value' });
      });

      test('parses multiple key/value pairs', () => {
        const result = parseProperties(
          propBuffer(
            [PropertyIdentifier.userProperty, ...encodeUTF8String('key1'), ...encodeUTF8String('value1')],
            [PropertyIdentifier.userProperty, ...encodeUTF8String('key2'), ...encodeUTF8String('value2')],
          ),
        );
        expect(result.userProperty).toEqual({ key1: 'value1', key2: 'value2' });
      });

      test('later duplicate key overwrites earlier value', () => {
        const result = parseProperties(
          propBuffer(
            [PropertyIdentifier.userProperty, ...encodeUTF8String('key'), ...encodeUTF8String('old')],
            [PropertyIdentifier.userProperty, ...encodeUTF8String('key'), ...encodeUTF8String('new')],
          ),
        );
        expect(result.userProperty).toEqual({ key: 'new' });
      });
    });

    describe('maximumPacketSize', () => {
      test('parses valid value', () => {
        const result = parseProperties(propBuffer(fourByteProperty(PropertyIdentifier.maximumPacketSize, 0x12345678)));
        expect(result.maximumPacketSize).toBe(0x12345678);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(fourByteProperty(PropertyIdentifier.maximumPacketSize, 1), fourByteProperty(PropertyIdentifier.maximumPacketSize, 2)),
          ),
        );
      });
    });

    describe('wildcardSubscriptionAvailable', () => {
      test('parses 0 as false', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.wildcardSubscriptionAvailable, 0)));
        expect(result.wildcardSubscriptionAvailable).toBe(false);
      });

      test('parses 1 as true', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.wildcardSubscriptionAvailable, 1)));
        expect(result.wildcardSubscriptionAvailable).toBe(true);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(
              oneByteProperty(PropertyIdentifier.wildcardSubscriptionAvailable, 0),
              oneByteProperty(PropertyIdentifier.wildcardSubscriptionAvailable, 1),
            ),
          ),
        );
      });

      test('throws when value is greater than 1', () => {
        expectProtocolError(() => parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.wildcardSubscriptionAvailable, 2))));
      });
    });

    describe('subscriptionIdentifierAvailable', () => {
      test('parses 0 as false', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.subscriptionIdentifierAvailable, 0)));
        expect(result.subscriptionIdentifierAvailable).toBe(false);
      });

      test('parses 1 as true', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.subscriptionIdentifierAvailable, 1)));
        expect(result.subscriptionIdentifierAvailable).toBe(true);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(
              oneByteProperty(PropertyIdentifier.subscriptionIdentifierAvailable, 0),
              oneByteProperty(PropertyIdentifier.subscriptionIdentifierAvailable, 1),
            ),
          ),
        );
      });

      test('throws when value is greater than 1', () => {
        expectProtocolError(() => parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.subscriptionIdentifierAvailable, 2))));
      });
    });

    describe('sharedSubscriptionAvailable', () => {
      test('parses 0 as false', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.sharedSubscriptionAvailable, 0)));
        expect(result.sharedSubscriptionAvailable).toBe(false);
      });

      test('parses 1 as true', () => {
        const result = parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.sharedSubscriptionAvailable, 1)));
        expect(result.sharedSubscriptionAvailable).toBe(true);
      });

      test('throws on duplicate', () => {
        expectProtocolError(() =>
          parseProperties(
            propBuffer(
              oneByteProperty(PropertyIdentifier.sharedSubscriptionAvailable, 0),
              oneByteProperty(PropertyIdentifier.sharedSubscriptionAvailable, 1),
            ),
          ),
        );
      });

      test('throws when value is greater than 1', () => {
        expectProtocolError(() => parseProperties(propBuffer(oneByteProperty(PropertyIdentifier.sharedSubscriptionAvailable, 2))));
      });
    });

    test('parses multiple different properties in one buffer', () => {
      const result = parseProperties(
        propBuffer(
          oneByteProperty(PropertyIdentifier.payloadFormatIndicator, 1),
          fourByteProperty(PropertyIdentifier.messageExpiryInterval, 60),
          utf8Property(PropertyIdentifier.contentType, 'text/plain'),
          twoByteProperty(PropertyIdentifier.topicAlias, 7),
        ),
      );
      expect(result).toMatchObject({
        payloadFormatIndicator: 1,
        messageExpiryInterval: 60,
        contentType: 'text/plain',
        topicAlias: 7,
      });
    });
  });

  describe('typed parse*Properties wrappers', () => {
    test('parseConnectProperties', () => {
      expect(parseConnectProperties(propBuffer(fourByteProperty(PropertyIdentifier.sessionExpiryInterval, 0xff))).sessionExpiryInterval).toBe(
        0xff,
      );
    });

    test('parseConnAckProperties', () => {
      expect(
        parseConnAckProperties(propBuffer(utf8Property(PropertyIdentifier.assignedClientIdentifier, 'client-id'))).assignedClientIdentifier,
      ).toBe('client-id');
    });

    test('parsePublishProperties', () => {
      expect(parsePublishProperties(propBuffer(oneByteProperty(PropertyIdentifier.payloadFormatIndicator, 1))).payloadFormatIndicator).toBe(1);
    });

    test('parseSubscribeProperties', () => {
      expect(
        parseSubscribeProperties(propBuffer([PropertyIdentifier.subscriptionIdentifier, ...encodeVariableByteInteger(1)]))
          .subscriptionIdentifier?.[0],
      ).toBe(1);
    });

    test('parseDisconnectProperties', () => {
      expect(parseDisconnectProperties(propBuffer(utf8Property(PropertyIdentifier.reasonString, 'bye'))).reasonString).toBe('bye');
    });

    test('parseAuthProperties', () => {
      expect(parseAuthProperties(propBuffer(utf8Property(PropertyIdentifier.authenticationMethod, 'PLAIN'))).authenticationMethod).toBe(
        'PLAIN',
      );
    });

    test('parseConnectWillProperties', () => {
      expect(parseConnectWillProperties(propBuffer(fourByteProperty(PropertyIdentifier.willDelayInterval, 0xff))).willDelayInterval).toBe(0xff);
    });

    test('parsePubAckProperties / parsePubRecProperties / parsePubRelProperties / parsePubCompProperties / parseSubAckProperties', () => {
      const reason = propBuffer(utf8Property(PropertyIdentifier.reasonString, 'Reason'));
      expect(parsePubAckProperties(reason).reasonString).toBe('Reason');
      expect(parsePubRecProperties(reason).reasonString).toBe('Reason');
      expect(parsePubRelProperties(reason).reasonString).toBe('Reason');
      expect(parsePubCompProperties(reason).reasonString).toBe('Reason');
      expect(parseSubAckProperties(reason).reasonString).toBe('Reason');
    });

    test('parseUnsubscribeProperties / parseUnsubscribeAckProperties', () => {
      const user = propBuffer([PropertyIdentifier.userProperty, ...encodeUTF8String('key'), ...encodeUTF8String('value')]);
      expect(parseUnsubscribeProperties(user).userProperty).toEqual({ key: 'value' });
      expect(parseUnsubscribeAckProperties(user).userProperty).toEqual({ key: 'value' });
    });
  });

  describe('encodeProperties', () => {
    test('should encode payloadFormatIndicator', () => {
      expect(encodeProperties(PropertyIdentifier.payloadFormatIndicator, 0x01)).toEqual([
        PropertyIdentifier.payloadFormatIndicator,
        0x01,
      ]);
    });

    test('should encode messageExpiryInterval', () => {
      expect(encodeProperties(PropertyIdentifier.messageExpiryInterval, 0x12345678)).toEqual([
        PropertyIdentifier.messageExpiryInterval,
        ...integerToFourUint8(0x12345678),
      ]);
    });

    test('should encode contentType', () => {
      const str = 'application/json';
      expect(encodeProperties(PropertyIdentifier.contentType, str)).toEqual([PropertyIdentifier.contentType, ...encodeUTF8String(str)]);
    });

    test('should encode responseTopic', () => {
      const topic = 'response/topic';
      expect(encodeProperties(PropertyIdentifier.responseTopic, topic)).toEqual([
        PropertyIdentifier.responseTopic,
        ...encodeUTF8String(topic),
      ]);
    });

    test('should encode correlationData from Buffer', () => {
      const data = Buffer.from([0x01, 0x02]);
      expect(encodeProperties(PropertyIdentifier.correlationData, data)).toEqual([
        PropertyIdentifier.correlationData,
        ...encodeBinaryData(data),
      ]);
    });

    test('should encode correlationData from string', () => {
      const data = 'corr';
      expect(encodeProperties(PropertyIdentifier.correlationData, data)).toEqual([
        PropertyIdentifier.correlationData,
        ...encodeUTF8String(data),
      ]);
    });

    test('should encode subscriptionIdentifier as array', () => {
      const result = encodeProperties(PropertyIdentifier.subscriptionIdentifier, [1, 2, 3] as any);
      expect(result).toEqual([
        PropertyIdentifier.subscriptionIdentifier,
        ...encodeVariableByteInteger(1),
        PropertyIdentifier.subscriptionIdentifier,
        ...encodeVariableByteInteger(2),
        PropertyIdentifier.subscriptionIdentifier,
        ...encodeVariableByteInteger(3),
      ]);
    });

    test('should encode subscriptionIdentifier as string via stringToVariableByteInteger', () => {
      const result = encodeProperties(PropertyIdentifier.subscriptionIdentifier, '42' as any);
      expect(result).toEqual([PropertyIdentifier.subscriptionIdentifier, ...encodeUTF8String('42')]);
    });

    test('should encode sessionExpiryInterval', () => {
      expect(encodeProperties(PropertyIdentifier.sessionExpiryInterval, 0x12345678)).toEqual([
        PropertyIdentifier.sessionExpiryInterval,
        ...integerToFourUint8(0x12345678),
      ]);
    });

    test('should encode assignedClientIdentifier', () => {
      const clientId = 'client-id';
      expect(encodeProperties(PropertyIdentifier.assignedClientIdentifier, clientId)).toEqual([
        PropertyIdentifier.assignedClientIdentifier,
        ...encodeUTF8String(clientId),
      ]);
    });

    test('should encode serverKeepAlive', () => {
      expect(encodeProperties(PropertyIdentifier.serverKeepAlive, 0x1234)).toEqual([
        PropertyIdentifier.serverKeepAlive,
        ...integerToTwoUint8(0x1234),
      ]);
    });

    test('should encode authenticationMethod', () => {
      const method = 'PLAIN';
      expect(encodeProperties(PropertyIdentifier.authenticationMethod, method)).toEqual([
        PropertyIdentifier.authenticationMethod,
        ...encodeUTF8String(method),
      ]);
    });

    test('should encode authenticationData', () => {
      const data = 'auth-bytes';
      expect(encodeProperties(PropertyIdentifier.authenticationData, data)).toEqual([
        PropertyIdentifier.authenticationData,
        ...encodeUTF8String(data),
      ]);
    });

    test('should encode requestProblemInformation', () => {
      expect(encodeProperties(PropertyIdentifier.requestProblemInformation, 1)).toEqual([
        PropertyIdentifier.requestProblemInformation,
        integerToOneUint8(1),
      ]);
    });

    test('should encode willDelayInterval', () => {
      expect(encodeProperties(PropertyIdentifier.willDelayInterval, 0x01020304)).toEqual([
        PropertyIdentifier.willDelayInterval,
        ...integerToFourUint8(0x01020304),
      ]);
    });

    test('should encode requestResponseInformation', () => {
      expect(encodeProperties(PropertyIdentifier.requestResponseInformation, 1)).toEqual([
        PropertyIdentifier.requestResponseInformation,
        integerToOneUint8(1),
      ]);
    });

    test('should encode responseInformation', () => {
      expect(encodeProperties(PropertyIdentifier.responseInformation, 'info')).toEqual([
        PropertyIdentifier.responseInformation,
        ...encodeUTF8String('info'),
      ]);
    });

    test('should encode serverReference', () => {
      expect(encodeProperties(PropertyIdentifier.serverReference, 'mqtt://broker')).toEqual([
        PropertyIdentifier.serverReference,
        ...encodeUTF8String('mqtt://broker'),
      ]);
    });

    test('should encode reasonString', () => {
      expect(encodeProperties(PropertyIdentifier.reasonString, 'reason')).toEqual([
        PropertyIdentifier.reasonString,
        ...encodeUTF8String('reason'),
      ]);
    });

    test('should encode receiveMaximum', () => {
      expect(encodeProperties(PropertyIdentifier.receiveMaximum, 0x1234)).toEqual([
        PropertyIdentifier.receiveMaximum,
        ...integerToTwoUint8(0x1234),
      ]);
    });

    test('should encode topicAliasMaximum', () => {
      expect(encodeProperties(PropertyIdentifier.topicAliasMaximum, 0x00ff)).toEqual([
        PropertyIdentifier.topicAliasMaximum,
        ...integerToTwoUint8(0x00ff),
      ]);
    });

    test('should encode userProperty', () => {
      const result = encodeProperties(PropertyIdentifier.userProperty, { key1: 'value1', key2: 'value2' } as any);
      expect(result[0]).toBe(PropertyIdentifier.userProperty);
      expect(result.length).toBeGreaterThan(0);
    });

    test('should encode topicAlias', () => {
      expect(encodeProperties(PropertyIdentifier.topicAlias, 0x1234)).toEqual([PropertyIdentifier.topicAlias, ...integerToTwoUint8(0x1234)]);
    });

    test('should encode maximumQoS', () => {
      expect(encodeProperties(PropertyIdentifier.maximumQoS, true)).toEqual([PropertyIdentifier.maximumQoS, integerToOneUint8(1)]);
    });

    test('should encode retainAvailable', () => {
      expect(encodeProperties(PropertyIdentifier.retainAvailable, true)).toEqual([PropertyIdentifier.retainAvailable, integerToOneUint8(1)]);
    });

    test('should encode maximumPacketSize', () => {
      expect(encodeProperties(PropertyIdentifier.maximumPacketSize, 0x12345678)).toEqual([
        PropertyIdentifier.maximumPacketSize,
        ...integerToFourUint8(0x12345678),
      ]);
    });

    test('should encode wildcardSubscriptionAvailable', () => {
      expect(encodeProperties(PropertyIdentifier.wildcardSubscriptionAvailable, true)).toEqual([
        PropertyIdentifier.wildcardSubscriptionAvailable,
        integerToOneUint8(1),
      ]);
    });

    test('should encode subscriptionIdentifierAvailable', () => {
      expect(encodeProperties(PropertyIdentifier.subscriptionIdentifierAvailable, false)).toEqual([
        PropertyIdentifier.subscriptionIdentifierAvailable,
        integerToOneUint8(0),
      ]);
    });

    test('should encode sharedSubscriptionAvailable', () => {
      expect(encodeProperties(PropertyIdentifier.sharedSubscriptionAvailable, true)).toEqual([
        PropertyIdentifier.sharedSubscriptionAvailable,
        integerToOneUint8(1),
      ]);
    });

    test('should return empty array for unknown property', () => {
      expect(encodeProperties(0xff as any, 'test')).toEqual([]);
    });
  });
});
