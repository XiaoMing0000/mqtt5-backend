import { generateClientIdentifier } from '../utils';

describe('utils', () => {
	describe('generateClientIdentifier', () => {
		test('should be defined', () => {
			expect(generateClientIdentifier).toBeDefined();
			expect(typeof generateClientIdentifier).toBe('function');
		});

		test('should generate a client identifier with correct format', () => {
			const identifier = generateClientIdentifier();

			// 应该以 'mqtt_' 开头
			expect(identifier).toMatch(/^mqtt_/);

			// 应该包含32个十六进制字符（UUID去掉连字符后）
			const hexPart = identifier.replace('mqtt_', '');
			expect(hexPart).toMatch(/^[0-9a-f]{32}$/);

			// 总长度应该是 37 (mqtt_ + 32个字符)
			expect(identifier.length).toBe(37);
		});

		test('should generate unique identifiers on each call', () => {
			const identifiers = new Set<string>();

			// 生成100个标识符，确保它们都是唯一的
			for (let i = 0; i < 100; i++) {
				const identifier = generateClientIdentifier();
				identifiers.add(identifier);
			}

			// 所有标识符应该是唯一的
			expect(identifiers.size).toBe(100);
		});

		test('should not contain hyphens', () => {
			const identifier = generateClientIdentifier();

			// UUID 格式中的连字符应该被移除
			expect(identifier).not.toContain('-');
		});

		test('should generate valid hexadecimal characters only', () => {
			const identifier = generateClientIdentifier();
			const hexPart = identifier.replace('mqtt_', '');

			// 只包含十六进制字符 (0-9, a-f)
			expect(hexPart).toMatch(/^[0-9a-f]+$/);
		});

		test('should have consistent format across multiple calls', () => {
			const identifiers = Array.from({ length: 10 }, () => generateClientIdentifier());

			// 所有标识符应该遵循相同的格式
			identifiers.forEach((identifier) => {
				expect(identifier).toMatch(/^mqtt_[0-9a-f]{32}$/);
			});
		});
	});
});
