// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import { documentationAnchors, inlineDocumentation, describes } from "./inline-jsdoc-helpers.mjs";

/** Resolve a formal parameter's actual caller-provided binding.
 * @param parameter - Formal parameter node, possibly wrapped by TypeScript or default/rest syntax.
 * @returns The identifier or destructuring pattern that receives the caller's value.
 */
function parameterBinding(parameter) {
  let value = parameter;
  while (["TSParameterProperty", "AssignmentPattern", "RestElement"].includes(value.type)) {
    value = value.parameter ?? value.left ?? value.argument;
  }
  return value;
}

/** Enumerate the explicit object bindings that need parameter prose.
 * @param pattern - Destructuring pattern whose fields are documented.
 * @param prefix - Parent property path, or null when a computed key made the path unknown.
 * @param output - Accumulator preserving source order across nested properties.
 * @returns Property nodes paired with their static dotted path when one exists.
 */
function parameterProperties(pattern, prefix = "", output = []) {
  const value = parameterBinding(pattern);
  if (value.type !== "ObjectPattern") {
    return output;
  }
  for (const property of value.properties) {
    if (property.type === "RestElement") {
      continue;
    }
    let key = null;
    if (property.key.type === "Identifier" && !property.computed) {
      key = property.key.name;
    } else if (property.key.type === "Literal") {
      key = String(property.key.value);
    }
    let path = null;
    if (key !== null && prefix !== null) {
      path = prefix ? `${prefix}.${key}` : key;
    }
    const nested = parameterBinding(property.value);
    if (nested.type === "ObjectPattern" && nested.properties.length) {
      parameterProperties(nested, path, output);
    } else {
      output.push({ path, node: property });
    }
  }
  return output;
}

/** Match a parameter tag with useful prose rather than a name echo.
 * @param tags - Parsed @param entries attached to a callable's documentation.
 * @param name - Formal binding name or dotted property path to find.
 * @returns Whether the matching tag contains a description beyond its name.
 */
function describedTag(tags, name) {
  for (const tag of tags) {
    if (tag.name === name && describes(tag.description, name)) {
      return true;
    }
  }
  return false;
}

/** Create the per-file checker for callable documentation and formal parameter contracts.
 * @param input - ESLint context, source text access, and parameter-description policy.
 * @param input.context - Rule context used to report the same rule diagnostics.
 * @param input.sourceCode - Parsed source access used to find attached inline JSDoc.
 * @param input.requireParameterDescriptions - Whether callable parameters require prose.
 * @returns Stateful owner and callable checkers sharing the same memoized documentation records.
 */
export function createParameterContractChecker({
  context,
  sourceCode,
  requireParameterDescriptions,
}) {
  const checked = new WeakMap();
  const functions = new WeakSet();

  /** Emit one missing-owner diagnostic before considering any parameter diagnostics.
   * @param owner - Declaration to which the inline JSDoc must attach.
   * @param kind - Human-readable declaration category used in diagnostics.
   * @returns Parsed callable documentation, or null when no meaningful comment exists.
   */
  function check(owner, kind) {
    if (checked.has(owner)) {
      return checked.get(owner);
    }
    const result = inlineDocumentation(sourceCode, documentationAnchors(owner));
    checked.set(owner, result);
    if (!result) {
      context.report({ node: owner, messageId: "missing", data: { kind } });
    }
    return result;
  }

  /** Validate inline parameter prose without reusing a function-purpose comment.
   * @param parameter - Parameter/member node that may own an inline comment.
   * @param functionDoc - Function-level documentation excluded as the parameter's own comment.
   * @param name - Parameter label used to reject a literal name echo.
   * @returns Whether this parameter has a distinct meaningful inline comment.
   */
  function inlineParameter(parameter, functionDoc, name) {
    const result = inlineDocumentation(sourceCode, [parameter, parameterBinding(parameter)]);
    return Boolean(
      result && result.comment !== functionDoc.comment && describes(result.description, name),
    );
  }

  /** Check ordinary, default, rest, and destructured parameters for one callable.
   * @param owner - Declaration that owns the function's inline JSDoc.
   * @param fn - Callable ESTree node containing its actual parameter list.
   * @param kind - Diagnostic label for a missing function-level comment.
   */
  function checkFunction(owner, fn, kind = "function") {
    if (functions.has(fn)) {
      return;
    }
    functions.add(fn);
    const doc = check(owner, kind);
    if (!doc || !requireParameterDescriptions) {
      return;
    }
    const parameters = fn.params ?? fn.parameters ?? [];
    const names = new Set();
    const roots = [];
    for (const parameter of parameters) {
      const binding = parameterBinding(parameter);
      if (binding.type === "Identifier") {
        names.add(binding.name);
      }
    }
    for (const tag of doc.parameters) {
      if (!tag.name.includes(".") && !names.has(tag.name)) {
        roots.push(tag);
      }
    }
    let destructured = 0;
    for (const [index, parameter] of parameters.entries()) {
      const binding = parameterBinding(parameter);
      const root = binding.type === "Identifier" ? binding.name : roots[destructured++]?.name;
      const label = root ?? `argument ${index + 1}`;
      if (inlineParameter(parameter, doc, label)) {
        continue;
      }
      if (!root || !describedTag(doc.parameters, root)) {
        context.report({ node: parameter, messageId: "missingParam", data: { name: label } });
        continue;
      }
      for (const property of parameterProperties(binding)) {
        const name = property.path === null ? `${root}.[computed]` : `${root}.${property.path}`;
        if (!inlineParameter(property.node, doc, name) && !describedTag(doc.parameters, name)) {
          context.report({
            node: property.node,
            messageId: "missingParamProperty",
            data: { name },
          });
        }
      }
    }
  }

  return { check, checkFunction };
}
