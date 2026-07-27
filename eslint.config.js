import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "public/sw.js", ".tmp/**"],
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
  // Specific overrides for Cloudflare Functions (if applicable)
  {
    files: ["functions/**/*.js"],
    languageOptions: {
      globals: {
        Request: "readonly",
        Response: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        URL: "readonly",
        env: "readonly",
      },
    },
    rules: {
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
