const vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.core;

module.exports = function(config) {
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
    frameworks: ['jasmine'],
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
            test: /\.ts$/,
            exclude: /node_modules/,
            use: ['ts-loader'],
          },
          {
            test: /\.(js|jsx)$/,
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
                  plugins: () => [autoprefixer('last 2 version', 'ie >= 10')],
                },
              },
            ],
          },
        ].concat(vtkRules),
      },
      resolve: {
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
      },
      // Any custom webpack configuration...
      node: { fs: 'empty' },
    },
    // Fix for `cornerstone-wado-image-loader` fs dep
    node: { fs: 'empty' },
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
  });
};
