const autoprefixer = require('autoprefixer');
const excludeNodeModulesExcept = require('../../.webpack/excludeNodeModulesExcept.js');

const exclude = excludeNodeModulesExcept([]);

module.exports = [
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
    test: /\.wasm/,
    // asset resource is used for assets that are not built but we want
    // to copy to dist. Don't import .wasm, just treat it as a file and
    // copy it to dist.
    type: 'asset/resource',
  },
  {
    test: /\.worker\.js$/,
    use: [
      {
        loader: 'worker-loader',
      },
      // {
      //   loader: 'babel-loader',
      // },
    ],
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
];
