import { afterEach, describe, expect, test, vi } from 'vitest';
import { IMqttOptions, IPublishData, PacketType, ProtocolVersion, QoSType } from '../interface';
import { type TSocket, type TSubscribeData } from '../manager/manager';
import { MemoryManager } from '../manager/memoryManager';
import { MqttClient } from '../mqttClient';
import { decodePacket } from '../packet';

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

interface ClientFixture {
  client: MqttClient;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

function createClient(manager: MemoryManager, id: string, sessionExpiryInterval = 0): ClientFixture {
  const write = vi.fn((_buf: Buffer) => true);
  const end = vi.fn();
  const socket = { write, end } as unknown as TSocket;
  const client = new MqttClient(socket, manager, mqttDefaultOptions);
  client.clientIdentifier = id;
  client.packetIdentifierManager.receiveMaximum = mqttDefaultOptions.receiveMaximum;
  client.connData = {
    header: {
      packetType: PacketType.RESERVED,
      packetFlags: 0,
      remainingLength: mqttDefaultOptions.maximumPacketSize,
      protocolName: '',
      protocolVersion: ProtocolVersion.V5,
      keepAlive: 60,
    },
    connectFlags: {} as any,
    properties: { sessionExpiryInterval },
    payload: { clientIdentifier: id },
  };
  return { client, write, end };
}

function sub(id: number, extra: Partial<TSubscribeData> = {}): TSubscribeData {
  return {
    qos: QoSType.QoS0,
    date: 0,
    subscriptionIdentifier: id,
    noLocal: false,
    retainAsPublished: false,
    protocolVersion: ProtocolVersion.V5,
    ...extra,
  };
}

function publishData(topic: string, qosLevel: QoSType = QoSType.QoS0, retain = false): IPublishData {
  return {
    header: {
      packetType: PacketType.PUBLISH,
      dupFlag: false,
      qosLevel,
      retain,
      topicName: topic,
    },
    properties: {},
    payload: Buffer.from('hi'),
  };
}

/** Decodes every PUBLISH written to the mock socket, in write order. */
function deliveredPublishes(write: ReturnType<typeof vi.fn>): IPublishData[] {
  return write.mock.calls.map(([buf]) => decodePacket(buf as Buffer, ProtocolVersion.V5) as IPublishData);
}

describe('MemoryManager', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager();
  });

  afterEach(async () => {
    await manager.dispose();
  });

  test('isConnected reflects registration', async () => {
    expect(await manager.isConnected('c1')).toBe(false);

    const { client } = createClient(manager, 'c1');
    await manager.connect('c1', client);

    expect(await manager.isConnected('c1')).toBe(true);
  });

  test('connect registers the client and creates a session', async () => {
    const { client } = createClient(manager, 'c1', 100);
    await manager.connect('c1', client);

    expect(manager.clientIdentifierManager.getClient('c1')).toBe(client);
    expect(await manager.hasSession('c1')).toBe(true);
  });

  test('connect restores routing for a persisted session', async () => {
    const { client: c1 } = createClient(manager, 'c1', 100);
    await manager.connect('c1', c1);
    await manager.subscribe('c1', 'a/b', sub(1));
    await manager.disconnect('c1');

    expect(await manager.hasSession('c1')).toBe(true);

    const { client: c2, write } = createClient(manager, 'c1', 100);
    await manager.connect('c1', c2);
    expect(await manager.isSubscribe('c1', 'a/b')).toBe(true);

    manager.publish('pub', 'a/b', publishData('a/b'));
    expect(write).toHaveBeenCalledTimes(1);
  });

  test('subscribe records the subscription and routes exact topics', async () => {
    const { client, write } = createClient(manager, 'c1');
    await manager.connect('c1', client);
    await manager.subscribe('c1', 'a/b', sub(1));

    expect(await manager.isSubscribe('c1', 'a/b')).toBe(true);

    manager.publish('pub', 'a/b', publishData('a/b'));
    expect(deliveredPublishes(write).map((p) => p.header.topicName)).toEqual(['a/b']);
  });

  test('unsubscribe removes the subscription and stops delivery', async () => {
    const { client, write } = createClient(manager, 'c1');
    await manager.connect('c1', client);
    await manager.subscribe('c1', 'a/b', sub(1));
    await manager.unsubscribe('c1', 'a/b');

    expect(await manager.isSubscribe('c1', 'a/b')).toBe(false);

    manager.publish('pub', 'a/b', publishData('a/b'));
    expect(write).not.toHaveBeenCalled();
  });

  test('clearSession removes all subscriptions and the session', async () => {
    const { client } = createClient(manager, 'c1');
    await manager.connect('c1', client);
    await manager.subscribe('c1', 'a/b', sub(1));
    await manager.subscribe('c1', 'a/c', sub(2));

    await manager.clearSession('c1');

    expect(await manager.isSubscribe('c1', 'a/b')).toBe(false);
    expect(await manager.hasSession('c1')).toBe(false);
  });

  test('disconnect ends the socket, removes the client, and keeps a session with expiry', async () => {
    const { client, end } = createClient(manager, 'c1', 100);
    await manager.connect('c1', client);
    await manager.subscribe('c1', 'a/b', sub(1));

    await manager.disconnect('c1');

    expect(end).toHaveBeenCalled();
    expect(client.isDisconnect).toBe(true);
    expect(manager.clientIdentifierManager.getClient('c1')).toBeUndefined();
    expect(await manager.hasSession('c1')).toBe(true);
  });

  test('disconnect clears the session when sessionExpiryInterval is 0', async () => {
    const { client, end } = createClient(manager, 'c1', 0);
    await manager.connect('c1', client);

    await manager.disconnect('c1');

    expect(end).toHaveBeenCalled();
    expect(await manager.hasSession('c1')).toBe(false);
  });

  test('disconnect is a no-op for an unknown client', async () => {
    await expect(manager.disconnect('missing')).resolves.toBeUndefined();
  });
});

