var path = require('path');
const rootPath = process.cwd();
const context = path.join(rootPath, "src");
const outputPath = path.join(rootPath, 'build');

module.exports = {
	context: context,
	entry: {
    dcmjs: './dcmjs.js'
	},
	target: 'web',
	output: {
    filename: 'dcmjs.js',
    library: 'dcmjs',
    libraryTarget: 'umd',
    path: outputPath,
    umdNamedDefine: true
	},
	devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules)/,
        use: [{
          loader: 'babel-loader'
        }]
      }
    ]
  }
};
