import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.test.{js,jsx}", "functions/**/*.test.{js,jsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      reportsDirectory: "./coverage",
      // FIX: Expanded coverage to include ALL source files, not just src/lib/
      include: ["src/**/*.{js,jsx}"],
      exclude: ["src/test/**", "src/**/*.test.{js,jsx}", "node_modules/**"],
      thresholds: {
        lines: 10,
        branches: 10,
        functions: 10,
        statements: 10,
        "src/lib/api.js": { lines: 40, branches: 30 },
        "src/lib/validation/**/*.js": { lines: 50, branches: 50 },
        "src/hooks/handlers/**/*.js": { lines: 30, branches: 20 },
      },
    },
  },
  build: {
    target: "es2020",
    // SECURITY: no sourcemaps in prod. Hidden maps leak anon key + source.
    // If Sentry/error-tracker is added later, wire a separate upload step.
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules") &&
            /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)
          ) {
            return "vendor";
          }
        },
      },
    },
  },
});
