import { vi } from 'vitest';
import { DisconnectReasonCode } from '../exception';
import { IDisconnectData, IMqttOptions, IPublishData, PacketType, ProtocolVersion, QoSType } from '../interface';
import { MqttClient } from '../mqttClient';
import { ClientIdentifierManager, ClientPacketIdentifierManager, Manager, TSocket, TSubscribeData } from '../manager/manager';
import { MemoryManager } from '../manager/memoryManager';

/** Minimal concrete Manager for exercising shared base-class behavior. */
class TestManager extends Manager {
  readonly clientIdentifierManager = new ClientIdentifierManager();

  async isConnected(): Promise<boolean> {
    return false;
  }
  async connect(): Promise<void> {}
  clearConnect(): void {}
  async hasSession(): Promise<boolean> {
    return false;
  }
  async clearSubscribe(): Promise<void> {}
  async subscribe(): Promise<void> {}
  async unsubscribe(): Promise<void> {}
  async isSubscribe(): Promise<boolean> {
    return false;
  }
  async getSubscription(): Promise<TSubscribeData | undefined> {
    return undefined;
  }
  publish(): void {}
  async ping(): Promise<void> {}
  async addRetainMessage(): Promise<void> {}
  async deleteRetainMessage(): Promise<void> {}
  async getRetainMessage(): Promise<IPublishData | undefined> {
    return undefined;
  }
  async forEachRetainMessage(): Promise<void> {}
}

function createMockClient(clientIdentifier = 'client-1'): MqttClient {
  const mqttDefaultOptions: Required<IMqttOptions> = {
    protocolName: 'MQTT',
    protocolVersions: [3, 4, 5],
    automaticallyAssignedClientIdentifier: true,
    maximumQoS: QoSType.QoS2,
    retainAvailable: true,
    retainTTL: 30 * 60,
    maximumPacketSize: 1 << 20,
    topicAliasMaximum: 0xffff,
    wildcardSubscriptionAvailable: true,
    subscriptionIdentifierAvailable: true,
    sharedSubscriptionAvailable: false,
    sessionExpiryInterval: 0,
    receiveMaximum: 0xffff,
    serverKeepAlive: 0,
    qosRetryCount: 3,
    packetIdentifierTTL: 30 * 60,
    sendReasonMessage: true,
  };
  const socket = {
    end: vi.fn(),
    write: vi.fn(),
  } as unknown as TSocket;
  const memoryManager = new MemoryManager();
  const client = new MqttClient(socket, memoryManager, mqttDefaultOptions);
  client.clientIdentifier = clientIdentifier;
  client.connData = {
    header: {
      packetType: PacketType.RESERVED,
      packetFlags: 0,
      remainingLength: 0,
      protocolName: '',
      protocolVersion: ProtocolVersion.V5,
      keepAlive: 60,
    },
    connectFlags: {} as any,
    properties: {},
    payload: {
      clientIdentifier: '',
    },
  };
  return client;
}

describe('ClientIdentifierManager', () => {
  let manager: ClientIdentifierManager;
  let client: MqttClient;

  beforeEach(() => {
    manager = new ClientIdentifierManager();
    client = createMockClient('id-a');
  });

  test('starts empty', () => {
    expect(manager.size).toBe(0);
    expect(manager.has('id-a')).toBe(false);
    expect(manager.getClient('id-a')).toBeUndefined();
    expect(manager.geTSocket('id-a')).toBeUndefined();
  });

  test('set / getClient / geTSocket / has', () => {
    manager.set('id-a', client);
    expect(manager.has('id-a')).toBe(true);
    expect(manager.size).toBe(1);
    expect(manager.getClient('id-a')).toBe(client);
    expect(manager.geTSocket('id-a')).toBe(client.socket);
  });

  test('delete removes entry and returns whether it existed', () => {
    manager.set('id-a', client);
    expect(manager.delete('id-a')).toBe(true);
    expect(manager.has('id-a')).toBe(false);
    expect(manager.delete('id-a')).toBe(false);
  });

  test('clear removes all entries', () => {
    manager.set('id-a', client);
    manager.set('id-b', createMockClient('id-b'));
    manager.clear();
    expect(manager.size).toBe(0);
  });

  test('clientKeys / identifierKeys / clientValues / clientForEach', () => {
    const clientB = createMockClient('id-b');
    manager.set('id-a', client);
    manager.set('id-b', clientB);

    expect([...manager.clientKeys()]).toEqual(['id-a', 'id-b']);
    expect([...manager.identifierKeys()]).toEqual(['id-a', 'id-b']);
    expect([...manager.clientValues()]).toEqual([client, clientB]);

    const seen: Array<[string, MqttClient]> = [];
    manager.clientForEach((value, key) => {
      seen.push([key, value]);
    });
    expect(seen).toEqual([
      ['id-a', client],
      ['id-b', clientB],
    ]);
  });
});

