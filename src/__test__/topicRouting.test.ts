import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { ProtocolVersion, QoSType } from '../interface';
import { MemorySessionManager, TopicHashRegexManager, TopicManager, TopicTrieManager, type TSubscribeData } from '../manager/manager';

function sub(id: number): TSubscribeData {
  return {
    qos: QoSType.QoS0,
    date: 0,
    subscriptionIdentifier: id,
    noLocal: false,
    retainAsPublished: false,
    protocolVersion: ProtocolVersion.V5,
  };
}

describe('TopicHashRegexManager', () => {
  test('routes and matches exact topics', () => {
    const manager = new TopicHashRegexManager();
    manager.subscribe('a/b', 'c1');

    expect([...manager.matchTopic('a/b')]).toEqual([['c1', 'a/b']]);
    expect([...manager.matchTopic('a/c')]).toEqual([]);
  });

  test('routes and matches wildcard filters', () => {
    const manager = new TopicHashRegexManager();
    manager.subscribe('sport/#', 'c1');

    expect([...manager.matchTopic('sport/tennis')]).toEqual([['c1', 'sport/#']]);
    expect([...manager.matchTopic('sport')]).toEqual([['c1', 'sport/#']]);
  });

  test('treats a wildcard topic as exact when enableWildcard is false', () => {
    const manager = new TopicHashRegexManager();
    manager.subscribe('sport/#', 'c1', false);

    expect([...manager.matchTopic('sport/#')]).toEqual([['c1', 'sport/#']]);
    expect([...manager.matchTopic('sport/tennis')]).toEqual([]);
  });

  test('unsubscribe removes a route', () => {
    const manager = new TopicHashRegexManager();
    manager.subscribe('a/b', 'c1');
    manager.unsubscribe('a/b', 'c1');

    expect([...manager.matchTopic('a/b')]).toEqual([]);
  });

  test('accumulates multiple clients per topic', () => {
    const manager = new TopicHashRegexManager();
    manager.subscribe('a/b', 'c1');
    manager.subscribe('a/b', 'c2');

    expect([...manager.matchTopic('a/b')]).toEqual([
      ['c1', 'a/b'],
      ['c2', 'a/b'],
    ]);
  });
});

describe('TopicTrieManager', () => {
  test('routes and matches exact topics', () => {
    const manager = new TopicTrieManager();
    manager.subscribe('a/b', 'c1');

    expect([...manager.matchTopic('a/b')]).toEqual([['c1', 'a/b']]);
    expect([...manager.matchTopic('a/c')]).toEqual([]);
  });

  test('# matches zero or more levels', () => {
    const manager = new TopicTrieManager();
    manager.subscribe('sport/#', 'c1');

    expect([...manager.matchTopic('sport')]).toEqual([['c1', 'sport/#']]);
    expect([...manager.matchTopic('sport/tennis')]).toEqual([['c1', 'sport/#']]);
    expect([...manager.matchTopic('sport/tennis/player')]).toEqual([['c1', 'sport/#']]);
  });

  test('+ matches exactly one level', () => {
    const manager = new TopicTrieManager();
    manager.subscribe('sport/+', 'c1');

    expect([...manager.matchTopic('sport/tennis')]).toEqual([['c1', 'sport/+']]);
    expect([...manager.matchTopic('sport')]).toEqual([]);
    expect([...manager.matchTopic('sport/tennis/player')]).toEqual([]);
  });

  test('terminal # under + matches the parent topic', () => {
    const manager = new TopicTrieManager();
    manager.subscribe('sport/+/#', 'c1');

    expect([...manager.matchTopic('sport/tennis')]).toEqual([['c1', 'sport/+/#']]);
  });

  test('root wildcards do not match $ system topics', () => {
    const manager = new TopicTrieManager();
    manager.subscribe('#', 'c1');
    manager.subscribe('+', 'c2');

    expect([...manager.matchTopic('$SYS/monitor')]).toEqual([]);
  });

  test('an explicit $ prefix still matches system topics', () => {
    const manager = new TopicTrieManager();
    manager.subscribe('$SYS/#', 'c1');

    expect([...manager.matchTopic('$SYS/monitor')]).toEqual([['c1', '$SYS/#']]);
  });

  test('unsubscribe removes a route', () => {
    const manager = new TopicTrieManager();
    manager.subscribe('a/b', 'c1');
    manager.unsubscribe('a/b', 'c1');

    expect([...manager.matchTopic('a/b')]).toEqual([]);
  });
});

