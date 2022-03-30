const path = require('path');
const { merge } = require('webpack-merge');

const webpackDevBase = require('./../../../.webpack/webpack.dev.js');
const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const commonConfig = webpackDevBase(env, argv, { SRC_DIR, DIST_DIR });

  return merge(commonConfig, {
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
