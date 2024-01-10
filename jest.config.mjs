// Initiate all tests from root, but allow tests from each package root.
// Share as much config as possible to reduce duplication.
//
// Borrowing from here:
// https://github.com/facebook/jest/issues/3112#issuecomment-398581705
import base from './jest.config.base.mjs';

export default {
  ...base,
  // https://jestjs.io/docs/en/configuration#projects-array-string-projectconfig
  projects: ['<rootDir>/packages/*/jest.config.mjs'],
  coverageDirectory: '<rootDir>/coverage/',
};
