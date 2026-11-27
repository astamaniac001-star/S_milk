// e2e/_operator.mjs
//
// Single source for the operator account identity used by live test suites
// (AGENTS §9: the email must never be hardcoded outside
// src/lib/constants.js and this one file). Node-only — e2e code cannot read
// Vite's import.meta.env, so the fallback lives here and everywhere else
// imports from this module.
export const OPERATOR_EMAIL_FALLBACK = "astamaniac001@gmail.com";

export const operatorEmail = (envValue) => envValue || OPERATOR_EMAIL_FALLBACK;
