//
// Borrowing from here:
// https://github.com/facebook/jest/issues/3112#issuecomment-398581705
const base = require('./jest.config.base.js');

module.exports = {
  ...base,
  projects: ['<rootDir>/packages/*/jest.config.js'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
