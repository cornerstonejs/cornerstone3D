const base = require('../../jest.config.base.js');
const path = require('path');

module.exports = {
  ...base,
  name: 'tools',
  displayName: 'tools',
  moduleNameMapper: {
    '^@cornerstonejs/(.*)$': path.resolve(__dirname, '../$1/src'),
  },
};
