import { vi } from 'vitest';
import { IConnectData, IPublishData, PacketType, ProtocolVersion, QoSType, type IMqttOptions } from '../interface';
import { ClientIdentifierManager, Manager, TSocket, TMqttClientEmitAsync, TSubscribeData } from '../manager/manager';
import { MqttClient } from '../mqttClient';

/** Delay between resends, matching `QosRetry`. */
const RETRY_INTERVAL_MS = 5000;
/** Resend budget, matching `QosRetry`. The original send is not counted. */
const RETRY_COUNT = 3;

/** Minimal concrete Manager so {@link MqttClient} can be constructed. Records fan-out for assertions. */
class TestManager extends Manager {
  readonly clientIdentifierManager = new ClientIdentifierManager();
  /** Every publish handed to the manager, in delivery order. */
  readonly published: IPublishData[] = [];

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
  publish(_clientIdentifier: string, _topic: string, pubData: IPublishData): void {
    this.published.push(pubData);
  }
  async ping(): Promise<void> {}
  async addRetainMessage(): Promise<void> {}
  async deleteRetainMessage(): Promise<void> {}
  async getRetainMessage(): Promise<IPublishData | undefined> {
    return undefined;
  }
  async forEachRetainMessage(): Promise<void> {}
}

/** `emitAsync` stub that accepts every packet. */
const acceptEmitAsync: TMqttClientEmitAsync = async () => true;

function createClient(options?: Partial<IMqttOptions>) {
  const write = vi.fn();
  const socket = { write, end: vi.fn() } as unknown as TSocket;
  const manager = new TestManager();
  const mergedOptions = {
    packetIdentifierTTL: 60,
    receiveMaximum: 0xffff,
    maximumQoS: QoSType.QoS2,
    qosRetryCount: RETRY_COUNT,
    protocolVersions: [ProtocolVersion.V5],
    ...options,
  } as Required<IMqttOptions>;
  const client = new MqttClient(socket, manager, mergedOptions);
  client.packetIdentifierManager.receiveMaximum = mergedOptions.receiveMaximum;
  // `handlePublish` refuses to write a frame whose Remaining Length exceeds the Remaining Length
  // recorded on the CONNECT packet, so the fixture carries a realistic one.
  // TODO [MQTT-3.1.2-24] That guard should look at the Maximum Packet Size this client advertised
  // in CONNECT (see the "Maximum Packet Size" suite below).
  client.connData.header.remainingLength = 1 << 20;
  return { client, write, manager };
}

/** Builds an inbound PUBLISH of the given QoS (defaults to identifier 7). */
function inboundPublish(qosLevel: QoSType.QoS1 | QoSType.QoS2, packetIdentifier = 7): IPublishData {
  return {
    header: {
      packetType: PacketType.PUBLISH,
      dupFlag: true,
      qosLevel,
      retain: false,
      topicName: 'in/topic',
      packetIdentifier,
    },
    properties: {},
    payload: Buffer.from('hello'),
  };
}

/** Builds an outbound PUBLISH to be handed to {@link MqttClient.handlePublish}. */
function outboundPublish(qosLevel: QoSType.QoS1 | QoSType.QoS2 = QoSType.QoS1): IPublishData {
  return {
    header: {
      packetType: PacketType.PUBLISH,
      dupFlag: false,
      qosLevel,
      retain: false,
      topicName: 'test/topic',
    },
    properties: {},
    payload: Buffer.from('hello'),
  };
}

/** A QoS 2 PUBREL frame: reserved flags 0x02, packet identifier 0x0007. */
const pubRelFrame = () => Buffer.from([0x62, 0x02, 0x00, 0x07]);

