const merge = require('./merge');
const baseConfig = require('./webpack-base');
const UglifyJSPlugin = require('uglifyjs-webpack-plugin');

const prodConfig = {
  mode: "production",
  optimization: {
    minimizer: [
      new UglifyJSPlugin({
        sourceMap: true
      })
    ]
  },
};

module.exports = merge(baseConfig, prodConfig);