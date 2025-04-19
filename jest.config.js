module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Explicitly tell Jest where to find source and test files
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  // Keep the pattern matching within the specified roots
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Optional: collect coverage
  // collectCoverage: true,
  // coverageDirectory: "coverage",
  // coverageProvider: "v8", // or "babel"
};
