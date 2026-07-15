# Changelogs

Agent-facing change log for `AGENTS.md` and the project-memory docs in this
folder. Code-level changelog for the app itself should go in the git
commit messages (no `CHANGELOG.md` exists in this repo).

## 2026-07-15

- **Initial AGENTS.md created.** Captured full architecture of `c1milk` (V17):
  React 19 + Vite 8 + Supabase-direct stack, state composition pattern,
  handler `useHelpers` pattern, API↔UI mapper convention, JSONB `delivery_days`
  convention, PascalCase status strings, ₹/Asia-Kolkata date conventions,
  sessionStorage token, optimistic-concurrency `version` column, 3-layer
  error handling, PWA service worker (V21) caching rules, and the standard
  workflow for adding a new entity. Includes a "common workflows" and
  "things to be careful about" section.
