const path = require('path')
const webpack = require('webpack')
const autoprefixer = require('autoprefixer')
const vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.core
  .rules
// Plugins
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

// PATHS
const PROJECT_ROOT = path.join(__dirname)
const RENDERING_ROOT = path.join(PROJECT_ROOT, './src/cornerstone-core/')
const TOOLS_ROOT = path.resolve(PROJECT_ROOT, './src/cornerstone-tools/')
const LOADER_ROOT = path.resolve(
  PROJECT_ROOT,
  './src/cornerstone-streaming-image-volume-loader/'
)
const ENTRY_EXAMPLES = path.join(PROJECT_ROOT, './examples/index.tsx')
const SRC_PATH = path.join(PROJECT_ROOT, './src')
const OUT_PATH = path.join(PROJECT_ROOT, './dist')
// CONFIG
const APP_CONFIG = process.env.APP_CONFIG || 'config/default.js'
const APP_CONFIG_PATH = path.join(PROJECT_ROOT, `./${APP_CONFIG}`)

// Need to add this if you want to yarn link locally.
// Add this additional call so we can yarn link vtk.js
// const shaderLoader = {
//   test: /\.glsl$/i,
//   loader: 'shader-loader',
// };

module.exports = {
  entry: {
    examples: ENTRY_EXAMPLES,
  },
  devtool: 'eval-source-map',
  mode: 'development',
  output: {
    path: OUT_PATH,
    filename: '[name].bundle.[contenthash].js',
    library: 'Cornerstone3DAlpha',
    libraryTarget: 'umd',
    globalObject: 'this',
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx|js|jsx)$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
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
              postcssOptions: {
                plugins: () => [autoprefixer('last 2 version', 'ie >= 11')],
              },
            },
          },
        ],
      },
    ].concat(vtkRules),
    //.concat(shaderLoader),
  },
  resolve: {
    modules: [path.resolve(__dirname, './node_modules'), SRC_PATH],
    // https://www.basefactor.com/configuring-aliases-in-webpack-vs-code-typescript-jest
    alias: {
      '@cornerstone': RENDERING_ROOT,
      '@cornerstone-tools': TOOLS_ROOT,
      '@cornerstone-streaming-image-volume-loader': LOADER_ROOT,
    },
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    fallback: {
      fs: false,
      path: require.resolve('path-browserify'),
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
      template: path.resolve(__dirname, 'public', 'index.html'),
    }),
    // Copy "Public" Folder to Dist (test data)
    /*
    Disabling for now due to ERROR in Conflict: Multiple assets emit different content to the same filename index.html
    CopyWebpackPlugin does not ignore things properly?
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, 'public'),
          to: OUT_PATH,
          toType: 'dir',
          globOptions: {
            ignore: ['index.html', '.DS_Store'],
          },
        },
      ],
    }),*/
  ],
  devServer: {
    hot: true,
    open: true,
    port: 3000,
    historyApiFallback: true,
  },
}
