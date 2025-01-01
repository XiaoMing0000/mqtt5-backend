/* eslint-disable no-undef */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const os = require('os');

module.exports = {
	singleQuote: true,
	trailingComma: 'all',
	endOfLine: os.platform() === 'win32' ? 'crlf' : 'lf',
	printWidth: 180,
	tabWidth: 2,
	useTabs: true,
	quoteProps: 'preserve',
	bracketSpacing: true,
};
