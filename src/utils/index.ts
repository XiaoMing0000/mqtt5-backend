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

/**
 * Generates a unique token for one connection instance.
 *
 * Used to distinguish an old connection from a new one when a session is taken
 * over across processes (the same client identifier connecting to a different process).
 *
 * @returns A random UUID string, unique per connection instance.
 */
export function generateConnectionToken(): string {
  return crypto.randomUUID();
}
