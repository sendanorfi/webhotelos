// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import assert from "node:assert/strict";
import { parser } from "typescript-eslint";
import { Linter, RuleTester } from "eslint";
import preferReadonlyBoundaries from "./prefer-readonly-boundaries.mjs";

const languageOptions = { parser, ecmaVersion: 2022, sourceType: "module" };
const tester = new RuleTester({ languageOptions });

tester.run("sendanor/prefer-readonly-boundaries", preferReadonlyBoundaries, {
  valid: [
    "function read(items: readonly number[]) { return items.length; }",
    "function read(items: ReadonlyArray<number>) { return items[0]; }",
    "function read(pair: readonly [number, string]) { return pair[0]; }",
    "function mutate(items: number[]) { items.push(1); }",
    "function mutate(items: number[]) { items.pop(); items.splice(0, 1); }",
    "function mutate(items: number[]) { items.sort(); items.reverse(); }",
    "function mutate(items: number[]) { items[0] = 3; }",
    "function mutate(items: number[]) { items.length = 0; }",
    "function mutate(items: number[]) { items[0]++; delete items[1]; }",
    "function mutate(items: number[]) { [items[0]] = [1]; }",
    "function mutate(items: number[]) { ({ value: items[0] } = { value: 1 }); }",
    "function mutate(items: number[]) { const other = items; other.push(1); }",
    "function mutate(items: number[]) { const other = items; other[0] = 2; }",
    "function mutate(items: number[]) { const other = items; const third = other; third.length = 0; }",
    "function mutate(items: number[]) { queueMicrotask(() => { items.push(1); }); }",
    "function mutate(items: number[]) { return items.map((value, index, receiver) => receiver.push(value)); }",
    "function mutate(items: number[]) { return items.reduce((sum, value, index, receiver) => { receiver[0] = 1; return sum; }, 0); }",
    "function mutate(items: number[]) { items.forEach(function () { arguments[2].push(1); }); }",
    "function unknown(items: number[]) { return items.map(existingCallback); }",
    "function unknown(items: number[]) { consume(items); }",
    "function unknown(items: number[]) { const other = items; consume(other); }",
    "function unknown(items: number[]) { target.items = items; }",
    "function unknown(items: number[]) { return { items }; }",
    "function unknown(items: number[]) { return items; }",
    "function unknown(items: number[]) { const other = items; return other; }",
    "function unknown(items: number[]) { return condition ? items : []; }",
    "function unknown(items: number[]) { return items as number[]; }",
    "function unknown(items: number[]) { return items.customOperation(); }",
    "function unknown(items: number[]) { const borrowed = items.slice; return borrowed(); }",
    "function unknown(items: number[]) { return consume(...items); }",
    "function unknown(items: number[]) { let other = items; other = []; }",
    "function declaration(items: number[]): number;",
    "type Items = number[]; function alias(items: Items) { return items.length; }",
    "function union(items: number[] | null) { return items?.length; }",
    "function destructured([first]: number[]) { return first; }",
    "interface Immutable { readonly values: number[]; }",
    "type Immutable = { readonly [name: string]: number; readonly label: string };",
    "class Immutable { readonly values: number[] = []; }",
    "class Counter { private count = 0; increment() { this.count++; } }",
    "class Counter { private count = 0; set value(next: number) { this.count = next; } }",
    "class Counter { #count = 0; increment() { this.#count++; } }",
    "class Counter { private count = 0; constructor() { queueMicrotask(() => { this.count = 1; }); } }",
    "class Counter { private count = 0; copy(other: Counter) { other.count = 1; } }",
    "class Counter { private count = 0; increment() { const alias = this; alias.count++; } }",
    "class Counter { private count = 0; change(key: string) { this[key] = 1; } }",
    "class Counter { private static count = 0; constructor() { Counter.count = 1; } }",
    "class Dynamic { [computedName] = 1; }",
  ],
  invalid: [
    {
      code: "function size(items: number[]) { return items.length; }",
      output: null,
      errors: [{ messageId: "arrayParameter", data: { name: "items" } }],
    },
    {
      code: "function size(items: Array<number>) { return items[0]; }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function size(pair: [number, string]) { return pair[1]; }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function size(items: number[] = []) { return items.length; }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function size(...items: number[]) { return items.length; }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "const size = (items: number[]) => items.length;",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "const object = { size(items: number[]) { return items.length; } };",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function copy(items: number[]) { return [...items]; }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function read(items: number[]) { const alias = items; return alias.length; }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function read(items: number[]) { const alias = items; return alias.slice(); }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function read(items: number[]) { for (const item of items) consume(item); }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function read(items: number[]) { return items.map(value => value * 2); }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function read(items: number[]) { return items.map((value, index, receiver) => receiver.length + value); }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function read(items: number[]) { items.forEach((value, index, receiver) => { const alias = receiver; consume(alias.length); }); }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function read(items: number[]) { return items.reduce((sum, value, index, receiver) => sum + value + receiver.length, 0); }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function read(items: number[]) { return queueMicrotask(() => consume(items.length)); }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function read(items: number[]) { function nested() { const items = []; items.push(1); } return items.length; }",
      errors: [{ messageId: "arrayParameter" }],
    },
    {
      code: "function unused(items: number[]) { return 1; }",
      errors: [{ messageId: "arrayParameter" }],
    },
    { code: "interface Data { name: string; }", errors: [{ messageId: "contractProperty" }] },
    {
      code: "interface Data { values?: readonly number[]; }",
      errors: [{ messageId: "contractProperty" }],
    },
    {
      code: "type Data = { values: ReadonlyArray<number> };",
      errors: [{ messageId: "contractProperty" }],
    },
    {
      code: "type Dictionary = { [name: string]: number };",
      errors: [{ messageId: "contractProperty" }],
    },
    {
      code: "class Data { private count = 0; value() { return this.count; } }",
      errors: [{ messageId: "privateField" }],
    },
    {
      code: "class Data { private count: number; constructor(value: number) { this.count = value; } }",
      errors: [{ messageId: "privateField" }],
    },
    {
      code: "class Data { #count = 0; value() { return this.#count; } }",
      errors: [{ messageId: "privateField" }],
    },
    {
      code: "class Data { private values: number[] = []; append() { this.values.push(1); } }",
      errors: [{ messageId: "privateField" }],
    },
    {
      code: "class Data { count = 0; increment() { this.count++; } }",
      errors: [{ messageId: "publicField" }],
    },
    {
      code: "class Data { protected count = 0; increment() { this.count++; } }",
      errors: [{ messageId: "publicField" }],
    },
    {
      code: "abstract class Data { abstract count: number; }",
      errors: [{ messageId: "publicField" }],
    },
  ],
});

// Actual flat-config suppression verifies the project's local rule name, not RuleTester's synthetic prefix.
const linter = new Linter();
const config = {
  languageOptions,
  plugins: { sendanor: { rules: { "prefer-readonly-boundaries": preferReadonlyBoundaries } } },
  rules: { "sendanor/prefer-readonly-boundaries": "warn" },
};
const intentional = `interface WritableDraft {
  // eslint-disable-next-line sendanor/prefer-readonly-boundaries -- The draft editor intentionally updates this field before persistence (HGIP627).
  title: string;
}`;
assert.deepEqual(linter.verify(intentional, config), []);
const review = linter.verify("interface Draft { title: string; }", config);
assert.equal(review[0]?.severity, 1);
assert.equal(review[0]?.fix, undefined);
assert.equal(preferReadonlyBoundaries.meta.fixable, undefined);
