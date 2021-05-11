const { merge } = require('webpack-merge');
const path = require('path');
const webpackCommon = require('./../../../.webpack/webpack.common.js');
const pkg = require('./../package.json');

const ROOT_DIR = path.join(__dirname, './..');
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
      library: 'cornerstoneTools',
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
        '@ohif/cornerstone-image-loader-streaming-volume': {
          root: 'window',
          commonjs: 'cornerstoneImageLoaderStreamingVolume',
          commonjs2: 'cornerstoneImageLoaderStreamingVolume',
          amd: 'cornerstoneImageLoaderStreamingVolume'
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
