# Panel lint rules

The custom rules and their tests in this directory are adapted from the owner's
Palvelinhuone.fi repository (`scripts/eslint`, commit `383da88`) with permission
to distribute that original work under this project's MIT license. SPDX notices
in the files identify that provenance. The ESLint built-in size rules are consumed
through ESLint's installed API, not copied; ESLint retains its own license.

The panel enables missing runtime bindings, async/await, explicit `Promise.all`
justification, local suppression reasons, named parameter contracts, readonly
boundaries, specific output types, and a 500-line file limit. The upstream tests
use synthetic fixtures and have been adapted for the installed TypeScript parser
and ESLint version. `npm run test:lint` executes them.

The rules for forbidding all `unknown` and requiring JSDoc for every callback or
escaping throw are retained and tested but not enabled: untrusted JSON and caught
errors need an `unknown` boundary, and the current React handlers do not yet have
those extensive documentation contracts. TypeScript ESLint still rejects explicit
`any`. The 100-line function limit is retained and tested but not enabled while the
panel's main React component is being split. These are review conventions, not
security enforcement.

The source repository's service-boundary, type-guard and UUID rules depend on its
specific paths, layers or guard library. They were omitted instead of introducing
rules that would silently check the wrong architecture. Revisit them if the panel
gains corresponding abstractions.
