// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import assert from "node:assert/strict";
import { parser } from "typescript-eslint";
import { Linter, RuleTester } from "eslint";
import requireEscapingThrowJsdoc from "./require-escaping-throw-jsdoc.mjs";
import noUnknownAny from "./no-unknown-any.mjs";
import { requireLocalDisableReason } from "./promise-all-reason.mjs";

const tester = new RuleTester({
  languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
});
const missing = { messageId: "missingThrows" };
const invalid = { messageId: "invalidThrows" };

// These are parser-only programs: no fixture throw, provider or async operation is executed.
tester.run("sendanor/require-escaping-throw-jsdoc", requireEscapingThrowJsdoc, {
  valid: [
    "const fallback = supplied ?? /** Reject when no installed operation can handle the request.\n * @throws {Error} When this fallback operation is invoked.\n */ (() => { throw new Error('unavailable'); });",
    "/** Reject values outside the parsed price range.\n * @throws {RangeError} When the parsed amount exceeds the supported range.\n */\nfunction reject() { throw new RangeError('too large'); }",
    "/** Preserve a domain failure from an imported contract.\n * @throws {import(\"unknown-any-domain\").DomainError} When the contract rejects the operation.\n */\nfunction rejectDomain() { throw new Error('domain'); }",
    "/** Preserve one asynchronous rejection.\n * @throws {Error} The Promise rejects when the accepted request cannot be retained.\n */\nconst save = async () => { throw new Error('save failed'); };",
    "/** Reject a missing binding.\n * @exception {TypeError} When the caller has not supplied a required binding.\n */\nconst reject = function () { throw new TypeError('missing'); };",
    "/** Absorb the local probe failure and return an unavailable result. */\nfunction probe() { try { throw new Error('probe'); } catch { return false; } }",
    "/** Absorb an inner rethrow before returning from this local probe. */\nfunction probe() { try { try { throw new Error('probe'); } catch (error) { throw error; } } catch { return false; } }",
    "/** Always replace the pending probe failure with the fallback result. */\nfunction probe() { try { throw new Error('probe'); } finally { return false; } }",
    "/** Always replace the pending probe failure on either finalizer branch. */\nfunction probe() { try { throw new Error('probe'); } finally { if (available) return true; else return false; } }",
    "/** Stop this probe loop rather than exposing its local failure. */\nfunction probe() { for (;;) { try { throw new Error('probe'); } finally { break; } } }",
    "/** Replace the prior failure with the finalizer's meaningful error.\n * @throws {RangeError} When final cleanup detects an invalid retained range.\n */\nfunction probe() { try { throw new TypeError('discarded'); } finally { throw new RangeError('retained'); } }",
    "/** Retain a callback whose failure is its own contract. */\nfunction outer() { return (/** Reject the unavailable callback action.\n * @throws {Error} When the callback action is unavailable.\n */ () => { throw new Error('callback'); }); }",
    "/** Own one isolated adapter instance. */\nclass Adapter { /** Reject an unavailable persistence action.\n * @throws {Error} The Promise rejects when the store is unavailable.\n */ async save() { throw new Error('unavailable'); } }",
    "const api = { /** Reject the unavailable action.\n * @throws {Error} When the owner has disabled this operation.\n */ run() { throw new Error('disabled'); } };",
    "/** Validate one accepted binding.\n * @throws {{ code: string } | Error} When validation or the injected parser fails.\n */\nfunction parse() { throw { code: 'invalid' }; }",
    "/** Require a bound runtime adapter.\n * @throws {Error}\n * When no adapter was installed for this request.\n */\nfunction bind() { throw new Error('missing adapter'); }",
    "/** Return the existing value without explicit local failures. */\nfunction value() { return readPort(); }",
    "function missingWholeDocumentation() { throw new Error('companion-rule owns this'); }",
    "throw new Error('module-level initialization is not a function contract');",
  ],
  invalid: [
    {
      code: "/** Forward a port failure.\n * @throws {unknown} When the adapter rejects.\n */\nasync function save(adapter) { return await adapter.save(); }",
      errors: [{ messageId: "broadThrows" }],
    },
    {
      code: "/** Forward a port failure.\n * @throws {Error|any} When the adapter rejects.\n */\nasync function save(adapter) { return await adapter.save(); }",
      errors: [{ messageId: "broadThrows" }],
    },
    {
      code: "/** Forward a port failure.\n * @throws {unknown} When the adapter rejects.\n */\nasync function saveExternal(adapter) { return await adapter.save(); }",
      errors: [{ messageId: "broadThrows" }],
    },
    {
      code: "const fallback = supplied ?? /** Reject requests without an installed operation. */ (() => { throw new Error('unavailable'); });",
      errors: [missing],
    },
    {
      code: "/** Reject an invalid parsed amount. */\nfunction reject() { throw new RangeError('invalid'); }",
      errors: [missing],
    },
    {
      code: "/** Reject either unsupported branch. */\nfunction reject() { if (first) throw new Error('first'); throw new Error('second'); }",
      errors: [missing],
    },
    {
      code: "/** Return an asynchronously checked value. */\nconst check = async () => { throw new Error('failed'); };",
      errors: [missing],
    },
    {
      code: "/** Preserve the original validation rejection. */\nfunction reject() { try { throw new Error('original'); } catch (error) { throw error; } }",
      errors: [missing],
    },
    {
      code: "/** Always execute cleanup before returning. */\nfunction reject() { try { return 1; } finally { throw new Error('cleanup'); } }",
      errors: [missing],
    },
    {
      code: "/** Keep the original failure unless the optional fallback is available. */\nfunction reject() { try { throw new Error('original'); } finally { if (available) return false; } }",
      errors: [missing],
    },
    {
      code: "/** Continue after a local label without replacing the pending failure. */\nfunction reject() { try { throw new Error('original'); } finally { local: { break local; } } }",
      errors: [missing],
    },
    {
      code: "/** Retain a callback whose execution is deferred.\n * @throws {Error} When the outer operation cannot retain the callback.\n */\nfunction outer() { try { return (/** Reject an unavailable callback action. */ () => { throw new Error('callback'); }); } catch { return null; } }",
      errors: [missing],
    },
    {
      code: "const api = { /** Reject an unavailable action. */ run() { throw new Error('unavailable'); } };",
      errors: [missing],
    },
    {
      code: "/** Own the adapter instance. */\nclass Adapter { /** Reject an unavailable write. */ save() { throw new Error('unavailable'); } }",
      errors: [missing],
    },
    {
      code: "/** Reject invalid parsed values.\n * @throws\n */\nfunction reject() { throw new Error('invalid'); }",
      errors: [invalid],
    },
    {
      code: "/** Reject invalid parsed values.\n * @throws {Error}\n */\nfunction reject() { throw new Error('invalid'); }",
      errors: [invalid],
    },
    {
      code: "/** Reject invalid parsed values.\n * @throws {Error} Error\n */\nfunction reject() { throw new Error('invalid'); }",
      errors: [invalid],
    },
    {
      code: "/** Reject invalid parsed values.\n * @throws Error when validation fails.\n */\nfunction reject() { throw new Error('invalid'); }",
      errors: [invalid],
    },
    {
      code: "/** Reject invalid parsed values.\n * @throws {} When validation fails.\n */\nfunction reject() { throw new Error('invalid'); }",
      errors: [invalid],
    },
    {
      code: "/** Reject invalid parsed values.\n * @throws {Error When validation fails.\n */\nfunction reject() { throw new Error('invalid'); }",
      errors: [invalid],
    },
    {
      code: "/** Forward an injected port's result.\n * @throws {unknown}\n */\nasync function save() { return await port.save(); }",
      errors: [invalid],
    },
    {
      code: "/** Reject one unavailable action.\n * @throws {Error} When the action is unavailable.\n * @exception {TypeError}\n */\nfunction reject() { throw new Error('unavailable'); }",
      errors: [invalid],
    },
  ],
});

