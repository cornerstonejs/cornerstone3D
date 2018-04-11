const path = require('path');
const webpackConfig = require('../webpack');

/* eslint no-process-env:0 */
process.env.CHROME_BIN = require('puppeteer').executablePath();

// Deleting output.library to avoid "Uncaught SyntaxError: Unexpected token /" error
// when running testes (var test/foo_test.js = ...)
delete webpackConfig.output.library;

// Karma will build the dependecy tree by itself
delete webpackConfig.entry;

// Code coverage
webpackConfig.module.rules.push({
  test: /\.js$/,
  include: path.resolve('./src/'),
  loader: 'istanbul-instrumenter-loader',
  query: {
    esModules: true
  }
});

module.exports = {
  basePath: '../../',
  frameworks: ['mocha'],
  reporters: ['progress', 'coverage', 'spec'],
  files: [
    'node_modules/cornerstone-core/dist/cornerstone.js',
    'node_modules/dicom-parser/dist/dicomParser.js',
    'test/**/*_test.js',
    {pattern: 'testImages/*', included: false},
    {pattern: 'dist/*', included: false},
    {pattern: 'codecs/*', included: true},
  ],

  plugins: [
    'karma-webpack',
    'karma-mocha',
    'karma-chrome-launcher',
    'karma-firefox-launcher',
    'karma-coverage',
    'karma-spec-reporter'
  ],

  preprocessors: {
    'src/**/*.js': ['webpack'],
    'test/**/*_test.js': ['webpack']
  },

  webpack: webpackConfig,

  webpackMiddleware: {
    noInfo: false,
    stats: {
      chunks: false,
      timings: false,
      errorDetails: true
    }
  },

  coverageReporter: {
    dir: './coverage',
    reporters: [
      { type: 'html', subdir: 'html' },
      { type: 'lcov', subdir: '.' },
      { type: 'text', subdir: '.', file: 'text.txt' },
      { type: 'text-summary', subdir: '.', file: 'text-summary.txt' }
    ]
  },

  client: {
    captureConsole: true,
  },

  browserConsoleLogOptions: {
    level: 'log',
    format: '%b %T: %m',
    terminal: true
  }
};