describe('TopicManager', () => {
  test('matches exact and wildcard routes together', () => {
    const manager = new TopicManager();
    manager.subscribe('a/b', 'c1');
    manager.subscribe('a/#', 'c2');

    expect([...manager.matchTopic('a/b')]).toEqual([
      ['c1', 'a/b'],
      ['c2', 'a/#'],
    ]);
  });

  test('disables wildcard matching on request', () => {
    const manager = new TopicManager();
    manager.subscribe('a/b', 'c1');
    manager.subscribe('a/#', 'c2');

    expect([...manager.matchTopic('a/b', false)]).toEqual([['c1', 'a/b']]);
  });

  test('unsubscribe removes exact and wildcard routes', () => {
    const manager = new TopicManager();
    manager.subscribe('a/b', 'c1');
    manager.subscribe('a/#', 'c2');
    manager.unsubscribe('a/b', 'c1');
    manager.unsubscribe('a/#', 'c2');

    expect([...manager.matchTopic('a/b')]).toEqual([]);
  });
});

describe('MemorySessionManager', () => {
  let manager: MemorySessionManager;

  beforeEach(() => {
    manager = new MemorySessionManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  test('connect creates a session, clear removes it', () => {
    manager.connect('c1', 0);

    expect(manager.has('c1')).toBe(true);
    expect(manager.get('c1')?.sessionExpiryInterval).toBe(0);

    manager.clear('c1');
    expect(manager.has('c1')).toBe(false);
  });

  test('connect with clearOldSession replaces an existing session', () => {
    manager.connect('c1', 0);
    manager.subscribe('c1', 'a/b', sub(1));

    manager.connect('c1', 100, true);

    expect(manager.get('c1')?.sessionExpiryInterval).toBe(100);
    expect(manager.isSubscribe('c1', 'a/b')).toBeUndefined();
  });

  test('connect without clearOldSession keeps subscriptions and refreshes expiry', () => {
    manager.connect('c1', 100);
    manager.subscribe('c1', 'a/b', sub(1));
    manager.disconnect('c1');
    expect(manager.get('c1')?.expireAt).toBeGreaterThan(0);

    manager.connect('c1', 200);

    expect(manager.get('c1')?.expireAt).toBe(0);
    expect(manager.get('c1')?.sessionExpiryInterval).toBe(200);
    expect(manager.isSubscribe('c1', 'a/b')).toStrictEqual(sub(1));
  });

  test('subscribe / unsubscribe / isSubscribe', () => {
    manager.connect('c1', 0);
    expect(manager.isSubscribe('c1', 'a/b')).toBeUndefined();

    manager.subscribe('c1', 'a/b', sub(1));
    expect(manager.isSubscribe('c1', 'a/b')).toStrictEqual(sub(1));

    manager.unsubscribe('c1', 'a/b');
    expect(manager.isSubscribe('c1', 'a/b')).toBeUndefined();
  });

  test('disconnect clears a session with no expiry and keeps one with expiry', () => {
    manager.connect('c1', 0);
    manager.disconnect('c1');
    expect(manager.has('c1')).toBe(false);

    manager.connect('c2', 100);
    manager.disconnect('c2');
    expect(manager.has('c2')).toBe(true);
    expect(manager.get('c2')?.expireAt).toBeGreaterThan(0);
  });
});
