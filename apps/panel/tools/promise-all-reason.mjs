// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
const protectedRules = new Set([
  "no-nested-ternary",
  "sendanor/promise-all-reason",
  "sendanor/prefer-async-await",
  "sendanor/readable-function-size",
  "sendanor/readable-file-size",
  "sendanor/prefer-readonly-boundaries",
  "sendanor/named-parameter-contracts",
  "sendanor/service-boundaries",
  "sendanor/prefer-uuid-guards",
  "sendanor/no-unknown-any",
]);

/** Resolve a call target through wrappers that do not change its receiver.
 * @param expression ESTree expression used by a call or member access.
 * @returns The underlying expression, retaining its original AST identity.
 */
function unwrapped(expression) {
  let value = expression;
  while (
    [
      "ChainExpression",
      "TSNonNullExpression",
      "TSAsExpression",
      "TSTypeAssertion",
      "TSSatisfiesExpression",
    ].includes(value.type)
  ) {
    value = value.expression;
  }
  return value;
}

/** Recognize the fixed all method without evaluating a dynamic property.
 * @param member Member expression whose property may be computed.
 * @returns Whether this syntax statically names the all method.
 */
function namesAll(member) {
  if (!member.computed) {
    return member.property.type === "Identifier" && member.property.name === "all";
  }
  const property = member.property;
  return (
    (property.type === "Literal" && property.value === "all") ||
    (property.type === "TemplateLiteral" &&
      property.expressions.length === 0 &&
      property.quasis[0]?.value.cooked === "all")
  );
}

/** Distinguish the standard Promise value from a caller's same-named binding.
 * Type-only bindings do not create a replacement runtime Promise object.
 * @param sourceCode ESLint source/scope manager for the current file.
 * @param node Identifier at the receiver's actual use site.
 * @returns Whether no lexical value declaration shadows the global Promise.
 */
function globalPromise(sourceCode, node) {
  if (node.type !== "Identifier" || node.name !== "Promise") {
    return false;
  }
  for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get("Promise");
    if (!variable || variable.isValueVariable === false) {
      continue;
    }
    return variable.defs.length === 0;
  }
  return true;
}

/** Require an explicit local reason before choosing Promise.all's fail-fast
 * behaviour. No automatic rewrite can preserve every task/error contract. */
const promiseAllReason = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Explain intentional Promise.all fail-fast behaviour with a targeted local lint exception.",
    },
    schema: [],
    messages: {
      explainAll:
        "Prefer controlled await or Promise.allSettled with explicit result handling. For intentional Promise.all fail-fast behaviour, add a reasoned local eslint-disable-next-line explaining task lifetime and errors.",
    },
  },
  /** Inspect the unshadowed global call without loading type services or
   * executing any of the asynchronous work being reviewed.
   * @param context ESLint rule context for scope access and diagnostics.
   * @returns A call listener that highlights only the all property.
   */
  create(context) {
    return {
      /** Warn on direct, static-computed, optional and typed Promise.all calls.
       * @param node Call expression currently visited by ESLint.
       */
      CallExpression(node) {
        const member = unwrapped(node.callee);
        if (
          member.type !== "MemberExpression" ||
          !namesAll(member) ||
          !globalPromise(context.sourceCode, unwrapped(member.object))
        ) {
          return;
        }
        context.report({ node: member.property, messageId: "explainAll" });
      },
    };
  },
};

/** Parse only ESLint disable directives relevant to the named local conventions
 * conventions. This is not a general configuration-comment interpreter.
 * @param comment ESLint's parsed line or block comment token.
 * @returns A relevant directive and its explanation, or null for other prose.
 */
function relevantDisable(comment) {
  const match = /^\s*eslint-(disable-next-line|disable-line|disable)\b([\s\S]*)$/u.exec(
    comment.value,
  );
  if (!match) {
    return null;
  }
  const body = match[2],
    separator = /(?:^|\s)--(?:\s|$)/u.exec(body);
  const ruleText = separator ? body.slice(0, separator.index) : body;
  const rules = [];
  let relevant = false;
  for (const token of ruleText.trim().split(/[\s,]+/u)) {
    const rule = token.replace(/^['"]|['"]$/gu, "");
    if (!rule) {
      continue;
    }
    rules.push(rule);
    if (protectedRules.has(rule)) {
      relevant = true;
    }
  }
  if (rules.length && !relevant) {
    return null;
  }
  return {
    kind: match[1],
    rules,
    reason: separator ? body.slice(separator.index + separator[0].length).trim() : "",
  };
}

/** Keep reviewed convention exceptions on one named source line with a written
 * reason. Its separate rule ID remains active when only the reviewed rule is
 * disabled; it deliberately does not replace ESLint's configuration authority. */
export const requireLocalDisableReason = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require targeted local, explained exceptions for asynchronous code and readability limits.",
    },
    schema: [],
    messages: {
      localOnly:
        "Use a targeted eslint-disable-next-line for the reviewed convention; a file/block-wide or all-rules exception is not accepted.",
      missingReason:
        "Add -- followed by a concrete reason explaining why this convention exception is necessary.",
    },
  },
  /** Inspect source comments once, independently of the original call warning.
   * @param context ESLint rule context supplying comments and reporting.
   * @returns A program listener for the bounded convention-comment check.
   */
  create(context) {
    return {
      /** Review relevant disable directives without reading application state. */
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          const directive = relevantDisable(comment);
          if (!directive) {
            continue;
          }
          if (directive.kind !== "disable-next-line" || !directive.rules.length) {
            context.report({ node: comment, messageId: "localOnly" });
          } else if (!directive.reason) {
            context.report({ node: comment, messageId: "missingReason" });
          }
        }
      },
    };
  },
};

export default promiseAllReason;
