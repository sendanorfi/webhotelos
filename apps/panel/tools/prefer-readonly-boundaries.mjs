// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
/** Array methods whose native contract reads the receiver without mutating it. */
const READ_METHODS = new Set([
  "at",
  "concat",
  "entries",
  "flat",
  "includes",
  "indexOf",
  "join",
  "keys",
  "lastIndexOf",
  "slice",
  "toLocaleString",
  "toReversed",
  "toSorted",
  "toSpliced",
  "toString",
  "values",
  "with",
]);

/** Callback methods expose their receiver as callback parameter 3, or 4 for reducers. */
const CALLBACK_ARRAY_PARAMETER = new Map([
  ["every", 2],
  ["filter", 2],
  ["find", 2],
  ["findIndex", 2],
  ["findLast", 2],
  ["findLastIndex", 2],
  ["flatMap", 2],
  ["forEach", 2],
  ["map", 2],
  ["reduce", 3],
  ["reduceRight", 3],
  ["some", 2],
]);

/** Recognize only mutable array spelling; aliases and unions require a type checker.
 * @param annotation Type annotation attached to the parameter binding.
 * @returns Whether the syntax directly declares a mutable array or tuple.
 */
function mutableArray(annotation) {
  const type = annotation?.type === "TSTypeAnnotation" ? annotation.typeAnnotation : annotation;
  return (
    type?.type === "TSArrayType" ||
    type?.type === "TSTupleType" ||
    (type?.type === "TSTypeReference" &&
      type.typeName.type === "Identifier" &&
      type.typeName.name === "Array")
  );
}

/** Extract a simple parameter binding without inventing aliases for destructuring.
 * @param parameter Formal parameter, possibly carrying a default value.
 * @returns Its identifier, or null when the binding is outside this rule's analysis.
 */
function parameterIdentifier(parameter) {
  if (parameter.type === "TSParameterProperty") {
    return null;
  }
  let binding = parameter;
  if (parameter.type === "AssignmentPattern") {
    binding = parameter.left;
  } else if (parameter.type === "RestElement") {
    binding = parameter.argument;
  }
  return binding.type === "Identifier" ? binding : null;
}

/** Resolve the actual lexical binding rather than matching names across nested scopes.
 * @param source ESLint source code with its existing syntax-only scope manager.
 * @param identifier Binding identifier whose reads will be examined.
 * @returns The matching variable, or null when the scope manager cannot resolve it.
 */
function bindingVariable(source, identifier) {
  let scope = source.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable?.identifiers.includes(identifier)) {
      return variable;
    }
    scope = scope.upper;
  }
  return null;
}

/** Read a literal member key while retaining uncertainty for runtime expressions.
 * @param member Member expression whose property is being inspected.
 * @returns A static string key, or null for a dynamic key.
 */
function memberName(member) {
  if (!member.computed && ["Identifier", "PrivateIdentifier"].includes(member.property.type)) {
    return member.property.name;
  }
  return member.property.type === "Literal" &&
    ["string", "number"].includes(typeof member.property.value)
    ? String(member.property.value)
    : null;
}

/** Identify direct or nested writes, including index writes and deletions.
 * @param node Expression at the root of an array-derived member chain.
 * @returns Whether the enclosing operation writes to that expression.
 */
function writeTarget(node) {
  let target = node;
  while (
    ["ArrayPattern", "ObjectPattern", "RestElement"].includes(target.parent.type) ||
    (target.parent.type === "Property" &&
      target.parent.parent.type === "ObjectPattern" &&
      target.parent.value === target) ||
    (target.parent.type === "AssignmentPattern" && target.parent.left === target)
  ) {
    target = target.parent;
  }
  const parent = target.parent;
  return (
    (parent.type === "AssignmentExpression" && parent.left === target) ||
    (parent.type === "UpdateExpression" && parent.argument === target) ||
    (parent.type === "UnaryExpression" && parent.operator === "delete") ||
    (["ForInStatement", "ForOfStatement"].includes(parent.type) && parent.left === target)
  );
}

/** Inspect an inline native callback's array argument instead of assuming it is pure.
 * @param call Native array method call carrying an inline callback.
 * @param arrayIndex Position where the native method passes the receiver to that callback.
 * @param source ESLint source code and scope information.
 * @param seen Variables already proved safe within the current alias graph.
 * @returns Whether the callback cannot syntactically write or leak its receiver argument.
 */
