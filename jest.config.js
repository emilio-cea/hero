const pkg = require('./package.json');

const workspaces = pkg.workspaces.packages
  .filter(x => !x.startsWith('replay') && x !== 'website')
  .map(x => x.replace('/*', ''));

module.exports = {
  verbose: false,
  testMatch: ['**/test/*.test.js'],
  testEnvironment: 'node',
  collectCoverage: false,
  transform: {},
  collectCoverageFrom: workspaces.map(x => `${x}/**/*.js`),
  coverageReporters: ['text-summary', 'json'],
  coveragePathIgnorePatterns: [
    'node_modules',
    '<rootDir>/testing/*',
    '<rootDir>/.*/interfaces/*',
    '<rootDir>/.*/core-interfaces/*.[ts|js]',
    '<rootDir>/.*/puppet-interfaces/*.[ts|js]',
    '<rootDir>/.*/bin/*.[ts|js]',
    '<rootDir>/.*/start.[ts|js]',
    '<rootDir>/.*/install.[ts|js]',
    '<rootDir>/.*/install/*.[ts|js]',
    '<rootDir>/.*/server.[ts|js]',
    '<rootDir>/.*/test/.*.js',
    '<rootDir>/.*.d.ts',
    '<rootDir>/.*.json',
  ],
  globalTeardown: './jest.teardown.js',
  globalSetup: './jest.setup.js',
  testTimeout: 10e3,
  reporters: ['default', 'jest-summary-reporter'],
  roots: workspaces.map(x => `${x}/`),
  moduleDirectories: ['node_modules', ...workspaces.map(x => `${x}/node_modules`)],
};
