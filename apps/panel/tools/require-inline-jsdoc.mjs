// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import { functionOwner } from "./inline-jsdoc-helpers.mjs";
import { createParameterContractChecker } from "./require-inline-jsdoc-parameters.mjs";

/** Identify member declarations that have no separate executable function body.
 * @param node - ESTree declaration emitted by the JavaScript or TypeScript parser.
 */
function declarationKind(node) {
  switch (node.type) {
    case "ClassDeclaration":
    case "ClassExpression":
      return "class";
    case "TSInterfaceDeclaration":
      return "interface";
    case "TSTypeAliasDeclaration":
      return "type alias";
    case "TSEnumDeclaration":
      return "enum";
    case "TSEnumMember":
      return "enum member";
    case "TSModuleDeclaration":
      return "namespace";
    case "PropertyDefinition":
    case "TSAbstractPropertyDefinition":
    case "AccessorProperty":
    case "TSPropertySignature":
      return "property";
    default:
      return "declaration";
  }
}

/** ESLint 9 documentation contract; meaningful prose remains a review responsibility and is never generated. */
const requireInlineJsdoc = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require descriptive inline JSDoc on all callables, their parameters and declared API members.",
    },
    schema: [
      {
        type: "object",
        properties: {
          requireCallbacks: { type: "boolean" },
          requireObjectProperties: { type: "boolean" },
          requireParameterDescriptions: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missing:
        "Add inline JSDoc to this {{kind}} explaining its purpose, use, and relevant constraints or side effects.",
      missingParam:
        "Describe parameter '{{name}}' in @param prose or its own inline JSDoc; a name or type alone is insufficient.",
      missingParamProperty:
        "Describe destructured property '{{name}}' in @param prose or its own inline JSDoc.",
    },
  },
  /** Check shared comment owners once, while checking each callable's actual parameter contract.
   * @param context - ESLint rule context; no project execution or inferred documentation is used.
   */
  create(context) {
    const sourceCode = context.sourceCode;
    const {
      requireCallbacks = true,
      requireObjectProperties = false,
      requireParameterDescriptions = true,
    } = context.options[0] ?? {};
    const { check, checkFunction } = createParameterContractChecker({
      context,
      sourceCode,
      requireParameterDescriptions,
    });

    return {
      /** Check all callbacks by default, including JSX events and array iteration.
       * @param node - Callable expression, including a bodyless TypeScript implementation node.
       */
      "FunctionExpression, ArrowFunctionExpression, TSEmptyBodyFunctionExpression"(node) {
        const owner = functionOwner(node);
        if (owner) {
          checkFunction(
            owner,
            node,
            owner.type === "Property" || owner.type.includes("Property")
              ? "function property"
              : "function",
          );
        } else if (requireCallbacks || node.id) {
          checkFunction(node, node);
        }
      },
      /** Use the named alias/member comment while checking the callable type's parameter names.
       * @param node - TypeScript callable or constructor type signature.
       */
      "TSFunctionType, TSConstructorType"(node) {
        checkFunction(functionOwner(node) ?? node, node);
      },
      /** Named declarations have the same parameter requirements as anonymous callbacks.
       * @param node - JavaScript function declaration or declared TypeScript function signature.
       */
      "FunctionDeclaration, TSDeclareFunction"(node) {
        checkFunction(node, node);
      },
      /** Check the method value here so the child visit cannot duplicate diagnostics.
       * @param node - Concrete or abstract class method, including constructors and accessors.
       */
      "MethodDefinition, TSAbstractMethodDefinition"(node) {
        checkFunction(node, node.value, "method");
      },
      /** Bodyless methods and callable members expose the same parameter contract.
       * @param node - Method/call/construct/index interface signature.
       */
      "TSMethodSignature, TSCallSignatureDeclaration, TSConstructSignatureDeclaration, TSIndexSignature"(
        node,
      ) {
        checkFunction(node, node, node.type === "TSMethodSignature" ? "method" : "type signature");
      },
      /** Methods always need docs; ordinary value-only object keys remain an explicit separate policy.
       * @param node - Object member; destructuring bindings are validated with their formal parameter.
       */
      Property(node) {
        if (node.parent?.type === "ObjectPattern") {
          return;
        }
        if (node.method || node.kind === "get" || node.kind === "set") {
          checkFunction(node, node.value, "method");
        } else if (requireObjectProperties) {
          check(node, "object property");
        }
      },
      /** Document noncallable declarations; constructor parameters also cover their parameter-properties.
       * @param node - Type/class/member declaration whose purpose must be documented.
       */
      "ClassDeclaration, ClassExpression, TSInterfaceDeclaration, TSTypeAliasDeclaration, TSEnumDeclaration, TSEnumMember, TSModuleDeclaration, PropertyDefinition, TSAbstractPropertyDefinition, AccessorProperty, TSPropertySignature"(
        node,
      ) {
        check(
          node.type === "ClassExpression" ? (functionOwner(node) ?? node) : node,
          declarationKind(node),
        );
      },
    };
  },
};

export default requireInlineJsdoc;
