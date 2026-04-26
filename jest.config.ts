import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-preset-angular',
  setupFilesAfterEach: ['<rootDir>/src/setup-jest.ts'],
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '\\.(css)$': '<rootDir>/src/__mocks__/style-mock.ts',
  },
};

export default config;
