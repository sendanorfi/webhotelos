// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import assert from "node:assert/strict";
import { parser } from "typescript-eslint";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
import { Linter, RuleTester } from "eslint";
import { builtinRules } from "eslint/use-at-your-own-risk";
import { readableFileSize, readableFunctionSize } from "./readable-size.mjs";

const tester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
});
const functionOptions = { max: 100, skipComments: true, skipBlankLines: true, IIFEs: true };
const fileOptions = { max: 500, skipComments: true, skipBlankLines: true };

/** Construct an exact physical function size, including signature and braces.
 * @param lines Number of code lines the native ESLint rule must count.
 * @returns A standalone function fixture without application dependencies.
 */
function functionCode(lines) {
  return `function sample() {\n${Array.from({ length: lines - 2 }, () => "  tick();").join("\n")}\n}`;
}

/** Construct file-size boundaries without a checked-in giant fixture.
 * @param lines Number of nonblank code lines to include.
 * @returns Independent expression statements with no duplicate declarations.
 */
function fileCode(lines) {
  return Array.from({ length: lines }, () => "tick();").join("\n");
}

assert.equal(
  require("eslint/package.json").version,
  "10.14.0",
  "Review the unsupported builtinRules seam when updating the pinned ESLint version",
);
for (const [wrapper, name] of [
  [readableFunctionSize, "max-lines-per-function"],
  [readableFileSize, "max-lines"],
]) {
  const builtin = builtinRules.get(name);
  assert.equal(
    wrapper.create,
    builtin.create,
    "The installed native counting algorithm is reused, never reimplemented",
  );
  assert.equal(
    wrapper.meta.schema,
    builtin.meta.schema,
    "The native validated option contract remains authoritative",
  );
  assert.equal(
    wrapper.meta.fixable,
    undefined,
    "Semantic module splitting must never be an automatic fix",
  );
  assert.equal(Boolean(wrapper.meta.hasSuggestions), false);
  assert.match(wrapper.meta.messages.exceed, /cohesive, independent/u);
  assert.match(wrapper.meta.messages.exceed, /concrete local reason/u);
}

tester.run("sendanor/readable-function-size", readableFunctionSize, {
  valid: [
    { code: functionCode(100), options: [functionOptions] },
    {
      code: "function sample() {\n // Full-line comment.\n /* A multiline\n    explanation. */\n\n tick(); // A code line remains a code line.\n}",
      options: [{ max: 3, skipComments: true, skipBlankLines: true, IIFEs: true }],
    },
    { code: "(function () {\n first();\n second();\n}());", options: [{ max: 3, IIFEs: false }] },
    { code: "class Reader {\n run() {\n  tick();\n }\n}", options: [{ max: 3 }] },
    {
      code: "interface Reader { read(): Promise<void>; }",
      filename: "fixture.ts",
      options: [functionOptions],
    },
  ],
  invalid: [
    {
      code: functionCode(101),
      options: [functionOptions],
      output: null,
      errors: [{ messageId: "exceed" }],
    },
    {
      code: "function sample() {\n first(); /* This comment does not erase code. */\n second();\n}",
      options: [{ max: 3, skipComments: true, skipBlankLines: true }],
      output: null,
      errors: [{ messageId: "exceed" }],
    },
    {
      code: "const update = () => {\n first();\n second();\n};",
      options: [{ max: 3 }],
      output: null,
      errors: [{ messageId: "exceed" }],
    },
    {
      code: "const reader = {\n read() {\n  first();\n  second();\n }\n};",
      options: [{ max: 3 }],
      output: null,
      errors: [{ messageId: "exceed" }],
    },
    {
      code: "class Reader {\n async read() {\n  first();\n  second();\n }\n}",
      options: [{ max: 3 }],
      output: null,
      errors: [{ messageId: "exceed" }],
    },
    {
      code: "class Reader {\n constructor() {\n  first();\n  second();\n }\n}",
      options: [{ max: 3 }],
      output: null,
      errors: [{ messageId: "exceed" }],
    },
    {
      code: "const reader = {\n get value() {\n  first();\n  return current;\n }\n};",
      options: [{ max: 3 }],
      output: null,
      errors: [{ messageId: "exceed" }],
    },
    {
      code: "(function () {\n first();\n second();\n}());",
      options: [{ max: 3, IIFEs: true }],
      output: null,
      errors: [{ messageId: "exceed" }],
    },
    {
      code: "(() => {\n first();\n second();\n})();",
      options: [{ max: 3, IIFEs: true }],
      output: null,
      errors: [{ messageId: "exceed" }],
    },
    {
      code: "function outer() {\n function inner() {\n  tick();\n }\n}",
      options: [{ max: 3 }],
      output: null,
      errors: [{ messageId: "exceed" }],
    },
  ],
});

