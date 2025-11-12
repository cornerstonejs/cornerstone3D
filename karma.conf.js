// @ts-check
const path = require('path');
const os = require('os');

process.env.CHROME_BIN = require('puppeteer').executablePath();

/**
 *
 * Tests for the dicomImageLoaders require support for Web Workers and loading
 * wasm files required for image decoding.
 *
 * In order to support this, the karma config requires some customisation. This
 * is based on
 * https://github.com/codymikol/karma-webpack/issues/498#issuecomment-790040818
 *
 * The changes are:
 * - Define a custom output path for webpack to emit files to
 * - Serve the output path via a `files` entry in the karma config
 *
 * Without this, webpack correctly bundles and outputs the worker and wasm
 * files, but they can't be loaded by the tests.  Trying to load the worker or
 * wasm files returns a 404.
 *
 * Manually create an output path.  This is the same as the default
 * karma-webpack config
 * https://github.com/codymikol/karma-webpack?tab=readme-ov-file#default-webpack-configuration
 */
const outputPath = path.join(os.tmpdir(), '_karma_webpack_') + Math.floor(Math.random() * 1000000)

/** @param {import('karma').Config} config */
module.exports = function (config) {
  config.set({
    reporters: ['junit', 'coverage', 'spec'],
    client: {
      jasmine: {
        random: false, // don't randomize the order of tests
        stopOnFailure: false,
        failFast: false,
      },
      // Set to true to capture WARN level logging
      // See browserConsoleLogOptions for setting other log levels
      captureConsole: true,
      clearContext: false,
    },
    concurrency: 1,
    // Uncomment this out to capture all logging
    // browserConsoleLogOptions: {
    //   terminal: true,
    //   level: '',
    // },
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
    files: [
      'packages/core/test/**/*_test.js',
      'packages/tools/test/**/*_test.js',
      // Serve dicomImageLoad test images
      {
        pattern: 'packages/dicomImageLoader/testImages/**/*',
        watched: false,
        included: false,
        served: true
      },
      /**
       * Required to allow karma to load wasm and worker files built via webpack.
       * See the comment at the top of this file for more details.
       */
      {
        pattern: `${outputPath}/**/*`,
        included: false,
        served: true,
        watched: false
      }
    ],
    proxies: {
      // Simplified path to access test images in tests
      '/testImages/': '/base/packages/dicomImageLoader/testImages/',
    },
    preprocessors: {
      'packages/core/test/**/*_test.js': ['webpack'],
      'packages/tools/test/**/*_test.js': ['webpack'],
    },
    coverageReporter: {
      type: 'html',
      dir: 'coverage/',
    },
    // The default of 2 seconds is a bit short for some tests
    browserNoActivityTimeout: 6000,
    browserDisconnectTimeout: 6000,

    /*webpackMiddleware: {
      noInfo: true
    },*/
    webpack: {
      devtool: 'eval-source-map',
      mode: 'development',
      output: {
        /**
         * Override default karma-webpack output path with the one we defined
         * above this allows webpack generated files including wasm and workers
         * to be served by karma without this, the default config won't allow
         * tests to load web workers or wasm files.
         */
        path: outputPath,
      },
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
            test: /\.wasm/,
            type: 'asset/inline',
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
        asyncWebAssembly: true
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
          '@cornerstonejs/dicom-image-loader': path.resolve('packages/dicomImageLoader/src/index'),
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
