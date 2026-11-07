// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import assert from "node:assert/strict";
import { parser } from "typescript-eslint";
import { Linter, RuleTester } from "eslint";
import namedParameterContracts from "./named-parameter-contracts.mjs";

const tester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
});

/** Express the public warning contract independently of diagnostic prose.
 * @param parameter Binding name that owns the inline contract in the fixture.
 * @returns Expected ESLint diagnostic metadata, without suggesting an invented name.
 */
function error(parameter) {
  return { messageId: "namedContract", data: { parameter } };
}

tester.run("sendanor/named-parameter-contracts", namedParameterContracts, {
  valid: [
    "interface IdParams { id: string; } type IdContext = { params: Promise<IdParams> }; async function GET(request: Request, context: IdContext) {}",
    "type Payload = { id: string; metadata: { count: number } }; interface RecordShape { value: { nested: number } }",
    "type Handler = (input: Payload) => void; interface Client { send(input: Payload): void; }",
    "function accept(input: unknown, raw: string, count: number, enabled: boolean) {}",
    "function read(context: Request, values: ReadonlyArray<IdParams>, metadata: Record<string, unknown>) {}",
    "const values: string[] = []; values.map(value => value.toUpperCase());",
    "const callback: (value: number) => number = value => value + 1;",
    "function local(input: string) { const value: { id: string } = { id: input }; return value; }",
    "function output(): { id: string } { return { id: 'output' }; }",
    "function generic<T extends { id: string }>(value: T) {}",
    "type Handler = (input: string) => { result: number };",
    "const text = 'function example(input: { id: string }) {}'; // Example prose is not a contract.",
  ],
  invalid: [
    {
      code: "async function GET(request: Request, context: { params: Promise<{ id: string }> }) {}",
      output: null,
      errors: [error("context")],
    },
    { code: "function direct(input: { id: string }) {}", output: null, errors: [error("input")] },
    {
      code: "function promised(input: Promise<{ id: string }>) {}",
      output: null,
      errors: [error("input")],
    },
    { code: "function array(input: { id: string }[]) {}", output: null, errors: [error("input")] },
    {
      code: "function readonlyArray(input: readonly { id: string }[]) {}",
      output: null,
      errors: [error("input")],
    },
    {
      code: "function generic(input: Readonly<Array<Promise<{ id: string }>>>) {}",
      output: null,
      errors: [error("input")],
    },
    {
      code: "function union(input: string | { id: string } | { count: number }) {}",
      output: null,
      errors: [error("input")],
    },
    {
      code: "function intersection(input: Existing & { id: string }) {}",
      output: null,
      errors: [error("input")],
    },
    {
      code: "function tuple(input: [string, { id: string }]) {}",
      output: null,
      errors: [error("input")],
    },
    {
      code: "const callback = (input: { id: string }) => input.id;",
      output: null,
      errors: [error("input")],
    },
    {
      code: "values.map((input: { id: string }) => input.id);",
      output: null,
      errors: [error("input")],
    },
    {
      code: "class Reader { read(input: { id: string }) {} }",
      output: null,
      errors: [error("input")],
    },
    {
      code: "class Reader { constructor(public input: { id: string }) {} }",
      output: null,
      errors: [error("input")],
    },
    {
      code: "const reader = { read(input: { id: string }) {} };",
      output: null,
      errors: [error("input")],
    },
    {
      code: "function defaults(input: { id: string } = { id: 'default' }) {}",
      output: null,
      errors: [error("input")],
    },
    {
      code: "function rest(...inputs: { id: string }[]) {}",
      output: null,
      errors: [error("inputs")],
    },
    {
      code: "function destructured({ id }: { id: string }) {}",
      output: null,
      errors: [error("destructured parameter")],
    },
    {
      code: "function arrayPattern([first]: Array<{ id: string }>) {}",
      output: null,
      errors: [error("destructured parameter")],
    },
    {
      code: "type Handler = (input: { id: string }) => void;",
      output: null,
      errors: [error("input")],
    },
    {
      code: "type Factory = new (input: { id: string }) => Instance;",
      output: null,
      errors: [error("input")],
    },
    {
      code: "interface Client { read(input: { id: string }): void; }",
      output: null,
      errors: [error("input")],
    },
    {
      code: "interface Callable { (input: { id: string }): void; }",
      output: null,
      errors: [error("input")],
    },
    {
      code: "declare function external(input: { id: string }): void;",
      output: null,
      errors: [error("input")],
    },
    {
      code: "function attach(callback: (input: { id: string }) => void) {}",
      output: null,
      errors: [error("input")],
    },
    {
      code: "function attach(callback: () => { result: number }) {}",
      output: null,
      errors: [error("callback")],
    },
    {
      code: "function pair(first: { id: string }, second: Promise<{ count: number }>) {}",
      output: null,
      errors: [error("first"), error("second")],
    },
  ],
});

const linter = new Linter();
const configuration = [
  {
    files: ["**/*.ts"],
    languageOptions: { parser },
    plugins: { sendanor: { rules: { "named-parameter-contracts": namedParameterContracts } } },
    rules: { "sendanor/named-parameter-contracts": "warn" },
  },
];
const warning = linter.verify("function read(input: { id: string }) {}", configuration, {
  filename: "fixture.ts",
});
assert.equal(warning.length, 1);
assert.equal(warning[0].severity, 1);
assert.equal(warning[0].ruleId, "sendanor/named-parameter-contracts");
assert.equal(warning[0].fix, undefined);
assert.equal(warning[0].suggestions, undefined);
assert.equal(
  linter.verify(
    "// eslint-disable-next-line sendanor/named-parameter-contracts -- This fixture deliberately mirrors the external anonymous transport signature.\nfunction read(input: { id: string }) {}",
    configuration,
    { filename: "fixture.ts" },
  ).length,
  0,
);
console.log(
  "HGIP628 named parameter contracts passed: direct/nested/generic/array/union literals, methods/callbacks/signatures/defaults/rest/destructuring, named declarations and unknown boundaries, warning severity and no automatic naming or fixes.",
);
