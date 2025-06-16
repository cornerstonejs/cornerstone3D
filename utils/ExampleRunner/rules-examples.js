const autoprefixer = require('autoprefixer');
const excludeNodeModulesExcept = require('../../.webpack/excludeNodeModulesExcept.js');

const exclude = excludeNodeModulesExcept([]);
const prod = process.env.NODE_ENV === 'production';
const isCoverage = process.env.COVERAGE === 'true';

console.log('isCoverage', isCoverage);

const jsTsRules = isCoverage
  ? [
      // Rule for code coverage with Istanbul
      {
        test: /\.[jt]sx?$/,
        exclude,
        use: {
          loader: 'babel-loader',
          options: {
            // Added preset-env for broader compatibility if needed, adjust as necessary
            presets: [
              '@babel/preset-env',
              '@babel/preset-typescript',
              '@babel/preset-react',
            ],
            plugins: ['istanbul'],
          },
        },
      },
    ]
  : [
      // SWC rules for faster builds when not running coverage
      {
        test: /\.(j|t)s$/,
        exclude,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
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
        test: /\.(j|t)sx$/,
        exclude,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: {
              syntax: 'typescript',
              tsx: true, // Ensure TSX is enabled for .tsx files
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
    ];

module.exports = [
  ...jsTsRules,
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
