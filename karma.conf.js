const path = require('path')
const vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.core

module.exports = function (config) {
  config.set({
    reporters: ['junit', 'coverage', 'progress'],
    junitReporter: {
      outputDir: 'junit',
      outputFile: 'test-results.xml',
    },
    plugins: [
      'karma-webpack',
      'karma-jasmine',
      'karma-chrome-launcher',
      // Reports / Output
      'karma-coverage',
      'karma-junit-reporter',
    ],
    frameworks: ['jasmine', 'webpack'],
    files: [
      { pattern: 'test/*_test.js', watched: false },
      { pattern: 'test/**/*_test.js', watched: false },
    ],
    preprocessors: {
      'test/*_test.js': ['webpack'],
      'test/**/*_test.js': ['webpack'],
    },
    webpack: {
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
        ].concat(vtkRules),
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        alias: {
          // https://stackoverflow.com/a/40444084/1867984
          '@vtk-viewport': path.join(__dirname, './../src'),
          '@tools': path.resolve(__dirname, './../cornerstone-tools-3d'),
        },
        fallback: {
          fs: false,
          path: require.resolve('path-browserify'),
        },
      },
    },
    webpackMiddleware: {
      noInfo: true,
    },
    customLaunchers: {
      ChromeHeadlessNoSandbox: {
        base: 'ChromeHeadless',
        flags: ['--no-sandbox', '--ignore-gpu-blacklist'],
      },
    },
    browsers: ['ChromeHeadlessNoSandbox'],
  })
}
