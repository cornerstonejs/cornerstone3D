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
      library: 'cornerstoneTools',
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
