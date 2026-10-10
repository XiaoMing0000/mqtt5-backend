import {
  ConnectAckException,
  DisconnectException,
  SubscribeAckException,
  PubAckException,
  PubRecException,
  PubRelException,
  PubCompException,
  AuthenticateException,
  ConnectAckReasonCode,
  DisconnectReasonCode,
  SubscribeAckReasonCode,
  PubAckReasonCode,
  PubRecReasonCode,
  PubRelReasonCode,
  PubCompReasonCode,
  AuthenticateReasonCode,
} from '../exception';

describe('exception', () => {
  describe('ConnectAckException', () => {
    test('should create instance with default code', () => {
      const error = new ConnectAckException(ConnectAckReasonCode.UnspecifiedError, 'Connection error');
      expect(error).toBeInstanceOf(ConnectAckException);
      expect(error).toBeInstanceOf(ConnectAckException);
      expect(error.msg).toBe('Connection error');
      expect(error.code).toBe(ConnectAckReasonCode.UnspecifiedError);
    });

    test.each([
      ['Bad credentials', ConnectAckReasonCode.BadUserNameOrPassword],
      ['Protocol error', ConnectAckReasonCode.ProtocolError],
      ['Server unavailable', ConnectAckReasonCode.ServerUnavailable],
    ])('should create instance with message "%s" and code %s', (message, code) => {
      const error = new ConnectAckException(code, message);
      expect(error.msg).toBe(message);
      expect(error.code).toBe(code);
    });
  });

  describe('DisconnectException', () => {
    test('should create instance with default code', () => {
      const error = new DisconnectException(DisconnectReasonCode.UnspecifiedError, 'Disconnect error');
      expect(error).toBeInstanceOf(DisconnectException);
      expect(error).toBeInstanceOf(DisconnectException);
      expect(error.msg).toBe('Disconnect error');
      expect(error.code).toBe(DisconnectReasonCode.UnspecifiedError);
    });

    test.each([
      ['Normal disconnection', DisconnectReasonCode.NormalDisconnection],
      ['Protocol error', DisconnectReasonCode.ProtocolError],
      ['Topic filter invalid', DisconnectReasonCode.TopicFilterInvalid],
      ['Server shutting down', DisconnectReasonCode.ServerShuttingDown],
    ])('should create instance with message "%s" and code %s', (message, code) => {
      const error = new DisconnectException(code, message);
      expect(error.msg).toBe(message);
      expect(error.code).toBe(code);
    });
  });

  describe('SubscribeAckException', () => {
    test('should create instance with default code', () => {
      const error = new SubscribeAckException(SubscribeAckReasonCode.UnspecifiedError, 'Subscribe error');
      expect(error).toBeInstanceOf(SubscribeAckException);
      expect(error).toBeInstanceOf(SubscribeAckException);
      expect(error.msg).toBe('Subscribe error');
      expect(error.code).toBe(SubscribeAckReasonCode.UnspecifiedError);
    });

    test.each([
      ['Topic filter invalid', SubscribeAckReasonCode.TopicFilterInvalid],
      ['Not authorized', SubscribeAckReasonCode.NotAuthorized],
      ['Quota exceeded', SubscribeAckReasonCode.QuotaExceeded],
      ['Wildcard not supported', SubscribeAckReasonCode.WildcardSubscriptionsNotSupported],
    ])('should create instance with message "%s" and code %s', (message, code) => {
      const error = new SubscribeAckException(code, message);
      expect(error.msg).toBe(message);
      expect(error.code).toBe(code);
    });
  });

  describe('PubAckException', () => {
    test('should create instance with default code', () => {
      const error = new PubAckException(PubAckReasonCode.UnspecifiedError, 'Publish error');
      expect(error).toBeInstanceOf(PubAckException);
      expect(error).toBeInstanceOf(PubAckException);
      expect(error.msg).toBe('Publish error');
      expect(error.code).toBe(PubAckReasonCode.UnspecifiedError);
    });

    test.each([
      ['Topic name invalid', PubAckReasonCode.TopicNameInvalid],
      ['No matching subscribers', PubAckReasonCode.NoMatchingSubscribers],
      ['Not authorized', PubAckReasonCode.NotAuthorized],
      ['Quota exceeded', PubAckReasonCode.QuotaExceeded],
    ])('should create instance with message "%s" and code %s', (message, code) => {
      const error = new PubAckException(code, message);
      expect(error.msg).toBe(message);
      expect(error.code).toBe(code);
    });
  });

  describe('PubRecException', () => {
    test('should create instance with default code', () => {
      const error = new PubRecException(PubRecReasonCode.UnspecifiedError, 'PubRec error');
      expect(error).toBeInstanceOf(PubRecException);
      expect(error).toBeInstanceOf(PubRecException);
      expect(error.msg).toBe('PubRec error');
      expect(error.code).toBe(PubRecReasonCode.UnspecifiedError);
    });

    test.each([
      ['Topic name invalid', PubRecReasonCode.TopicNameInvalid],
      ['No matching subscribers', PubRecReasonCode.NoMatchingSubscribers],
      ['Not authorized', PubRecReasonCode.NotAuthorized],
      ['Payload format invalid', PubRecReasonCode.PayloadFormatInvalid],
    ])('should create instance with message "%s" and code %s', (message, code) => {
      const error = new PubRecException(code, message);
      expect(error.msg).toBe(message);
      expect(error.code).toBe(code);
    });
  });

  describe('PubRelException', () => {
    test('should create instance with default code', () => {
      const error = new PubRelException(undefined, 'PubRel error');
      expect(error).toBeInstanceOf(PubRelException);
      expect(error).toBeInstanceOf(PubRelException);
      expect(error.msg).toBe('PubRel error');
      expect(error.code).toBe(PubRelReasonCode.PacketIdentifierNotFound);
    });

    test.each([
      ['Packet identifier not found', PubRelReasonCode.PacketIdentifierNotFound],
      ['Success', PubRelReasonCode.Success],
    ])('should create instance with message "%s" and code %s', (message, code) => {
      const error = new PubRelException(code, message);
      expect(error.msg).toBe(message);
      expect(error.code).toBe(code);
    });
  });

  describe('PubCompException', () => {
    test('should create instance with default code', () => {
      const error = new PubCompException(undefined, 'PubComp error');
      expect(error).toBeInstanceOf(PubCompException);
      expect(error).toBeInstanceOf(PubCompException);
      expect(error.msg).toBe('PubComp error');
      expect(error.code).toBe(PubCompReasonCode.PacketIdentifierNotFound);
    });

    test.each([
      ['Packet identifier not found', PubCompReasonCode.PacketIdentifierNotFound],
      ['Success', PubCompReasonCode.Success],
    ])('should create instance with message "%s" and code %s', (message, code) => {
      const error = new PubCompException(code, message);
      expect(error.msg).toBe(message);
      expect(error.code).toBe(code);
    });
  });

  describe('AuthenticateException', () => {
    test('should create instance with default code', () => {
      const error = new AuthenticateException(undefined, 'Auth error');
      expect(error).toBeInstanceOf(AuthenticateException);
      expect(error).toBeInstanceOf(AuthenticateException);
      expect(error.msg).toBe('Auth error');
      expect(error.code).toBe(AuthenticateReasonCode.ContinueAuthentication);
    });

    test.each([
      ['Continue authentication', AuthenticateReasonCode.ContinueAuthentication],
      ['Reauthenticate', AuthenticateReasonCode.Reauthenticate],
      ['Success', AuthenticateReasonCode.Success],
    ])('should create instance with message "%s" and code %s', (message, code) => {
      const error = new AuthenticateException(code, message);
      expect(error.msg).toBe(message);
      expect(error.code).toBe(code);
    });
  });

  describe('Exception inheritance', () => {
    test.each([
      [ConnectAckException, 'Connect error'],
      [DisconnectException, 'Disconnect error'],
      [SubscribeAckException, 'Subscribe error'],
      [PubAckException, 'PubAck error'],
      [PubRecException, 'PubRec error'],
      [PubRelException, 'PubRel error'],
      [PubCompException, 'PubComp error'],
      [AuthenticateException, 'Auth error'],
    ])('should be instance of MqttBasicException and Error', (ExceptionClass, message) => {
      const error = new ExceptionClass(undefined, message);
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ExceptionClass);
    });
  });

  describe('Exception error properties', () => {
    test('should have correct error properties', () => {
      const error = new ConnectAckException(ConnectAckReasonCode.ProtocolError, 'Test error');
      expect(error.name).toBe('Error');
      expect(error.msg).toBe('Test error');
      expect(error.code).toBe(ConnectAckReasonCode.ProtocolError);
    });

    test('should be throwable', () => {
      const error = new DisconnectException(DisconnectReasonCode.UnspecifiedError, 'Throwable error');
      expect(() => {
        throw error;
      }).toThrow(DisconnectException);
    });

    test('should preserve msg property when thrown', () => {
      const error = new PubAckException(PubAckReasonCode.UnspecifiedError, 'Error message');
      expect(() => {
        throw error;
      }).toThrow();
      expect(error.msg).toBe('Error message');
    });
  });
});