describe('QosRetry', () => {
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
    client.publishQosRetry.registerPendingPacket(client, id, Buffer.from([0x32, 0x00]));

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS - 1);

    expect(write).not.toHaveBeenCalled();
    expect(client.packetIdentifierManager.has(id)).toBe(true);
  });

  test('resends the stored frame bytes after the interval', async () => {
    const packet = Buffer.from([0x32, 0x07, 0x00, 0x01]);
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.publishQosRetry.registerPendingPacket(client, id, packet);

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(packet);
    expect(write.mock.calls[0][0][0]).toBe(0x3a); // [MQTT-3.3.1-1] 0x32 | 0x08 (DUP)
    expect(client.packetIdentifierManager.has(id)).toBe(true);
  });

  test('applies the DUP bit to frames that do not define one (PUBREL 0x62 -> 0x6a)', async () => {
    // TODO [MQTT-3.6.1-1] The resend marks every frame with DUP, so PUBREL loses its reserved
    // flags 0x02 and PUBREC (0x50) is rewritten as 0x58. Only PUBLISH defines a DUP flag; this
    // expectation has to become 0x62 once the resend masks the packet type.
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.publishQosRetry.registerPendingPacket(client, id, pubRelFrame());

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(write.mock.calls[0][0][0]).toBe(0x6a);
  });

  test('resends up to the retry budget, then abandons the frame on the following interval', async () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.publishQosRetry.registerPendingPacket(client, id, Buffer.from([0x32, 0x00]), true);

    for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      expect(write).toHaveBeenCalledTimes(attempt);
      // The identifier is only freed by the tick that gives up, not by the last resend.
      expect(client.packetIdentifierManager.has(id)).toBe(true);
    }

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(write).toHaveBeenCalledTimes(RETRY_COUNT);
    expect(client.packetIdentifierManager.has(id)).toBe(false);

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 3);
    expect(write).toHaveBeenCalledTimes(RETRY_COUNT);
  });

  test('leaves the identifier allocated when an abandoned frame did not opt into releasing it', async () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.publishQosRetry.registerPendingPacket(client, id, Buffer.from([0x32, 0x00]));

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * (RETRY_COUNT + 1));

    expect(write).toHaveBeenCalledTimes(RETRY_COUNT);
    // TODO Nothing frees the identifier now that no retry will run again: it stays in the outbound
    // allocator until its TTL expires, shrinking the send quota for the rest of the connection.
    expect(client.packetIdentifierManager.has(id)).toBe(true);
  });

  test('the resend budget is the class constant, not options.qosRetryCount', async () => {
    const { client: customClient, write: customWrite, manager: customManager } = createClient({ qosRetryCount: 1 });
    const id = customClient.packetIdentifierManager.newPacketIdentifier();
    customClient.publishQosRetry.registerPendingPacket(customClient, id, Buffer.from([0x32, 0x00]), true);

    // TODO `options.qosRetryCount` is never read by `QosRetry`, so the fixed budget of 3 applies.
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    expect(customWrite).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);
    expect(customWrite).toHaveBeenCalledTimes(RETRY_COUNT);

    await customManager.dispose();
  });

  test('clearPendingPacket cancels the timer and releases the identifier when asked', async () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.publishQosRetry.registerPendingPacket(client, id, Buffer.from([0x32, 0x00]));

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);
    expect(write).toHaveBeenCalledTimes(2);

    client.publishQosRetry.clearPendingPacket(client, id, true);
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);

    expect(write).toHaveBeenCalledTimes(2);
    expect(client.packetIdentifierManager.has(id)).toBe(false);
  });

  test('clearPendingPacket keeps the identifier allocated by default', async () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.publishQosRetry.registerPendingPacket(client, id, Buffer.from([0x32, 0x00]));

    client.publishQosRetry.clearPendingPacket(client, id);

    expect(client.packetIdentifierManager.has(id)).toBe(true);
  });

  test('clearPendingPacket releases an identifier that has no retry entry', () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();

    client.publishQosRetry.clearPendingPacket(client, id, true);

    expect(client.packetIdentifierManager.has(id)).toBe(false);
  });

  test('clearPendingClient cancels every pending resend', async () => {
    const id1 = client.packetIdentifierManager.newPacketIdentifier();
    const id2 = client.packetIdentifierManager.newPacketIdentifier();
    client.publishQosRetry.registerPendingPacket(client, id1, Buffer.from([0x32, 0x01]));
    client.publishQosRetry.registerPendingPacket(client, id2, Buffer.from([0x32, 0x02]));

    client.publishQosRetry.clearPendingClient(client);
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * RETRY_COUNT);

    expect(write).not.toHaveBeenCalled();
  });

  test('clearPendingClient does nothing when no frame is pending', () => {
    expect(() => client.publishQosRetry.clearPendingClient(client)).not.toThrow();
  });

  test('retries an identifier that packetIdentifierManager does not track', async () => {
    // The PUBREC leg of an inbound QoS 2 handshake uses the identifier the client picked, which
    // never went through the server's outbound allocator.
    const packet = Buffer.from([0x50, 0x02, 0x00, 0x2a]);
    client.receiveQos2Retry.registerPendingPacket(client, 42, packet);

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(packet);
    expect(client.packetIdentifierManager.has(42)).toBe(false);
  });

  test('scheduleRetry starts a retry for an identifier with no stored frame', async () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();

    // TODO `scheduleRetry` is the only entry point that creates an entry from `packet`; it never
    // checks the allocator, so arming a retry for an identifier that was already acked, released,
    // or cleared brings its frame back.
    client.publishQosRetry.scheduleRetry(client, id, Buffer.from([0x32, 0x00]));
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(write).toHaveBeenCalledTimes(1);
  });

  test('scheduleRetry called directly never reaches the retry limit', async () => {
    const id = client.packetIdentifierManager.newPacketIdentifier();

    // TODO Only `registerPendingPacket` stores the entry in `qosRetryMap`; a directly armed retry
    // is invisible to its own recursion, so every tick builds a fresh entry with `attempts = 0`
    // and the frame is resent forever.
    client.publishQosRetry.scheduleRetry(client, id, Buffer.from([0x32, 0x00]));

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 10);

    expect(write).toHaveBeenCalledTimes(10);
    expect(client.packetIdentifierManager.has(id)).toBe(true);
  });

  test('retries distinct packet identifiers independently', async () => {
    const packet1 = Buffer.from([0x32, 0x01]);
    const packet2 = Buffer.from([0x32, 0x02]);
    const id1 = client.packetIdentifierManager.newPacketIdentifier();
    const id2 = client.packetIdentifierManager.newPacketIdentifier();
    client.publishQosRetry.registerPendingPacket(client, id1, packet1);
    client.publishQosRetry.registerPendingPacket(client, id2, packet2);

    client.publishQosRetry.clearPendingPacket(client, id1, true);
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);

    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toBe(packet2);
    expect(client.packetIdentifierManager.has(id1)).toBe(false);
    expect(client.packetIdentifierManager.has(id2)).toBe(true);
  });

  test('pubAckHandle clears pending retry packet and releases the identifier', async () => {
    const packet = Buffer.from([0x32, 0x07, 0x00, 0x01]);
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.publishQosRetry.registerPendingPacket(client, id, packet, true);

    await client.pubAckHandle({
      header: { packetIdentifier: id } as any,
      properties: {},
    });

    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);
    expect(write).not.toHaveBeenCalled();
    expect(client.packetIdentifierManager.has(id)).toBe(false);
  });

  test('pubRecHandle keeps resending the PUBREL leg instead of the PUBLISH', async () => {
    const packet = Buffer.from([0x32, 0x07, 0x00, 0x01]);
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.publishQosRetry.registerPendingPacket(client, id, packet, true);

    await client.pubRecHandle({
      header: { packetIdentifier: id } as any,
      properties: {},
    });

    // handlePubRel writes the PUBREL for this leg
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0][0]).toBe(0x62);
    write.mockClear();

    // [MQTT-4.3.3-6] The PUBLISH must never be re-sent once the PUBREL went out: the retry
    // repeats the PUBREL. TODO the DUP mask currently rewrites its flags (0x6a), so only the
    // packet type is asserted here.
    await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0][0] & 0xf0).toBe(0x60);
    expect(write.mock.calls[0][0][0]).not.toBe(0x32);
    // In QoS 2, packet identifier must not be released until PUBCOMP
    expect(client.packetIdentifierManager.has(id)).toBe(true);
  });

  test('pubCompHandle releases packet identifier', async () => {
    const packet = Buffer.from([0x32, 0x07, 0x00, 0x01]);
    const id = client.packetIdentifierManager.newPacketIdentifier();
    client.publishQosRetry.registerPendingPacket(client, id, packet, true);

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

  describe('inbound QoS 2 handshake', () => {
    test('handlePubRec arms a PUBREC resend that pubRelHandle cancels', async () => {
      await client.publishHandle(inboundPublish(QoSType.QoS2, 9), acceptEmitAsync);

      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0][0][0]).toBe(0x50); // PUBREC
      expect(client.receiveCounter).toBe(1);

      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS);
      expect(write).toHaveBeenCalledTimes(2);
      // TODO the DUP mask makes this 0x58; only the packet type is asserted here.
      expect(write.mock.calls[1][0][0] & 0xf0).toBe(0x50);

      await client.pubRelHandle({
        header: { packetType: PacketType.PUBREL, received: 0x00, packetIdentifier: 9, reasonCode: 0x00 },
        properties: {},
      });
      write.mockClear();

      expect(client.receiveCounter).toBe(0);
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);
      expect(write).not.toHaveBeenCalled();
    });

    test('the same identifier is delivered again after PUBREL closed the handshake', async () => {
      await client.publishHandle(inboundPublish(QoSType.QoS2, 13), acceptEmitAsync);
      await client.pubRelHandle({
        header: { packetType: PacketType.PUBREL, received: 0x00, packetIdentifier: 13, reasonCode: 0x00 },
        properties: {},
      });

      await client.publishHandle(inboundPublish(QoSType.QoS2, 13), acceptEmitAsync);

      expect(manager.published).toHaveLength(2);
      expect(client.receiveCounter).toBe(1);
    });

    test('a QoS 2 PUBLISH repeated before PUBREL is delivered a second time', async () => {
      // TODO [MQTT-4.3.3-2] The duplicate should only be answered with PUBREC again; the inbound
      // de-duplication set was removed with the session-recovery refactor, so the message is
      // fanned out twice and the extra Receive Maximum slot is never returned.
      await client.publishHandle(inboundPublish(QoSType.QoS2, 11), acceptEmitAsync);
      await client.publishHandle(inboundPublish(QoSType.QoS2, 11), acceptEmitAsync);

      expect(manager.published).toHaveLength(2);
      expect(client.receiveCounter).toBe(2);

      await client.pubRelHandle({
        header: { packetType: PacketType.PUBREL, received: 0x00, packetIdentifier: 11, reasonCode: 0x00 },
        properties: {},
      });
      expect(client.receiveCounter).toBe(1);
    });
  });

  describe('flow control & handlePublish retry integration', () => {
    test('handlePublish registers retry when send quota is available and resends on timer', async () => {
      client.packetIdentifierManager.receiveMaximum = 10;
      const pubData = outboundPublish();

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
      const pubData = outboundPublish();

      await client.handlePublish(pubData);

      // [MQTT-4.9.0-2] packetIdentifier reaches 0 -> downgraded to QoS0
      expect(pubData.header.packetIdentifier).toBe(0);
      expect(pubData.header.qosLevel).toBe(QoSType.QoS0);
      expect(write).toHaveBeenCalledTimes(1);

      // Advancing retry interval should NOT trigger any resend
      await vi.advanceTimersByTimeAsync(RETRY_INTERVAL_MS * 2);
      expect(write).toHaveBeenCalledTimes(1);
    });

    test('handlePublish sends a packet that fits the size limit carried by the CONNECT', async () => {
      const pubData = outboundPublish();
      client.connData.header.remainingLength = 1 << 20;

      await client.handlePublish(pubData);

      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0][0].length).toBeLessThanOrEqual(1 << 20);
    });

    test('handlePublish drops a packet larger than the size limit carried by the CONNECT', async () => {
      client.connData.header.remainingLength = 4;

      await client.handlePublish(outboundPublish());

      // TODO [MQTT-3.1.2-24] The limit compared here is the Remaining Length of the inbound
      // CONNECT packet rather than the Maximum Packet Size this client advertised, so a normal
      // QoS 1 publish is dropped whenever the CONNECT was smaller than it.
      expect(write).not.toHaveBeenCalled();
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
