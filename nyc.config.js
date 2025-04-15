module.exports = {
  reporter: ['html', 'text', 'lcov'],
  extension: ['.js', '.ts'],
  all: true,
  include: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.js'],
  exclude: [
    '**/*.spec.ts',
    '**/*.test.ts',
    '**/test/*',
    '**/tests/*',
    '**/examples/*',
    '**/stories/*',
    'packages/docs/**',
  ],
};
