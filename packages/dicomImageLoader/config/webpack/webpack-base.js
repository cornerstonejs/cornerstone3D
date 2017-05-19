const path = require('path');
const rootPath = process.env.PWD;
const context = path.resolve(rootPath, 'src');
const outputPath = path.resolve(rootPath, 'dist');
const bannerPlugin = require('./plugins/banner');

module.exports = {
  context,
  entry: {
    cornerstoneWADOImageLoader: './imageLoader/index.js',
    cornerstoneWADOImageLoaderWebWorker: './webWorker/index.js'
  },
  target: 'web',
  output: {
    filename: '[name].js',
    library: '[name]',
    libraryTarget: 'umd',
    path: outputPath,
    umdNamedDefine: true
  },
  devtool: 'source-map',
  externals: {
    jquery: {
      commonjs: "jquery",
      commonjs2: "jquery",
      amd: "jquery",
      root: '$'
    },
    'cornerstone-core': {
      commonjs: "cornerstone-core",
      commonjs2: "cornerstone-core",
      amd: "cornerstone-core",
      root: 'cornerstone'
    },
    'dicom-parser': {
      commonjs: "dicom-parser",
      commonjs2: "dicom-parser",
      amd: "dicom-parser",
      root: 'dicomParser'
    },
  },
  module: {
    rules: [{
      enforce: 'pre',
      test: /\.js$/,
      exclude: /(node_modules|bower_components)/,
      loader: 'eslint-loader',
      options: {
        failOnError: true
      }
    }, {
      test: /\.js$/,
      exclude: /(node_modules|bower_components)/,
      use: [{
        loader: 'babel-loader'
      }]
    }]
  },
  plugins: [
    bannerPlugin()
  ]
};
