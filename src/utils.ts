import crypto from 'crypto';

export function generateClientIdentifier() {
	return 'mqtt_' + crypto.randomUUID().replace(/-/g, '');
}
