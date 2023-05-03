const path = require('path');
const webpack = require('webpack');
const rootPath = process.cwd();
const context = path.join(rootPath, 'src');
const codecs = path.join(rootPath, 'codecs');
const outputPath = path.join(rootPath, 'dist');
const ESLintPlugin = require('eslint-webpack-plugin');

const BundleAnalyzerPlugin =
  require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  mode: 'development',
  context,
  entry: {
    cornerstoneDICOMImageLoader: './imageLoader/index.ts',
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
    clean: true,
  },
  devtool: 'source-map',
  externals: [
    '@cornerstonejs/core',
    'uuid',
    {
      'dicom-parser': {
        commonjs: 'dicom-parser',
        commonjs2: 'dicom-parser',
        amd: 'dicom-parser',
        root: 'dicomParser',
      },
    },
  ],
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      fs: false,
      path: false,
    },
  },
  module: {
    noParse: [/(codecs)/],
    rules: [
      {
        test: /\.wasm/,
        type: 'asset/resource',
      },
      {
        test: /\.worker\.(mjs|js|ts)$/,
        use: [
          {
            loader: 'worker-loader',
            options: {
              filename: '[name].[contenthash].worker.js',
            },
          },
          // {
          //   loader: 'babel-loader',
          // },
        ],
      },
      {
        test: /\.(mjs|js|ts)$/,
        exclude: [/(node_modules)/, /(codecs)/],
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: true,
          },
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
  plugins: [
    new ESLintPlugin(),
    new webpack.ProgressPlugin(),
    // new BundleAnalyzerPlugin(),
  ],
};
