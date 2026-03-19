# Sentinel

Milestone 1 focuses on a single protection path:

- detect a suspicious lookalike address introduced by a recent low-value transaction
- interrupt a send attempt only when the address is both newly introduced and highly similar to a trusted address

The initial implementation is dependency-free so the core engine can be exercised with the Node.js built-in test runner.

TypeScript is scaffolded at the workspace root so the project can migrate package-by-package without blocking the current runtime tests.

For a loadable browser build, run `npm run package:extension`. That emits a self-contained unpacked extension in `dist/extension`.
