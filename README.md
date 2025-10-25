# @elfdream/mqtt5-backend

[![npm version](https://badge.fury.io/js/%40elfdream%2Fmqtt5-backend.svg)](https://badge.fury.io/js/%40elfdream%2Fmqtt5-backend)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Node.js-based MQTT v5 protocol cloud service backend implementation with support for multiple transport protocols and storage backends.

## ✨ Features

- 🚀 **Complete MQTT v5 Protocol Support** - Implements all MQTT v5 specification features
- 🔒 **Multiple Transport Protocols** - Supports TCP, TLS/SSL, WebSocket, WSS
- 💾 **Multiple Storage Backends** - Memory storage, Redis single-instance, Redis distributed
- 📡 **Distributed Architecture** - Supports horizontal scaling and cluster deployment
- 🛡️ **Type Safety** - Complete TypeScript type definitions
- ⚡ **High Performance** - Optimized message processing and distribution mechanisms
- 🔧 **Flexible Configuration** - Rich configuration options and event hooks

## 📦 Installation

```bash
npm install @elfdream/mqtt5-backend
```

## 🚀 Quick Start

### Basic TCP Server

```typescript
import { MqttServer, MemoryManager } from '@elfdream/mqtt5-backend';

// Create client manager
const clientManager = new MemoryManager();

// Create MQTT server
const server = new MqttServer(clientManager);

// Listen for connection events
server.onConnect(async (data, client, clientManager) => {
	console.log('Client connected:', data);
	return true; // Allow connection
});

// Listen for publish events
server.onPublish(async (data, client, clientManager) => {
	console.log('Message received:', data);
	return true; // Allow publish
});

// Start server
server.listen(1883, () => {
	console.log('MQTT server listening on port 1883');
});
```

### TLS/SSL Server

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
	console.log('MQTT TLS server listening on port 8883');
});
```

### WebSocket Server

```typescript
import { MqttServerWebSocket, MemoryManager } from '@elfdream/mqtt5-backend';

const clientManager = new MemoryManager();
const server = new MqttServerWebSocket(clientManager);

server.listen(8083, () => {
	console.log('MQTT WebSocket server listening on port 8083');
});
```

## 🗄️ Storage Backends

### Memory Storage (MemoryManager)

Suitable for single-instance deployment and development testing:

```typescript
import { MemoryManager } from '@elfdream/mqtt5-backend';

const clientManager = new MemoryManager();
```

### Redis Single-Instance Storage (RedisManager)

Suitable for single-instance Redis deployment:

```typescript
import { RedisManager } from '@elfdream/mqtt5-backend';

const clientManager = new RedisManager({
	host: '127.0.0.1',
	port: 6379,
	password: 'your_password',
	db: 0,
});
```

### Redis Distributed Storage (Redis2Manager)

Suitable for distributed deployment and horizontal scaling:

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

## 📋 API Documentation

### MqttServer

#### Constructor

```typescript
new MqttServer(clientManager: Manager, options?: IMqttOptions)
```

#### Event Listeners

```typescript
// Connection event - triggered when client connects
server.onConnect(listener: (data: IConnectData, client: TClient, clientManager: Manager) => Promise<boolean>)

// Disconnect event - triggered when client disconnects
server.onDisconnect(listener: (data: IDisconnectData, client: TClient, clientManager: Manager) => Promise<boolean>)

// Publish event - triggered when client publishes message
server.onPublish(listener: (data: IPublishData, client: TClient, clientManager: Manager) => Promise<boolean>)

// Publish acknowledgment event - triggered for QoS 1 message acknowledgment
server.onPubAck(listener: (data: IPubAckData, client: TClient, clientManager: Manager) => Promise<boolean>)

// Publish receive event - triggered for QoS 2 message receive
server.onPubRec(listener: (data: IPubRecData, client: TClient, clientManager: Manager) => Promise<boolean>)

// Publish release event - triggered for QoS 2 message release
server.onPubRel(listener: (data: IPubRelData, client: TClient, clientManager: Manager) => Promise<boolean>)

// Publish complete event - triggered for QoS 2 message completion
server.onPubComp(listener: (data: IPubCompData, client: TClient, clientManager: Manager) => Promise<boolean>)

// Subscribe event - triggered when client subscribes to topic
server.onSubscribe(listener: (data: ISubscribeData, client: TClient, clientManager: Manager) => Promise<boolean>)

// Unsubscribe event - triggered when client unsubscribes
server.onUnsubscribe(listener: (data: IUnsubscribeData, client: TClient, clientManager: Manager) => Promise<boolean>)

// Ping event - triggered when client sends heartbeat
server.onPing(listener: (client: TClient, clientManager: Manager) => Promise<boolean>)

