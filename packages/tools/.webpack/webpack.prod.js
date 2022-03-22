const { merge } = require('webpack-merge');
const path = require('path');
const webpackCommon = require('./../../../.webpack/webpack.common.js');
const pkg = require('./../package.json');

module.exports = (env, argv) => {
  const commonConfig = webpackCommon(env, argv);

  return merge(commonConfig, {
    devtool: 'source-map',
    entry: {
      lib: path.join(__dirname, '../src/index.ts'),
    },
    output: {
      path: path.join(__dirname, '../dist/umd'),
      library: 'cornerstoneTools3D',
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
      sideEffects: true,
    },
    externals: [
      /\b(vtk.js)/,
      {
        '@cornerstonejs/core': {
          root: 'window',
          commonjs: 'cornerstone3D',
          commonjs2: 'cornerstone3D',
          amd: 'cornerstone3D'
        },
        '@cornerstonejs/streaming-image-volume-loader': {
          root: 'window',
          commonjs: 'cornerstoneStreamingImageVolumeLoader',
          commonjs2: 'cornerstoneStreamingImageVolumeLoader',
          amd: 'cornerstoneStreamingImageVolumeLoader'
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
