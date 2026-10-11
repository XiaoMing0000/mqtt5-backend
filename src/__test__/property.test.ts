import {
  EncoderProperties,
  parseAuthProperties,
  parseConnAckProperties,
  parseConnectProperties,
  parseConnectWillProperties,
  parseDisconnectProperties,
  parsePubAckProperties,
  parsePubCompProperties,
  parsePublishProperties,
  parsePubRecProperties,
  parsePubRelProperties,
  parseSubAckProperties,
  parseSubscribeProperties,
  parseUnsubscribeAckProperties,
  parseUnsubscribeProperties,
} from '../property';
import { PropertyIdentifier } from '../interface';
import { DisconnectException, DisconnectReasonCode } from '../exception';
import {
  encodeBinaryData,
  encodeFourByteInteger,
  encodeOneByteInteger,
  encodeTwoByteInteger,
  encodeUTF8String,
  encodeVariableByteInteger,
} from '../dataRepresentations';

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
  return [id, encodeOneByteInteger(value)];
}

function twoByteProperty(id: PropertyIdentifier, value: number): number[] {
  return [id, ...encodeTwoByteInteger(value)];
}

function fourByteProperty(id: PropertyIdentifier, value: number): number[] {
  return [id, ...encodeFourByteInteger(value)];
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
  describe('EncoderProperties', () => {
    test('should add property and calculate length', () => {
      const encoder = new EncoderProperties();
      encoder.add(PropertyIdentifier.payloadFormatIndicator, 1);
      expect(encoder.length).toBeGreaterThan(0);
      expect(Buffer.isBuffer(encoder.buffer)).toBe(true);
    });

    test('should push individual properties', () => {
      const encoder = new EncoderProperties();
      encoder.push({
        payloadFormatIndicator: 1,
        messageExpiryInterval: 60,
        contentType: 'application/json',
        responseTopic: 'resp/topic',
        correlationData: Buffer.from([1, 2, 3]),
        sessionExpiryInterval: 120,
        assignedClientIdentifier: 'client-1',
        serverKeepAlive: 30,
        authenticationMethod: 'PLAIN',
        authenticationData: 'secret',
        requestProblemInformation: true,
        willDelayInterval: 10,
        requestResponseInformation: true,
        responseInformation: 'resp-info',
        serverReference: 'mqtt://server',
        reasonString: 'ok',
        receiveMaximum: 100,
        topicAliasMaximum: 10,
        topicAlias: 5,
        maximumQoS: true,
        retainAvailable: true,
        userProperty: { key: 'value' },
        maximumPacketSize: 1024,
        wildcardSubscriptionAvailable: true,
        subscriptionIdentifierAvailable: true,
        sharedSubscriptionAvailable: true,
      });
      expect(encoder.length).toBeGreaterThan(1);
      expect(encoder.buffer[0]).toBeGreaterThan(0); // variable byte integer length > 0
    });

    test('should encode string correlationData and subscriptionIdentifier array', () => {
      const encoder = new EncoderProperties();
      encoder.add(PropertyIdentifier.correlationData, 'corr-str' as any);
      encoder.add(PropertyIdentifier.subscriptionIdentifier, [1, 2] as any);
      encoder.add(PropertyIdentifier.subscriptionIdentifier, '42' as any);
      expect(encoder.length).toBeGreaterThan(1);
    });

    test('should ignore undefined properties', () => {
      const encoder = new EncoderProperties();
      encoder.push({
        payloadFormatIndicator: undefined,
        contentType: undefined,
      });
      // 0 property length is encoded as 1 byte in Variable Byte Integer
      expect(encoder.length).toBe(1);
      expect(encoder.buffer).toEqual(Buffer.from([0x00]));
    });

    test('should handle unknown property gracefully in add', () => {
      const encoder = new EncoderProperties();
      encoder.add(0xff as any, 'unknown' as any);
      expect(encoder.length).toBe(1);
      expect(encoder.buffer).toEqual(Buffer.from([0x00]));
    });
  });

  describe('parseConnectProperties', () => {
    test('parses empty buffer', () => {
      expect(parseConnectProperties(Buffer.from([]))).toEqual({});
    });

    test('parses from non-zero offset', () => {
      const buffer = propBuffer([0x00, 0x00], twoByteProperty(PropertyIdentifier.receiveMaximum, 10));
      expect(parseConnectProperties(buffer, 2).receiveMaximum).toBe(10);
    });

    test('stops at unknown property identifier', () => {
      const buffer = propBuffer(twoByteProperty(PropertyIdentifier.receiveMaximum, 10), [0xfe, 0x01]);
      const result = parseConnectProperties(buffer);
      expect(result.receiveMaximum).toBe(10);
      expect(Object.keys(result)).toEqual(['receiveMaximum']);
    });

    test('parses valid CONNECT properties', () => {
      const buffer = propBuffer(
        fourByteProperty(PropertyIdentifier.sessionExpiryInterval, 300),
        twoByteProperty(PropertyIdentifier.receiveMaximum, 100),
        fourByteProperty(PropertyIdentifier.maximumPacketSize, 65535),
        twoByteProperty(PropertyIdentifier.topicAliasMaximum, 20),
        oneByteProperty(PropertyIdentifier.requestResponseInformation, 1),
        oneByteProperty(PropertyIdentifier.requestProblemInformation, 1),
        utf8Property(PropertyIdentifier.authenticationMethod, 'PLAIN'),
        utf8Property(PropertyIdentifier.authenticationData, 'auth-secret'),
        [PropertyIdentifier.userProperty, ...encodeUTF8String('env'), ...encodeUTF8String('prod')],
      );
      const props = parseConnectProperties(buffer);
      expect(props.sessionExpiryInterval).toBe(300);
      expect(props.receiveMaximum).toBe(100);
      expect(props.maximumPacketSize).toBe(65535);
      expect(props.topicAliasMaximum).toBe(20);
      expect(props.requestResponseInformation).toBe(true);
      expect(props.requestProblemInformation).toBe(true);
      expect(props.authenticationMethod).toBe('PLAIN');
      expect(props.authenticationData).toBe('auth-secret');
      expect(props.userProperty).toEqual({ env: 'prod' });
    });

    test('parses boolean properties false when 0', () => {
      const buffer = propBuffer(
        oneByteProperty(PropertyIdentifier.requestResponseInformation, 0),
        oneByteProperty(PropertyIdentifier.requestProblemInformation, 0),
      );
      const props = parseConnectProperties(buffer);
      expect(props.requestResponseInformation).toBe(false);
      expect(props.requestProblemInformation).toBe(false);
    });

    test('throws on duplicate sessionExpiryInterval', () => {
      const buffer = propBuffer(
        fourByteProperty(PropertyIdentifier.sessionExpiryInterval, 100),
        fourByteProperty(PropertyIdentifier.sessionExpiryInterval, 200),
      );
      expectProtocolError(() => parseConnectProperties(buffer));
    });

    test('throws on duplicate receiveMaximum', () => {
      expectProtocolError(() =>
        parseConnectProperties(
          propBuffer(twoByteProperty(PropertyIdentifier.receiveMaximum, 10), twoByteProperty(PropertyIdentifier.receiveMaximum, 20)),
        ),
      );
    });

    test('throws on duplicate maximumPacketSize', () => {
      expectProtocolError(() =>
        parseConnectProperties(
          propBuffer(fourByteProperty(PropertyIdentifier.maximumPacketSize, 10), fourByteProperty(PropertyIdentifier.maximumPacketSize, 20)),
        ),
      );
    });

    test('throws on invalid boolean property values (> 1)', () => {
      expectProtocolError(() => parseConnectProperties(propBuffer(oneByteProperty(PropertyIdentifier.requestResponseInformation, 2))));
      expectProtocolError(() => parseConnectProperties(propBuffer(oneByteProperty(PropertyIdentifier.requestProblemInformation, 2))));
    });

    test('throws on duplicate requestResponseInformation / requestProblemInformation', () => {
      expectProtocolError(() =>
        parseConnectProperties(
          propBuffer(
            oneByteProperty(PropertyIdentifier.requestResponseInformation, 0),
            oneByteProperty(PropertyIdentifier.requestResponseInformation, 1),
          ),
        ),
      );
      expectProtocolError(() =>
        parseConnectProperties(
          propBuffer(
            oneByteProperty(PropertyIdentifier.requestProblemInformation, 0),
            oneByteProperty(PropertyIdentifier.requestProblemInformation, 1),
          ),
        ),
      );
    });

    test('throws on duplicate authenticationMethod / authenticationData', () => {
      expectProtocolError(() =>
        parseConnectProperties(
          propBuffer(utf8Property(PropertyIdentifier.authenticationMethod, 'a'), utf8Property(PropertyIdentifier.authenticationMethod, 'b')),
        ),
      );
      expectProtocolError(() =>
        parseConnectProperties(
          propBuffer(utf8Property(PropertyIdentifier.authenticationData, 'a'), utf8Property(PropertyIdentifier.authenticationData, 'b')),
        ),
      );
    });

    test('throws on duplicate topicAliasMaximum', () => {
      expectProtocolError(() =>
        parseConnectProperties(
          propBuffer(twoByteProperty(PropertyIdentifier.topicAliasMaximum, 5), twoByteProperty(PropertyIdentifier.topicAliasMaximum, 10)),
        ),
      );
    });
  });

  describe('parseConnAckProperties', () => {
    test('parses valid CONNACK properties', () => {
      const buffer = propBuffer(
        fourByteProperty(PropertyIdentifier.sessionExpiryInterval, 300),
        twoByteProperty(PropertyIdentifier.receiveMaximum, 100),
        oneByteProperty(PropertyIdentifier.maximumQoS, 1),
        oneByteProperty(PropertyIdentifier.retainAvailable, 1),
        fourByteProperty(PropertyIdentifier.maximumPacketSize, 1024),
        utf8Property(PropertyIdentifier.assignedClientIdentifier, 'assigned-id'),
        twoByteProperty(PropertyIdentifier.topicAliasMaximum, 5),
        utf8Property(PropertyIdentifier.reasonString, 'Welcome'),
        oneByteProperty(PropertyIdentifier.wildcardSubscriptionAvailable, 1),
        oneByteProperty(PropertyIdentifier.subscriptionIdentifierAvailable, 1),
        oneByteProperty(PropertyIdentifier.sharedSubscriptionAvailable, 1),
        twoByteProperty(PropertyIdentifier.serverKeepAlive, 60),
        utf8Property(PropertyIdentifier.responseInformation, 'resp-info'),
        utf8Property(PropertyIdentifier.serverReference, 'backup.broker'),
        utf8Property(PropertyIdentifier.authenticationMethod, 'PLAIN'),
        utf8Property(PropertyIdentifier.authenticationData, 'token'),
      );
      const props = parseConnAckProperties(buffer);
      expect(props.sessionExpiryInterval).toBe(300);
      expect(props.receiveMaximum).toBe(100);
      expect(props.maximumQoS).toBe(true);
      expect(props.retainAvailable).toBe(true);
      expect(props.maximumPacketSize).toBe(1024);
      expect(props.assignedClientIdentifier).toBe('assigned-id');
      expect(props.topicAliasMaximum).toBe(5);
      expect(props.reasonString).toBe('Welcome');
      expect(props.wildcardSubscriptionAvailable).toBe(true);
      expect(props.subscriptionIdentifierAvailable).toBe(true);
      expect(props.sharedSubscriptionAvailable).toBe(true);
      expect(props.serverKeepAlive).toBe(60);
      expect(props.responseInformation).toBe('resp-info');
      expect(props.serverReference).toBe('backup.broker');
      expect(props.authenticationMethod).toBe('PLAIN');
      expect(props.authenticationData).toBe('token');
    });

    test('parses boolean properties as false when 0', () => {
      const buffer = propBuffer(
        oneByteProperty(PropertyIdentifier.maximumQoS, 0),
        oneByteProperty(PropertyIdentifier.retainAvailable, 0),
        oneByteProperty(PropertyIdentifier.wildcardSubscriptionAvailable, 0),
        oneByteProperty(PropertyIdentifier.subscriptionIdentifierAvailable, 0),
        oneByteProperty(PropertyIdentifier.sharedSubscriptionAvailable, 0),
      );
      const props = parseConnAckProperties(buffer);
      expect(props.maximumQoS).toBe(false);
      expect(props.retainAvailable).toBe(false);
      expect(props.wildcardSubscriptionAvailable).toBe(false);
      expect(props.subscriptionIdentifierAvailable).toBe(false);
      expect(props.sharedSubscriptionAvailable).toBe(false);
    });

    test('throws on duplicate assignedClientIdentifier / serverKeepAlive / responseInformation', () => {
      expectProtocolError(() =>
        parseConnAckProperties(
          propBuffer(utf8Property(PropertyIdentifier.assignedClientIdentifier, 'a'), utf8Property(PropertyIdentifier.assignedClientIdentifier, 'b')),
        ),
      );
      expectProtocolError(() =>
        parseConnAckProperties(
          propBuffer(twoByteProperty(PropertyIdentifier.serverKeepAlive, 10), twoByteProperty(PropertyIdentifier.serverKeepAlive, 20)),
        ),
      );
      expectProtocolError(() =>
        parseConnAckProperties(
          propBuffer(utf8Property(PropertyIdentifier.responseInformation, 'a'), utf8Property(PropertyIdentifier.responseInformation, 'b')),
        ),
      );
    });

    test('throws on duplicate or invalid boolean flags', () => {
      expectProtocolError(() => parseConnAckProperties(propBuffer(oneByteProperty(PropertyIdentifier.maximumQoS, 2))));
      expectProtocolError(() => parseConnAckProperties(propBuffer(oneByteProperty(PropertyIdentifier.retainAvailable, 2))));
      expectProtocolError(() => parseConnAckProperties(propBuffer(oneByteProperty(PropertyIdentifier.wildcardSubscriptionAvailable, 2))));
      expectProtocolError(() => parseConnAckProperties(propBuffer(oneByteProperty(PropertyIdentifier.subscriptionIdentifierAvailable, 2))));
      expectProtocolError(() => parseConnAckProperties(propBuffer(oneByteProperty(PropertyIdentifier.sharedSubscriptionAvailable, 2))));

      expectProtocolError(() =>
        parseConnAckProperties(propBuffer(oneByteProperty(PropertyIdentifier.maximumQoS, 0), oneByteProperty(PropertyIdentifier.maximumQoS, 1))),
      );
      expectProtocolError(() =>
        parseConnAckProperties(
          propBuffer(oneByteProperty(PropertyIdentifier.retainAvailable, 0), oneByteProperty(PropertyIdentifier.retainAvailable, 1)),
        ),
      );
      expectProtocolError(() =>
        parseConnAckProperties(
          propBuffer(
            oneByteProperty(PropertyIdentifier.wildcardSubscriptionAvailable, 0),
            oneByteProperty(PropertyIdentifier.wildcardSubscriptionAvailable, 1),
          ),
        ),
      );
      expectProtocolError(() =>
        parseConnAckProperties(
          propBuffer(
            oneByteProperty(PropertyIdentifier.subscriptionIdentifierAvailable, 0),
            oneByteProperty(PropertyIdentifier.subscriptionIdentifierAvailable, 1),
          ),
        ),
      );
      expectProtocolError(() =>
        parseConnAckProperties(
          propBuffer(
            oneByteProperty(PropertyIdentifier.sharedSubscriptionAvailable, 0),
            oneByteProperty(PropertyIdentifier.sharedSubscriptionAvailable, 1),
          ),
        ),
      );
    });
  });

  describe('parsePublishProperties', () => {
    test('parses valid PUBLISH properties', () => {
      const corr = Buffer.from([1, 2, 3]);
      const buffer = propBuffer(
        oneByteProperty(PropertyIdentifier.payloadFormatIndicator, 1),
        fourByteProperty(PropertyIdentifier.messageExpiryInterval, 3600),
        twoByteProperty(PropertyIdentifier.topicAlias, 2),
        utf8Property(PropertyIdentifier.responseTopic, 'response/to'),
        binaryProperty(PropertyIdentifier.correlationData, corr),
        [PropertyIdentifier.subscriptionIdentifier, ...encodeVariableByteInteger(42)],
        utf8Property(PropertyIdentifier.contentType, 'text/plain'),
      );
      const props = parsePublishProperties(buffer);
      expect(props.payloadFormatIndicator).toBe(1);
      expect(props.messageExpiryInterval).toBe(3600);
      expect(props.topicAlias).toBe(2);
      expect(props.responseTopic).toBe('response/to');
      expect(props.correlationData).toEqual(corr);
      expect(props.subscriptionIdentifier).toEqual([42]);
      expect(props.contentType).toBe('text/plain');
    });

    test('throws on duplicate topicAlias', () => {
      expectProtocolError(() =>
        parsePublishProperties(propBuffer(twoByteProperty(PropertyIdentifier.topicAlias, 1), twoByteProperty(PropertyIdentifier.topicAlias, 2))),
      );
    });

    test('throws on duplicate payloadFormatIndicator / messageExpiryInterval / contentType / responseTopic / correlationData', () => {
      expectProtocolError(() =>
        parsePublishProperties(
          propBuffer(oneByteProperty(PropertyIdentifier.payloadFormatIndicator, 0), oneByteProperty(PropertyIdentifier.payloadFormatIndicator, 1)),
        ),
      );
      expectProtocolError(() =>
        parsePublishProperties(
          propBuffer(fourByteProperty(PropertyIdentifier.messageExpiryInterval, 10), fourByteProperty(PropertyIdentifier.messageExpiryInterval, 20)),
        ),
      );
      expectProtocolError(() =>
        parsePublishProperties(propBuffer(utf8Property(PropertyIdentifier.contentType, 'a'), utf8Property(PropertyIdentifier.contentType, 'b'))),
      );
      expectProtocolError(() =>
        parsePublishProperties(propBuffer(utf8Property(PropertyIdentifier.responseTopic, 'a'), utf8Property(PropertyIdentifier.responseTopic, 'b'))),
      );
      expectProtocolError(() =>
        parsePublishProperties(
          propBuffer(
            binaryProperty(PropertyIdentifier.correlationData, Buffer.from([1])),
            binaryProperty(PropertyIdentifier.correlationData, Buffer.from([2])),
          ),
        ),
      );
    });
  });

  describe('parseConnectWillProperties', () => {
    test('parses valid Will properties', () => {
      const corr = Buffer.from([9, 8, 7]);
      const buffer = propBuffer(
        fourByteProperty(PropertyIdentifier.willDelayInterval, 60),
        oneByteProperty(PropertyIdentifier.payloadFormatIndicator, 1),
        fourByteProperty(PropertyIdentifier.messageExpiryInterval, 300),
        utf8Property(PropertyIdentifier.contentType, 'text/html'),
        utf8Property(PropertyIdentifier.responseTopic, 'will/resp'),
        binaryProperty(PropertyIdentifier.correlationData, corr),
        [PropertyIdentifier.userProperty, ...encodeUTF8String('willKey'), ...encodeUTF8String('willVal')],
      );
      const props = parseConnectWillProperties(buffer);
      expect(props.willDelayInterval).toBe(60);
      expect(props.payloadFormatIndicator).toBe(1);
      expect(props.messageExpiryInterval).toBe(300);
      expect(props.contentType).toBe('text/html');
      expect(props.responseTopic).toBe('will/resp');
      expect(props.correlationData).toEqual(corr);
      expect(props.userProperty).toEqual({ willKey: 'willVal' });
    });

    test('throws on duplicate willDelayInterval', () => {
      const buffer = propBuffer(
        fourByteProperty(PropertyIdentifier.willDelayInterval, 10),
        fourByteProperty(PropertyIdentifier.willDelayInterval, 20),
      );
      expectProtocolError(() => parseConnectWillProperties(buffer));
    });
  });

  describe('parseSubscribeProperties', () => {
    test('parses single and multiple subscription identifiers', () => {
      const buffer = propBuffer(
        [PropertyIdentifier.subscriptionIdentifier, ...encodeVariableByteInteger(100)],
        [PropertyIdentifier.subscriptionIdentifier, ...encodeVariableByteInteger(200)],
        [PropertyIdentifier.userProperty, ...encodeUTF8String('subKey'), ...encodeUTF8String('subVal')],
      );
      const props = parseSubscribeProperties(buffer);
      expect(props.subscriptionIdentifier).toEqual([100, 200]);
      expect(props.userProperty).toEqual({ subKey: 'subVal' });
    });

    test('throws on subscription identifier of 0', () => {
      const buffer = propBuffer([PropertyIdentifier.subscriptionIdentifier, ...encodeVariableByteInteger(0)]);
      expectProtocolError(() => parseSubscribeProperties(buffer));
    });
  });

  describe('parseSubAckProperties', () => {
    test('parses reason string and user property', () => {
      const buffer = propBuffer(utf8Property(PropertyIdentifier.reasonString, 'SubAck reason'), [
        PropertyIdentifier.userProperty,
        ...encodeUTF8String('k'),
        ...encodeUTF8String('v'),
      ]);
      const props = parseSubAckProperties(buffer);
      expect(props.reasonString).toBe('SubAck reason');
      expect(props.userProperty).toEqual({ k: 'v' });
    });

    test('throws on duplicate reasonString', () => {
      const buffer = propBuffer(utf8Property(PropertyIdentifier.reasonString, 'reason1'), utf8Property(PropertyIdentifier.reasonString, 'reason2'));
      expectProtocolError(() => parseSubAckProperties(buffer));
    });
  });

  describe('parseUnsubscribeProperties and parseUnsubscribeAckProperties', () => {
    test('parses user property on UNSUBSCRIBE', () => {
      const buffer = propBuffer([PropertyIdentifier.userProperty, ...encodeUTF8String('unsubKey'), ...encodeUTF8String('unsubVal')]);
      const props = parseUnsubscribeProperties(buffer);
      expect(props.userProperty).toEqual({ unsubKey: 'unsubVal' });
    });

    test('parses multiple user properties on UNSUBACK', () => {
      const buffer = propBuffer(
        utf8Property(PropertyIdentifier.reasonString, 'UnsubAck reason'),
        [PropertyIdentifier.userProperty, ...encodeUTF8String('k1'), ...encodeUTF8String('v1')],
        [PropertyIdentifier.userProperty, ...encodeUTF8String('k2'), ...encodeUTF8String('v2')],
      );
      const props = parseUnsubscribeAckProperties(buffer);
      expect(props.reasonString).toBe('UnsubAck reason');
      expect(props.userProperty).toEqual({ k1: 'v1', k2: 'v2' });
    });
  });

  describe('parseDisconnectProperties', () => {
    test('parses valid DISCONNECT properties', () => {
      const buffer = propBuffer(
        fourByteProperty(PropertyIdentifier.sessionExpiryInterval, 60),
        utf8Property(PropertyIdentifier.serverReference, 'new.broker.com'),
        utf8Property(PropertyIdentifier.reasonString, 'Normal disconnect'),
        [PropertyIdentifier.userProperty, ...encodeUTF8String('bye'), ...encodeUTF8String('true')],
      );
      const props = parseDisconnectProperties(buffer);
      expect(props.sessionExpiryInterval).toBe(60);
      expect(props.serverReference).toBe('new.broker.com');
      expect(props.reasonString).toBe('Normal disconnect');
      expect(props.userProperty).toEqual({ bye: 'true' });
    });

    test('throws on duplicate serverReference', () => {
      const buffer = propBuffer(
        utf8Property(PropertyIdentifier.serverReference, 'broker1'),
        utf8Property(PropertyIdentifier.serverReference, 'broker2'),
      );
      expectProtocolError(() => parseDisconnectProperties(buffer));
    });
  });

  describe('parsePubAckProperties / parsePubRecProperties / parsePubRelProperties / parsePubCompProperties', () => {
    test('parses reasonString and userProperty on QoS control packets', () => {
      const buffer = propBuffer(utf8Property(PropertyIdentifier.reasonString, 'Handled'), [
        PropertyIdentifier.userProperty,
        ...encodeUTF8String('tag'),
        ...encodeUTF8String('123'),
      ]);
      expect(parsePubAckProperties(buffer)).toEqual({ reasonString: 'Handled', userProperty: { tag: '123' } });
      expect(parsePubRecProperties(buffer)).toEqual({ reasonString: 'Handled', userProperty: { tag: '123' } });
      expect(parsePubRelProperties(buffer)).toEqual({ reasonString: 'Handled', userProperty: { tag: '123' } });
      expect(parsePubCompProperties(buffer)).toEqual({ reasonString: 'Handled', userProperty: { tag: '123' } });
    });
  });

  describe('parseAuthProperties', () => {
    test('parses AUTH properties', () => {
      const buffer = propBuffer(
        utf8Property(PropertyIdentifier.authenticationMethod, 'SCRAM-SHA-256'),
        utf8Property(PropertyIdentifier.authenticationData, 'challenge'),
        utf8Property(PropertyIdentifier.reasonString, 'Continue'),
        [PropertyIdentifier.userProperty, ...encodeUTF8String('authStep'), ...encodeUTF8String('1')],
      );
      const props = parseAuthProperties(buffer);
      expect(props.authenticationMethod).toBe('SCRAM-SHA-256');
      expect(props.authenticationData).toBe('challenge');
      expect(props.reasonString).toBe('Continue');
      expect(props.userProperty).toEqual({ authStep: '1' });
    });

    test('throws on duplicate authenticationMethod', () => {
      const buffer = propBuffer(
        utf8Property(PropertyIdentifier.authenticationMethod, 'METHOD1'),
        utf8Property(PropertyIdentifier.authenticationMethod, 'METHOD2'),
      );
      expectProtocolError(() => parseAuthProperties(buffer));
    });
  });
});
