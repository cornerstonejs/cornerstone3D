const webpack = require('webpack');
const merge = require('./merge');
const baseConfig = require('./webpack-base');

const devConfig = {
  mode: "development",
  devServer: {
    hot: true,
    publicPath: '/build/'
  },
  plugins: [
    new webpack.HotModuleReplacementPlugin({})
  ]
};

module.exports = merge(baseConfig, devConfig);