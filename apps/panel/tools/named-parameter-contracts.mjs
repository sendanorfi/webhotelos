// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
/** Identify a parameter carrying this annotation, preserving default-value and
 * constructor-property wrappers instead of mistaking local variable types for
 * function contracts.
 * @param annotation TypeScript annotation currently examined in the ancestor chain.
 * @returns The owning parameter node, or null outside a function/signature parameter.
 */
function annotatedParameter(annotation) {
  let parameter = annotation.parent;
  while (
    (parameter.parent?.type === "AssignmentPattern" && parameter.parent.left === parameter) ||
    (parameter.parent?.type === "TSParameterProperty" && parameter.parent.parameter === parameter)
  ) {
    parameter = parameter.parent;
  }
  return parameter.parent?.params?.includes(parameter) ? parameter : null;
}

/** Find the closest parameter boundary containing an anonymous object shape.
 * Callback signatures own their own parameters; type-alias/interface bodies do
 * not become parameter contracts merely because they describe object data.
 * @param node Inline TypeScript object type visited by ESLint.
 * @returns Its nearest annotated parameter, or null for a named declaration's body.
 */
function enclosingParameter(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type !== "TSTypeAnnotation") {
      continue;
    }
    const parameter = annotatedParameter(current);
    if (parameter) {
      return parameter;
    }
  }
  return null;
}

/** Keep the diagnostic short without copying a potentially large inline type.
 * @param parameter Parameter node, including rest/default/property wrappers.
 * @returns A developer-facing binding name or a stable destructuring label.
 */
function parameterLabel(parameter) {
  let binding = parameter;
  while (["AssignmentPattern", "TSParameterProperty", "RestElement"].includes(binding.type)) {
    if (binding.type === "AssignmentPattern") {
      binding = binding.left;
    } else if (binding.type === "TSParameterProperty") {
      binding = binding.parameter;
    } else {
      binding = binding.argument;
    }
  }
  return binding.type === "Identifier" ? binding.name : "destructured parameter";
}

/** Require a named domain contract at explicit object-shaped parameter boundaries
 * while leaving inference, runtime validation and declaration ownership separate. */
const namedParameterContracts = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Use documented named contracts instead of anonymous object shapes in parameter types",
    },
    schema: [],
    messages: {
      namedContract:
        "Parameter '{{parameter}}' contains an anonymous object contract. Extract a meaningfully named, documented type or interface; reuse an existing public contract when its semantics match. Keep unknown at genuinely untrusted boundaries.",
    },
  },
  /** Inspect syntax only; inferred contextual callbacks and primitive/named
   * types remain untouched. Naming a contract requires domain knowledge, so the
   * rule never invents a type name or automatically moves declarations.
   * @param context ESLint context used to report the parameter contract boundary.
   * @returns A TypeScript object-type listener with one diagnostic per parameter.
   */
  create(context) {
    const reported = new WeakSet();
    return {
      /** Report anonymous object types even below Promise, arrays or generics.
       * Nested properties share their outer parameter's diagnostic; nested
       * callback parameters retain their own boundary and binding name.
       * @param node The currently visited inline object type.
       */
      TSTypeLiteral(node) {
        const parameter = enclosingParameter(node);
        if (!parameter || reported.has(parameter)) {
          return;
        }
        reported.add(parameter);
        context.report({
          node,
          messageId: "namedContract",
          data: { parameter: parameterLabel(parameter) },
        });
      },
    };
  },
};

export default namedParameterContracts;
