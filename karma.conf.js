const path = require('path');

process.env.CHROME_BIN = require('puppeteer').executablePath();

module.exports = function (config) {
  config.set({
    reporters: ['junit', 'coverage', 'spec'],
    client: {
      jasmine: {
        // random: false, // don't randomize the order of tests
        stopOnFailure: false,
        failFast: false,
      },
      captureConsole: false,
      clearContext: false,
    },
    specReporter: {
      maxLogLines: 5, // limit number of lines logged per test
      suppressSummary: true, // do not print summary
      suppressErrorSummary: true, // do not print error summary
      suppressFailed: false, // do not print information about failed tests
      suppressPassed: false, // do not print information about passed tests
      suppressSkipped: true, // do not print information about skipped tests
      showSpecTiming: false, // print the time elapsed for each spec
      failFast: false, // test would finish with error when a first fail occurs
      prefixes: {
        success: '  PASS: ', // override prefix for passed tests, default is '✓ '
        failure: 'FAILED: ', // override prefix for failed tests, default is '✗ '
        skipped: 'SKIPPED: ', // override prefix for skipped tests, default is '- '
      },
    },
    junitReporter: {
      outputDir: 'junit',
      outputFile: 'test-results.xml',
    },
    plugins: [
      'karma-webpack',
      'karma-jasmine',
      'karma-chrome-launcher',
      // Reports / Output
      'karma-junit-reporter',
      'karma-coverage',
      'karma-spec-reporter',
    ],
    frameworks: ['jasmine', 'webpack'],
    customHeaders: [
      {
        match: '.*.html',
        name: 'Cross-Origin-Opener-Policy',
        value: 'same-origin',
      },
      {
        match: '.*.html',
        name: 'Cross-Origin-Embedder-Policy',
        value: 'require-corp',
      },
    ],
    files: [
      'packages/streaming-image-volume-loader/test/**/*_test.js',
      'packages/core/test/**/*_test.js',
      'packages/tools/test/**/*_test.js',
    ],
    preprocessors: {
      'packages/streaming-image-volume-loader/test/**/*_test.js': ['webpack'],
      'packages/core/test/**/*_test.js': ['webpack'],
      'packages/tools/test/**/*_test.js': ['webpack'],
    },
    coverageReporter: {
      type: 'html',
      dir: 'coverage/',
    },
    /*webpackMiddleware: {
      noInfo: true
    },*/
    webpack: {
      devtool: 'eval-source-map',
      mode: 'development',
      module: {
        rules: [
          {
            test: /\.(js|jsx|ts|tsx)$/,
            exclude: /node_modules/,
            use: {
              loader: 'babel-loader',
              options: {
                plugins: [['babel-plugin-istanbul', {}]],
              },
            },
          },
          {
            test: /\.png$/i,
            use: [
              {
                loader: 'url-loader',
              },
            ],
          },
          {
            test: /\.wasm/,
            type: 'asset/resource',
          },
          // NOTE: For better debugging you can comment out the
          // istanbul-instrumenter-loader below
          // {
          //   test: /\.ts$/,
          //   exclude: [path.resolve(__dirname, 'test')],
          //   enforce: 'post',
          //   use: {
          //     loader: 'istanbul-instrumenter-loader',
          //     options: { esModules: true },
          //   },
          // },
        ],
      },
      experiments: {
        asyncWebAssembly: true,
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        fallback: {
          fs: false,
          path: require.resolve('path-browserify'),
        },
        alias: {
          '@cornerstonejs/core': path.resolve('packages/core/src/index'),
          '@cornerstonejs/tools': path.resolve('packages/tools/src/index'),
          '@cornerstonejs/streaming-image-volume-loader': path.resolve(
            'packages/streaming-image-volume-loader/src/index'
          ),
        },
      },
    },
    webpackMiddleware: {
      noInfo: false,
    },
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: [
          '--disable-translate',
          '--disable-extensions',
          '--no-sandbox',
          '--ignore-gpu-blacklist',
          '--remote-debugging-port=9229',
        ],
      },
    },
    browsers: ['ChromeHeadlessNoSandbox'],
    // browsers: ['Chrome'],
    // singleRun: true,
    // colors: true,
    // autoWatch: true,
  });
};
