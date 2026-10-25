import { context, SpanKind, SpanStatusCode, trace, type Tracer } from '@opentelemetry/api';
import { InstrumentationBase } from '@opentelemetry/instrumentation';
import type { TIdentifier, TTopic } from '../interface';
import { RedisManager } from '../manager/redisManager';

const ATTR_MESSAGING_SYSTEM = 'messaging.system';
const ATTR_MESSAGING_OPERATION = 'messaging.operation';
const ATTR_MESSAGING_CLIENT_ID = 'messaging.client.id';
const ATTR_MESSAGING_DESTINATION_NAME = 'messaging.destination.name';

type SpanAttributes = Record<string, string | number | boolean>;

/** `RedisManager.broadcastMessage` is private, so its type cannot be derived via `keyof`; declare its signature separately. */
type TBroadcastMessage = (topic: TTopic, sourceIdentifier: TIdentifier, pubBuffer: Buffer) => Promise<void>;

/** Create an INTERNAL span that wraps a RedisManager operation and keeps the active MQTT context. */
function withSpan<T>(tracer: Tracer, name: string, attributes: SpanAttributes, fn: () => Promise<T>): Promise<T> {
  const span = tracer.startSpan(name, { kind: SpanKind.INTERNAL });
  span.setAttributes(attributes);
  // Make the RedisManager span the active context so inner ioredis command spans can treat it as the parent span.
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

/**
 * OpenTelemetry instrumentation for the {@link RedisManager} session/retain/publish operations.
 *
 * Like {@link MqttClientInstrumentation}, this patches the prototype methods directly instead of
 * intercepting a third-party module at load time. Each wrapped method becomes an `INTERNAL` span
 * that sits between the MQTT handler span and the raw ioredis command spans, carrying the MQTT
 * context (client id / topic) so the whole chain stays correlated.
 *
 * Spans are named with an `mqtt.` prefix (e.g. `mqtt.connect`, `mqtt.retain.add`) to mark them
 * as broker-level MQTT operations rather than raw Redis commands; the raw ioredis commands are
 * instrumented separately by IORedisInstrumentation.
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
    // `broadcastMessage` is private, so `keyof RedisManager` cannot see it; widen the type and wrap using its original signature.
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

  private _traceConnect(original: RedisManager['connect']): RedisManager['connect'] {
    const tracer = this.tracer;
    return function (this: RedisManager, identifier, client) {
      return withSpan(
        tracer,
        'mqtt.connect',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'connect',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
        },
        () => original.call(this, identifier, client),
      );
    };
  }

  private _traceDisconnect(original: RedisManager['disconnect']): RedisManager['disconnect'] {
    const tracer = this.tracer;
    return function (this: RedisManager, identifier, disconnectData) {
      return withSpan(
        tracer,
        'mqtt.disconnect',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'disconnect',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
        },
        () => original.call(this, identifier, disconnectData),
      );
    };
  }

  private _traceSubscribe(original: RedisManager['subscribe']): RedisManager['subscribe'] {
    const tracer = this.tracer;
    return function (this: RedisManager, identifier, topic, data) {
      return withSpan(
        tracer,
        'mqtt.subscribe',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'subscribe',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, identifier, topic, data),
      );
    };
  }

  private _traceIsSubscribe(original: RedisManager['isSubscribe']): RedisManager['isSubscribe'] {
    const tracer = this.tracer;
    return function (this: RedisManager, identifier, topic) {
      return withSpan(
        tracer,
        'mqtt.isSubscribe',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'isSubscribe',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, identifier, topic),
      );
    };
  }

  private _traceUnsubscribe(original: RedisManager['unsubscribe']): RedisManager['unsubscribe'] {
    const tracer = this.tracer;
    return function (this: RedisManager, identifier, topic) {
      return withSpan(
        tracer,
        'mqtt.unsubscribe',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'unsubscribe',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, identifier, topic),
      );
    };
  }

  private _traceClearSession(original: RedisManager['clearSession']): RedisManager['clearSession'] {
    const tracer = this.tracer;
    return function (this: RedisManager, identifier) {
      return withSpan(
        tracer,
        'mqtt.clearSession',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'clearSession',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
        },
        () => original.call(this, identifier),
      );
    };
  }

  private _traceHasSession(original: RedisManager['hasSession']): RedisManager['hasSession'] {
    const tracer = this.tracer;
    return function (this: RedisManager, identifier) {
      return withSpan(
        tracer,
        'mqtt.hasSession',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'hasSession',
          [ATTR_MESSAGING_CLIENT_ID]: identifier,
        },
        () => original.call(this, identifier),
      );
    };
  }

  private _traceAddRetainMessage(original: RedisManager['addRetainMessage']): RedisManager['addRetainMessage'] {
    const tracer = this.tracer;
    return function (this: RedisManager, topic, pubData, retainTTL) {
      return withSpan(
        tracer,
        'mqtt.retain.add',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'retain.add',
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, topic, pubData, retainTTL),
      );
    };
  }

  private _traceDeleteRetainMessage(original: RedisManager['deleteRetainMessage']): RedisManager['deleteRetainMessage'] {
    const tracer = this.tracer;
    return function (this: RedisManager, topic) {
      return withSpan(
        tracer,
        'mqtt.retain.delete',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'retain.delete',
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, topic),
      );
    };
  }

  private _traceGetRetainMessage(original: RedisManager['getRetainMessage']): RedisManager['getRetainMessage'] {
    const tracer = this.tracer;
    return function (this: RedisManager, topic) {
      return withSpan(
        tracer,
        'mqtt.retain.get',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'retain.get',
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, topic),
      );
    };
  }

  private _traceMatchRetainMessage(original: RedisManager['matchRetainMessage']): RedisManager['matchRetainMessage'] {
    const tracer = this.tracer;
    return function (this: RedisManager, topic, callbackfn) {
      return withSpan(
        tracer,
        'mqtt.retain.match',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'retain.match',
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, topic, callbackfn),
      );
    };
  }

  private _tracePublish(original: RedisManager['publish']): RedisManager['publish'] {
    const tracer = this.tracer;
    return function (this: RedisManager, sourceIdentifier, topic, pubData) {
      return withSpan(
        tracer,
        'mqtt.publish',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'publish',
          [ATTR_MESSAGING_CLIENT_ID]: sourceIdentifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, sourceIdentifier, topic, pubData),
      );
    };
  }

  private _traceBroadcastMessage(original: TBroadcastMessage): TBroadcastMessage {
    const tracer = this.tracer;
    return function (this: RedisManager, topic, sourceIdentifier, pubBuffer) {
      return withSpan(
        tracer,
        'mqtt.broadcast',
        {
          [ATTR_MESSAGING_SYSTEM]: 'mqtt',
          [ATTR_MESSAGING_OPERATION]: 'broadcast',
          [ATTR_MESSAGING_CLIENT_ID]: sourceIdentifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: topic,
        },
        () => original.call(this, topic, sourceIdentifier, pubBuffer),
      );
    };
  }
}
