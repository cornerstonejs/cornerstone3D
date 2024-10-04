const { merge } = require('webpack-merge');
const path = require('path');
const webpackCommon = require('./../../../.webpack/webpack.common.js');
const webpackBundleAnalyzer = require('webpack-bundle-analyzer');
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
    },
    externals: [
      {
        '@cornerstonejs/core': {
          root: 'cornerstone3D',
          commonjs: '@cornerstonejs/core',
          commonjs2: '@cornerstonejs/core',
          amd: '@cornerstonejs/core',
        },
        'gl-matrix': {
          root: 'window',
          commonjs: 'gl-matrix',
          commonjs2: 'gl-matrix',
          amd: 'gl-matrix',
        },
      },
    ],

    // plugins: [new webpackBundleAnalyzer.BundleAnalyzerPlugin()],
  });
};
