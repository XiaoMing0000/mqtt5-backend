import { BuildOptions } from 'esbuild';

export default {
	entryPoints: {
		index: './src/index.ts',
	},
	entryNames: '[name]',
	assetNames: '[name]',
	bundle: true,
	minify: false,
	loader: {},
	outdir: './dist/',
	sourcemap: 'linked',
	platform: 'node',
	treeShaking: false,
	ignoreAnnotations: true,
	define: {},
} as BuildOptions;
