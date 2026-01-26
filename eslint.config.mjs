import globals from 'globals';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig([
	{
		ignores: ['dist', 'node_modules', 'temp', '**/*min.js', 'examples/test.ts'],
	},
	...tseslint.configs.recommended,
	{
		files: ['**/*.{ts,tsx,mts}'],
		plugins: { '@typescript-eslint': tseslint.plugin },
		languageOptions: {
			parser: tseslint.parser,
			globals: globals.node,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module',
			},
		},
		extends: [...tseslint.configs.recommended],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',	// ⚠️ 允许 any
			'@typescript-eslint/no-unused-expressions': 'off', // 🔥 允许表达式语句
			'no-undef': 'off', // 用 TS 版本，关掉 JS 原生检测
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					vars: 'all',
					args: 'all',
					ignoreRestSiblings: true,
					varsIgnorePattern: '^_',
					argsIgnorePattern: '^_',
					caughtErrors: 'none',
				}
			],
			'no-useless-escape': 'error', // 🧬 禁止不必要的转义字符
		}
	}

]);