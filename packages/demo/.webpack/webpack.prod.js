const { merge } = require('webpack-merge');
const path = require('path');
const pkg = require('./../package.json');
// const ROOT_DIR = path.join(__dirname, './..');

const webpackDevBase = require('./../../../.webpack/webpack.dev.js');
const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');

module.exports = (env, argv) => {
  const commonConfig = webpackDevBase(env, argv, { SRC_DIR, DIST_DIR });

  return merge(commonConfig, {
    devtool: 'source-map',
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
      minimize: false,
      sideEffects: true,
      splitChunks: {
        chunks: 'all',
      },
    }
  });
};
