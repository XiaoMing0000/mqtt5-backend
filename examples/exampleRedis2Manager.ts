import { MqttServer, MqttServerTLS, MqttServerWebSocket, MqttServerWebSocketSecure, Redis2Manager } from '../src';
import tls from 'tls';
import fs from 'fs';
import path from 'path';

const clientManager = new Redis2Manager({
	host: process.env.redisHost,
	port: Number(process.env.redisPort),
	username: process.env.redisUsername,
	password: process.env.redisPassword,
	db: Number(process.env.redisDB),
});

const tlsOptions: tls.TlsOptions = {
	cert: fs.readFileSync(path.join(__dirname, '../temp/test.com.crt')),
	key: fs.readFileSync(path.join(__dirname, '../temp/test.com.key')),
	keepAlive: true,
};

const mqttServer = new MqttServer(clientManager);
const mqttsServer = new MqttServerTLS(tlsOptions, clientManager);
const wsMqttServer = new MqttServerWebSocket(clientManager);
const wssMqttServer = new MqttServerWebSocketSecure(tlsOptions, clientManager);






mqttServer.listen(1883, () => {
	console.log(`MQTT server listening on port 1883。`);



});

mqttsServer.listen(8883, () => {
	console.log(`MQTT TLS server listening on port 8883.`);
});

wsMqttServer.listen(8083, () => {
	console.log(`MQTT WebSocket server listening on port 8083.`);
});

wssMqttServer.listen(8084, () => {
	console.log(`MQTT WebSocket Secure server listening on port 8084.`);
});
