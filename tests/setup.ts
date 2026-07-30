/**
 * Vitest global setup for THEFVC.IS (PRD-008: Testing & CI).
 *
 * - Registers @testing-library/jest-dom custom matchers.
 * - Sets NODE_ENV=test so the app doesn't try to start the Vite dev server
 *   or hit real external services during unit/integration tests.
 */
import "@testing-library/jest-dom";

// Ensure a deterministic timezone for date-sensitive tests
process.env.TZ = "UTC";

// Silence noisy console.error during expected-error tests
const originalError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    // Allow tests to opt-in to error logging
    if (process.env.VITEST_VERBOSE_ERRORS) {
      originalError(...args);
    }
  };
});
afterAll(() => {
  console.error = originalError;
});
