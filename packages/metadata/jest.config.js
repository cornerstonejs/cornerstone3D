/* eslint-disable */
const base = require('../../jest.config.base.js');
const path = require('path');

module.exports = {
  ...base,
  displayName: 'metadata',
  transformIgnorePatterns: ['<rootDir>/node_modules/(?!(@kitware|dcmjs)/.*)'],
  moduleNameMapper: {
    ...base.moduleNameMapper,
    '^@cornerstonejs/(\\w+)/(.+)$': path.resolve(__dirname, '../$1/src/$2'),
    '^@cornerstonejs/(.*)$': path.resolve(__dirname, '../$1/src'),
  },
};
