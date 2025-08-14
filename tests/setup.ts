// Jest setup file
import 'jest';

// Global test setup can go here
global.console = {
  ...console,
  // Uncomment to ignore specific log levels during tests
  // log: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};