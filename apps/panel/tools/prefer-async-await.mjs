// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
/** Read a statically named method without executing an expression or guessing
 * a computed runtime key.
 * @param property AST property node from a computed member expression.
 * @returns A recognized then/catch name, or null for another or dynamic key.
 */
function staticMethodName(property) {
  let value = null;
  if (property.type === "Literal") {
    value = property.value;
  } else if (property.type === "TemplateLiteral" && property.expressions.length === 0) {
    value = property.quasis[0]?.value.cooked;
  }
  return value === "then" || value === "catch" ? value : null;
}

/** Find the called member through syntax-only parentheses/optional-chain/type
 * wrappers. This never resolves values or claims the receiver is a Promise.
 * @param callee AST expression immediately used as the call target.
 * @returns The called member expression, or null for a different call shape.
 */
function calledMember(callee) {
  let member = callee;
  while (
    [
      "ChainExpression",
      "TSNonNullExpression",
      "TSAsExpression",
      "TSTypeAssertion",
      "TSSatisfiesExpression",
    ].includes(member.type)
  ) {
    member = member.expression;
  }
  return member.type === "MemberExpression" ? member : null;
}

/** Prefer readable async/await without rewriting Promise scheduling, rejection
 * propagation or non-Promise APIs that happen to use the same method names. */
const preferAsyncAwait = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer async/await to direct .then() and .catch() chains, with documented local exceptions.",
    },
    schema: [],
    messages: {
      preferAwait:
        "Prefer async/await instead of .{{method}}(). Keep intentional chaining only with a reasoned local eslint-disable-next-line comment.",
    },
  },
  /** Inspect call syntax only. The rule deliberately supplies no automatic fix
   * because moving await/catch can change parallel work and error handling.
   * @param context ESLint rule context supplying reporting and source access.
   * @returns A listener that reports the statically named then/catch method.
   */
  create(context) {
    return {
      /** Warn on each direct, computed or optional then/catch invocation.
       * @param node Call expression currently visited by ESLint.
       */
      CallExpression(node) {
        const member = calledMember(node.callee);
        if (!member) {
          return;
        }
        let method = null;
        if (member.computed) {
          method = staticMethodName(member.property);
        } else if (member.property.type === "Identifier") {
          method = member.property.name;
        }
        if (method !== "then" && method !== "catch") {
          return;
        }
        context.report({ node: member.property, messageId: "preferAwait", data: { method } });
      },
    };
  },
};

export default preferAsyncAwait;
