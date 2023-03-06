const path = require('path');
const merge = require('./merge');
const rootPath = process.cwd();
const baseConfig = require('./webpack-base');
const outputPath = path.join(rootPath, 'dist', 'dynamic-import');

const prodConfig = {
  mode: 'development',
  stats: {
    children: true,
  },
  output: {
    /*library: {
      //name: '[name]',
    },*/
    path: outputPath,
    libraryTarget: 'umd',
    globalObject: 'this',
    filename: '[name].min.js',
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
