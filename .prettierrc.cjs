const os = require('os');

module.exports = {
	singleQuote: true,
	trailingComma: 'none',
	endOfLine: os.platform() === 'win32' ? 'crlf' : 'lf',
	printWidth: 180,
	tabWidth: 2,
	useTabs: true,
	quoteProps: 'preserve',
	bracketSpacing: true,
};

