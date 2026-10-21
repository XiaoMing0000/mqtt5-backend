/**
 * OpenTelemetry 初始化入口。
 *
 * 必须在 ioredis 被导入前加载，否则 Redis 插桩不会生效：
 * `tsx --import ./examples/instrumentation.ts examples/demo.ts`
 */
import 'dotenv/config';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MqttClientInstrumentation } from '../src/utils/mqttClientInstrumentation';
import { RedisManagerInstrumentation } from '../src/utils/redisManagerInstrumentation';
import { BatchSpanProcessor, ConsoleSpanExporter, NodeTracerProvider, SimpleSpanProcessor, SpanProcessor } from '@opentelemetry/sdk-trace-node';
import { ATTR_DEPLOYMENT_ENVIRONMENT_NAME, ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { register } from 'node:module';

// 默认只输出 ERROR；排查问题时设置 OTEL_LOG_LEVEL=debug 打开完整诊断日志。
// 注意：阿里云 ARMS 返回的是 "success" 文本而不是标准 OTLP protobuf 响应，
// SDK 会打一条 "could not deserialize response" 的 WARN，数据实际上报成功，可忽略。
if (process.env.OTEL_LOG_LEVEL) {
  const diagLogLevel = process.env.OTEL_LOG_LEVEL?.toLowerCase() === 'debug' ? DiagLogLevel.DEBUG : DiagLogLevel.ERROR;
  diag.setLogger(new DiagConsoleLogger(), diagLogLevel);
}

/**
 * 本项目是 ESM，require-in-the-middle 无法拦截 `import`，
 * 需要注册 import-in-the-middle 的 loader hook 才能给 ioredis 插桩。
 */
register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);

// 通过 HTTP/protobuf 上报 Trace 数据（阿里云 ARMS 要求 http/protobuf）。
// 未配置 url 时读取 OTEL_EXPORTER_OTLP_TRACES_ENDPOINT / OTEL_EXPORTER_OTLP_ENDPOINT。
const exporter = new OTLPTraceExporter();
const spanProcessors: SpanProcessor[] = [
  new BatchSpanProcessor(exporter, {
    scheduledDelayMillis: 5_000, // 改成 10 秒
  }),
];
process.env.OTEL_LOG_LEVEL && spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'mqtt5-backend',
    [ATTR_SERVICE_VERSION]: 'v1.0.0',
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: 'test',
  }),
  /**
   * 上报地址由 OTLP 环境变量控制（按优先级）：
   * - OTEL_EXPORTER_OTLP_TRACES_ENDPOINT：完整 URL，如 http://collector:4318/v1/traces
   * - OTEL_EXPORTER_OTLP_ENDPOINT：基础地址，自动追加 /v1/traces，如 http://collector:4318
   * - 都未配置时默认 http://localhost:4318/v1/traces
   *
   * 鉴权头用 OTEL_EXPORTER_OTLP_HEADERS 配置，如 Authorization=Bearer xxx。
   */
  spanProcessors: spanProcessors,
});

provider.register();

registerInstrumentations({
  tracerProvider: provider,
  // 默认 requireParentSpan 为 true：只有存在父 Span 时才创建 Redis Span，
  // 避免产生大量孤立的 Redis Span。当前项目只有 Redis 插桩、没有上层
  // (HTTP/MQTT) 插桩生成父 Span，不关闭会导致所有 Redis 命令都不上报。
  // instrumentations: [new IORedisInstrumentation({ requireParentSpan: false }), new MqttClientInstrumentation()],
  instrumentations: [new IORedisInstrumentation(), new MqttClientInstrumentation(), new RedisManagerInstrumentation()],
});
