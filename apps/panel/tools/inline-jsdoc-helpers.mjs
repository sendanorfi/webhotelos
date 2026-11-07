// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
/** Wrappers that preserve the callable identified by an enclosing declaration. */
const expressionWrappers = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TSNonNullExpression",
  "ChainExpression",
  "ParenthesizedExpression",
  "TSParenthesizedType",
  "TSTypeAnnotation",
]);

/** Recognize a type union that adds only nullish states to one callable branch.
 * A single callback can then share its variable, alias or property documentation; unions with
 * another value or callable remain independent callable contracts.
 * @param union - TypeScript union surrounding the currently visited callable type.
 * @param callableBranch - Exact non-nullish member reached through transparent wrappers.
 * @returns Whether the union contains only this callable branch and nullish alternatives.
 */
function isNullableCallableUnion(union, callableBranch) {
  if (union.type !== "TSUnionType") {
    return false;
  }
  let nonNullishBranch;
  for (const member of union.types) {
    if (member.type === "TSNullKeyword" || member.type === "TSUndefinedKeyword") {
      continue;
    }
    if (nonNullishBranch) {
      return false;
    }
    nonNullishBranch = member;
  }
  return nonNullishBranch === callableBranch;
}

/** Find the declaration readers see, including named callable types and React wrappers.
 * @param node - Callable expression or signature whose documentation owner is needed.
 */
export function functionOwner(node) {
  let value = node;
  while (true) {
    if (expressionWrappers.has(value.parent?.type)) {
      value = value.parent;
      continue;
    }
    const nullableUnion = value.parent;
    if (nullableUnion?.type === "TSUnionType" && isNullableCallableUnion(nullableUnion, value)) {
      value = nullableUnion;
      continue;
    }
    const call = value.parent;
    if (call?.type === "CallExpression" && call.arguments[0] === value) {
      let name = null;
      if (call.callee.type === "Identifier") {
        name = call.callee.name;
      } else if (
        call.callee.type === "MemberExpression" &&
        !call.callee.computed &&
        call.callee.object.type === "Identifier" &&
        call.callee.object.name === "React"
      ) {
        name = call.callee.property.name;
      }
      if (["memo", "forwardRef", "useCallback"].includes(name)) {
        value = call;
        continue;
      }
    }
    break;
  }
  let parent = value.parent;
  if (
    parent?.type === "Identifier" &&
    parent.typeAnnotation === value &&
    parent.parent?.type === "VariableDeclarator"
  ) {
    value = parent;
    parent = parent.parent;
  }
  if (parent?.type === "VariableDeclarator" && (parent.init === value || parent.id === value)) {
    return parent;
  }
  if (
    [
      "Property",
      "PropertyDefinition",
      "AccessorProperty",
      "MethodDefinition",
      "TSAbstractPropertyDefinition",
      "TSAbstractMethodDefinition",
    ].includes(parent?.type) &&
    parent.value === value
  ) {
    return parent;
  }
  if (
    ["TSTypeAliasDeclaration", "TSPropertySignature"].includes(parent?.type) &&
    parent.typeAnnotation === value
  ) {
    return parent;
  }
  if (parent?.type === "AssignmentExpression" && parent.right === value) {
    return parent;
  }
  if (parent?.type === "ExportDefaultDeclaration") {
    return parent;
  }
  return null;
}

/** Include const/export wrappers while keeping comments attached to a single declaration.
 * @param owner - Declaration that owns the callable or member being documented.
 */
export function documentationAnchors(owner) {
  const anchors = [owner];
  if (
    owner.type === "VariableDeclarator" &&
    owner.parent?.type === "VariableDeclaration" &&
    owner.parent.declarations.length === 1
  ) {
    anchors.push(owner.parent);
  }
  const outer = anchors.at(-1);
  if (["ExportNamedDeclaration", "ExportDefaultDeclaration"].includes(outer.parent?.type)) {
    anchors.push(outer.parent);
  }
  return anchors;
}

/** Read a balanced optional-name/type prefix without confusing nested brackets with its end.
 * @param value - JSDoc fragment beginning with the opening delimiter.
 * @param open - Opening delimiter used by the fragment.
 * @param close - Corresponding closing delimiter.
 */
function balancedPrefix(value, open, close) {
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === open) {
      depth++;
    } else if (value[index] === close && --depth === 0) {
      return { value: value.slice(1, index), rest: value.slice(index + 1).trim() };
    }
  }
  return null;
}

/** Parse a parameter tag without requiring redundant TypeScript type annotations.
 * @param line - One normalized JSDoc line, including its tag marker.
 */
