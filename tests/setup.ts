import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

const localStore: Record<string, unknown> = {};

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  value: {
    storage: {
      local: {
        get: vi.fn(async (defaults: Record<string, unknown>) => ({ ...defaults, ...localStore })),
        set: vi.fn(async (value: Record<string, unknown>) => Object.assign(localStore, value)),
      },
    },
    permissions: {
      contains: vi.fn(async () => false),
      request: vi.fn(async () => true),
    },
  },
});
