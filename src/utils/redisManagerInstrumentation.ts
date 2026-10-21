import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { InstrumentationBase } from '@opentelemetry/instrumentation';
import type { TIdentifier, TTopic } from '../interface';
import { RedisManager } from '../manager/redisManager';

const ATTR_DB_SYSTEM = 'db.system';
const ATTR_DB_OPERATION = 'db.operation';
const ATTR_MESSAGING_CLIENT_ID = 'messaging.client.id';
const ATTR_MESSAGING_DESTINATION_NAME = 'messaging.destination.name';

type SpanAttributes = Record<string, string | number | boolean>;

/** `RedisManager.broadcastMessage` 是 private，无法通过 `keyof` 取类型，单独声明其签名。 */
type TBroadcastMessage = (topic: TTopic, sourceIdentifier: TIdentifier, pubBuffer: Buffer) => Promise<void>;

/**
 * OpenTelemetry instrumentation for the {@link RedisManager} session/retain/publish operations.
 *
 * Like {@link MqttClientInstrumentation}, this patches the prototype methods directly instead of
 * intercepting a third-party module at load time. Each wrapped method becomes an `INTERNAL` span
 * that sits between the MQTT handler span and the raw ioredis command spans, carrying the MQTT
 * context (client id / topic) so the whole chain stays correlated.
 */
export class RedisManagerInstrumentation extends InstrumentationBase {
  constructor() {
    super('@elfdream/mqtt5-backend', '1.5.0', {});
  }

  protected init(): [] {
    // First-party code is patched directly in enable/disable, so no module-load interception is needed.
    return [];
  }

  public override enable(): void {
    if (this.isEnabled()) {
      return;
    }
    super.enable();
    this._patch();
  }

  public override disable(): void {
    if (!this.isEnabled()) {
      return;
    }
    this._unpatch();
    super.disable();
  }

  private _patch(): void {
    const proto = RedisManager.prototype;
    this._wrap(proto, 'connect', (original) => this._traceConnect(original));
    this._wrap(proto, 'disconnect', (original) => this._traceDisconnect(original));
    this._wrap(proto, 'subscribe', (original) => this._traceSubscribe(original));
    this._wrap(proto, 'isSubscribe', (original) => this._traceIsSubscribe(original));
    this._wrap(proto, 'unsubscribe', (original) => this._traceUnsubscribe(original));
    this._wrap(proto, 'clearSession', (original) => this._traceClearSession(original));
    this._wrap(proto, 'hasSession', (original) => this._traceHasSession(original));
    this._wrap(proto, 'addRetainMessage', (original) => this._traceAddRetainMessage(original));
    this._wrap(proto, 'deleteRetainMessage', (original) => this._traceDeleteRetainMessage(original));
    this._wrap(proto, 'getRetainMessage', (original) => this._traceGetRetainMessage(original));
    this._wrap(proto, 'matchRetainMessage', (original) => this._traceMatchRetainMessage(original));
    this._wrap(proto, 'publish', (original) => this._tracePublish(original));
    // broadcastMessage 是 private，keyof RedisManager 取不到，放宽类型后按原签名包装。
    this._wrap(proto as any, 'broadcastMessage', (original: TBroadcastMessage) => this._traceBroadcastMessage(original));
  }

  private _unpatch(): void {
    const proto = RedisManager.prototype;
    this._unwrap(proto, 'connect');
    this._unwrap(proto, 'disconnect');
    this._unwrap(proto, 'subscribe');
    this._unwrap(proto, 'isSubscribe');
    this._unwrap(proto, 'unsubscribe');
    this._unwrap(proto, 'clearSession');
    this._unwrap(proto, 'hasSession');
    this._unwrap(proto, 'addRetainMessage');
    this._unwrap(proto, 'deleteRetainMessage');
    this._unwrap(proto, 'getRetainMessage');
    this._unwrap(proto, 'matchRetainMessage');
    this._unwrap(proto, 'publish');
    this._unwrap(proto as any, 'broadcastMessage');
  }

  private _withSpan<T>(name: string, attributes: SpanAttributes, fn: () => Promise<T>): Promise<T> {
    const span = this.tracer.startSpan(name, { kind: SpanKind.INTERNAL });
    span.setAttributes(attributes);
    // 让 RedisManager Span 成为活动上下文，内部 ioredis 命令 Span 才能把它当作父 Span。
    const activeContext = trace.setSpan(context.active(), span);
    return context
      .with(activeContext, () => fn())
      .then(
        (result) => {
          span.end();
          return result;
        },
        (err: unknown) => {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          span.end();
          throw err;
        },
      );
  }

