const path = require('path');
const webpack = require('webpack');
const autoprefixer = require('autoprefixer');
// Plugins
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer')
  .BundleAnalyzerPlugin;
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const ENTRY_VTK_EXT = path.join(__dirname, './../src/index.js');
const SRC_PATH = path.join(__dirname, './../src');
const OUT_PATH = path.join(__dirname, './../dist');

/**
 * `argv` are options from the CLI. They will override our config here if set.
 * `-d` - Development shorthand, sets `debug`, `devtool`, and `mode`
 * `-p` - Production shorthand, sets `minimize`, `NODE_ENV`, and `mode`
 */
module.exports = (env, argv) => {
  const isProdBuild = argv.mode !== 'development';
  const outputFilename = isProdBuild ? '[name].umd.min.js' : '[name].umd.js';

  return {
    entry: {
      index: ENTRY_VTK_EXT,
    },
    devtool: 'source-map',
    output: {
      path: OUT_PATH,
      filename: outputFilename,
      library: 'VTKViewport',
      libraryTarget: 'umd',
      globalObject: 'this',
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: ['ts-loader'],
        },
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
      ],
    },
    resolve: {
      modules: [path.resolve(__dirname, './../node_modules'), SRC_PATH],
      alias: {
        // https://stackoverflow.com/a/40444084/1867984
        '@vtk-viewport': path.join(__dirname, './../src'),
        '@tools': path.resolve(__dirname, './../cornerstone-tools-3d')
      },
    },
    externals: [
      // :wave:
      /\b(vtk.js)/,
      // Used to build/load metadata
      {
        'cornerstone-core': {
          commonjs: 'cornerstone-core',
          commonjs2: 'cornerstone-core',
          amd: 'cornerstone-core',
          root: 'cornerstone',
        },
        'cornerstone-tools': {
          commonjs: 'cornerstone-tools',
          commonjs2: 'cornerstone-tools',
          amd: 'cornerstone-tools',
          root: 'cornerstoneTools',
        },
        //
        react: 'react',
      },
    ],
    node: {
      // https://github.com/webpack-contrib/style-loader/issues/200
      Buffer: false,
      // https://github.com/webpack-contrib/css-loader/issues/447
      // Related to `fs` usage in codecs; may be able to remove after
      // We update our codecs to latest
      fs: 'empty',
    },
    plugins: [
      // Uncomment to generate bundle analyzer
      // new BundleAnalyzerPlugin(),
      // Show build progress
      new webpack.ProgressPlugin(),
      // Clear dist between builds
      // new CleanWebpackPlugin(),
    ],
  };
};
