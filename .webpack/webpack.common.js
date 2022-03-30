const { merge } = require('webpack-merge');
const path = require('path');
const webpackBase = require('./webpack.base.js');

const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');

/**
 * WebPack configuration for CommonJS Bundles. Extends rules of BaseConfig by making
 * sure we're bundling styles and other files that would normally be split in a
 * PWA.
 */
module.exports = (env, argv) => {
  const baseConfig = webpackBase(env, argv, { SRC_DIR, DIST_DIR });

  return merge(baseConfig, {});
};
