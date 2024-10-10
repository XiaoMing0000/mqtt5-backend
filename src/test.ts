import { MqttServer } from '.';

const server = new MqttServer({});

server.listen(1883, () => {
	console.log('MQTT server listening on port 1883');
});
