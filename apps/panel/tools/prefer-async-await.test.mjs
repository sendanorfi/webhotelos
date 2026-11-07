// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import assert from "node:assert/strict";
import { parser } from "typescript-eslint";
import { Linter, RuleTester } from "eslint";
import preferAsyncAwait from "./prefer-async-await.mjs";

const tester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
});

/** Assert the named lint contract without depending on message prose.
 * @param method The statically named Promise-style method to report.
 * @returns Expected ESLint diagnostic metadata for the fixture.
 */
function error(method) {
  return { messageId: "preferAwait", data: { method } };
}

tester.run("sendanor/prefer-async-await", preferAsyncAwait, {
  valid: [
    "async function read() { const result = await pending; return result; }",
    "async function read() { try { return await pending; } catch (error) { return recover(error); } }",
    "async function read() { return await Promise.all([first(), second()]); }",
    "pending.finally(cleanup); pending?.finally?.(cleanup);",
    "const method = pending.then; const recover = pending.catch;",
    "then(handler); catchResult(handler);",
    "pending[method](handler); pending[`th${suffix}`](handler);",
    "class Collection { #then() {} run() { this.#then(); } }",
    'const sample = "pending.then(handler).catch(recover)";',
    "// pending.then(handler) is example prose.\nawait pending;",
  ],
  invalid: [
    { code: "pending.then(handler);", output: null, errors: [error("then")] },
    { code: "pending.catch(recover);", output: null, errors: [error("catch")] },
    {
      code: "pending.then(handler).catch(recover);",
      output: null,
      errors: [error("then"), error("catch")],
    },
    { code: 'pending["then"](handler);', output: null, errors: [error("then")] },
    { code: "pending['catch'](recover);", output: null, errors: [error("catch")] },
    { code: "pending[`then`](handler);", output: null, errors: [error("then")] },
    { code: "pending?.then(handler);", output: null, errors: [error("then")] },
    { code: "pending.then?.(handler);", output: null, errors: [error("then")] },
    { code: 'pending?.["catch"]?.(recover);', output: null, errors: [error("catch")] },
    { code: "(pending?.then)(handler);", output: null, errors: [error("then")] },
    { code: "pending.then!(handler);", output: null, errors: [error("then")] },
    { code: "(pending.catch as Handler)(recover);", output: null, errors: [error("catch")] },
    { code: "await pending.then(handler);", output: null, errors: [error("then")] },
    // Without type services the syntax is intentionally the same for a custom
    // API; a local reasoned suppression documents that conventional exception.
    {
      code: "const collection = { then: handler => handler() }; collection.then(handler);",
      output: null,
      errors: [error("then")],
    },
  ],
});

const linter = new Linter();
const configuration = [
  {
    plugins: { sendanor: { rules: { "prefer-async-await": preferAsyncAwait } } },
    rules: { "sendanor/prefer-async-await": "warn" },
  },
];
const warning = linter.verify("pending.then(handler);", configuration);
assert.equal(warning.length, 1);
assert.equal(
  warning[0].severity,
  1,
  "Promise-style chaining is a warning, not a release-blocking error",
);
assert.equal(warning[0].ruleId, "sendanor/prefer-async-await");
// RuleTester names rules with a synthetic prefix; test actual local exceptions
// through the real plugin registration so an unknown-rule error cannot pass.
for (const code of [
  "// eslint-disable-next-line sendanor/prefer-async-await -- Preserve this library's required Promise hand-off.\npending.then(handler);",
  "// eslint-disable-next-line sendanor/prefer-async-await -- This external collection API calls its synchronous operation then.\ncollection.then(handler);",
  "// eslint-disable-next-line sendanor/prefer-async-await -- This compatibility adapter must preserve the caller's exact rejection chain.\npending.catch(recover);",
]) {
  assert.deepEqual(linter.verify(code, configuration), []);
}
assert.equal(
  linter.verify("async function read() { return await pending; }", configuration).length,
  0,
);
console.log(
  "Async/await preference passed: direct/computed/optional/typed call syntax, chained diagnostics, warn severity, reasoned local suppression, no automatic fixes and no .finally warning.",
);
