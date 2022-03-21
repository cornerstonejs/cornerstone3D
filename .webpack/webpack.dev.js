const path = require('path')
const webpack = require('webpack')
const autoprefixer = require('autoprefixer')
const vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.core
  .rules
// Plugins
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyPlugin = require('copy-webpack-plugin')
const excludeNodeModulesExcept = require('./excludeNodeModulesExcept.js')

const NODE_ENV = process.NODE_ENV

// PATHS
const PROJECT_ROOT = path.join(__dirname, '..', 'packages/demo')
const ENTRY_DEMO = path.join(PROJECT_ROOT, 'src/index.tsx')
const OUT_PATH = path.join(__dirname, '..', 'packages', 'demo', 'dist')

// Need to add this if you want to yarn link locally.
// Add this additional call so we can yarn link vtk.js
const shaderLoader = {
  test: /\.glsl$/i,
  loader: 'shader-loader',
}

const exclude = excludeNodeModulesExcept([])

module.exports = (env, argv, { SRC_DIR, DIST_DIR }) => {
  const mode = NODE_ENV === 'production' ? 'production' : 'development'
  // const baseConfig = webpackBase(env, argv, { SRC_DIR, DIST_DIR });

  // return merge(baseConfig, {
  //   // module: {
  //   //   rules: [cssToJavaScriptRule, stylusToJavaScriptRule],
  //   // },
  // });

  return {
    entry: {
      demo: ENTRY_DEMO,
    },
    devtool: 'eval-source-map',
    mode: mode,
    output: {
      path: OUT_PATH,
      clean: true,
      globalObject: 'this',
    },
    optimization: {
      splitChunks: {
        // include all types of chunks
        chunks: 'all',
      },
      minimize: mode === 'production',
    },
    module: {
      rules: [
        {
          test: /\.(mjs|ts|tsx|js|jsx)?$/,
          exclude,
          loader: 'babel-loader',
          options: {
            // Find babel.config.js in monorepo root
            // https://babeljs.io/docs/en/options#rootmode
            rootMode: 'upward',
            envName: 'development',
          },
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
        {
          test: /\.png$/i,
          use: [
            {
              loader: 'url-loader',
            },
          ],
        },
      ].concat(vtkRules),
      // Only enable this with a linked version of VTK
      //.concat(shaderLoader),
    },
    resolve: {
      modules: [path.resolve(__dirname, './../node_modules')],
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      fallback: {
        fs: false,
        path: require.resolve('path-browserify'),
      },
    },
    plugins: [
      // Show build progress
      new webpack.ProgressPlugin(),
      // Generate `index.html` with injected build assets
      new HtmlWebpackPlugin({
        filename: 'index.html',
        template: path.resolve(
          __dirname,
          './../packages/demo',
          'public',
          'index.html'
        ),
      }),
      new CopyPlugin({
        patterns: [
          {
            from: '../../node_modules/cornerstone-wado-image-loader/dist/dynamic-import/',
            to: DIST_DIR,
          },
        ],
      }),
    ],
    devServer: {
      hot: true,
      open: true,
      port: 3001,
      historyApiFallback: true,
      headers: {
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
    },
  }
}