// Authentication event - triggered when client authenticates
server.onAuth(listener: (data: IAuthData, client: TClient, clientManager: Manager) => Promise<boolean>)
```

**Event Listener Notes**:

- All event listeners return `Promise<boolean>`
- Return `true` to allow the operation to continue
- Return `false` or throw an exception to reject the operation
- Can throw appropriate exceptions to return error codes and error messages

#### Server Methods

```typescript
// Start server
server.listen(port: number, hostname?: string, callback?: () => void)

// Close server
server.close(callback?: (err?: Error) => void)

// Get server address
server.address()

// Get connection count
server.getConnections(callback: (error: Error | null, count: number) => void)
```

### Configuration Options (IMqttOptions)

```typescript
interface IMqttOptions {
	protocolName?: string; // Protocol name, default 'MQTT'
	protocolVersion?: number; // Protocol version, default 5
	assignedClientIdentifier?: boolean; // Whether to assign client ID
	maximumQoS?: QoSType; // Maximum QoS level
	retainAvailable?: boolean; // Whether to support retained messages
	retainTTL?: number; // Retained message TTL (seconds)
	maximumPacketSize?: number; // Maximum packet size
	topicAliasMaximum?: number; // Maximum topic alias
	wildcardSubscriptionAvailable?: boolean; // Whether to support wildcard subscriptions
	sendReasonMessage?: boolean; // Whether to send reason messages
}
```

## 🔧 Advanced Usage

### QoS Message Handling

```typescript
// QoS 1 message publish acknowledgment handling
server.onPubAck(async (data, client, clientManager) => {
	const clientId = clientManager.clientIdentifierManager.getClient(client)?.identifier;
	console.log(`Client ${clientId} acknowledged QoS 1 message, packet ID: ${data.header.packetIdentifier}`);
	return true;
});

// QoS 2 message four-step handshake handling
server.onPubRec(async (data, client, clientManager) => {
	console.log(`Received QoS 2 message receive acknowledgment, packet ID: ${data.header.packetIdentifier}`);
	return true;
});

server.onPubRel(async (data, client, clientManager) => {
	console.log(`Received QoS 2 message release request, packet ID: ${data.header.packetIdentifier}`);
	return true;
});

server.onPubComp(async (data, client, clientManager) => {
	console.log(`QoS 2 message processing completed, packet ID: ${data.header.packetIdentifier}`);
	return true;
});
```

### Custom Authentication

```typescript
server.onConnect(async (data, client, clientManager) => {
	// Validate client ID
	if (!data.payload.clientIdentifier) {
		throw new ConnectAckException(ConnectAckReasonCode.CLIENT_IDENTIFIER_NOT_VALID);
	}

	// Validate username and password
	if (data.payload.username && data.payload.password) {
		const isValid = await validateCredentials(data.payload.username, data.payload.password);
		if (!isValid) {
			throw new ConnectAckException(ConnectAckReasonCode.BAD_USER_NAME_OR_PASSWORD);
		}
	}

	return true;
});
```

### Enhanced Authentication

```typescript
server.onAuth(async (data, client, clientManager) => {
	// Handle MQTT v5 enhanced authentication
	console.log('Authentication request received:', data);

	// Validate authentication data
	if (data.properties?.authenticationData) {
		const authData = data.properties.authenticationData;
		// Handle authentication logic
		const isValid = await validateAuthData(authData);
		if (!isValid) {
			throw new AuthenticateException(AuthenticateReasonCode.CONTINUE_AUTHENTICATION);
		}
	}

	return true;
});
```

### Subscription Management

```typescript
server.onSubscribe(async (data, client, clientManager) => {
	const clientId = clientManager.clientIdentifierManager.getClient(client)?.identifier;

	// Check subscription permissions
	for (const subscription of data.subscriptions) {
		const topic = subscription.topicFilter;
		const qos = subscription.qos;

		// Validate topic permissions
		if (!hasSubscribePermission(clientId, topic)) {
			throw new SubscribeAckException(SubscribeAckReasonCode.NOT_AUTHORIZED);
		}

		// Check QoS level
		if (qos > MAX_QOS_LEVEL) {
			throw new SubscribeAckException(SubscribeAckReasonCode.QOS_NOT_SUPPORTED);
		}

		console.log(`Client ${clientId} subscribed to topic ${topic}, QoS: ${qos}`);
	}

	return true;
});

