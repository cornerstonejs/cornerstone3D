const path = require('path');
const webpack = require('webpack');
const rootPath = process.env.PWD;
const context = path.resolve(rootPath, "src");
const outputPath = path.resolve(rootPath, 'dist');
const bannerPlugin = require('./plugins/banner');

module.exports = {
  context: context,
  entry: {
    cornerstoneWADOImageLoader: './imageLoader/index.js'
    // cornerstoneWADOImageLoaderWebWorker: './webWorker/index.js',
    // cornerstoneWADOImageLoaderCodecs: './codecs/index.js'
  },
  target: 'web',
  output: {
    filename: '[name].js',
    library: '[name]',
    libraryTarget: 'var',
    path: outputPath
  },
  devtool: 'source-map',
  externals: {
    jquery: {
      root: '$'
    }
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
