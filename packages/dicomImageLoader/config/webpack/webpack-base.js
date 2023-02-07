const path = require('path');
const webpack = require('webpack');

const rootPath = process.cwd();
const context = path.join(rootPath, 'src');
const codecs = path.join(rootPath, 'codecs');
const outputPath = path.join(rootPath, 'dist');

const BundleAnalyzerPlugin =
  require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  mode: 'development',
  context,
  entry: {
    cornerstoneDICOMImageLoader: './imageLoader/index.js',
  },
  target: 'web',
  output: {
    library: {
      name: '[name]',
      type: 'umd',
      umdNamedDefine: true,
    },
    globalObject: 'this',
    path: outputPath,
    publicPath: 'auto',
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
  resolve: {
    fallback: {
      fs: false,
      path: false,
    },
  },
  module: {
    noParse: [/(codecs)/],
    rules: [
      // {
      //   enforce: 'pre',
      //   test: /\.js$/,
      //   exclude: /(node_modules)|(codecs)/,
      //   loader: 'eslint-loader',
      //   options: {
      //     failOnError: false,
      //   },
      // },
      {
        test: /\.wasm/,
        type: 'asset/resource',
      },
      {
        test: /\.worker\.js$/,
        use: [
          {
            loader: 'worker-loader',
          },
          // {
          //   loader: 'babel-loader',
          // },
        ],
      },
      {
        test: /\.js$/,
        exclude: [/(node_modules)/, /(codecs)/],
        use: {
          loader: 'babel-loader',
        },
      },
      {
        test: path.join(codecs, 'jpeg.js'),
        loader: 'exports-loader',
        options: {
          type: 'commonjs',
          exports: 'JpegImage',
        },
      },
    ],
  },
  // experiments: {
  //   asyncWebAssembly: true,
  // },
  plugins: [new webpack.ProgressPlugin()],
  // plugins: [new webpack.ProgressPlugin(), new BundleAnalyzerPlugin()],
};
