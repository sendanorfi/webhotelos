// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import assert from "node:assert/strict";
import { parser } from "typescript-eslint";
import { Linter, RuleTester } from "eslint";
import noUnknownAny from "./no-unknown-any.mjs";
import { requireLocalDisableReason } from "./promise-all-reason.mjs";

const languageOptions = { parser, ecmaVersion: 2022, sourceType: "module" };
const tester = new RuleTester({ languageOptions });

/** Expect one broad type diagnostic without coupling a fixture to message prose.
 * @param keyword - Explicit any or unknown type expected at this occurrence.
 * @param line - Optional declaration line for parsed JSDoc types.
 * @returns The expected ESLint diagnostic shape.
 */
function broadType(keyword, line) {
  return {
    messageId: "broadType",
    data: { keyword },
    ...(line ? { line } : {}),
  };
}

tester.run("sendanor/no-unknown-any", noUnknownAny, {
  valid: [
    "type Input = { value: string; nested: ReadonlyArray<number> };",
    "const content = 'any unknown /** @throws {any} */'; const values = { any: 'unknown', unknown: false };",
    "/** The words any and unknown here describe prose, not a type.\n * @example `const value: any` is text in an example.\n */\nfunction read() { return 'any unknown'; }",
    "/**\n * @throws {TypeError} When the input has an unsupported shape.\n * @throws {RangeError} When the requested value is outside its range.\n */\nfunction parse() { throw new Error('invalid'); }",
    {
      code: "/** @typedef {string | number} Identifier */\nconst identifier = 'value';",
      filename: "identifier.mjs",
    },
  ],
  invalid: [
    {
      code: "type Input = Readonly<{ raw: unknown; rows: Array<{ value: any }> }> | null;",
      errors: [broadType("unknown"), broadType("any")],
    },
    {
      code: "type Value = any | unknown;",
      errors: [broadType("any"), broadType("unknown")],
    },
    {
      code: "/**\n * @param {unknown} raw - Request body received from an external HTTP caller.\n * @returns {Array<any>} - Parsed external records before validation.\n * @throws {Error} When parsing fails.\n */\nfunction parse(raw) {}",
      filename: "external-payload.mjs",
      errors: [broadType("unknown", 6), broadType("any", 6)],
    },
    {
      code: "/** @typedef {Record<string, any>} ExternalMap */\nconst value = {};",
      filename: "external-map.js",
      errors: [broadType("any", 2)],
    },
    {
      code: "/**\n * @param {unknown} input - External request body.\n * @returns {unknown} - Result before validation.\n */\nfunction parse(input) {}",
      filename: "repeated-jsdoc.mjs",
      errors: [broadType("unknown", 5), broadType("unknown", 5)],
    },
    {
      code: "/** @throws {Error | unknown} When the external adapter rejects. */\nfunction save() {}",
      filename: "adapter.mjs",
      errors: [broadType("unknown", 2)],
    },
    {
      code: "/** @template {unknown} T - External data remains untrusted until narrowed. */\nfunction retain(value) {}",
      filename: "template.mjs",
      errors: [broadType("unknown", 2)],
    },
  ],
});

const linter = new Linter();
const configuration = [
  {
    files: ["**/*.ts"],
    languageOptions,
    plugins: {
      sendanor: {
        rules: {
          "no-unknown-any": noUnknownAny,
          "require-local-disable-reason": requireLocalDisableReason,
        },
      },
    },
    rules: {
      "sendanor/no-unknown-any": "warn",
      "sendanor/require-local-disable-reason": "warn",
    },
  },
];

/** Verify warning severity and directive behavior using the actual rule namespace.
 * @param code - Complete parser-only TypeScript source fixture.
 * @returns ESLint diagnostics with severity and rule ownership intact.
 */
function lint(code) {
  return linter.verify(code, configuration, { filename: "src/unknown-any-fixture.ts" });
}

const plainWarning = lint("const payload: unknown = source;");
assert.equal(plainWarning.length, 1);
assert.equal(plainWarning[0].ruleId, "sendanor/no-unknown-any");
assert.equal(plainWarning[0].severity, 1);
assert.equal(plainWarning[0].messageId, "broadType");
assert.equal(plainWarning[0].fix, undefined, "The rule never guesses a replacement type.");

const justifiedBoundary = lint(
  "// eslint-disable-next-line sendanor/no-unknown-any -- HTTP JSON is external and isRecord narrows it before field access.\nfunction parse(value: unknown) { if (!isRecord(value)) return null; return value; }",
);
assert.deepEqual(justifiedBoundary, []);

const documentedBoundary = lint(
  "/** @param {unknown} payload - JSON received from an external HTTP request. */\n// eslint-disable-next-line sendanor/no-unknown-any -- The external request body is narrowed with isRecord before any field access.\nfunction parse(payload) { if (!isRecord(payload)) return null; return payload; }",
);
assert.deepEqual(documentedBoundary, []);

const missingReason = lint(
  "// eslint-disable-next-line sendanor/no-unknown-any\nfunction parse(value: unknown) { return value; }",
);
assert.deepEqual(
  missingReason.map(({ ruleId, messageId, severity }) => [ruleId, messageId, severity]),
  [["sendanor/require-local-disable-reason", "missingReason", 1]],
);

console.log(
  "Explicit any/unknown types: TypeScript nodes, parsed JSDoc types, prose/string exclusions, warning severity and reasoned local boundary exception are covered.",
);
