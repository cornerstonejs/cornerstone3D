const base = require('../../jest.config.base.js');

module.exports = {
  ...base,
  displayName: 'codemods',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.jest.js'],
  collectCoverageFrom: ['<rootDir>/src/**/*.js'],
};