const configuredLinter = new Linter();
const configuredRules = [
  {
    files: ["**/*.ts"],
    languageOptions: { parser, ecmaVersion: 2022, sourceType: "module" },
    plugins: {
      sendanor: {
        rules: {
          "require-escaping-throw-jsdoc": requireEscapingThrowJsdoc,
          "no-unknown-any": noUnknownAny,
          "require-local-disable-reason": requireLocalDisableReason,
        },
      },
    },
    rules: {
      "sendanor/require-escaping-throw-jsdoc": "error",
      "sendanor/no-unknown-any": "off",
      "sendanor/require-local-disable-reason": "error",
    },
  },
];

/** Run the production-rule combination with the lexical broad-type warning disabled.
 * @param source - Complete TypeScript fixture linted with both rules registered.
 * @returns ESLint diagnostics, including the owning rule and severity.
 */
function lintConfiguredThrows(source, broadTypeSeverity = "off") {
  return configuredLinter.verify(
    source,
    [
      {
        ...configuredRules[0],
        rules: {
          ...configuredRules[0].rules,
          "sendanor/no-unknown-any": broadTypeSeverity,
        },
      },
    ],
    { filename: "throw-contract.ts" },
  );
}

const unknownThrowWithOtherRuleDisabled = lintConfiguredThrows(
  "/** Reject a rejected persistence operation.\n * @throws {unknown} When the persistence port rejects.\n */\nasync function save() { return await port.save(); }",
);
assert.deepEqual(
  unknownThrowWithOtherRuleDisabled.map(({ ruleId, severity, messageId }) => [
    ruleId,
    severity,
    messageId,
  ]),
  [["sendanor/require-escaping-throw-jsdoc", 2, "broadThrows"]],
  "the escaping-throw rule rejects unknown even when no-unknown-any is disabled",
);

const locallySuppressedUnknownType = lintConfiguredThrows(
  "/** Reject a rejected persistence operation.\n * @throws {unknown} When the persistence port rejects.\n */\n// eslint-disable-next-line sendanor/no-unknown-any -- The legacy input surface remains unvalidated until its parser runs.\nasync function save() { return await port.save(); }\n/** Reject an adapter failure.\n * @throws {Error | any} When the adapter fails.\n */\n// eslint-disable-next-line sendanor/no-unknown-any -- The legacy input surface remains unvalidated until its parser runs.\nasync function saveLegacy() { return await legacyPort.save(); }",
  "warn",
);
assert.deepEqual(
  locallySuppressedUnknownType.map(({ ruleId, severity, messageId }) => [
    ruleId,
    severity,
    messageId,
  ]),
  [
    ["sendanor/require-escaping-throw-jsdoc", 2, "broadThrows"],
    ["sendanor/require-escaping-throw-jsdoc", 2, "broadThrows"],
  ],
  "a local no-unknown-any directive cannot waive unknown or any escaping-throws diagnostics",
);

const allowedConcreteRows = lintConfiguredThrows(
  '/** Reject the typed operation.\n * @throws {TypeError} When the supplied value is not accepted.\n * @throws {DomainError} When the operation rejects its domain transition.\n * @throws {import("unknown-any-domain").DomainError} When the imported domain contract rejects.\n */\nfunction save() { return port.save(); }',
);
assert.deepEqual(allowedConcreteRows, [], "known exception names and import paths remain valid");