function callbackReadsOnly(call, arrayIndex, source, seen) {
  const callback = call.arguments[0];
  if (!callback || !["ArrowFunctionExpression", "FunctionExpression"].includes(callback.type)) {
    return false;
  }
  const scope = source.scopeManager.acquire(callback, true);
  if (
    callback.type !== "ArrowFunctionExpression" &&
    scope?.set.get("arguments")?.references.length
  ) {
    return false;
  }
  for (const parameter of callback.params) {
    if (parameter.type === "RestElement") {
      return false;
    }
  }
  const parameter = callback.params[arrayIndex];
  if (!parameter) {
    return true;
  }
  const identifier = parameterIdentifier(parameter);
  const variable = identifier && bindingVariable(source, identifier);
  return Boolean(variable && variableReadsOnly(variable, source, seen, identifier));
}

/** Check the immediate array member operation; scalar element reads do not leak the array.
 * @param identifier Reference to the array binding, not a same-named shadow.
 * @param source ESLint source code and scope information.
 * @param seen Variables visited during conservative alias analysis.
 * @returns Whether the member use is a recognized read without receiver mutation.
 */
function memberReadsOnly(identifier, source, seen) {
  const first = identifier.parent;
  let top = first;
  while (top.parent.type === "MemberExpression" && top.parent.object === top) {
    top = top.parent;
  }
  if (writeTarget(top)) {
    return false;
  }
  let expression = first;
  while (expression.parent.type === "ChainExpression") {
    expression = expression.parent;
  }
  const call = expression.parent;
  const called = call.type === "CallExpression" && call.callee === expression;
  const name = memberName(first);
  if (called) {
    if (READ_METHODS.has(name)) {
      return true;
    }
    const arrayIndex = CALLBACK_ARRAY_PARAMETER.get(name);
    return arrayIndex !== undefined && callbackReadsOnly(call, arrayIndex, source, seen);
  }
  if (top.parent.type === "CallExpression" && top.parent.callee === top) {
    return false;
  }
  return name === "length" || (first.computed && (name === null || /^\d+$/u.test(name)));
}

/** Follow a local identity alias while refusing assignments, calls or returned arrays.
 * @param identifier Current read reference to an array parameter or its local alias.
 * @param source ESLint source code and scope information.
 * @param seen Variables already inspected for this parameter.
 * @returns Whether this individual reference is a recognized nonescaping read.
 */
function referenceReadsOnly(identifier, source, seen) {
  const parent = identifier.parent;
  if (parent.type === "MemberExpression" && parent.object === identifier) {
    return memberReadsOnly(identifier, source, seen);
  }
  if (
    parent.type === "VariableDeclarator" &&
    parent.init === identifier &&
    parent.id.type === "Identifier"
  ) {
    const alias = bindingVariable(source, parent.id);
    return Boolean(alias && variableReadsOnly(alias, source, seen, parent.id));
  }
  if (parent.type === "UnaryExpression") {
    return ["!", "typeof", "void"].includes(parent.operator);
  }
  if (parent.type === "BinaryExpression") {
    return ["===", "!==", "==", "!=", "instanceof"].includes(parent.operator);
  }
  if (
    [
      "IfStatement",
      "WhileStatement",
      "DoWhileStatement",
      "ConditionalExpression",
      "ForStatement",
    ].includes(parent.type)
  ) {
    return parent.test === identifier;
  }
  if (parent.type === "ForOfStatement") {
    return parent.right === identifier;
  }
  if (parent.type === "SpreadElement") {
    return parent.parent.type === "ArrayExpression";
  }
  return parent.type === "ExpressionStatement";
}

/** Prove only a small local read vocabulary, conservatively rejecting unknown escapes.
 * @param variable Lexically resolved parameter or directly assigned local alias.
 * @param source ESLint source code and scope information.
 * @param seen Cycle guard shared with the receiver's inline callback aliases.
 * @param initialWrite Optional alias declaration; its initializing write is expected.
 * @returns Whether every value reference belongs to the supported read-only subset.
 */
function variableReadsOnly(variable, source, seen, initialWrite = null) {
  if (seen.has(variable)) {
    return true;
  }
  seen.add(variable);
  for (const reference of variable.references) {
    if (reference.isValueReference === false) {
      continue;
    }
    if (reference.identifier === initialWrite) {
      continue;
    }
    if (reference.isWrite() || !referenceReadsOnly(reference.identifier, source, seen)) {
      return false;
    }
  }
  return true;
}

/** Walk children using parser visitor keys, avoiding parent cycles and type-program work.
 * @param root AST subtree whose member writes will be inspected.
 * @param source ESLint source code providing the parser's child keys.
 * @param visit Consumer called once for each syntax node in the subtree.
 */
function walk(root, source, visit) {
  visit(root);
  for (const key of source.visitorKeys[root.type] ?? []) {
    const children = root[key];
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child?.type) {
          walk(child, source, visit);
        }
      }
    } else if (children?.type) {
      walk(children, source, visit);
    }
  }
}

