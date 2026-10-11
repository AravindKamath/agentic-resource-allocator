// Native ESM: run with NODE_OPTIONS=--experimental-vm-modules (see `npm test`).
export default {
  testEnvironment: 'node',
  transform: {},
  setupFiles: ['<rootDir>/src/tests/env.js'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
  testMatch: ['<rootDir>/src/tests/**/*.test.js'],
  testTimeout: 30000,
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/tests/**',
    '!src/seed/**',
    '!src/scripts/**',
    '!src/index.js'
  ]
};
