import { IMqttOptions, PacketType, ProtocolVersion, QoSType, type IConnectData, type IPublishData } from '../interface';
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

function mockClient(id: string, writes: Buffer[], manager: MemoryManager): MqttClient {
  const socket = {
    write(buf: Buffer) {
      writes.push(Buffer.from(buf));
      return true;
    },
    end() {},
  } as unknown as TSocket;
  const client = new MqttClient(socket, manager, mqttDefaultOptions);
  client.clientIdentifier = id;
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

function connectData(id: string): IConnectData {
  return {
    header: {
      packetType: PacketType.CONNECT,
      packetFlags: 0,
      protocolName: 'MQTT',
      protocolVersion: ProtocolVersion.V5,
      keepAlive: 60,
    },
    connectFlags: { cleanStart: true } as IConnectData['connectFlags'],
    properties: {},
    payload: { clientIdentifier: id },
  };
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

function publishData(topic: string): IPublishData {
  return {
    header: {
      packetType: PacketType.PUBLISH,
      dupFlag: false,
      qosLevel: QoSType.QoS0,
      retain: false,
      topicName: topic,
    },
    properties: {},
    payload: 'hi',
  };
}

function subscriptionIds(packets: Buffer[]): number[] {
  return packets.flatMap((packet) => {
    const parsed = decodePacket(packet, ProtocolVersion.V5) as IPublishData;
    return parsed.properties.subscriptionIdentifier ?? [];
  });
}

describe('MemoryManager wildcard publish', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager();
  });

  afterEach(async () => {
    await manager.dispose();
  });

  test('a broader # filter does not hide a deeper # filter', async () => {
    const writes: Buffer[] = [];
    const client = mockClient('c1', writes, manager);
    await manager.connect('c1', connectData('c1'), client);
    await manager.subscribe('c1', '/xiaoming/#', sub(1));
    await manager.subscribe('c1', '/xiaoming/test/#', sub(2));

    manager.publish('pub', '/xiaoming/test/xxx', publishData('/xiaoming/test/xxx'));

    expect(writes).toHaveLength(2);
    expect(subscriptionIds(writes).sort()).toEqual([1, 2]);
  });

  test('terminal # under + still matches the parent topic', async () => {
    const writes: Buffer[] = [];
    const client = mockClient('c1', writes, manager);
    await manager.connect('c1', connectData('c1'), client);
    await manager.subscribe('c1', 'sport/+/#', sub(7));

    manager.publish('pub', 'sport/tennis', publishData('sport/tennis'));

    expect(subscriptionIds(writes)).toEqual([7]);
  });
});
