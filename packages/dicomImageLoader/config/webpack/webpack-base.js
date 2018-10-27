const path = require('path');
const rootPath = process.cwd();
const context = path.join(rootPath, "src");
const outputPath = path.join(rootPath, 'dist');
const bannerPlugin = require('./plugins/banner');

module.exports = {
  mode: "development",
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
    globalObject: 'this',
    path: outputPath,
    umdNamedDefine: true
  },
  devtool: 'source-map',
  externals: {
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
      exclude: /(node_modules)/,
      loader: 'eslint-loader',
      options: {
        failOnError: true
      }
    }, {
      test: /\.js$/,
      exclude: /(node_modules)/,
      use: {
        loader: 'babel-loader'
      }
    }]
  },
  plugins: [
    bannerPlugin()
  ]
};
