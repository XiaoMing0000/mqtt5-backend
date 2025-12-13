# @elfdream/mqtt5-backend

[![npm version](https://badge.fury.io/js/%40elfdream%2Fmqtt5-backend.svg)](https://badge.fury.io/js/%40elfdream%2Fmqtt5-backend)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

一个基于 Node.js 的 MQTT 协议云服务后端实现，支持 MQTT v3.1、v3.1.1 和 v5.0 协议，支持多种传输协议和存储后端。

## ✨ 特性

- 🚀 **完整的 MQTT 协议支持** - 支持 MQTT v3.1、v3.1.1 和 v5.0 协议
- 🔄 **向后兼容** - 默认同时支持 MQTT v3.1、v3.1.1 和 v5.0 客户端连接
- 🔒 **多种传输协议** - 支持 TCP、TLS/SSL、WebSocket、WSS
- 💾 **多种存储后端** - 内存存储、Redis 单机、Redis 分布式
- 📡 **分布式架构** - 支持水平扩展和集群部署
- 🛡️ **类型安全** - 完整的 TypeScript 类型定义
- ⚡ **高性能** - 优化的消息处理和分发机制
- 🔧 **灵活配置** - 丰富的配置选项和事件钩子

## 📦 安装

```bash
npm install @elfdream/mqtt5-backend
```

## 🚀 快速开始

### 基础 TCP 服务器

```typescript
import { MqttServer, MemoryManager } from '@elfdream/mqtt5-backend';

// 创建客户端管理器
const clientManager = new MemoryManager();

// 创建 MQTT 服务器
const server = new MqttServer(clientManager);

// 监听连接事件
server.onConnect(async (data, client, clientManager) => {
	console.log('客户端连接:', data);
	return true; // 允许连接
});

// 监听发布事件
server.onPublish(async (data, client, clientManager) => {
	console.log('收到消息:', data);
	return true; // 允许发布
});

// 启动服务器
server.listen(1883, () => {
	console.log('MQTT 服务器启动在端口 1883');
});
```

### TLS/SSL 服务器

```typescript
import { MqttServerTLS, MemoryManager } from '@elfdream/mqtt5-backend';
import fs from 'fs';

const clientManager = new MemoryManager();

const tlsOptions = {
	cert: fs.readFileSync('cert.pem'),
	key: fs.readFileSync('key.pem'),
};

const server = new MqttServerTLS(tlsOptions, clientManager);

server.listen(8883, () => {
	console.log('MQTT TLS 服务器启动在端口 8883');
});
```

### WebSocket 服务器

```typescript
import { MqttServerWebSocket, MemoryManager } from '@elfdream/mqtt5-backend';

const clientManager = new MemoryManager();
const server = new MqttServerWebSocket(clientManager);

server.listen(8083, () => {
	console.log('MQTT WebSocket 服务器启动在端口 8083');
});
```

### WebSocket Secure (WSS) 服务器

```typescript
import { MqttServerWebSocketSecure, MemoryManager } from '@elfdream/mqtt5-backend';
import fs from 'fs';

const clientManager = new MemoryManager();

const httpsOptions = {
	cert: fs.readFileSync('cert.pem'),
	key: fs.readFileSync('key.pem'),
};

const server = new MqttServerWebSocketSecure(httpsOptions, clientManager);

server.listen(8084, () => {
	console.log('MQTT WebSocket Secure 服务器启动在端口 8084');
});
```

## 🗄️ 存储后端

### 内存存储 (MemoryManager)

适用于单机部署和开发测试：

```typescript
import { MemoryManager } from '@elfdream/mqtt5-backend';

const clientManager = new MemoryManager();
```

### Redis 单机存储 (RedisManager)

适用于单机 Redis 部署：

```typescript
import { RedisManager } from '@elfdream/mqtt5-backend';

const clientManager = new RedisManager({
	host: '127.0.0.1',
	port: 6379,
	password: 'your_password',
	db: 0,
});
```

### Redis 分布式存储 (Redis2Manager)

适用于分布式部署和水平扩展：

```typescript
import { Redis2Manager } from '@elfdream/mqtt5-backend';

const clientManager = new Redis2Manager({
	host: '127.0.0.1',
	port: 6379,
	username: 'your_username',
	password: 'your_password',
	db: 0,
});
```

## 📋 API 文档

### MqttServer

#### 构造函数

```typescript
new MqttServer(clientManager: Manager, options?: IMqttOptions)
```

#### 事件监听器

```typescript
// 连接事件 - 客户端连接时触发
server.onConnect(listener: (data: IConnectData, client: TClient, clientManager: Manager) => Promise<boolean>)

// 断开连接事件 - 客户端断开连接时触发
server.onDisconnect(listener: (data: IDisconnectData, client: TClient, clientManager: Manager) => Promise<boolean>)

// 发布事件 - 客户端发布消息时触发
server.onPublish(listener: (data: IPublishData, client: TClient, clientManager: Manager) => Promise<boolean>)

// 发布确认事件 - QoS 1 消息发布确认时触发
server.onPubAck(listener: (data: IPubAckData, client: TClient, clientManager: Manager) => Promise<boolean>)

// 发布接收事件 - QoS 2 消息发布接收时触发
server.onPubRec(listener: (data: IPubRecData, client: TClient, clientManager: Manager) => Promise<boolean>)

// 发布释放事件 - QoS 2 消息发布释放时触发
server.onPubRel(listener: (data: IPubRelData, client: TClient, clientManager: Manager) => Promise<boolean>)

// 发布完成事件 - QoS 2 消息发布完成时触发
server.onPubComp(listener: (data: IPubCompData, client: TClient, clientManager: Manager) => Promise<boolean>)

// 订阅事件 - 客户端订阅主题时触发
server.onSubscribe(listener: (data: ISubscribeData, client: TClient, clientManager: Manager) => Promise<boolean>)

// 取消订阅事件 - 客户端取消订阅时触发
server.onUnsubscribe(listener: (data: IUnsubscribeData, client: TClient, clientManager: Manager) => Promise<boolean>)

// Ping 事件 - 客户端发送心跳包时触发
server.onPing(listener: (client: TClient, clientManager: Manager) => Promise<boolean>)

// 认证事件 - 客户端进行认证时触发
server.onAuth(listener: (data: IAuthData, client: TClient, clientManager: Manager) => Promise<boolean>)
```

**事件监听器说明**：

- 所有事件监听器都返回 `Promise<boolean | void>`
- 返回 `true` 或 `void`（不返回值）表示允许操作继续
- 返回 `false` 或抛出异常表示拒绝操作
- 可以通过抛出相应的异常来返回错误码和错误信息

#### 服务器方法

```typescript
// 启动服务器
server.listen(port: number, hostname?: string, callback?: () => void)

// 关闭服务器
server.close(callback?: (err?: Error) => void)

// 获取服务器地址
server.address()

// 获取连接数
server.getConnections(callback: (error: Error | null, count: number) => void)
```

### 配置选项 (IMqttOptions)

```typescript
interface IMqttOptions {
	protocolName?: 'MQTT' | 'MQIsdp'; // 协议名称，默认 'MQTT'
	// MQTT v3.1 使用 'MQIsdp'，MQTT v3.1.1 和 v5.0 使用 'MQTT'
	protocolVersions?: Array<number>; // 协议版本，默认 [3, 4, 5]
	// 3 = MQTT v3.1, 4 = MQTT v3.1.1, 5 = MQTT v5.0
	// 可以设置为 [3, 4] 仅支持 v3.1 和 v3.1.1，或 [5] 仅支持 v5.0
	automaticallyAssignedClientIdentifier?: boolean; // 是否自动分配客户端ID，默认 true
	maximumQoS?: QoSType; // 最大QoS级别，默认 QoS2
	retainAvailable?: boolean; // 是否支持保留消息，默认 true
	retainTTL?: number; // 保留消息TTL（秒），默认 1800
	maximumPacketSize?: number; // 最大数据包大小，默认 1MB
	topicAliasMaximum?: number; // 主题别名最大值，默认 65535（仅 MQTT v5.0）
	wildcardSubscriptionAvailable?: boolean; // 是否支持通配符订阅，默认 true
	subscriptionIdentifierAvailable?: boolean; // 订阅标识符可用，默认 true（仅 MQTT v5.0）
	sharedSubscriptionAvailable?: boolean; // 共享订阅可用，默认 false（仅 MQTT v5.0）
	sessionExpiryInterval?: number; // 会话过期时间（秒），默认 0（仅 MQTT v5.0）
	sendReasonMessage?: boolean; // 是否发送原因消息（仅 MQTT v5.0）
	receiveMaximum?: number; // 接收最大值，控制接受 PUBLISH QoS 1 和 QoS 2 报文数量，默认 65535（仅 MQTT v5.0）
	serverKeepAlive?: number; // 服务端保持连接时间（秒），默认 0（仅 MQTT v5.0）
}
```

## 📡 协议版本兼容性

### 支持的协议版本

本库默认支持以下 MQTT 协议版本：

- **MQTT v3.1** (协议版本号: 3) - 使用协议名称 `MQIsdp`
- **MQTT v3.1.1** (协议版本号: 4) - 使用协议名称 `MQTT`
- **MQTT v5.0** (协议版本号: 5) - 使用协议名称 `MQTT`

### 版本差异说明

#### MQTT v3.1 和 v3.1.1

- 不支持用户属性（User Properties）
- 不支持原因字符串（Reason String）
- 不支持主题别名（Topic Alias）
- 不支持订阅标识符（Subscription Identifier）
- 不支持会话过期时间（Session Expiry Interval）
- 不支持共享订阅（Shared Subscription）
- 不支持增强认证（Enhanced Authentication）

#### MQTT v5.0 特性

MQTT v5.0 在 v3.1.1 基础上新增了以下特性：

- ✅ 用户属性（User Properties）
- ✅ 原因字符串（Reason String）
- ✅ 主题别名（Topic Alias）
- ✅ 订阅标识符（Subscription Identifier）
- ✅ 会话过期时间（Session Expiry Interval）
- ✅ 共享订阅（Shared Subscription）
- ✅ 增强认证（Enhanced Authentication）
- ✅ 服务器保持连接（Server Keep Alive）
- ✅ 请求/响应信息（Request/Response Information）

### 配置协议版本支持

#### 默认配置（支持所有版本）

```typescript
const server = new MqttServer(clientManager);
// 默认支持 [3, 4, 5]，即 MQTT v3.1、v3.1.1 和 v5.0
```

#### 仅支持 MQTT v3.1 和 v3.1.1

```typescript
const server = new MqttServer(clientManager, {
	protocolVersions: [3, 4], // 仅支持 v3.1 和 v3.1.1
});
```

#### 仅支持 MQTT v5.0

```typescript
const server = new MqttServer(clientManager, {
	protocolVersions: [5], // 仅支持 v5.0
});
```

### 协议名称说明

- **MQTT v3.1**: 使用协议名称 `MQIsdp`
- **MQTT v3.1.1**: 使用协议名称 `MQTT`
- **MQTT v5.0**: 使用协议名称 `MQTT`

在配置中，`protocolName` 选项主要用于兼容性检查，默认值为 `'MQTT'`。服务器会根据客户端连接时发送的协议名称和版本号自动识别协议版本。

### 混合版本部署

服务器可以同时处理不同协议版本的客户端连接。每个客户端连接后，服务器会根据其协议版本使用相应的报文格式和特性：

```typescript
// 同时支持 v3.1、v3.1.1 和 v5.0 客户端
const server = new MqttServer(clientManager, {
	protocolVersions: [3, 4, 5], // 默认值
});

server.onConnect(async (data, client, clientManager) => {
	const version = data.header.protocolVersion;
	if (version === 3) {
		console.log('MQTT v3.1 客户端连接');
	} else if (version === 4) {
		console.log('MQTT v3.1.1 客户端连接');
	} else if (version === 5) {
		console.log('MQTT v5.0 客户端连接');
		// 可以使用 v5.0 特有特性
		console.log('会话过期时间:', data.properties.sessionExpiryInterval);
	}
	return true;
});
```

## 🔧 高级用法

### QoS 消息处理

```typescript
// QoS 1 消息发布确认处理
server.onPubAck(async (data, client, clientManager) => {
	const clientId = clientManager.clientIdentifierManager.getClient(client)?.identifier;
	console.log(`客户端 ${clientId} 确认收到 QoS 1 消息，包ID: ${data.header.packetIdentifier}`);
	return true;
});

// QoS 2 消息四步握手处理
server.onPubRec(async (data, client, clientManager) => {
	console.log(`收到 QoS 2 消息接收确认，包ID: ${data.header.packetIdentifier}`);
	return true;
});

server.onPubRel(async (data, client, clientManager) => {
	console.log(`收到 QoS 2 消息释放请求，包ID: ${data.header.packetIdentifier}`);
	return true;
});

server.onPubComp(async (data, client, clientManager) => {
	console.log(`QoS 2 消息处理完成，包ID: ${data.header.packetIdentifier}`);
	return true;
});
```

### 自定义认证

```typescript
server.onConnect(async (data, client, clientManager) => {
	// 验证客户端ID
	if (!data.payload.clientIdentifier) {
		throw new ConnectAckException(ConnectAckReasonCode.CLIENT_IDENTIFIER_NOT_VALID);
	}

	// 验证用户名密码
	if (data.payload.username && data.payload.password) {
		const isValid = await validateCredentials(data.payload.username, data.payload.password);
		if (!isValid) {
			throw new ConnectAckException(ConnectAckReasonCode.BAD_USER_NAME_OR_PASSWORD);
		}
	}

	return true;
});
```

### 增强认证 (Enhanced Authentication)

```typescript
server.onAuth(async (data, client, clientManager) => {
	// 处理 MQTT v5 增强认证
	console.log('收到认证请求:', data);

	// 验证认证数据
	if (data.properties?.authenticationData) {
		const authData = data.properties.authenticationData;
		// 处理认证逻辑
		const isValid = await validateAuthData(authData);
		if (!isValid) {
			throw new AuthenticateException(AuthenticateReasonCode.CONTINUE_AUTHENTICATION);
		}
	}

	return true;
});
```

### 订阅管理

```typescript
server.onSubscribe(async (data, client, clientManager) => {
	const clientId = clientManager.clientIdentifierManager.getClient(client)?.identifier;

	// 检查订阅权限
	for (const subscription of data.subscriptions) {
		const topic = subscription.topicFilter;
		const qos = subscription.qos;

		// 验证主题权限
		if (!hasSubscribePermission(clientId, topic)) {
			throw new SubscribeAckException(SubscribeAckReasonCode.NOT_AUTHORIZED);
		}

		// 检查 QoS 级别
		if (qos > MAX_QOS_LEVEL) {
			throw new SubscribeAckException(SubscribeAckReasonCode.QOS_NOT_SUPPORTED);
		}

		console.log(`客户端 ${clientId} 订阅主题 ${topic}，QoS: ${qos}`);
	}

	return true;
});

server.onUnsubscribe(async (data, client, clientManager) => {
	const clientId = clientManager.clientIdentifierManager.getClient(client)?.identifier;

	// 记录取消订阅
	for (const topicFilter of data.topicFilters) {
		console.log(`客户端 ${clientId} 取消订阅主题 ${topicFilter}`);
	}

	return true;
});
```

### 消息过滤和处理

```typescript
server.onPublish(async (data, client, clientManager) => {
	// 检查主题权限
	const clientId = clientManager.clientIdentifierManager.getClient(client)?.identifier;
	if (!hasTopicPermission(clientId, data.topic)) {
		throw new PubAckException(PubAckReasonCode.NOT_AUTHORIZED);
	}

	// 消息内容验证
	if (data.payload.length > MAX_MESSAGE_SIZE) {
		throw new PubAckException(PubAckReasonCode.PACKET_TOO_LARGE);
	}

	// 记录消息日志
	console.log(`客户端 ${clientId} 发布消息到主题 ${data.topic}`);

	return true;
});
```

### 异常处理

```typescript
import {
	ConnectAckException,
	ConnectAckReasonCode,
	PubAckException,
	PubAckReasonCode,
	SubscribeAckException,
	SubscribeAckReasonCode,
	AuthenticateException,
	AuthenticateReasonCode,
} from '@elfdream/mqtt5-backend';

// 连接异常处理
server.onConnect(async (data, client, clientManager) => {
	try {
		// 验证逻辑
		if (!isValidClient(data.payload.clientIdentifier)) {
			throw new ConnectAckException(ConnectAckReasonCode.CLIENT_IDENTIFIER_NOT_VALID);
		}
		return true;
	} catch (error) {
		// 异常会被自动处理并发送相应的响应
		throw error;
	}
});

// 发布异常处理
server.onPublish(async (data, client, clientManager) => {
	if (data.payload.length > MAX_SIZE) {
		throw new PubAckException(PubAckReasonCode.PACKET_TOO_LARGE);
	}
	return true;
});

// 订阅异常处理
server.onSubscribe(async (data, client, clientManager) => {
	for (const subscription of data.subscriptions) {
		if (!isValidTopic(subscription.topicFilter)) {
			throw new SubscribeAckException(SubscribeAckReasonCode.TOPIC_FILTER_INVALID);
		}
	}
	return true;
});
```

### 保留消息管理

```typescript
// 添加保留消息
await clientManager.addRetainMessage(
	'sensor/temperature',
	{
		header: {
			/* ... */
		},
		topic: 'sensor/temperature',
		payload: Buffer.from('25.5'),
	},
	3600,
); // TTL: 1小时

// 获取保留消息
const retainMessage = await clientManager.getRetainMessage('sensor/temperature');

// 遍历保留消息
await clientManager.forEachRetainMessage(async (topic, data) => {
	console.log(`保留消息 - 主题: ${topic}, 内容: ${data.payload}`);
}, 'sensor/+'); // 支持通配符
```

## 🌐 分布式部署

### Redis 配置

确保 Redis 配置了键空间通知：

```redis
# redis.conf
notify-keyspace-events Ex
```

### 环境变量

```bash
# .env
MQTT_HOST=0.0.0.0
MQTT_PORT=1883
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_USERNAME=your_username
REDIS_PASSWORD=your_password
REDIS_DB=0
```

### 多实例部署

```typescript
// 实例 1
const clientManager1 = new Redis2Manager({
	host: 'redis-cluster-1.example.com',
	port: 6379,
});

// 实例 2
const clientManager2 = new Redis2Manager({
	host: 'redis-cluster-2.example.com',
	port: 6379,
});

// 两个实例可以共享订阅和消息
```

## 🧪 测试

```bash
# 运行测试
npm test

# 开发模式
npm run dev

# 构建生产版本
npm run build:prod
```

## 📊 性能测试

### 基准测试结果

我们对 MQTT5 后端服务进行了全面的性能测试。测试结果显示出色的性能特征：

- **连接处理能力**: 960 cps (每秒连接数)
- **订阅处理能力**: 923 cps (每秒订阅数)
- **消息推送能力**: 12,124 qps (每秒消息数)
- **最大连接数**: 28,232 个并发连接
- **资源效率**: 低 CPU 占用 (空闲时 0.14%) 和内存消耗 (< 21%)

📋 **[查看完整性能测试报告](simple-test.md)**

测试报告包含详细分析、与其他 MQTT Broker 的对比以及优化建议。

## 📊 性能优化

### Redis 优化

1. **连接池配置**：

```typescript
const clientManager = new Redis2Manager({
	host: '127.0.0.1',
	port: 6379,
	lazyConnect: true,
	maxRetriesPerRequest: 3,
	retryDelayOnFailover: 100,
	enableReadyCheck: false,
	maxLoadingTimeout: 10000,
});
```

2. **内存优化**：

```typescript
const clientManager = new MemoryManager();
// 内存管理器自动处理垃圾回收
```

### 服务器优化

```typescript
const server = new MqttServer(clientManager, {
	maximumPacketSize: 1024 * 1024, // 1MB
	retainTTL: 30 * 60, // 30分钟
	topicAliasMaximum: 1000,
});

// 设置最大连接数
server.maxConnections = 10000;
```

## 🔍 故障排除

### 常见问题

1. **连接被拒绝**：

   - 检查端口是否被占用
   - 确认防火墙设置
   - 验证客户端连接参数

2. **Redis 连接失败**：

   - 检查 Redis 服务状态
   - 验证连接参数
   - 确认网络连通性

3. **消息丢失**：
   - 检查 QoS 设置
   - 确认订阅关系
   - 验证网络稳定性

### 调试模式

```typescript
// 启用详细日志
process.env.DEBUG = 'mqtt5-backend:*';

// 监听错误事件
server.on('error', (err) => {
	console.error('服务器错误:', err);
});
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目基于 MIT 许可证开源 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🔗 相关链接

- [MQTT v5 规范](https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html)
- [项目主页](https://gitlab.soraharu.com/xiaoming0000/mqtt5-backend)
- [GitHub 仓库](https://github.com/XiaoMing0000/mqtt5-backend.git)
- [性能测试报告](simple-test.md)

## 📞 支持

如有问题或建议，请通过以下方式联系：

- 提交 [Issue](https://github.com/XiaoMing0000/mqtt5-backend/issues)
- 发送邮件至项目维护者

---

⭐ 如果这个项目对你有帮助，请给它一个星标！

## 🌍 语言支持

- [English](README.md)
- [中文](README.zh.md) (当前)
