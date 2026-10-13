import { vi } from 'vitest';
import { IConnectData, IPublishData, PacketType, ProtocolVersion, QoSType, type IMqttOptions } from '../interface';
import { ClientIdentifierManager, Manager, TSocket, TSubscribeData } from '../manager/manager';
import { MqttClient } from '../mqttClient';

/** Delay between resends, matching `ClientQosRetry`. */
const RETRY_INTERVAL_MS = 5000;
/** Resend budget, matching `ClientQosRetry`. The original send is not counted. */
const RETRY_COUNT = 3;

/** Minimal concrete Manager so {@link MqttClient} can be constructed. */
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

function createClient(options?: Partial<IMqttOptions>) {
  const write = vi.fn();
  const socket = { write, end: vi.fn() } as unknown as TSocket;
  const manager = new TestManager();
  const mergedOptions = {
    packetIdentifierTTL: 60,
    receiveMaximum: 0xffff,
    protocolVersions: [ProtocolVersion.V5],
    ...options,
  } as Required<IMqttOptions>;
  const client = new MqttClient(socket, manager, mergedOptions);
  client.packetIdentifierManager.receiveMaximum = mergedOptions.receiveMaximum;
  return { client, write, manager };
}

describe('ClientQosRetry', () => {
  let client: MqttClient;
  let write: ReturnType<typeof vi.fn>;
  let manager: TestManager;

  beforeEach(() => {
    vi.useFakeTimers();
    ({ client, write, manager } = createClient());
  });

  afterEach(async () => {
    await manager.dispose();
    vi.useRealTimers();
  });

  test('does not resend before the retry interval', async () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.qosRetry.registerPendingPacket(client, id, Buffer.from([0x32, 0x00]));

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS - 1);

    expect(write).not.toHaveBeenCalled();
    expect(client.packetIdentifierManager.has(id)).toBe(true);
  });

  test('resends the stored frame bytes after the interval', async () => {
    const packet = Buffer.from([0x32, 0x07, 0x00, 0x01]);
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.qosRetry.registerPendingPacket(client, id, packet);

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(packet);
    expect(write.mock.calls[0][0][0]).toBe(0x3a); // 0x32 | 0x08 (DUP flag bit 3)
    expect(client.packetIdentifierManager.has(id)).toBe(true);
  });

  test('abandons the frame after the retry budget and releases the packet identifier', async () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.qosRetry.registerPendingPacket(client, id, Buffer.from([0x32, 0x00]));

    for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      expect(write).toHaveBeenCalledTimes(attempt);
    }

    expect(client.packetIdentifierManager.has(id)).toBe(false);

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);
    expect(write).toHaveBeenCalledTimes(RETRY_COUNT);
  });

  test('clearPendingPacket cancels the timer and releases the identifier', async () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.qosRetry.registerPendingPacket(client, id, Buffer.from([0x32, 0x00]));

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);
    expect(write).toHaveBeenCalledTimes(2);

    client.qosRetry.clearPendingPacket(client, id);
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);

    expect(write).toHaveBeenCalledTimes(2);
    expect(client.packetIdentifierManager.has(id)).toBe(false);
  });

  test('clearPendingPacket releases an identifier that has no retry entry', () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();

    client.qosRetry.clearPendingPacket(client, id);

    expect(client.packetIdentifierManager.has(id)).toBe(false);
  });

  test('clearPendingClient cancels every pending resend', async () => {
    const id1 = client.packetIdentifierManager.newPacketIdentifier();
    const id2 = client.packetIdentifierManager.newPacketIdentifier();
    client.qosRetry.registerPendingPacket(client, id1, Buffer.from([0x32, 0x01]));
    client.qosRetry.registerPendingPacket(client, id2, Buffer.from([0x32, 0x02]));

    client.qosRetry.clearPendingClient(client);
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * RETRY_COUNT);

    expect(write).not.toHaveBeenCalled();
    expect(client.packetIdentifierManager.has(id1)).toBe(false);
    expect(client.packetIdentifierManager.has(id2)).toBe(false);
  });

  test('clearPendingClient does nothing when no frame is pending', () => {
    expect(() => client.qosRetry.clearPendingClient(client)).not.toThrow();
  });

  test('drops a registration when the packet identifier is not allocated', async () => {
    client.qosRetry.registerPendingPacket(client, 42, Buffer.from([0x32, 0x00]));

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(write).not.toHaveBeenCalled();
    expect(client.packetIdentifierManager.has(42)).toBe(false);
  });

  test('scheduleRetry does nothing when the id was never registered', async () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();

    client.qosRetry.scheduleRetry(client, id);
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(write).not.toHaveBeenCalled();
    expect(client.packetIdentifierManager.has(id)).toBe(true);
  });

  test('writes the in-flight resend once, then stops if the identifier was released', async () => {
    const packet = Buffer.from([0x62, 0x02]);
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.qosRetry.registerPendingPacket(client, id, packet);
    client.packetIdentifierManager.delete(id);

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(packet);

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);
    expect(write).toHaveBeenCalledTimes(1);
  });

  test('retries distinct packet identifiers independently', async () => {
    const packet1 = Buffer.from([0x32, 0x01]);
    const packet2 = Buffer.from([0x32, 0x02]);
    const id1 = client.packetIdentifierManager.newPacketIdentifier();
    const id2 = client.packetIdentifierManager.newPacketIdentifier();
    client.qosRetry.registerPendingPacket(client, id1, packet1);
    client.qosRetry.registerPendingPacket(client, id2, packet2);

    client.qosRetry.clearPendingPacket(client, id1);
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(packet2);
    expect(client.packetIdentifierManager.has(id1)).toBe(false);
    expect(client.packetIdentifierManager.has(id2)).toBe(true);
  });

  test('pubAckHandle clears pending retry packet', async () => {
    const packet = Buffer.from([0x32, 0x07, 0x00, 0x01]);
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.qosRetry.registerPendingPacket(client, id, packet);

    await client.pubAckHandle({
      header: { packetIdentifier: id } as any,
      properties: {},
    });

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);
    expect(write).not.toHaveBeenCalled();
    expect(client.packetIdentifierManager.has(id)).toBe(false);
  });

  test('pubRecHandle clears pending retry packet', async () => {
    const packet = Buffer.from([0x32, 0x07, 0x00, 0x01]);
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.qosRetry.registerPendingPacket(client, id, packet);

    await client.pubRecHandle({
      header: { packetIdentifier: id } as any,
      properties: {},
    });

    // handlePubRel writes PUBREL
    expect(write).toHaveBeenCalledTimes(1);
    write.mockClear();

    // After retry interval, original PUBLISH retry should not fire
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);
    expect(write).not.toHaveBeenCalled();
    // In QoS 2, packet identifier must not be released until PUBCOMP
    expect(client.packetIdentifierManager.has(id)).toBe(true);
  });

  test('pubCompHandle releases packet identifier', async () => {
    const packet = Buffer.from([0x32, 0x07, 0x00, 0x01]);
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.qosRetry.registerPendingPacket(client, id, packet);

    await client.pubRecHandle({
      header: { packetIdentifier: id } as any,
      properties: {},
    });

    expect(client.packetIdentifierManager.has(id)).toBe(true);

    await client.pubCompHandle({
      header: { packetIdentifier: id } as any,
      properties: {},
    });

    expect(client.packetIdentifierManager.has(id)).toBe(false);
  });

  describe('flow control & handlePublish retry integration', () => {
    test('handlePublish registers retry when send quota is available and resends on timer', async () => {
      client.packetIdentifierManager.receiveMaximum = 10;
      const pubData: IPublishData = {
        header: {
          packetType: PacketType.PUBLISH,
          dupFlag: false,
          qosLevel: QoSType.QoS1,
          retain: false,
          topicName: 'test/topic',
        },
        properties: {},
        payload: 'hello',
      };

      await client.handlePublish(pubData);

      expect(pubData.header.packetIdentifier).toBe(10);
      expect(write).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      expect(write).toHaveBeenCalledTimes(2);
      expect(write.mock.calls[1][0][0]).toBe(0x32 | 0x08); // DUP flag set
      expect(client.packetIdentifierManager.has(10)).toBe(true);
    });

    test('handlePublish downgrades to QoS 0 and skips retry registration when send quota is 0', async () => {
      client.packetIdentifierManager.receiveMaximum = 0;
      const pubData: IPublishData = {
        header: {
          packetType: PacketType.PUBLISH,
          dupFlag: false,
          qosLevel: QoSType.QoS1,
          retain: false,
          topicName: 'test/topic',
        },
        properties: {},
        payload: 'hello',
      };

      await client.handlePublish(pubData);

      // [MQTT-4.9.0-2] packetIdentifier reaches 0 -> downgraded to QoS0
      expect(pubData.header.packetIdentifier).toBe(0);
      expect(pubData.header.qosLevel).toBe(QoSType.QoS0);
      expect(write).toHaveBeenCalledTimes(1);

      // Advancing retry interval should NOT trigger any resend
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);
      expect(write).toHaveBeenCalledTimes(1);
    });

    test('connectHandle sets packetIdentifierManager receiveMaximum from CONNECT properties', async () => {
      const connData: IConnectData = {
        header: {
          packetType: PacketType.CONNECT,
          packetFlags: 0,
          remainingLength: 0,
          protocolName: 'MQTT',
          protocolVersion: ProtocolVersion.V5,
          keepAlive: 60,
        },
        connectFlags: {
          cleanStart: true,
          willFlag: false,
          willQoS: QoSType.QoS0,
          willRetain: false,
          password: false,
          username: false,
          reserved: false,
        },
        properties: {
          receiveMaximum: 5,
        },
        payload: {
          clientIdentifier: 'client-test',
        },
      };

      await client.connectHandle(connData);
      expect(client.packetIdentifierManager.newPacketIdentifier()).toBe(5);
      expect(client.packetIdentifierManager.newPacketIdentifier()).toBe(4);
    });

    test('connectHandle falls back to options.receiveMaximum when property is absent', async () => {
      const connData: IConnectData = {
        header: {
          packetType: PacketType.CONNECT,
          packetFlags: 0,
          remainingLength: 0,
          protocolName: 'MQTT',
          protocolVersion: ProtocolVersion.V5,
          keepAlive: 60,
        },
        connectFlags: {
          cleanStart: true,
          willFlag: false,
          willQoS: QoSType.QoS0,
          willRetain: false,
          password: false,
          username: false,
          reserved: false,
        },
        properties: {},
        payload: {
          clientIdentifier: 'client-test',
        },
      };

      await client.connectHandle(connData);
      expect(client.packetIdentifierManager.newPacketIdentifier()).toBe(0xffff);
    });
  });
});