server.onUnsubscribe(async (data, client, clientManager) => {
	const clientId = clientManager.clientIdentifierManager.getClient(client)?.identifier;

	// Log unsubscription
	for (const topicFilter of data.topicFilters) {
		console.log(`Client ${clientId} unsubscribed from topic ${topicFilter}`);
	}

	return true;
});
```

### Message Filtering and Processing

```typescript
server.onPublish(async (data, client, clientManager) => {
	// Check topic permissions
	const clientId = clientManager.clientIdentifierManager.getClient(client)?.identifier;
	if (!hasTopicPermission(clientId, data.topic)) {
		throw new PubAckException(PubAckReasonCode.NOT_AUTHORIZED);
	}

	// Message content validation
	if (data.payload.length > MAX_MESSAGE_SIZE) {
		throw new PubAckException(PubAckReasonCode.PACKET_TOO_LARGE);
	}

	// Log message
	console.log(`Client ${clientId} published message to topic ${data.topic}`);

	return true;
});
```

### Exception Handling

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

// Connection exception handling
server.onConnect(async (data, client, clientManager) => {
	try {
		// Validation logic
		if (!isValidClient(data.payload.clientIdentifier)) {
			throw new ConnectAckException(ConnectAckReasonCode.CLIENT_IDENTIFIER_NOT_VALID);
		}
		return true;
	} catch (error) {
		// Exceptions are automatically handled and appropriate responses are sent
		throw error;
	}
});

// Publish exception handling
server.onPublish(async (data, client, clientManager) => {
	if (data.payload.length > MAX_SIZE) {
		throw new PubAckException(PubAckReasonCode.PACKET_TOO_LARGE);
	}
	return true;
});

// Subscribe exception handling
server.onSubscribe(async (data, client, clientManager) => {
	for (const subscription of data.subscriptions) {
		if (!isValidTopic(subscription.topicFilter)) {
			throw new SubscribeAckException(SubscribeAckReasonCode.TOPIC_FILTER_INVALID);
		}
	}
	return true;
});
```

### Retained Message Management

```typescript
// Add retained message
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
); // TTL: 1 hour

// Get retained message
const retainMessage = await clientManager.getRetainMessage('sensor/temperature');

// Iterate retained messages
await clientManager.forEachRetainMessage(async (topic, data) => {
	console.log(`Retained message - Topic: ${topic}, Content: ${data.payload}`);
}, 'sensor/+'); // Supports wildcards
```

## 🌐 Distributed Deployment

### Redis Configuration

Ensure Redis is configured with keyspace notifications:

```redis
# redis.conf
notify-keyspace-events Ex
```

### Environment Variables

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

### Multi-Instance Deployment

```typescript
// Instance 1
const clientManager1 = new Redis2Manager({
	host: 'redis-cluster-1.example.com',
	port: 6379,
});

// Instance 2
const clientManager2 = new Redis2Manager({
	host: 'redis-cluster-2.example.com',
	port: 6379,
});

// Both instances can share subscriptions and messages
```

## 🧪 Testing

```bash
# Run tests
npm test

# Development mode
npm run dev

# Build production version
npm run build:prod
```

## 📊 Performance Testing

### Benchmark Results

We have conducted comprehensive performance testing on the MQTT5 backend service. The test results show excellent performance characteristics:

- **Connection Handling**: 960 cps (connections per second)
- **Subscription Processing**: 923 cps (subscriptions per second)
- **Message Publishing**: 12,124 qps (messages per second)
- **Maximum Connections**: 28,232 concurrent connections
- **Resource Efficiency**: Low CPU usage (0.14% idle) and memory consumption (< 21%)

📋 **[View Complete Performance Test Report](simple-test.md)**

The test report includes detailed analysis, comparison with other MQTT brokers, and optimization recommendations.

## 📊 Performance Optimization

### Redis Optimization

1. **Connection Pool Configuration**:

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

2. **Memory Optimization**:

```typescript
const clientManager = new MemoryManager();
// Memory manager automatically handles garbage collection
```

### Server Optimization

```typescript
const server = new MqttServer(clientManager, {
	maximumPacketSize: 1024 * 1024, // 1MB
	retainTTL: 30 * 60, // 30 minutes
	topicAliasMaximum: 1000,
});

// Set maximum connections
server.maxConnections = 10000;
```

## 🔍 Troubleshooting

### Common Issues

1. **Connection Refused**:

   - Check if port is occupied
   - Verify firewall settings
   - Validate client connection parameters

2. **Redis Connection Failed**:

   - Check Redis service status
   - Verify connection parameters
   - Confirm network connectivity

3. **Message Loss**:
   - Check QoS settings
   - Confirm subscription relationships
   - Verify network stability

### Debug Mode

```typescript
// Enable verbose logging
process.env.DEBUG = 'mqtt5-backend:*';

// Listen for error events
server.on('error', (err) => {
	console.error('Server error:', err);
});
```

## 🤝 Contributing

Issues and Pull Requests are welcome!

1. Fork the project
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Related Links

- [MQTT v5 Specification](https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html)
- [Project Homepage](https://gitlab.soraharu.com/xiaoming0000/mqtt5-backend)
- [GitHub Repository](https://github.com/XiaoMing0000/mqtt5-backend.git)
- [Performance Test Report](simple-test.md)

## 📞 Support

For questions or suggestions, please contact us through:

- Submit an [Issue](https://github.com/XiaoMing0000/mqtt5-backend/issues)
- Send an email to the project maintainer

---

⭐ If this project helps you, please give it a star!

## 🌍 Language Support

- [English](README.md) (Current)
- [中文](README.zh.md)
