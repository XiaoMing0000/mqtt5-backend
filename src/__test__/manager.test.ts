import { vi } from 'vitest';
import { DisconnectReasonCode } from '../exception';
import { IDisconnectData, IPublishData, PacketType, ProtocolVersion, QoSType } from '../interface';
import { MqttClient } from '../mqttClient';
import { ClientIdentifierManager, ClientPacketIdentifierManager, Manager, TSocket, TSubscribeData } from '../manager/manager';

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
  const socket = {
    end: vi.fn(),
    write: vi.fn(),
  } as unknown as TSocket;

  return {
    socket,
    clientIdentifier,
    packetIdentifierManager: new ClientPacketIdentifierManager(60),
  } as unknown as MqttClient;
}

/** Fixed header for PUBLISH QoS1 without DUP: type=3, qos=1 → 0x32 */
function makePublishPacket(withDup = false): Buffer {
  const flags = (PacketType.PUBLISH << 4) | (withDup ? 0x08 : 0) | (QoSType.QoS1 << 1);
  return Buffer.from([flags, 0x00]);
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
    vi.useFakeTimers();
    manager = new TestManager();
    client = createMockClient('client-1');
  });

  afterEach(() => {
    manager.clearPendingClient(client);
    vi.useRealTimers();
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

  describe('setQoSRetryCount', () => {
    test('accepts non-negative finite numbers and floors them', async () => {
      manager.setQoSRetryCount(2.9);
      manager.registerPendingPacket(client, 1, makePublishPacket(), 'publish');

      // attempts 1, 2 then end on the 3rd fire (attempts >= 2)
      await vi.advanceTimersByTimeAsync(5000);
      expect(client.socket.write).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(client.socket.write).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(5000);
      expect(client.socket.end).toHaveBeenCalled();
    });

    test('ignores invalid values', async () => {
      manager.setQoSRetryCount(1);
      manager.setQoSRetryCount(-1);
      manager.setQoSRetryCount(Number.NaN);
      manager.setQoSRetryCount(undefined);

      manager.registerPendingPacket(client, 1, makePublishPacket(), 'publish');
      await vi.advanceTimersByTimeAsync(5000);
      expect(client.socket.write).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(client.socket.end).toHaveBeenCalled();
    });
  });

  describe('pending QoS retry', () => {
    test('registerPendingPacket schedules retry and sets DUP on PUBLISH resend', async () => {
      const packet = makePublishPacket(false);
      manager.setQoSRetryCount(3);
      manager.registerPendingPacket(client, 7, packet, 'publish');

      await vi.advanceTimersByTimeAsync(5000);

      expect(client.socket.write).toHaveBeenCalledTimes(1);
      const resent = (client.socket.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as Buffer;
      expect(resent[0] & 0x08).toBe(0x08);
      expect(resent[0] >> 4).toBe(PacketType.PUBLISH);
    });

    test('does not set DUP when retrying pubrel', async () => {
      const pubrel = Buffer.from([(PacketType.PUBREL << 4) | 0x02, 0x00]);
      manager.setQoSRetryCount(3);
      manager.registerPendingPacket(client, 3, pubrel, 'pubrel');

      await vi.advanceTimersByTimeAsync(5000);

      const resent = (client.socket.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as Buffer;
      expect(resent[0] & 0x08).toBe(0);
      expect(resent[0] >> 4).toBe(PacketType.PUBREL);
    });

    test('promotePendingToPubRel replaces pending publish with pubrel', async () => {
      manager.setQoSRetryCount(3);
      manager.registerPendingPacket(client, 5, makePublishPacket(), 'publish');
      const pubrel = Buffer.from([(PacketType.PUBREL << 4) | 0x02, 0x00]);
      manager.promotePendingToPubRel(client, 5, pubrel);

      await vi.advanceTimersByTimeAsync(5000);
      const resent = (client.socket.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as Buffer;
      expect(resent[0] >> 4).toBe(PacketType.PUBREL);
    });

    test('clearPendingPacket cancels timer and removes entry', async () => {
      manager.registerPendingPacket(client, 9, makePublishPacket(), 'publish');
      manager.clearPendingPacket(client, 9);

      await vi.advanceTimersByTimeAsync(15_000);
      expect(client.socket.write).not.toHaveBeenCalled();
      expect(client.socket.end).not.toHaveBeenCalled();
    });

    test('clearPendingClient cancels all timers for the client', async () => {
      manager.registerPendingPacket(client, 1, makePublishPacket(), 'publish');
      manager.registerPendingPacket(client, 2, makePublishPacket(), 'publish');
      manager.clearPendingClient(client);

      await vi.advanceTimersByTimeAsync(15_000);
      expect(client.socket.write).not.toHaveBeenCalled();
    });

    test('clearPendingClient is a no-op when nothing is pending', () => {
      expect(() => manager.clearPendingClient(client)).not.toThrow();
    });

    test('re-registering the same packet id replaces the previous timer', async () => {
      manager.setQoSRetryCount(3);
      manager.registerPendingPacket(client, 1, makePublishPacket(), 'publish');
      await vi.advanceTimersByTimeAsync(2000);

      const newer = Buffer.from([(PacketType.PUBLISH << 4) | (QoSType.QoS1 << 1), 0x99]);
      manager.registerPendingPacket(client, 1, newer, 'publish');

      await vi.advanceTimersByTimeAsync(5000);
      expect(client.socket.write).toHaveBeenCalledTimes(1);
      const resent = (client.socket.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as Buffer;
      expect(resent[1]).toBe(0x99);
    });

    test('exhausting retries ends the socket and frees the packet identifier', async () => {
      manager.setQoSRetryCount(0);
      client.packetIdentifierManager.set(11, Date.now() + 60_000);
      manager.registerPendingPacket(client, 11, makePublishPacket(), 'publish');

      await vi.advanceTimersByTimeAsync(5000);

      expect(client.socket.write).not.toHaveBeenCalled();
      expect(client.socket.end).toHaveBeenCalled();
      expect(client.packetIdentifierManager.has(11)).toBe(false);
    });
  });

  describe('dispose', () => {
    test('default dispose resolves without error', async () => {
      await expect(manager.dispose()).resolves.toBeUndefined();
    });
  });
});
