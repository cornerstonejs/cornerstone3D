// Not used for now due to issues with experimental output modules
const path = require('path');
const webpack = require('webpack');
const rootPath = process.cwd();
const context = path.join(rootPath, 'src');
const outputPath = path.join(rootPath, 'dist');

const BundleAnalyzerPlugin =
  require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

const config = {
  mode: 'development',
  context,
  entry: {
    cornerstoneDICOMImageLoader: './imageLoader/index.ts',
  },
  target: 'web',
  output: {
    path: outputPath,
    filename: '[name].mjs',
    library: {
      type: 'module',
    },
    module: true,
    clean: true,
    //libraryTarget: 'module',
    //globalObject: 'this',
    //chunkFormat: 'module',
  },
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
        test: /\.(mjs|js|ts)$/,
        exclude: [/(node_modules)/, /(codecs)/],
        use: {
          loader: 'babel-loader',
        },
      },
    ],
  },
  plugins: [new webpack.ProgressPlugin()], //, new BundleAnalyzerPlugin()],
  optimization: {
    //minimize: false,
    /*minimizer: [
      new TerserPlugin({
        parallel: true,
      }),
    ],*/
    /*splitChunks: {
      // include all types of chunks
      chunks: 'all',
    },*/
    //runtimeChunk: 'single',
    usedExports: true,
    concatenateModules: true,
  },
  experiments: {
    outputModule: true,
    // asyncWebAssembly: true
  },
};

module.exports = config;