/** Determine whether a direct write belongs to this instance's own constructor body.
 * @param member Field access being assigned, updated or deleted.
 * @param field Field declaration whose readonly legality is being considered.
 * @returns Whether it is a direct nonstatic constructor assignment to this.field.
 */
function constructorAssignment(member, field) {
  if (
    field.static ||
    member.object.type !== "ThisExpression" ||
    member.parent.type !== "AssignmentExpression"
  ) {
    return false;
  }
  let ancestor = member.parent;
  while (
    ancestor &&
    !["FunctionExpression", "ArrowFunctionExpression", "FunctionDeclaration"].includes(
      ancestor.type,
    )
  ) {
    ancestor = ancestor.parent;
  }
  return ancestor?.parent?.type === "MethodDefinition" && ancestor.parent.kind === "constructor";
}

/** Gather class-local evidence without claiming that public objects are globally immutable.
 * @param field Private field declaration, possibly initialized in its constructor.
 * @param body Enclosing class body whose lexical member writes are inspected.
 * @param source ESLint source code providing parser child keys.
 * @returns Whether every recognized assignment is a legal constructor initialization.
 */
function privateFieldCanBeReadonly(field, body, source) {
  const name = field.key.name ?? String(field.key.value);
  let safe = true;
  /** Reject writes to the same member key, including aliases of this and other instances.
   * @param node Current syntax node within the containing class.
   */
  function inspect(node) {
    if (!safe || node.type !== "MemberExpression" || !writeTarget(node)) {
      return;
    }
    const key = memberName(node);
    if (key === null || key === name) {
      if (key === null || !constructorAssignment(node, field)) {
        safe = false;
      }
    }
  }
  walk(body, source, inspect);
  return safe;
}

/** Warn at mutable API boundaries using local evidence or an explicitly named convention. */
const preferReadonlyBoundaries = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Prefer readonly array inputs when supported by local reads, and review mutable property declarations.",
    },
    schema: [],
    messages: {
      arrayParameter:
        "Array parameter '{{name}}' has only supported local reads. Prefer readonly array/tuple input; review the declaration and its callers before changing it.",
      contractProperty:
        "Prefer readonly for this type/interface property by convention. This is an API design review, not proof that callers never write it.",
      privateField:
        "Private field '{{name}}' has no recognized writes outside direct constructor initialization. Consider readonly; this check is class-local.",
      publicField:
        "Review whether public/protected field '{{name}}' should be readonly. This rule does not analyze writes by external callers.",
    },
  },
  /** Register syntax-only checks without allocating a TypeScript program or supplying fixes.
   * @param context ESLint context supplying source and diagnostic reporting.
   * @returns Listeners for implemented functions and property declarations.
   */
  create(context) {
    const source = context.sourceCode;
    /** Inspect parameters only when a real implementation body and direct array type exist.
     * @param node Function implementation whose complete lexical references are available.
     */
    function inspectFunction(node) {
      if (!node.body) {
        return;
      }
      for (const parameter of node.params) {
        const identifier = parameterIdentifier(parameter);
        if (!identifier || !mutableArray(parameter.typeAnnotation ?? identifier.typeAnnotation)) {
          continue;
        }
        const variable = bindingVariable(source, identifier);
        if (variable && variableReadsOnly(variable, source, new Set(), identifier)) {
          context.report({
            node: identifier,
            messageId: "arrayParameter",
            data: { name: identifier.name },
          });
        }
      }
    }
    /** Flag mutable contract declarations as conventions, never as body-based proof.
     * @param node Interface/type property or index signature to review.
     */
    function inspectContractProperty(node) {
      if (!node.readonly) {
        context.report({ node: node.key ?? node, messageId: "contractProperty" });
      }
    }
    /** Inspect only declared fields, excluding accessors and unresolved computed keys.
     * @param node Class body containing field declarations and their lexical writers.
     */
    function inspectClass(node) {
      for (const field of node.body) {
        if (
          !["PropertyDefinition", "TSAbstractPropertyDefinition"].includes(field.type) ||
          field.readonly ||
          field.computed ||
          field.declare
        ) {
          continue;
        }
        const isPrivate =
          field.accessibility === "private" || field.key.type === "PrivateIdentifier";
        if (isPrivate && !privateFieldCanBeReadonly(field, node, source)) {
          continue;
        }
        context.report({
          node: field.key,
          messageId: isPrivate ? "privateField" : "publicField",
          data: { name: field.key.name ?? String(field.key.value) },
        });
      }
    }
    return {
      FunctionDeclaration: inspectFunction,
      FunctionExpression: inspectFunction,
      ArrowFunctionExpression: inspectFunction,
      TSPropertySignature: inspectContractProperty,
      TSIndexSignature: inspectContractProperty,
      "ClassBody:exit": inspectClass,
    };
  },
};

export default preferReadonlyBoundaries;
