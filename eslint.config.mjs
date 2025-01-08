import globals from 'globals';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
	{ files: ['./src/**/*.{js,mjs,cjs,ts}'] },
	{ languageOptions: { globals: globals.browser } },
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,
	{
		'rules': {
			'@typescript-eslint/no-explicit-any': ['off'], // 关闭类型为 any 报错
			'@typescript-eslint/no-unused-expressions': ['off'], // 表达式语句
			'@typescript-eslint/no-unused-vars': ['warn'], // 将变量未引用设置未 warn
		},
	},
];
