const os = require('os');

module.exports = {
	singleQuote: true,
	trailingComma: 'all',
	endOfLine: os.platform() === 'win32' ? 'crlf' : 'lf',
	printWidth: 180,
	tabWidth: 4,
	useTabs: true,
	quoteProps: 'preserve',
	bracketSpacing: true,
};

