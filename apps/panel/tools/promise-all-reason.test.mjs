// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import assert from "node:assert/strict";
import { parser } from "typescript-eslint";
import { Linter, RuleTester } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import promiseAllReason, { requireLocalDisableReason } from "./promise-all-reason.mjs";
import preferAsyncAwait from "./prefer-async-await.mjs";

const tester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
});
tester.run("sendanor/promise-all-reason", promiseAllReason, {
  valid: [
    "await Promise.allSettled(tasks); Promise.race(tasks); Promise.any(tasks);",
    "const join = Promise.all; const sample = 'Promise.all(tasks)';",
    "OtherPromise.all(tasks);",
    "function run(Promise) { return Promise.all(tasks); }",
    "const Promise = customImplementation; Promise.all(tasks);",
    'import Promise from "custom-promise"; Promise["all"](tasks);',
    "Promise[method](tasks); Promise[`al${suffix}`](tasks);",
    "async function run() { const first = await firstTask(); return await nextTask(first); }",
  ],
  invalid: [
    { code: "Promise.all(tasks);", output: null, errors: [{ messageId: "explainAll" }] },
    { code: 'Promise["all"](tasks);', output: null, errors: [{ messageId: "explainAll" }] },
    { code: "Promise[`all`](tasks);", output: null, errors: [{ messageId: "explainAll" }] },
    { code: "Promise?.all(tasks);", output: null, errors: [{ messageId: "explainAll" }] },
    { code: "Promise.all?.(tasks);", output: null, errors: [{ messageId: "explainAll" }] },
    { code: 'Promise?.["all"]?.(tasks);', output: null, errors: [{ messageId: "explainAll" }] },
    { code: "(Promise?.all)(tasks);", output: null, errors: [{ messageId: "explainAll" }] },
    { code: "(Promise.all as Join)(tasks);", output: null, errors: [{ messageId: "explainAll" }] },
    {
      code: "(Promise as PromiseConstructor).all(tasks);",
      output: null,
      errors: [{ messageId: "explainAll" }],
    },
    { code: "Promise!.all(tasks);", output: null, errors: [{ messageId: "explainAll" }] },
    {
      code: "Promise.all([first(), Promise.all(second)]);",
      output: null,
      errors: [{ messageId: "explainAll" }, { messageId: "explainAll" }],
    },
  ],
});

// Directive integration uses the real plugin namespace in Linter. RuleTester's
// synthetic rule registration is not a substitute for a multi-rule override:
// the original warning and the separate comment rule must coexist here.
const linter = new Linter();
const configuration = [
  {
    plugins: {
      sendanor: {
        rules: {
          "promise-all-reason": promiseAllReason,
          "prefer-async-await": preferAsyncAwait,
          "require-local-disable-reason": requireLocalDisableReason,
          "readable-function-size": builtinRules.get("max-lines-per-function"),
          "readable-file-size": builtinRules.get("max-lines"),
        },
      },
    },
    rules: {
      "no-alert": "warn",
      "sendanor/promise-all-reason": "warn",
      "sendanor/prefer-async-await": "warn",
      "sendanor/require-local-disable-reason": "warn",
    },
  },
];

/** Verify actual directive handling rather than invoking a rule listener by
 * hand or accidentally replacing the original warning with a parser error.
 * @param code Complete isolated source fixture to lint with the real plugin.
 * @param options Flat ESLint configuration for the convention being exercised.
 * @returns The reported rule/message IDs after asserting warn-only severity.
 */
function diagnostics(code, options = configuration) {
  const messages = linter.verify(code, options);
  const identifiers = [];
  for (const message of messages) {
    assert.equal(message.severity, 1, message.message);
    identifiers.push([message.ruleId, message.messageId]);
  }
  return identifiers;
}

assert.deepEqual(diagnostics("Promise.all(tasks);"), [
  ["sendanor/promise-all-reason", "explainAll"],
]);
assert.deepEqual(
  diagnostics(
    "// eslint-disable-next-line sendanor/promise-all-reason -- Both bounded read-only tasks may finish after the page fails; no state is committed.\nPromise.all(tasks);",
  ),
  [],
);
assert.deepEqual(
  diagnostics(
    "// eslint-disable-next-line sendanor/prefer-async-await -- The external adapter requires this precise rejection chain.\npending.catch(recover);",
  ),
  [],
);
assert.deepEqual(
  diagnostics("// eslint-disable-next-line sendanor/promise-all-reason\nPromise.all(tasks);"),
  [["sendanor/require-local-disable-reason", "missingReason"]],
);
assert.deepEqual(
  diagnostics(
    "// eslint-disable-next-line sendanor/prefer-async-await --   \npending.then(handler);",
  ),
  [["sendanor/require-local-disable-reason", "missingReason"]],
);
assert.deepEqual(
  diagnostics(
    "/* eslint-disable sendanor/promise-all-reason -- This whole-file exception is still too broad. */\nPromise.all(tasks);",
  ),
  [["sendanor/require-local-disable-reason", "localOnly"]],
);
assert.deepEqual(
  diagnostics(
    "pending.then(handler); // eslint-disable-line sendanor/prefer-async-await -- Use the required next-line form instead.",
  ),
  [["sendanor/require-local-disable-reason", "localOnly"]],
);
assert.deepEqual(
  diagnostics(
    "// eslint-disable-next-line -- This all-rules exception is too broad.\nPromise.all(tasks);",
  ),
  [["sendanor/require-local-disable-reason", "localOnly"]],
);
assert.deepEqual(
  diagnostics('/* eslint-disable no-alert */\nalert("synthetic");'),
  [],
  "The bounded comment convention does not take ownership of unrelated rules",
);
assert.deepEqual(diagnostics("const settled = await Promise.allSettled(tasks);"), []);
const readabilityConfiguration = [
  {
    ...configuration[0],
    rules: {
      ...configuration[0].rules,
      "sendanor/readable-function-size": [
        "warn",
        { max: 1, skipComments: true, skipBlankLines: true },
      ],
      "sendanor/readable-file-size": ["warn", { max: 3, skipComments: true, skipBlankLines: true }],
    },
  },
];
assert.deepEqual(
  diagnostics(
    "// eslint-disable-next-line sendanor/readable-function-size -- This fixture intentionally exercises the complete atomic transition.\nfunction atomic() {\n  return 1;\n}",
    readabilityConfiguration,
  ),
  [],
);
assert.deepEqual(
  diagnostics(
    "// eslint-disable-next-line sendanor/readable-function-size\nfunction atomic() {\n  return 1;\n}",
    readabilityConfiguration,
  ),
  [["sendanor/require-local-disable-reason", "missingReason"]],
);
assert.deepEqual(
  diagnostics(
    "const first = 1;\nconst second = 2;\nconst third = 3;\n// eslint-disable-next-line sendanor/readable-file-size -- This source fixture retains a compact inseparable declaration sequence.\nconst fourth = 4;",
    readabilityConfiguration,
  ),
  [],
);
assert.deepEqual(
  diagnostics(
    "const first = 1;\nconst second = 2;\nconst third = 3;\n// eslint-disable-next-line sendanor/readable-file-size\nconst fourth = 4;",
    readabilityConfiguration,
  ),
  [["sendanor/require-local-disable-reason", "missingReason"]],
);
console.log(
  "Promise.all reasons passed: unshadowed global calls, optional/computed/typed wrappers, no autofix, warn severity and real multi-rule local reason enforcement.",
);
