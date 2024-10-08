import { MqttServer } from '.';

const server = new MqttServer({});

server.on('connect', (connData) => {
	console.log('--------------------------------------------2');
	console.log(connData);
	console.log('--------------------------------------------3');
});

server.listen(1883, () => {
	console.log('MQTT server listening on port 1883');
});
