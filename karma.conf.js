const path = require('path')
const vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.core
//
const PROJECT_ROOT = path.join(__dirname)
const RENDERING_ROOT = path.join(
  PROJECT_ROOT,
  './src/cornerstone-core/src/index.ts'
)
const TOOLS_ROOT = path.resolve(
  PROJECT_ROOT,
  './src/cornerstone-tools/src/index.ts'
)
const LOADER_ROOT = path.resolve(
  PROJECT_ROOT,
  './src/cornerstone-streaming-image-volume-loader'
)

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
      { pattern: 'src/cornerstone-core/test/*_test.js', watched: false },
      { pattern: 'src/cornerstone-tools/test/*_test.js', watched: false },
      {
        pattern: 'src/cornerstone-streaming-image-volume-loader/test/*_test.js',
        watched: false,
      },
      { pattern: 'test/*_test.js', watched: false },
      { pattern: 'test/**/*_test.js', watched: false },
    ],
    preprocessors: {
      'src/cornerstone-core/test/*_test.js': ['webpack'],
      'src/cornerstone-tools/test/*_test.js': ['webpack'],
      'src/cornerstone-streaming-image-volume-loader/test/*_test.js': [
        'webpack',
      ],
      'test/*_test.js': ['webpack'],
      'test/**/*_test.js': ['webpack'],
    },
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
        ].concat(vtkRules),
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        alias: {
          // https://stackoverflow.com/a/40444084/1867984
          '@cornerstone': RENDERING_ROOT,
          '@cornerstone-tools': TOOLS_ROOT,
          '@cornerstone-streaming-image-volume-loader': LOADER_ROOT,
        },
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
        flags: ['--no-sandbox', '--ignore-gpu-blacklist'],
      },
    },
    browsers: ['ChromeHeadlessNoSandbox'],
  })
}
