// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint/no-undefined-values.mjs, commit 383da88.
/** Report unresolved runtime references while leaving type-only names to TypeScript. */
export default {
  meta: {
    type: "problem",
    schema: [],
    messages: { missingBinding: "Declare or import '{{name}}' before using this value." },
  },
  create(context) {
    return {
      "Program:exit"(node) {
        for (const reference of context.sourceCode.getScope(node).through) {
          if (reference.isValueReference === false) {
            continue;
          }
          const identifier = reference.identifier;
          if (
            identifier.parent.type === "UnaryExpression" &&
            identifier.parent.operator === "typeof"
          ) {
            continue;
          }
          context.report({
            node: identifier,
            messageId: "missingBinding",
            data: { name: identifier.name },
          });
        }
      },
    };
  },
};
