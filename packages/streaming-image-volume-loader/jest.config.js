const base = require('../../jest.config.base.js');
const path = require('path');

module.exports = {
  ...base,
  name: 'streaming-image-volume-loader',
  displayName: 'streaming-image-volume-loader',
  moduleNameMapper: {
    '^@cornerstonejs/(.*)$': path.resolve(__dirname, '../$1/src'),
  },
};
