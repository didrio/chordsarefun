import { defineConfig } from 'vitest/config'

// Real-browser smoke tests (`npm run e2e`). Kept apart from `npm test`, which stays unit-only and fast.
export default defineConfig({
  test: { include: ['e2e/**/*.e2e.ts'], testTimeout: 20_000, hookTimeout: 30_000 },
})
