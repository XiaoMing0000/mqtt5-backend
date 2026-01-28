import { verifyTopic, topicToRegEx, isWildcardTopic } from '../topicFilters';

describe('topicFilters', () => {
	describe('verifyTopic', () => {
		test.each([
			// 简单主题（无通配符）
			['sport', true],
			['sport/tennis', true],
			['sport/tennis/player1', true],
			['sport/tennis/player1/score', true],
			// 有效的单层通配符
			['+', true],
			['#', true],
			// 有效的多层通配符 (#)
			['sport/#', true],
			['sport/tennis/#', true],
			['sport/tennis/player1/#', true],
			// 有效的单层通配符 (+)
			['sport/+', true],
			['sport/+/tennis', true],
			['sport/+/tennis/+', true],
			['+/tennis', true],
			// $ 前缀主题
			['$SYS/monitor', true],
			['$SYS/monitor/#', true],
			['$SYS/+/monitor', true],
			// 无效的 # 通配符使用
			['sport/tennis#', false],
			['sport/#/tennis/#', false],
			// # 通配符边界情况（实际行为）
			['sport/#/tennis', true],
			['#/tennis', true],
			// 无效的 + 通配符使用
			['sport+', false],
			['sport+tennis', false],
			['+sport', false],
			['sport/+tennis', false],
			// 无效的 $ 使用
			['sport/$SYS', false],
			['sport/$', false],
			['$SYS/$monitor', false],
			// 边界情况
			['', true],
			['/', true],
			['sport/', true],
		])('should return %s for topic: %s', (topic, expected: boolean) => {
			expect(verifyTopic(topic)).toBe(expected);
		});
	});

	describe('topicToRegEx', () => {
		test.each([
			// 无效主题（返回 false）
			['sport+', false],
			['sport/$SYS', false],
			// 简单主题（无通配符）
			['sport', '^sport$'],
			['sport/tennis', '^sport/tennis$'],
			['sport/tennis/player1', '^sport/tennis/player1$'],
			['simple/topic/name', '^simple/topic/name$'],
			['a/b/c/d/e', '^a/b/c/d/e$'],
			// # 通配符转换
			['#', '^.*'],
			['sport/#', '^sport/?.*$'],
			['sport/tennis/#', '^sport/tennis/?.*$'],
			// + 通配符转换
			['+', '^[^/]*$'],
			['sport/+', '^sport/[^/]*$'],
			['sport/+/tennis', '^sport/[^/]*/tennis$'],
			['sport/+/tennis/+', '^sport/[^/]*/tennis/[^/]*$'],
			// $ 字符转义
			['$SYS/monitor', '^\\$SYS/monitor$'],
			['$SYS/monitor/#', '^\\$SYS/monitor/?.*$'],
			['$SYS/+/monitor', '^\\$SYS/[^/]*/monitor$'],
			// 组合通配符
			['sport/+/tennis/#', '^sport/[^/]*/tennis/?.*$'],
			['+/tennis/+', '^[^/]*/tennis/[^/]*$'],
			// 边界情况
			['', '^$'],
			['/', '^/$'],
			// # 通配符在中间位置（实际行为）
			['sport/#/tennis', '^sport/?.*/tennis$'],
		] as Array<[string, string | false]>)('should return %s for topic: %s', (topic, expected) => {
			const result = topicToRegEx(topic);
			if (expected === false) {
				expect(result).toBe(false);
			} else {
				expect(result).toBe(expected);
			}
		});
	});

	describe('isWildcardTopic', () => {
		test.each([
			// 简单主题（无通配符）
			['sport', false],
			['sport/tennis', false],
			['sport/tennis/player1', false],
			['$SYS/monitor', false],
			['$SYS/monitor/status', false],
			// 包含 # 通配符
			['#', true],
			['sport/#', true],
			['sport/tennis/#', true],
			// 包含 + 通配符
			['+', true],
			['sport/+', true],
			['sport/+/tennis', true],
			['sport/+/tennis/+', true],
			// 同时包含 # 和 + 通配符
			['sport/+/tennis/#', true],
			['+/tennis/#', true],
			// 包含 $ 和通配符
			['$SYS/monitor/#', true],
			['$SYS/+/monitor', true],
		])('should return %s for topic: %s', (topic, expected: boolean) => {
			expect(isWildcardTopic(topic)).toBe(expected);
		});
	});

	describe('integration tests', () => {
		test.each([
			// sport/# 匹配测试
			['sport/#', 'sport', true],
			['sport/#', 'sport/', true],
			['sport/#', 'sport/tennis', true],
			['sport/#', 'sport/tennis/player1', true],
			['sport/#', 'sport/tennis/player1/score', true],
			['sport/#', 'other', false],
			// sport/+ 匹配测试
			['sport/+', 'sport/tennis', true],
			['sport/+', 'sport/player1', true],
			['sport/+', 'sport/', true],
			['sport/+', 'sport', false],
			['sport/+', 'sport/tennis/player1', false],
			// sport/+/tennis/+ 匹配测试
			['sport/+/tennis/+', 'sport/player1/tennis/score', true],
			['sport/+/tennis/+', 'sport/player2/tennis/result', true],
			['sport/+/tennis/+', 'sport/player1/tennis', false],
			['sport/+/tennis/+', 'sport/tennis/score', false],
			// # 匹配所有测试
			['#', 'sport', true],
			['#', 'sport/tennis', true],
			['#', 'sport/tennis/player1', true],
			['#', '', true],
			// + 匹配单层测试
			['+', 'sport', true],
			['+', 'tennis', true],
			['+', 'sport/tennis', false],
			['+', '', true],
		] as Array<[string, string, boolean]>)('should match topic filter %s with topic %s: %s', (filter, topic, expected: boolean) => {
			const regex = topicToRegEx(filter);
			expect(regex).not.toBe(false);
			const regexPattern = new RegExp(regex as string);
			expect(regexPattern.test(topic)).toBe(expected);
		});
	});
});
