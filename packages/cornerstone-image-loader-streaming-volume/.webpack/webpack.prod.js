const { merge } = require('webpack-merge');
const path = require('path');
const webpackCommon = require('./../../../.webpack/webpack.common.js');
const pkg = require('./../package.json');

const SRC_DIR = path.join(__dirname, '../src');
const DIST_DIR = path.join(__dirname, '../dist');

module.exports = (env, argv) => {
  const commonConfig = webpackCommon(env, argv, { SRC_DIR, DIST_DIR });

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
      minimize: true,
      sideEffects: true,
    },
    output: {
      path: DIST_DIR,
      library: 'cornerstoneImageLoaderStreamingVolume',
      libraryTarget: 'umd',
      filename: pkg.main,
    },
    externals: [
      /\b(vtk.js)/,
      {
        '@ohif/cornerstone-render': {
          root: 'window',
          commonjs: 'cornerstoneRender',
          commonjs2: 'cornerstoneRender',
          amd: 'cornerstoneRender'
        },
        'gl-matrix': {
          root: 'window',
          commonjs: 'gl-matrix',
          commonjs2: 'gl-matrix',
          amd: 'gl-matrix',
        },
      }
    ]
  });
};
