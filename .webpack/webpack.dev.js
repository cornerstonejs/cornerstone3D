/**
 * vtkRules contains three rules:
 *
 * - shader-loader
 * - babel-loader
 * - worker-loader
 *
 * The defaults work fine for us here, but it's worth noting that for a UMD build,
 * we would like likely want to inline web workers. An application consuming this package
 * will likely want to use a non-default loader option:
 *
 * {
 *   test: /\.worker\.js$/,
 *   include: /vtk\.js[\/\\]Sources/,
 *   use: [
 *     {
 *       loader: 'worker-loader',
 *       options: { inline: true, fallback: false },
 *     },
 *   ],
 * },
 */

const path = require('path');
const webpack = require('webpack');
const autoprefixer = require('autoprefixer');
const vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.core
  .rules;
// Plugins
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const ENTRY_VTK_EXT = path.join(__dirname, './../src/index.js');
const ENTRY_EXAMPLES = path.join(__dirname, './../examples/index.js');
const SRC_PATH = path.join(__dirname, './../src');
const OUT_PATH = path.join(__dirname, './../dist');

// Add this additional call so we can yarn link vtk.js
// const shaderLoader = {
//   test: /\.glsl$/i,
//   loader: 'shader-loader',
// };

module.exports = {
  entry: {
    examples: ENTRY_EXAMPLES,
  },
  devtool: 'source-map',
  output: {
    path: OUT_PATH,
    filename: '[name].bundle.[hash].js',
    library: 'ReactVTKjsViewport',
    libraryTarget: 'umd',
    globalObject: 'this',
  },
  module: {
    rules: [
      { test: /\.(ts|tsx)$/, loader: 'ts-loader' },
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: ['babel-loader'],
      },
      {
        test: /\.css$/,
        exclude: /\.module\.css$/,
        use: [
          'style-loader',
          'css-loader',
          {
            loader: 'postcss-loader',
            options: {
              plugins: () => [autoprefixer('last 2 version', 'ie >= 10')],
            },
          },
        ],
      },
    ].concat(vtkRules),
    //.concat(shaderLoader),
  },
  resolve: {
    modules: [path.resolve(__dirname, './../node_modules'), SRC_PATH],
    alias: {
      '@vtk-viewport': ENTRY_VTK_EXT,
    },
  },
  plugins: [
    // Show build progress
    new webpack.ProgressPlugin(),
    // Clear dist between builds
    new CleanWebpackPlugin(),
    // Generate `index.html` with injected build assets
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: path.resolve(__dirname, '..', 'public', 'index.html'),
    }),
    // Copy "Public" Folder to Dist (test data)
    new CopyWebpackPlugin([
      {
        from: path.resolve(__dirname, '..', 'public'),
        to: OUT_PATH,
        toType: 'dir',
        ignore: ['index.html', '.DS_Store'],
      },
    ]),
  ],
  // Fix for `cornerstone-wado-image-loader` fs dep
  node: { fs: 'empty' },
  devServer: {
    hot: true,
    open: true,
    port: 3000,
    historyApiFallback: true,
  },
};
