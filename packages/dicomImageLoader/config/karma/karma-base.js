const path = require('path');
const webpackConfig = require('../webpack');
const os = require('os');

/* eslint no-process-env:0 */
process.env.CHROME_BIN = require('puppeteer').executablePath();

// Deleting output.library to avoid "Uncaught SyntaxError: Unexpected token /" error
// when running testes (var test/foo_test.js = ...)
delete webpackConfig.output;

delete webpackConfig.devMiddleware;

// Karma will build the dependecy tree by itself
delete webpackConfig.entry;

// Code coverage
webpackConfig.module.rules.push({
  test: /\.js$/,
  include: path.resolve('./src/'),
  loader: 'coverage-istanbul-loader',
  options: {
    esModules: true,
  },
});

// https://github.com/ryanclark/karma-webpack/issues/498
const output = {
  path:
    path.join(os.tmpdir(), '_karma_webpack_') +
    Math.floor(Math.random() * 1000000),
};

module.exports = function (config) {
  config.set({
    basePath: '../../',
    frameworks: ['mocha', 'webpack'],
    reporters: ['progress', 'coverage', 'spec'],
    files: [
      'node_modules/cornerstone-core/dist/cornerstone.js',
      {
        pattern: 'node_modules/cornerstone-core/dist/cornerstone.js.map',
        included: false,
      },
      'node_modules/dicom-parser/dist/dicomParser.js',
      {
        pattern: 'node_modules/dicom-parser/dist/dicomParser.js.map',
        included: false,
      },
      'test/**/*_test.js',
      {
        pattern: `${output.path}/**/*`,
        watched: false,
        included: false,
      },
      'src/**/*_test.js',
      {
        pattern: `${output.path}/**/*`,
        watched: false,
        included: false,
      },
      // http://localhost:[PORT]/base/test/[MY FILE].wasm
      { pattern: 'testImages/*', included: false },
      { pattern: 'dist/*', included: false },
    ],
    mime: {
      'application/wasm': ['wasm'],
    },
    proxies: {
      '/base/test/imageLoader/wadouri/': '/base/test/',
    },

    plugins: [
      'karma-webpack',
      'karma-mocha',
      'karma-chrome-launcher',
      'karma-firefox-launcher',
      'karma-coverage',
      'karma-spec-reporter',
    ],

    preprocessors: {
      'src/**/*.js': ['webpack'],
      'test/**/*_test.js': ['webpack'],
    },

    webpack: { ...webpackConfig, output },

    webpackMiddleware: {
      noInfo: false,
      stats: {
        chunks: false,
        timings: false,
        errorDetails: true,
      },
    },

    coverageReporter: {
      dir: './coverage',
      reporters: [
        { type: 'html', subdir: 'html' },
        { type: 'lcov', subdir: '.' },
        { type: 'text', subdir: '.', file: 'text.txt' },
        { type: 'text-summary', subdir: '.', file: 'text-summary.txt' },
      ],
    },

    client: {
      captureConsole: true,
    },

    browserConsoleLogOptions: {
      level: 'log',
      format: '%b %T: %m',
      terminal: true,
    },

    /// FROM KARMA-CHROME
    singleRun: false,
    //browsers: ['Chrome'],
    // singleRun: true,
    browsers: ['ChromeHeadlessNoSandbox'],
    reporters: ['spec'],
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox'],
      },
    },
  });
};