describe('MemoryManager retain messages', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager();
  });

  afterEach(async () => {
    await manager.dispose();
  });

  test('matchRetainMessage invokes the callback for a non-wildcard topic', async () => {
    await manager.addRetainMessage('a/b', publishData('a/b'));

    const received: IPublishData[] = [];
    await manager.matchRetainMessage('a/b', async (data) => {
      received.push(data);
    });

    expect(received).toHaveLength(1);
    expect(received[0].header.topicName).toBe('a/b');
    expect(received[0].payload.toString()).toBe('hi');
  });

  test('matchRetainMessage matches wildcard filters', async () => {
    await manager.addRetainMessage('sport/tennis', publishData('sport/tennis'));
    await manager.addRetainMessage('sport/football', publishData('sport/football'));
    await manager.addRetainMessage('news/world', publishData('news/world'));

    const topics: string[] = [];
    await manager.matchRetainMessage('sport/+', async (data) => {
      topics.push(data.header.topicName);
    });

    expect(topics.sort()).toEqual(['sport/football', 'sport/tennis']);
  });

  test('deleteRetainMessage removes a retained message', async () => {
    await manager.addRetainMessage('a/b', publishData('a/b'));
    await manager.deleteRetainMessage('a/b');

    let called = 0;
    await manager.matchRetainMessage('a/b', async () => {
      called++;
    });
    expect(called).toBe(0);
  });

  test('getRetainMessage returns undefined for a fresh message (expiry check inverted)', async () => {
    // TODO [retain] `getRetainMessage` treats a non-expired message (`expireAt` in the future) as
    // expired and deletes it, so retained messages can never be read back this way.
    await manager.addRetainMessage('a/b', publishData('a/b'));

    expect(await manager.getRetainMessage('a/b')).toBeUndefined();
  });
});

describe('MemoryManager publish fan-out', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager();
  });

  afterEach(async () => {
    await manager.dispose();
  });

  test('carries the subscription identifier to the delivered packet', async () => {
    const { client, write } = createClient(manager, 'c1');
    await manager.connect('c1', client);
    await manager.subscribe('c1', 'a/b', sub(7));

    manager.publish('pub', 'a/b', publishData('a/b'));

    const delivered = deliveredPublishes(write);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].properties.subscriptionIdentifier).toEqual([7]);
  });

  test('noLocal prevents delivery back to the publishing client', async () => {
    const { client, write } = createClient(manager, 'c1');
    await manager.connect('c1', client);
    await manager.subscribe('c1', 'a/b', sub(1, { noLocal: true }));

    manager.publish('c1', 'a/b', publishData('a/b'));

    expect(write).not.toHaveBeenCalled();
  });

  test('clears the retain flag on forwarded messages by default', async () => {
    const { client, write } = createClient(manager, 'c1');
    await manager.connect('c1', client);
    await manager.subscribe('c1', 'a/b', sub(1));

    manager.publish('pub', 'a/b', publishData('a/b', QoSType.QoS0, true));

    expect(deliveredPublishes(write)[0].header.retain).toBe(false);
  });

  test('retainAsPublished has no effect because handlePublish resets the flag', async () => {
    // TODO [MQTT-3.3.1-12] `publish` sets the retain flag from `retainAsPublished`, but
    // `handlePublish` immediately overwrites it with its `retain` parameter (default false),
    // so retain is cleared even when the subscriber opted into retain-as-published.
    const { client, write } = createClient(manager, 'c1');
    await manager.connect('c1', client);
    await manager.subscribe('c1', 'a/b', sub(1, { retainAsPublished: true }));

    manager.publish('pub', 'a/b', publishData('a/b', QoSType.QoS0, true));

    expect(deliveredPublishes(write)[0].header.retain).toBe(false);
  });

  test('delivers at the minimum QoS of the subscription and the publish', async () => {
    vi.useFakeTimers();
    try {
      const { client, write } = createClient(manager, 'c1');
      await manager.connect('c1', client);
      await manager.subscribe('c1', 'a/b', sub(1, { qos: QoSType.QoS2 }));

      manager.publish('pub', 'a/b', publishData('a/b', QoSType.QoS1));

      expect(deliveredPublishes(write)[0].header.qosLevel).toBe(QoSType.QoS1);
    } finally {
      vi.useRealTimers();
    }
  });
});