  private _traceConnect(original: RedisManager['connect']): RedisManager['connect'] {
    const instrumentation = this;
    return function (this: RedisManager, identifier, client) {
      return instrumentation._withSpan(
        'redis.connect',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'connect',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
        },
        () => original.call(this, identifier, client),
      );
    };
  }

  private _traceDisconnect(original: RedisManager['disconnect']): RedisManager['disconnect'] {
    const instrumentation = this;
    return function (this: RedisManager, identifier, disconnectData) {
      return instrumentation._withSpan(
        'redis.disconnect',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'disconnect',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
        },
        () => original.call(this, identifier, disconnectData),
      );
    };
  }

  private _traceSubscribe(original: RedisManager['subscribe']): RedisManager['subscribe'] {
    const instrumentation = this;
    return function (this: RedisManager, identifier, topic, data) {
      return instrumentation._withSpan(
        'redis.subscribe',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'subscribe',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, identifier, topic, data),
      );
    };
  }

  private _traceIsSubscribe(original: RedisManager['isSubscribe']): RedisManager['isSubscribe'] {
    const instrumentation = this;
    return function (this: RedisManager, identifier, topic) {
      return instrumentation._withSpan(
        'redis.isSubscribe',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'isSubscribe',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, identifier, topic),
      );
    };
  }

  private _traceUnsubscribe(original: RedisManager['unsubscribe']): RedisManager['unsubscribe'] {
    const instrumentation = this;
    return function (this: RedisManager, identifier, topic) {
      return instrumentation._withSpan(
        'redis.unsubscribe',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'unsubscribe',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, identifier, topic),
      );
    };
  }

  private _traceClearSession(original: RedisManager['clearSession']): RedisManager['clearSession'] {
    const instrumentation = this;
    return function (this: RedisManager, identifier) {
      return instrumentation._withSpan(
        'redis.clearSession',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'clearSession',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
        },
        () => original.call(this, identifier),
      );
    };
  }

  private _traceHasSession(original: RedisManager['hasSession']): RedisManager['hasSession'] {
    const instrumentation = this;
    return function (this: RedisManager, identifier) {
      return instrumentation._withSpan(
        'redis.hasSession',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'hasSession',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
        },
        () => original.call(this, identifier),
      );
    };
  }

  private _traceAddRetainMessage(original: RedisManager['addRetainMessage']): RedisManager['addRetainMessage'] {
    const instrumentation = this;
    return function (this: RedisManager, topic, pubData, retainTTL) {
      return instrumentation._withSpan(
        'redis.retain.add',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'retain.add',
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, topic, pubData, retainTTL),
      );
    };
  }

  private _traceDeleteRetainMessage(original: RedisManager['deleteRetainMessage']): RedisManager['deleteRetainMessage'] {
    const instrumentation = this;
    return function (this: RedisManager, topic) {
      return instrumentation._withSpan(
        'redis.retain.delete',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'retain.delete',
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, topic),
      );
    };
  }

  private _traceGetRetainMessage(original: RedisManager['getRetainMessage']): RedisManager['getRetainMessage'] {
    const instrumentation = this;
    return function (this: RedisManager, topic) {
      return instrumentation._withSpan(
        'redis.retain.get',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'retain.get',
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, topic),
      );
    };
  }

  private _traceMatchRetainMessage(original: RedisManager['matchRetainMessage']): RedisManager['matchRetainMessage'] {
    const instrumentation = this;
    return function (this: RedisManager, topic, callbackfn) {
      return instrumentation._withSpan(
        'redis.retain.match',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'retain.match',
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, topic, callbackfn),
      );
    };
  }

  private _tracePublish(original: RedisManager['publish']): RedisManager['publish'] {
    const instrumentation = this;
    return function (this: RedisManager, sourceIdentifier, topic, pubData) {
      return instrumentation._withSpan(
        'redis.publish',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'publish',
          [ATTR_MESSAGING_CLIENT_ID]: sourceIdentifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, sourceIdentifier, topic, pubData),
      );
    };
  }

  private _traceBroadcastMessage(original: TBroadcastMessage): TBroadcastMessage {
    const instrumentation = this;
    return function (this: RedisManager, topic, sourceIdentifier, pubBuffer) {
      return instrumentation._withSpan(
        'redis.broadcast',
        {
          [ATTR_DB_SYSTEM]: 'redis',
          [ATTR_DB_OPERATION]: 'broadcast',
          [ATTR_MESSAGING_CLIENT_ID]: sourceIdentifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, topic, sourceIdentifier, pubBuffer),
      );
    };
  }
}
