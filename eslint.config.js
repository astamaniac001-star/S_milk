import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "public/sw.js",
      ".tmp/**",
      "e2e-test-results/**",
      "coverage/**",
      // Throwaway node helper scripts (top-level await + node:fs). They are not
      // part of the app or test suite; linting them as browser/jsx source pulls
      // in node globals (`process`) that conflict with the .mjs ecmaVersion.
      "e2e/vitest/_cleanup.mjs",
      "e2e/vitest/_state.mjs",
      "e2e/vitest/_client.mjs",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        document: "readonly",
        window: "readonly",
        console: "readonly",
        // FIX (audit 2026-07-25): `true` is an alias for "writeable" — `location`
        // should be read-only in the browser. Treating it as writable would mask
        // accidental `location = ...` assignments that don't actually navigate.
        location: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        navigator: "readonly",
        CustomEvent: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        TextEncoder: "readonly",
        AbortController: "readonly",
        crypto: "readonly",
        URL: "readonly",
        Request: "readonly",
        Response: "readonly",
        Headers: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // REMOVED (2026-11-21 audit — AI-S L8): the Cloudflare "functions/**"
  // override referenced a directory that does not exist in this repo.

  // E2E test layer (Playwright + Vitest integration). Kept fully isolated
  // from app source under src/. Node globals are required here for fs/path/
  // process access; Playwright/Vitest inject their own test-scoped globals.
  // Includes playwright.config.js at repo root since it shares the same
  // Playwright-world globals as the test files.
  {
    files: ["e2e/**/*.{js,jsx}", "playwright.config.js"],
    languageOptions: {
      globals: {
        // Browser globals still apply because Playwright tests interact with
        // the live DOM via `page` (Playwright-supplied). Add Node-only ones.
        document: "readonly",
        window: "readonly",
        console: "readonly",
        location: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        fetch: "readonly",
        navigator: "readonly",
        CustomEvent: "readonly",
        // Playwright page.evaluate dispatches DOM events via the browser global
        // `Event` — required for `new Event("input")` patterns in e2e specs.
        Event: "readonly",
        HTMLElement: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        crypto: "readonly",
        URL: "readonly",
        // Node-only.
        process: "readonly",
        Buffer: "readonly",
        // Vitest + Playwright asserted globals (vitest globals:true).
        test: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        beforeEach: "readonly",
        afterAll: "readonly",
        afterEach: "readonly",
        vi: "readonly",
      },
    },
    rules: {
      "no-console": "off", // e2e log output is intentional for diagnostics
      "react-refresh/only-export-components": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
];
