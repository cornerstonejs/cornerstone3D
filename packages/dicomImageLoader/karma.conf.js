/* eslint-disable */
// @ts-check

const { tmpdir } = require('os');
const { join } = require('path');
const path = require('path');

process.env.CHROME_BIN = require('puppeteer').executablePath();

/**
 * Required for packages/dicomImageLoader Manually set a temporary output
 * directory for webpack so that Karma can serve all the required files for
 * dicomImageLoader, such as wasm files and web-workers. See
 * https://github.com/ryanclark/karma-webpack/issues/498
 */
const output = {
  path: join(tmpdir(), '_karma_webpack_') + Math.floor(Math.random() * 1000000),
};

/**
 *
 * @param { import("karma").Config } config - karma config
 */
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
        match: '.*html|js|wasm$',
        name: 'Cross-Origin-Opener-Policy',
        value: 'same-origin',
      },
      {
        match: '.*html|js|wasm$',
        name: 'Cross-Origin-Embedder-Policy',
        value: 'require-corp',
      },
    ],
    files: [
      'packages/core/test/**/*_test.js',
      'packages/tools/test/**/*_test.js',
      'packages/dicomImageLoader/test/**/*_test.ts',
      /**
       * Required for packages/dicomImageLoader
       * Serve all the webpack files from the output path so that karma can load
       * wasm and web workers required for dicomImageLoader
       */
      {
        pattern: `${output.path}/**/*`,
        watched: false,
        included: false,
      },
      /**
       * Required for packages/dicomImageLoader
       * Serve all the testImages for the dicomImageLoader tests
       */
      {
        pattern: 'packages/dicomImageLoader/testImages/*.dcm',
        watched: false,
        included: false,
        served: true,
        nocache: false,
      },
    ],
    /**
     * Required for packages/dicomImageLoader configure /testImages path as a
     * proxy for all the dicomImageLoader test images
     */
    proxies: {
      '/testImages/': '/base/packages/dicomImageLoader/testImages',
    },
    preprocessors: {
      'packages/core/test/**/*_test.js': ['webpack'],
      'packages/tools/test/**/*_test.js': ['webpack'],
      'packages/dicomImageLoader/test/**/*_test.js': ['webpack'],
    },
    // coverageIstanbulReporter: {
    //   reports: ['html', 'text-summary', 'lcovonly'],
    //   dir: path.join(__dirname, 'coverage'),
    //   fixWebpackSourcePaths: true,
    //   'report-config': {
    //     html: { outdir: 'html' },
    //     linkMapper: '/',
    //   },
    // },
    /*webpackMiddleware: {
      noInfo: true
    },*/
    webpack: {
      devtool: 'eval-source-map',
      mode: 'development',
      /**
       * Required for dicomImageLoader
       *
       * The webpack output directory is manually specified so that all
       * generated assets, such as wasm, workers etc.. can be found when running
       * in Karma
       */
      output,
      module: {
        rules: [
          {
            test: /\.(js|jsx|ts|tsx)$/,
            /**
             * exclude codecs for dicomImageLoader so that
             * packages/dicomImageLoader/codecs/* are not processed and
             * imported as is. See
             * packages/dicomImageLoader/.webpack/webpack-base.js
             */
            exclude: /(node_modules)|(codecs)/,
            use: ['babel-loader'],
          },
          {
            test: /\.png$/i,
            use: [
              {
                loader: 'url-loader',
              },
            ],
          },
          /**
           * Start webpack rules for packages/dicomImageLoader
           * see packages/dicomImageLoader/.webpack/webpack-base.js
           */
          {
            test: /\.wasm/,
            type: 'asset/resource',
          },
          {
            test: path.join(
              path.resolve(__dirname, 'packages/dicomImageLoader'),
              'codecs',
              'jpeg.js'
            ),
            loader: 'exports-loader',
            options: {
              type: 'commonjs',
              exports: 'JpegImage',
            },
          },
          /**
           * End webpack rules for packages/dicomImageLoader
           */
          // q
        ],
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
          '@cornerstonejs/dicomImageLoader': path.resolve(
            'packages/dicomImageLoader/src/imageLoader/index'
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
    // browsers: ['ChromeHeadlessNoSandbox'],
    browsers: ['Chrome'],
    // singleRun: true,
    // colors: true,
    // autoWatch: true,
  });
};
