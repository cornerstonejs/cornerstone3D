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
    rules: [
      {
        test: /\.wasm/,
        type: 'asset/resource',
      },
      {
        test: /\.(mjs|js|ts)$/,
        exclude: [/(node_modules)/],
        use: {
          loader: 'babel-loader',
          options: {
            cacheDirectory: false,
          },
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
