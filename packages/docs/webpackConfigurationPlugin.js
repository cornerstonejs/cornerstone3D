const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

// If we want to embed examples in the docusaurus we need the following
// module.exports = function (context, options) {
// return {
//   name: 'custom-docusaurus-plugin',
//   // eslint-disable-next-line
//   configureWebpack(config, isServer, utils) {
//     return {
//       module: {
//         rules: [
//           {
//             test: /\.glsl$/i,
//             include: /vtk\.js[\/\\]Sources/,
//             loader: 'shader-loader',
//           },
//         ],
//       },
//       plugins: [
//         new CopyPlugin({
//           patterns: [
//             {
//               from: '../../node_modules/@cornerstonejs/dicom-image-loader/dist/dynamic-import/',
//             },
//           ],
//         }),
//       ],
//       resolve: {
//         modules: [path.resolve(__dirname, './../node_modules')],
//         extensions: ['.ts', '.tsx', '.js', '.jsx'],
//         fallback: {
//           fs: false,
//           path: require.resolve('path-browserify'),
//         },
//         alias: {
//           '@cornerstonejs/core': path.resolve('../core/src/index'),
//           '@cornerstonejs/tools': path.resolve('../tools/src/index'),
//           // We use this alias and the CopyPlugin to support using the dynamic-import version
//           // of WADO Image Loader
//           '@cornerstonejs/dicom-image-loader': '@cornerstonejs/dicom-image-loader/dist/dynamic-import/cornerstoneDICOMImageLoader.min.js',
//         },
//       },
//       devServer: {
//         historyApiFallback: true,
//         headers: {
//           'Cross-Origin-Embedder-Policy': 'require-corp',
//           'Cross-Origin-Opener-Policy': 'same-origin',
//         },
//       },
//     }
//   },
// };
// };

module.exports = function (context, options) {
  return {
    name: 'custom-docusaurus-plugin',
    // eslint-disable-next-line
    configureWebpack(config, isServer, utils) {
      return {
        devServer: {
          historyApiFallback: true,
          headers: {
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cross-Origin-Opener-Policy': 'same-origin',
          },
        },
      };
    },
  };
};
