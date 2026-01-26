import os from 'os';

export default {
	singleQuote: true,
	trailingComma: 'all',
	endOfLine: os.platform() === 'win32' ? 'crlf' : 'lf',
	printWidth: 180,
	tabWidth: 2,
	useTabs: true,
	quoteProps: 'preserve',
	bracketSpacing: true,
};
