const { merge } = require('webpack-merge');
const path = require('path');
const webpackCommon = require('./../../../.webpack/webpack.common.js');
const webpackBundleAnalyzer = require('webpack-bundle-analyzer');

const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');

module.exports = (env, argv) => {
  const commonConfig = webpackCommon(env, argv, { SRC_DIR, DIST_DIR });

  return merge(commonConfig, {
    devtool: 'source-map',
    entry: {
      lib: path.join(__dirname, '../src/index.ts'),
    },
    output: {
      path: path.join(__dirname, '../dist/umd'),
      library: 'cornerstone3D',
      libraryTarget: 'umd',
      filename: 'index.js',
    },
    stats: {
      colors: true,
      hash: true,
      timings: true,
      assets: true,
      chunks: false,
      chunkModules: false,
      modules: false,
      children: false,
      warnings: true,
    },
    optimization: {
      minimize: true,
    },
    externals: [
      {
        'detect-gpu': {
          root: 'window',
          commonjs: 'detect-gpu',
          commonjs2: 'detect-gpu',
          amd: 'detect-gpu',
        },
      },
    ],
    // plugins: [new webpackBundleAnalyzer.BundleAnalyzerPlugin()],
  });
};
