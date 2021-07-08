const path = require('path')
const webpack = require('webpack')
// Plugins
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer')
  .BundleAnalyzerPlugin
const { CleanWebpackPlugin } = require('clean-webpack-plugin')
//
const PROJECT_ROOT = path.join(__dirname, '../')
const SRC_PATH = path.join(PROJECT_ROOT, './src')
const NODE_ENV = process.env.NODE_ENV;
const vtkRules = require('vtk.js/Utilities/config/dependency.js').webpack.core
    .rules;
/**
 * `argv` are options from the CLI. They will override our config here if set.
 * `-d` - Development shorthand, sets `debug`, `devtool`, and `mode`
 * `-p` - Production shorthand, sets `minimize`, `NODE_ENV`, and `mode`
 */
module.exports = (env, argv) => {
  const mode = NODE_ENV === 'production' ? 'production' : 'development';
  const isProdBuild = argv.mode !== 'development'
  const outputFilename = isProdBuild ? '[name].umd.min.js' : '[name].umd.js'

  const config = {
    devtool: 'eval-source-map',
    module: {
      rules: [
        // ts-loader: convert typescript (es6) to javascript (es6),
        // {
        //   test: /\.ts$/,
        //   exclude: /node_modules/,
        //   loader: 'ts-loader',
        //   options: {
        //     configFile: 'tsconfig.build.json'
        //   }
        // },
        // babel-loader: converts javascript (es6) to javascript (es5)
        {
          test: /\.(js|ts)$/,
          exclude: /node_modules/,
          loader: 'babel-loader',
          options: {
            // Find babel.config.js in monorepo root
            // https://babeljs.io/docs/en/options#rootmode
            rootMode: 'upward',
            envName: mode,
          },
        },
      ],
    },
    resolve: {
      modules: [path.resolve(PROJECT_ROOT, './node_modules'), SRC_PATH],
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
      fallback: {
        fs: false,
        path: require.resolve('path-browserify'),
      },
    },
    externals: [
      // :wave:
      /\b(vtk.js)/,
      // Used to build/load metadata
      // TODO: Remove these as dependencies
      {
        'cornerstone-wado-image-loader': {
          commonjs: 'cornerstone-wado-image-loader',
          commonjs2: 'cornerstone-wado-image-loader',
          amd: 'cornerstone-wado-image-loader',
          root: 'cornerstoneWADOImageLoader',
        },
        'gl-matrix': {
          root: 'window',
          commonjs: 'gl-matrix',
          commonjs2: 'gl-matrix',
          amd: 'gl-matrix',
        },
      },
    ],
    plugins: [
      // Uncomment to generate bundle analyzer
      // new BundleAnalyzerPlugin(),
      // Show build progress
      new webpack.ProgressPlugin(),
      // Clear dist between builds
      new CleanWebpackPlugin(),
    ],
  };

  return config;
}
