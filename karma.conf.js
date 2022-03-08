const path = require('path')

process.env.CHROME_BIN = require('puppeteer').executablePath()
const vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.core

// Need to add this if you want to yarn link locally.
// Add this additional call so we can yarn link vtk.js
const shaderLoader = {
  test: /\.glsl$/i,
  loader: 'shader-loader',
}

module.exports = function (config) {
  config.set({
    reporters: ['junit', 'coverage', 'spec'],
    client: {
      jasmine: {
        random: false, // don't randomize the order of tests
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
        success: '    OK: ', // override prefix for passed tests, default is '✓ '
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
      'packages/cornerstone-image-loader-streaming-volume/test/**/*_test.js',
      'packages/cornerstone-render/test/**/*_test.js',
      'packages/cornerstone-tools/test/**/*_test.js',
    ],
    preprocessors: {
      'packages/cornerstone-image-loader-streaming-volume/test/**/*_test.js': [
        'webpack',
      ],
      'packages/cornerstone-render/test/**/*_test.js': ['webpack'],
      'packages/cornerstone-tools/test/**/*_test.js': ['webpack'],
    },
    coverageIstanbulReporter: {
      reports: ['html', 'text-summary', 'lcovonly'],
      dir: path.join(__dirname, 'coverage'),
      fixWebpackSourcePaths: true,
      'report-config': {
        html: { outdir: 'html' },
        linkMapper: '/',
      },
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
            use: ['babel-loader'],
          },
          {
            test: /\.css$/,
            exclude: /\.module\.css$/,
            use: [
              'style-loader',
              'css-loader',
              {
                loader: 'postcss-loader',
                options: {
                  postcssOptions: {
                    plugins: () => [autoprefixer('last 2 version', 'ie >= 10')],
                  },
                },
              },
            ],
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
            test: /\.ts$/,
            exclude: [path.resolve(__dirname, 'test')],
            enforce: 'post',
            use: {
              loader: 'istanbul-instrumenter-loader',
              options: { esModules: true },
            },
          },
        ].concat(vtkRules),
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        fallback: {
          fs: false,
          path: require.resolve('path-browserify'),
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
  })
}
