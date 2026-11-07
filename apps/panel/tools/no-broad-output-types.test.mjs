// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import { parser } from "typescript-eslint";
import { RuleTester } from "eslint";
import noBroadOutputTypes from "./no-broad-output-types.mjs";

const tester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
});
tester.run("sendanor/no-broad-output-types", noBroadOutputTypes, {
  valid: [
    {
      code: "function parse(payload: unknown): string { return String(payload); }",
      filename: "input-boundary.ts",
    },
    {
      code: "type RawInput = unknown; function parse(payload: RawInput): string { return String(payload); }",
      filename: "aliased-input.ts",
    },
    {
      code: "type TypeName = unknown; function preserve<TypeName>(): TypeName { throw new Error('generic'); }",
      filename: "generic-shadows-local-alias.ts",
    },
    {
      code: "type Echo<T> = T; function preserve<T>(): Echo<T> { throw new Error('generic'); }",
      filename: "generic-alias-of-input.ts",
    },
    {
      code: "type Handler = (payload: unknown) => Promise<void>; function register(handler: Handler): void {}",
      filename: "callback-input.ts",
    },
    {
      code: 'function load(): import("unknown-any-domain").DomainError { throw new Error("domain"); }',
      filename: "import-name.ts",
    },
    {
      code: "function load(): Readonly<{ payload: string }> { return { payload: 'ok' }; }",
      filename: "concrete-output.ts",
    },
    {
      code: "function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }",
      filename: "type-guard-input.ts",
    },
    {
      code: "function assertRecord(value: unknown): asserts value is Record<string, unknown> { if (typeof value !== 'object' || value === null) throw new Error('invalid'); }",
      filename: "assertion-input.ts",
    },
    {
      code: "type Guard = (value: unknown) => value is Record<string, unknown>; function register(guard: Guard): void {}",
      filename: "callback-type-guard-input.ts",
    },
    {
      code: `type Recursive<T> = { value: T; next?: Recursive<Recursive<T>> };
function load(): Recursive<string> { throw new Error("fixture"); }`,
      filename: "recursive-self-safe.ts",
    },
    {
      code: `interface Left { right?: Right; label: string }
interface Right { left?: Left; label: string }
function load(): Left { throw new Error("fixture"); }`,
      filename: "recursive-mutual-safe.ts",
    },
    {
      code: `type Left<T> = { value: T; next?: Right<Left<T>> };
type Right<T> = { next?: Left<Right<T>>; payload: string };
function load(): Left<string> { throw new Error("fixture"); }`,
      filename: "recursive-generic-mutual-safe.ts",
    },
    {
      code: `/** @typedef {{ label: string, next?: SelfNode }} SelfNode */
/** @returns {SelfNode} */
function load() {}`,
      filename: "recursive-jsdoc-self-safe.js",
    },
    {
      code: `/** @typedef {{ right?: Right, label: string }} Left */
/** @typedef {{ left?: Left, label: string }} Right */
/** @returns {Left} */
function load() {}`,
      filename: "recursive-jsdoc-mutual-safe.js",
    },
  ],
  invalid: [
    {
      code: "function load(): unknown { return null; }",
      filename: "direct-output.ts",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: "function load(): Promise<any> { return Promise.resolve(null); }",
      filename: "promise-output.ts",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: "type Result = unknown; function load(): Result { return null; }",
      filename: "aliased-output.ts",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: "type Result<T> = Promise<T>; function load(): Result<unknown> { return Promise.resolve(null); }",
      filename: "generic-aliased-output.ts",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: "type Result<T = unknown> = T[]; function load(): Result { return []; }",
      filename: "default-generic-output.ts",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: "interface Result { readonly value: unknown } function load(): Result { return { value: null }; }",
      filename: "interface-output.ts",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: "type Handler = (payload: string) => Promise<unknown>; const handle: Handler = async () => null;",
      filename: "callback-output.ts",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: "/** @returns {unknown} */ function load() {}",
      filename: "jsdoc-unknown.js",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: "/** @returns {Promise<any>} */ function load() {}",
      filename: "jsdoc-promise-any.js",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: "/** @typedef {Promise<unknown>} Result */\n/** @returns {Result} */ function load() {}",
      filename: "jsdoc-local-alias.js",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: "type Result<T> = { value: T }; function load(): Result<unknown> { return { value: null }; }",
      filename: "nested-aliased-output.ts",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: `type Recursive = { value: string; next?: Recursive; payload?: unknown };
function load(): Recursive { throw new Error("fixture"); }`,
      filename: "recursive-self-unsafe.ts",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: `interface Left { right?: Right; label: string }
interface Right { left?: Left; payload?: any }
function load(): Left { throw new Error("fixture"); }`,
      filename: "recursive-mutual-unsafe.ts",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: `type Left<T> = { value: T; next?: Right<Left<T>> };
type Right<T> = { next?: Left<Right<T>>; payload: unknown };
function load(): Left<string> { throw new Error("fixture"); }`,
      filename: "recursive-generic-mutual-unsafe.ts",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: `/** @typedef {{ label: string, next?: SelfNode, payload?: unknown }} SelfNode */
/** @returns {SelfNode} */
function load() {}`,
      filename: "recursive-jsdoc-self-unsafe.js",
      errors: [{ messageId: "broadOutput" }],
    },
    {
      code: `/** @typedef {{ right?: Right, label: string }} Left */
/** @typedef {{ left?: Left, payload: any }} Right */
/** @returns {Left} */
function load() {}`,
      filename: "recursive-jsdoc-mutual-unsafe.js",
      errors: [{ messageId: "broadOutput" }],
    },
  ],
});