describe('ClientPacketIdentifierManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('newPacketIdentifier allocates increasing ids in 1..0xffff and stores expiry', () => {
    const mgr = new ClientPacketIdentifierManager(30);
    const now = Date.now();
    vi.setSystemTime(now);

    // ++dynamicId & 0xffff, falling back to 1 when the mask yields 0
    expect(mgr.newPacketIdentifier()).toBe(1);
    expect(mgr.newPacketIdentifier()).toBe(2);
    expect(mgr.newPacketIdentifier()).toBe(3);

    expect(mgr.get(1)).toBe(now + 30_000);
    expect(mgr.get(2)).toBe(now + 30_000);
    expect(mgr.get(3)).toBe(now + 30_000);
  });

  test('newPacketIdentifier stays within 1..0xffff and never returns 0', () => {
    const mgr = new ClientPacketIdentifierManager(30);
    const ids = Array.from({ length: 128 }, () => mgr.newPacketIdentifier());

    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(0xffff);
    }
    expect(ids).toEqual(Array.from({ length: 128 }, (_, i) => i + 1));
  });

  test('newPacketIdentifier wraps from 0xffff back to 1', () => {
    const mgr = new ClientPacketIdentifierManager(30);
    let id = 0;
    for (let i = 0; i < 0xffff; i++) {
      id = mgr.newPacketIdentifier();
    }
    expect(id).toBe(0xffff);
    expect(mgr.newPacketIdentifier()).toBe(1);
    expect(mgr.newPacketIdentifier()).toBe(2);
  });

  test('newPacketIdentifier resumes from 1 after dynamicId is set to 0xfffe', () => {
    const mgr = new ClientPacketIdentifierManager(30);
    (mgr as unknown as { dynamicId: number }).dynamicId = 0xfffe;

    const id1 = mgr.newPacketIdentifier();
    const id2 = mgr.newPacketIdentifier();

    // 0xfffe → 0xffff, then mask yields 0 and falls back to 1
    expect(id1).toBe(0xffff);
    expect(id2).toBe(1);
  });

  test('clearExpiredIdentifiers removes only expired entries', () => {
    const mgr = new ClientPacketIdentifierManager(1);
    const now = Date.now();
    vi.setSystemTime(now);

    const idExpired = mgr.newPacketIdentifier(); // 1
    expect(idExpired).toBe(1);

    vi.setSystemTime(now + 500);
    const idAlive = mgr.newPacketIdentifier(); // 2
    expect(idAlive).toBe(2);

    // id 1 expired at now+1000; id 2 expires at now+500+1000
    vi.setSystemTime(now + 1_100);
    mgr.clearExpiredIdentifiers();

    expect(mgr.has(idExpired)).toBe(false);
    expect(mgr.has(idAlive)).toBe(true);
  });
});

describe('Manager', () => {
  let manager: TestManager;
  let client: MqttClient;

  beforeEach(() => {
    manager = new TestManager();
    client = createMockClient('client-1');
  });

  afterEach(async () => {
    await manager.dispose();
  });

  describe('disconnect', () => {
    test('ends socket when given a MqttClient', () => {
      manager.disconnect(client);
      expect(client.socket.end).toHaveBeenCalledWith(Buffer.from([]));
    });

    test('ends socket when given a registered client id', () => {
      manager.clientIdentifierManager.set('client-1', client);
      manager.disconnect('client-1');
      expect(client.socket.end).toHaveBeenCalledTimes(1);
    });

    test('does nothing for unknown client id', () => {
      manager.disconnect('missing');
      expect(client.socket.end).not.toHaveBeenCalled();
    });

    test('encodes MQTT 5 DISCONNECT when data and protocol version are provided', () => {
      const disconnectData: IDisconnectData = {
        header: {
          packetType: PacketType.DISCONNECT,
          received: 0,
          reasonCode: DisconnectReasonCode.NormalDisconnection,
        },
        properties: {},
      };
      manager.disconnect(client, disconnectData, ProtocolVersion.V5);
      const buf = (client.socket.end as ReturnType<typeof vi.fn>).mock.calls[0][0] as Buffer;
      expect(buf[0] >> 4).toBe(PacketType.DISCONNECT);
      expect(buf.length).toBeGreaterThan(1);
    });
  });

  describe('dispose', () => {
    test('default dispose resolves without error', async () => {
      await expect(manager.dispose()).resolves.toBeUndefined();
    });
  });
});
