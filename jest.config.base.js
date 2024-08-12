/** @type {import('jest').Config} */
const config = {
  roots: ['<rootDir>/src', '<rootDir>/test'],

  testMatch: [
    // '<rootDir>/test/**/*.jest.js',
    '<rootDir>/test/**/volumeViewport_gpu_render_test.js',
  ],

  testPathIgnorePatterns: ['<rootDir>/node_modules/'],
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  transformIgnorePatterns: ['<rootDir>/node_modules/(?!@kitware/.*)'],
  moduleNameMapper: {
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$':
      '<rootDir>/src/__mocks__/fileMock.js',
    '\\.(css|less)$': 'identity-obj-proxy',
  },
  // Coverage
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{js,jsx}',
    // Not
    '!<rootDir>/src/RenderingEngine/vtkClasses/**',
    '!<rootDir>/src/**/*.test.js',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!<rootDir>/dist/**',
  ],

  coverageDirectory: 'coverage',
  reporters: ['default'],
  // Setup files to be run before each test suite
  setupFiles: ['jest-canvas-mock/lib/index.js'],

  globals: {
    CHROME_BIN: require('puppeteer').executablePath(),
  },

  watchPlugins: ['jest-watch-typeahead'],

  preset: 'jest-puppeteer',

  // If needed, transform files like WebAssembly or other specific types
  transform: {
    '^.+\\.[t|j]sx?$': 'babel-jest',
    '\\.wasm$': 'jest-raw-loader',
  },

  // Handle custom extensions like .wasm or others
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx', 'wasm'],
};

module.exports = config;
