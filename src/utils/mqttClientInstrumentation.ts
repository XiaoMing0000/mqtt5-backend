import { context, SpanKind, SpanStatusCode, trace, type Tracer } from '@opentelemetry/api';
import { InstrumentationBase } from '@opentelemetry/instrumentation';
import { MqttClient } from '../mqttClient';

const ATTR_MESSAGING_SYSTEM = 'messaging.system';
const ATTR_MESSAGING_OPERATION = 'messaging.operation';
const ATTR_MESSAGING_CLIENT_ID = 'messaging.client.id';
const ATTR_MESSAGING_DESTINATION_NAME = 'messaging.destination.name';
const ATTR_MQTT_QOS = 'mqtt.qos';
const ATTR_MQTT_PROTOCOL_VERSION = 'mqtt.protocol_version';
const ATTR_MQTT_REASON_CODE = 'mqtt.reason_code';

type SpanAttributes = Record<string, string | number | boolean>;

/** Create a span that wraps an MqttClient handler and keeps the active context. */
function withSpan<T>(tracer: Tracer, name: string, kind: SpanKind, attributes: SpanAttributes, fn: () => Promise<T>): Promise<T> {
  const span = tracer.startSpan(name, { kind });
  span.setAttribute(ATTR_MESSAGING_SYSTEM, 'mqtt');
  span.setAttributes(attributes);
  // Make the MQTT span the active context so ioredis calls initiated inside the
  // handler can treat it as the parent span (matching ioredis instrumentation's
  // default `requireParentSpan: true`).
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
 * OpenTelemetry instrumentation for the {@link MqttClient} broker handlers.
 *
 * `MqttClient` is first-party code, so unlike third-party packages it cannot be intercepted
 * by module name at load time. This instrumentation patches the prototype methods directly in
 * {@link enable}, wrapping each handler with a span — the same approach
 * `@opentelemetry/instrumentation-ioredis` uses to wrap `ioredis` prototype methods.
 *
 * Register it alongside the other instrumentations:
 * `registerInstrumentations({ tracerProvider, instrumentations: [new MqttClientInstrumentation()] })`.
 */
export class MqttClientInstrumentation extends InstrumentationBase {
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
    const proto = MqttClient.prototype;
    this._wrap(proto, 'connectHandle', (original) => this._traceConnect(original));
    this._wrap(proto, 'disconnectHandle', (original) => this._traceDisconnect(original));
    this._wrap(proto, 'publishHandle', (original) => this._tracePublish(original));
    this._wrap(proto, 'handlePublish', (original) => this._tracePublishSend(original));
    this._wrap(proto, 'subscribeHandle', (original) => this._traceSubscribe(original));
    this._wrap(proto, 'unsubscribeHandle', (original) => this._traceUnsubscribe(original));
  }

  private _unpatch(): void {
    const proto = MqttClient.prototype;
    this._unwrap(proto, 'connectHandle');
    this._unwrap(proto, 'disconnectHandle');
    this._unwrap(proto, 'publishHandle');
    this._unwrap(proto, 'handlePublish');
    this._unwrap(proto, 'subscribeHandle');
    this._unwrap(proto, 'unsubscribeHandle');
  }

  private _traceConnect(original: MqttClient['connectHandle']): MqttClient['connectHandle'] {
    const tracer = this.tracer;
    return function (this: MqttClient, connData, emitAsync) {
      return withSpan(
        tracer,
        'connect',
        SpanKind.SERVER,
        {
          [ATTR_MESSAGING_OPERATION]: 'connect',
          [ATTR_MESSAGING_CLIENT_ID]: connData.payload.clientIdentifier,
          [ATTR_MQTT_PROTOCOL_VERSION]: connData.header.protocolVersion,
        },
        () => original.call(this, connData, emitAsync),
      );
    };
  }

  private _traceDisconnect(original: MqttClient['disconnectHandle']): MqttClient['disconnectHandle'] {
    const tracer = this.tracer;
    return function (this: MqttClient, disconnectData) {
      return withSpan(
        tracer,
        'disconnect',
        SpanKind.SERVER,
        {
          [ATTR_MESSAGING_OPERATION]: 'disconnect',
          [ATTR_MESSAGING_CLIENT_ID]: this.clientIdentifier,
          [ATTR_MQTT_REASON_CODE]: disconnectData.header.reasonCode,
        },
        () => original.call(this, disconnectData),
      );
    };
  }

  private _tracePublish(original: MqttClient['publishHandle']): MqttClient['publishHandle'] {
    const tracer = this.tracer;
    return function (this: MqttClient, pubData, emitAsync) {
      return withSpan(
        tracer,
        'publish',
        SpanKind.SERVER,
        {
          [ATTR_MESSAGING_OPERATION]: 'publish',
          [ATTR_MESSAGING_CLIENT_ID]: this.clientIdentifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: pubData.header.topicName,
          [ATTR_MQTT_QOS]: pubData.header.qosLevel,
        },
        () => original.call(this, pubData, emitAsync),
      );
    };
  }

  private _tracePublishSend(original: MqttClient['handlePublish']): MqttClient['handlePublish'] {
    const tracer = this.tracer;
    return function (this: MqttClient, pubData, retain) {
      return withSpan(
        tracer,
        'publish.send',
        SpanKind.CLIENT,
        {
          [ATTR_MESSAGING_OPERATION]: 'publish',
          [ATTR_MESSAGING_CLIENT_ID]: this.clientIdentifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: pubData.header.topicName,
          [ATTR_MQTT_QOS]: pubData.header.qosLevel,
        },
        () => original.call(this, pubData, retain),
      );
    };
  }

  private _traceSubscribe(original: MqttClient['subscribeHandle']): MqttClient['subscribeHandle'] {
    const tracer = this.tracer;
    return function (this: MqttClient, subData) {
      return withSpan(
        tracer,
        'subscribe',
        SpanKind.SERVER,
        {
          [ATTR_MESSAGING_OPERATION]: 'subscribe',
          [ATTR_MESSAGING_CLIENT_ID]: this.clientIdentifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: subData.payloads?.[0]?.topicFilter ?? subData.payload,
        },
        () => original.call(this, subData),
      );
    };
  }

  private _traceUnsubscribe(original: MqttClient['unsubscribeHandle']): MqttClient['unsubscribeHandle'] {
    const tracer = this.tracer;
    return function (this: MqttClient, unsubscribeData) {
      return withSpan(
        tracer,
        'unsubscribe',
        SpanKind.SERVER,
        {
          [ATTR_MESSAGING_OPERATION]: 'unsubscribe',
          [ATTR_MESSAGING_CLIENT_ID]: this.clientIdentifier,
          [ATTR_MESSAGING_DESTINATION_NAME]: unsubscribeData.payloads?.[0] ?? unsubscribeData.payload,
        },
        () => original.call(this, unsubscribeData),
      );
    };
  }
}
