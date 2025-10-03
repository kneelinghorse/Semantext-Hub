/**
 * Vitest Test Setup
 * Configures testing environment with React Testing Library
 */
import '@testing-library/jest-dom';

// Mock window.matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {}, // deprecated
    removeListener: () => {}, // deprecated
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock fetch for API tests
global.fetch = undefined; // Will be mocked in individual tests