function parameterTag(line) {
  const match = /^@(?:param|arg|argument)\s+(.+)$/u.exec(line);
  if (!match) {
    return null;
  }
  let rest = match[1].trim();
  if (rest.startsWith("{")) {
    const type = balancedPrefix(rest, "{", "}");
    if (!type) {
      return null;
    }
    rest = type.rest;
  }
  let name, description;
  if (rest.startsWith("[")) {
    const optional = balancedPrefix(rest, "[", "]");
    if (!optional) {
      return null;
    }
    name = optional.value.split("=", 1)[0].trim();
    description = optional.rest;
  } else {
    const nameMatch = /^(\S+)(?:\s+([\s\S]*))?$/u.exec(rest);
    if (!nameMatch) {
      return null;
    }
    name = nameMatch[1];
    description = nameMatch[2] ?? "";
  }
  return {
    name: name.replace(/^\.\.\./u, "").replace(/\[(\d+)\]/gu, ".$1"),
    description: description.replace(/^-+\s*/u, "").trim(),
  };
}

/** Parse an exception tag while leaving actual type resolution and business conditions to review.
 * @param line - Normalized JSDoc tag line, including its marker.
 * @returns A type/description pair even for incomplete tags so the caller can report them.
 */
function exceptionTag(line) {
  const match = /^@(?:throws|exception)(?:\s+([\s\S]*))?$/u.exec(line);
  if (!match) {
    return null;
  }
  const rest = (match[1] ?? "").trim();
  const type = rest.startsWith("{") ? balancedPrefix(rest, "{", "}") : null;
  return {
    type: type?.value.trim() ?? "",
    description: (type ? type.rest : rest).replace(/^-+\s*/u, "").trim(),
  };
}

/** Separate purpose, parameter and exception tags without interpreting their semantic completeness.
 * @param comment - ESLint block comment that may contain inline JSDoc.
 * @returns Parsed prose and ordered tags, or null for ordinary block/line comments.
 */
function documentation(comment) {
  if (comment?.type !== "Block" || !comment.value.startsWith("*")) {
    return null;
  }
  const purpose = [],
    parameters = [],
    exceptions = [];
  let inTags = false,
    current = null;
  for (const raw of comment.value.slice(1).split(/\r?\n/u)) {
    const line = raw.replace(/^\s*\*?\s?/u, "").trim();
    if (line.startsWith("@")) {
      inTags = true;
      const parameter = parameterTag(line),
        exception = exceptionTag(line);
      current = parameter ?? exception;
      if (parameter) {
        parameters.push(parameter);
      }
      if (exception) {
        exceptions.push(exception);
      }
    } else if (current && line) {
      current.description = `${current.description} ${line}`.trim();
    } else if (!inTags && line) {
      purpose.push(line);
    }
  }
  return { comment, description: purpose.join(" "), parameters, exceptions };
}

/** Recognize a reasoned, targeted next-line lint directive between a member and its JSDoc.
 * The separate local-disable rule validates the policy and rule names; this only
 * keeps an explicit tooling instruction from taking ownership of the member's prose.
 * @param token Preceding ESLint token or comment, possibly absent at the start of a file.
 * @returns Whether the line comment is an explicit next-line directive with a reason.
 */
function localLintDirective(token) {
  return (
    token?.type === "Line" && /^\s*eslint-disable-next-line\s+\S[^\r\n]*--\s*\S/u.test(token.value)
  );
}

/** Find descriptive JSDoc separated only by whitespace, opening parentheses or local lint directives.
 * Parentheses added by a formatter do not detach a callback's own documentation;
 * other tokens or ordinary line comments still cannot supply its contract.
 * @param sourceCode - ESLint source view used to verify exact comment attachment.
 * @param anchors - Equivalent declaration positions allowed to own the same comment.
 */
export function inlineDocumentation(sourceCode, anchors) {
  for (const anchor of anchors) {
    let preceding = sourceCode.getTokenBefore(anchor, { includeComments: true });
    let formattingLines = 0;
    while (
      (preceding?.type === "Punctuator" && preceding.value === "(") ||
      localLintDirective(preceding)
    ) {
      formattingLines += 1;
      preceding = sourceCode.getTokenBefore(preceding, { includeComments: true });
    }
    const comment = preceding?.type === "Block" ? preceding : undefined;
    const result = documentation(comment);
    if (
      result?.description &&
      anchor.loc.start.line - comment.loc.end.line <= 1 + formattingLines
    ) {
      return result;
    }
  }
  return null;
}

/** Reject empty/type-only descriptions and literal repetitions of the parameter name.
 * @param description - Prose associated with a formal parameter or property.
 * @param name - Declared name used only to detect an exact name echo.
 */
export function describes(description, name) {
  const text = description.replace(/^-+\s*/u, "").trim();
  if (!text || /^\{[\s\S]*\}$/u.test(text)) {
    return false;
  }
  const prose = text.replace(/[^\p{L}\p{N}_$]/gu, "").toLowerCase();
  return (
    prose !== name.replace(/[^\p{L}\p{N}_$]/gu, "").toLowerCase() &&
    prose !==
      name
        .split(".")
        .at(-1)
        .replace(/[^\p{L}\p{N}_$]/gu, "")
        .toLowerCase()
  );
}
