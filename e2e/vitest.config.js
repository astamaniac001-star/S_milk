// e2e/vitest.config.js — runner for the integration tests under ./vitest/.
// Deliberately separated from the app's own vitest config so:
//   1. `npm test` (app units) keeps using vite.config.js and never
//      touches live network or operator credentials.
//   2. `npm run test:db` picks up ONLY ./e2e/vitest /**.test.js.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["e2e/vitest/**/*.test.{js,jsx}"],
    // Vitest 4: `poolOptions` was hoisted to top-level. Integration tests
    // run serially in a single fork because they share the live DB and
    // operator session — parallel runs would race against the operator's
    // own writes and against each other.
    pool: "forks",
    singleFork: true,
    fileParallelism: false,
    retry: 0,
  },
});