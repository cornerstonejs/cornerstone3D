const path = require('path');
const webpack = require('webpack');
const rootPath = process.cwd();
const context = path.join(rootPath, 'src');
const codecs = path.join(rootPath, 'codecs');
const outputPath = path.join(rootPath, 'dist');
const TerserPlugin = require('terser-webpack-plugin');

const BundleAnalyzerPlugin =
  require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

// The big difference between this and the dynamic-import version is that
// the dynamic import version does not bundle the WASM modules into the WebWorker file
module.exports = {
  mode: 'production',
  context,
  entry: {
    cornerstoneDICOMImageLoader: './imageLoader/index.ts',
    cornerstoneDICOMImageLoaderNoWebWorkers: './imageLoader/index-noWorkers.ts',
  },
  target: 'web',
  output: {
    library: {
      name: 'cornerstoneDICOMImageLoader',
      type: 'umd',
      umdNamedDefine: true,
    },
    globalObject: 'this',
    path: outputPath,
    filename: '[name].bundle.min.js',
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
    extensions: ['.ts', '.js'],
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
      //   test: /\.(mjs|js|ts)$/,
      //   exclude: /(node_modules)|(codecs)/,
      //   loader: 'eslint-loader',
      //   options: {
      //     failOnError: false,
      //   },
      // },
      {
        test: /\.wasm/,
        type: 'asset/inline',
      },
      {
        test: /\.worker\.(mjs|js|ts)$/,
        use: [
          {
            loader: 'worker-loader',
            options: { inline: 'fallback' },
          },
          {
            loader: 'babel-loader',
          },
        ],
      },
      {
        test: /\.(mjs|js|ts)$/,
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
  plugins: [
    new webpack.ProgressPlugin(),
    new webpack.optimize.LimitChunkCountPlugin({
      maxChunks: 1,
    }),
  ],
  experiments: {
    asyncWebAssembly: true,
  },
  optimization: {
    // minimize: false,
    minimizer: [
      new TerserPlugin({
        parallel: true,
      }),
    ],
  },
  // plugins: [new webpack.ProgressPlugin(), new BundleAnalyzerPlugin()],
};
