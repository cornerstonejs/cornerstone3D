const path = require('path');
const rootPath = process.cwd();
const context = path.join(rootPath, 'src');
const codecs = path.join(rootPath, 'codecs');
const outputPath = path.join(rootPath, 'dist');
const bannerPlugin = require('./plugins/banner');

module.exports = {
  mode: 'development',
  context,
  entry: {
    cornerstoneWADOImageLoader: './imageLoader/index.js',
    cornerstoneWADOImageLoaderWebWorker: './webWorker/index.worker.js',
  },
  target: 'web',
  output: {
    filename: '[name].js',
    library: '[name]',
    libraryTarget: 'umd',
    globalObject: 'this',
    path: outputPath,
    umdNamedDefine: true,
  },
  devtool: 'source-map',
  externals: {
    'dicom-parser': {
      commonjs: 'dicom-parser',
      commonjs2: 'dicom-parser',
      amd: 'dicom-parser',
      root: 'dicomParser',
    },
  },
  module: {
    noParse: [/(codecs)/],
    rules: [
      {
        enforce: 'pre',
        test: /\.js$/,
        exclude: /(node_modules)|(codecs)/,
        loader: 'eslint-loader',
        options: {
          failOnError: true,
        },
      },
      {
        test: /\.worker\.js$/,
        use: {
          loader: 'worker-loader',
          options: { inline: true, fallback: false },
        },
      },
      /*{
      test: /\.js$/,
      include: /(codecs)/,
      use: {
        loader: 'babel-loader',
        options: {
          compact: false
        }
      },
    },*/ {
        test: path.join(codecs, 'openJPEG-FixedMemory.js'),
        use: 'exports-loader?OpenJPEG',
      },
      {
        test: path.join(codecs, 'charLS-FixedMemory-browser.js'),
        use: 'exports-loader?CharLS',
      },
      {
        test: path.join(codecs, 'jpeg.js'),
        use: 'exports-loader?JpegImage',
      },
      {
        test: path.join(codecs, 'jpx.min.js'),
        use: 'exports-loader?JpxImage',
      },
      {
        test: /\.js$/,
        exclude: [/(node_modules)/, /(codecs)/],
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  plugins: [bannerPlugin()],
  node: { fs: 'empty' },
};
