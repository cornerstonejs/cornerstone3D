const vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.core

// Need to add this if you want to yarn link locally.
// Add this additional call so we can yarn link vtk.js
const shaderLoader = {
  test: /\.glsl$/i,
  loader: 'shader-loader',
}

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
    files: [{ // NOTE: This is super ugly, but I coulnd't get the !(node_modules) approach to work properly
      pattern: 'packages/cornerstone-image-loader-streaming-volume/test/**/*_test.js', watched: false
    },{
      pattern: 'packages/cornerstone-render/test/**/*_test.js', watched: false
    },{
      pattern: 'packages/cornerstone-tools/test/**/**_test.js', watched: false
    },{
      pattern: 'packages/demo/test/**/*_test.js', watched: false
    }],
    preprocessors: {
      'packages/cornerstone-image-loader-streaming-volume/test/**/*_test.js': ['webpack'],
      'packages/cornerstone-render/test/**/*_test.js': ['webpack'],
      'packages/cornerstone-tools/test/**/*_test.js': ['webpack'],
      'packages/demo/test/**/*_test.js': ['webpack'],
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
          {
            test: /\.png$/i,
            use: [
              {
                loader: 'url-loader',
              },
            ],
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
    // browsers: ['Chrome'],
    // singleRun: true,
    // colors: true,
    // autoWatch: true,
  })
}
