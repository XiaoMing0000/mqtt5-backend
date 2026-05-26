import crypto from 'crypto';

/**
 * Generates a unique MQTT client identifier.
 *
 * Format: `mqtt_` followed by a UUID with hyphens removed (32 hexadecimal digits),
 * for example `mqtt_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.
 *
 * @returns A client identifier string derived from a random UUID to reduce collision risk.
 */
export function generateClientIdentifier() {
	return 'mqtt_' + crypto.randomUUID().replace(/-/g, '');
}
