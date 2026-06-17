import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Match the tsconfig `@/*` path alias so test code can import app modules
      // by the same specifier the app uses (e.g. `@/lib/supabase/server`).
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The jsdom test environment resolves `server-only` to its browser build,
      // which throws on import. Server-only modules (e.g. csv-profile.server.ts)
      // are exercised here as plain Node modules, so alias the guard to a no-op so
      // importing them under test does not trip the client-component guard (WR-04).
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
})
