// https://github.com/facebook/jest/issues/3613
// Yarn Doctor: `npx @yarnpkg/doctor .` -->
// '<rootDir>' warning:
// Strings should avoid referencing the node_modules directory (prefer require.resolve)

const path = require('path');

/**
 * Starts the jest workers without Sparkplug, the baseline compiler of V8.
 *
 * Node 24 kills a jest worker with SIGSEGV now and then on macOS with Apple
 * silicon (3 of 15 full core runs on 24.15.0, in a different file each time):
 * a full garbage collection that a stack guard interrupt starts in
 * `Builtins_BaselineOutOfLinePrologue` reads a stack slot that the prologue
 * left unset, in `ClearStaleLeftTrimmedPointerVisitor::VisitRootPointers`
 * (nodejs/node#62393, reported from 24.10 to 24.21). Jest then loses the tests
 * of that file and exits 1. jest-worker starts each worker with the `execArgv`
 * of this process, and NODE_OPTIONS does not take the flag, so it is added
 * here. A run in band (one file) runs in this process, which started with
 * Sparkplug.
 */
function runWorkersWithoutSparkplug() {
  if (!process.execArgv.includes('--no-sparkplug')) {
    process.execArgv.push('--no-sparkplug');
  }
}

runWorkersWithoutSparkplug();

module.exports = {
  // roots: ['<rootDir>/src'],
  testMatch: ['<rootDir>/test/**/*.jest.js'],
  testPathIgnorePatterns: ['<rootDir>/node_modules/'],
  testEnvironment: require.resolve('./utils/fixJSDOMJest.js'),
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  transformIgnorePatterns: ['<rootDir>/node_modules/(?!@kitware/.*)'],
  moduleNameMapper: {
    // Resolve from node_modules so workspace alias does not map this package
    '^@cornerstonejs/calculate-suv$': path.resolve(
      __dirname,
      'node_modules/@cornerstonejs/calculate-suv'
    ),
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/src/__mocks__/fileMock.js',
    '\\.(css|less)$': 'identity-obj-proxy',
  },
  // Setup
  // setupFiles: ["jest-canvas-mock/lib/index.js"],
  // Coverage
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      {
        plugins: ['babel-plugin-transform-import-meta'],
      },
    ],
  },
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{js,jsx}',
    // Not
    '!<rootDir>/src/RenderingEngine/vtkClasses/**',
    '!<rootDir>/src/**/*.test.js',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!<rootDir>/dist/**',
  ],
};
