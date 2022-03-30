const { merge } = require('webpack-merge');
const path = require('path');
const pkg = require('./../package.json');
// const ROOT_DIR = path.join(__dirname, './..');

const webpackDevBase = require('./../../../.webpack/webpack.dev.js');
const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');
const CopyPlugin = require('copy-webpack-plugin');

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
      splitChunks: {
        chunks: 'all',
      },
    },
    plugins: [
      new CopyPlugin({
        patterns: [
          {
            from: '../demo/public/head',
            to: `${DIST_DIR}/examples/head`,
          },
        ],
      }),
    ],
  });
};
