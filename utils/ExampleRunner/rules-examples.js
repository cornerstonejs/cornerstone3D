const autoprefixer = require('autoprefixer');
const excludeNodeModulesExcept = require('../../.webpack/excludeNodeModulesExcept.js');

const exclude = excludeNodeModulesExcept([]);
const prod = process.env.NODE_ENV === 'production';

module.exports = [
  {
    test: /\.[jt]sx?$/,
    exclude,
    use: {
      loader: 'babel-loader',
      options: {
        presets: ['@babel/preset-typescript', '@babel/preset-react'],
        plugins: ['istanbul'],
      },
    },
  },
  {
    test: /\.(j|t)sx$/,
    exclude,
    loader: 'builtin:swc-loader',
    options: {
      jsc: {
        parser: {
          syntax: 'typescript',
          tsx: true,
        },
        transform: {
          react: {
            runtime: 'automatic',
            development: !prod,
            refresh: !prod,
          },
        },
      },
      env: {
        targets: 'Chrome >= 48',
      },
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
    test: /\.(png|jpe?g|gif)$/i,
    type: 'asset/resource',
  },
  {
    test: /\.wasm$/,
    type: 'asset/inline',
  },
];
