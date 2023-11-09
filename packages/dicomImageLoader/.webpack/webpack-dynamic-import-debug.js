const path = require('path');
const { merge } = require('webpack-merge');
const rootPath = process.cwd();
const baseConfig = require('./webpack-base');
const outputPath = path.join(rootPath, 'dist', 'dynamic-import');

const prodConfig = {
  mode: 'development',
  stats: {
    children: true,
  },
  devtool: 'eval-source-map',
  output: {
    /*library: {
      //name: '[name]',
    },*/
    path: outputPath,
    libraryTarget: 'umd',
    globalObject: 'this',
    filename: '[name].min.js',
    clean: true,
  },
  optimization: {
    minimize: false,
    // minimizer: [
    //   new TerserPlugin({
    //     parallel: true,
    //   }),
    // ],
  },
};

module.exports = merge(baseConfig, prodConfig);