tester.run("sendanor/readable-file-size", readableFileSize, {
  valid: [
    { code: fileCode(500) + "\n", options: [fileOptions] },
    {
      code: "// Header comment.\n\nfirst();\n/* A multiline\n explanation. */\nsecond();\n\nthird(); // Still counted.\n",
      options: [{ max: 3, skipComments: true, skipBlankLines: true }],
    },
    {
      code: "// Comment-only file.\n\n/* More explanation. */\n",
      options: [{ max: 0, skipComments: true, skipBlankLines: true }],
    },
  ],
  invalid: [
    {
      code: fileCode(501),
      options: [fileOptions],
      output: null,
      errors: [{ messageId: "exceed", data: { actual: 501, max: 500 } }],
    },
    {
      code: "first(); /* Comments next to code do not subtract that line. */\nsecond();\nthird();\nfourth();",
      options: [{ max: 3, skipComments: true, skipBlankLines: true }],
      output: null,
      errors: [{ messageId: "exceed", data: { actual: 4, max: 3 } }],
    },
  ],
});

const linter = new Linter();
const plugin = {
  sendanor: {
    rules: {
      "readable-function-size": readableFunctionSize,
      "readable-file-size": readableFileSize,
    },
  },
};
const warnings = linter.verify(functionCode(4), [
  {
    plugins: plugin,
    rules: {
      "sendanor/readable-function-size": ["warn", { max: 3 }],
      "sendanor/readable-file-size": ["warn", { max: 3 }],
    },
  },
]);
assert.deepEqual(warnings.map((item) => item.ruleId).sort(), [
  "sendanor/readable-file-size",
  "sendanor/readable-function-size",
]);
assert.ok(
  warnings.every((item) => item.severity === 1 && !item.fix && !item.suggestions),
  "Large code is a warning for human review, never an automated semantic rewrite",
);
assert.match(
  warnings.find((item) => item.ruleId === "sendanor/readable-function-size").message,
  /4 code lines/u,
);
assert.equal(
  linter.verify(
    "// eslint-disable-next-line sendanor/readable-function-size -- This small compatibility fixture deliberately preserves the upstream layout.\n" +
      functionCode(4),
    [{ plugins: plugin, rules: { "sendanor/readable-function-size": ["warn", { max: 3 }] } }],
  ).length,
  0,
);
assert.equal(
  linter.verify(
    "first();\nsecond();\nthird();\n// eslint-disable-next-line sendanor/readable-file-size -- This protocol fixture is kept in its upstream order for direct comparison.\nfourth();",
    [
      {
        plugins: plugin,
        rules: {
          "sendanor/readable-file-size": [
            "warn",
            { max: 3, skipComments: true, skipBlankLines: true },
          ],
        },
      },
    ],
  ).length,
  0,
);
console.log(
  "HGIP626 readable-size wrappers passed: native algorithm/schema reuse, 100/101 function and 500/501 file boundaries, methods/arrows/IIFEs, comments/blanks, warning severity, local exceptions and no automatic fixes.",
);
