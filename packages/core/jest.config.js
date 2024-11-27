/* eslint-disable */
const base = require('../../jest.config.base.js');
const path = require('path');

module.exports = {
  ...base,
  displayName: 'core',
  moduleNameMapper: {
    '^@cornerstonejs/(.*)$': path.resolve(__dirname, '../$1/src'),
  },
};
