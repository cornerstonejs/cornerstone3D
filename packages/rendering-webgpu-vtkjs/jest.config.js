/* eslint-disable */
const base = require('../../jest.config.base.js');
const path = require('path');

module.exports = {
  ...base,
  displayName: 'rendering-webgpu-vtkjs',
  setupFiles: ['jest-canvas-mock'],
  moduleNameMapper: {
    ...base.moduleNameMapper,
    // Subpath imports first: '@cornerstonejs/core/renderBackend' and friends
    // resolve to the corresponding source directory, so the suite runs against
    // core's sources rather than requiring a built dist.
    '^@cornerstonejs/core/(.*)$': path.resolve(__dirname, '../core/src/$1'),
    '^@cornerstonejs/(.*)$': path.resolve(__dirname, '../$1/src'),
  },
};
