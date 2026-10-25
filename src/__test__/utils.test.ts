import { generateClientIdentifier } from '../utils';

describe('utils', () => {
  describe('generateClientIdentifier', () => {
    test('should be defined', () => {
      expect(generateClientIdentifier).toBeDefined();
      expect(typeof generateClientIdentifier).toBe('function');
    });

    test('should generate a client identifier with correct format', () => {
      const identifier = generateClientIdentifier();

      // Should start with 'mqtt_'
      expect(identifier).toMatch(/^mqtt_/);

      // Should contain 32 hexadecimal characters (the UUID without hyphens)
      const hexPart = identifier.replace('mqtt_', '');
      expect(hexPart).toMatch(/^[0-9a-f]{32}$/);

      // Total length should be 37 (mqtt_ + 32 characters)
      expect(identifier.length).toBe(37);
    });

    test('should generate unique identifiers on each call', () => {
      const identifiers = new Set<string>();

      // Generate 100 identifiers and ensure they are all unique
      for (let i = 0; i < 100; i++) {
        const identifier = generateClientIdentifier();
        identifiers.add(identifier);
      }

      // All identifiers should be unique
      expect(identifiers.size).toBe(100);
    });

    test('should not contain hyphens', () => {
      const identifier = generateClientIdentifier();

      // Hyphens from the UUID should be removed
      expect(identifier).not.toContain('-');
    });

    test('should generate valid hexadecimal characters only', () => {
      const identifier = generateClientIdentifier();
      const hexPart = identifier.replace('mqtt_', '');

      // Contains only hexadecimal characters (0-9, a-f)
      expect(hexPart).toMatch(/^[0-9a-f]+$/);
    });

    test('should have consistent format across multiple calls', () => {
      const identifiers = Array.from({ length: 10 }, () => generateClientIdentifier());

      // All identifiers should follow the same format
      identifiers.forEach((identifier) => {
        expect(identifier).toMatch(/^mqtt_[0-9a-f]{32}$/);
      });
    });
  });
});
