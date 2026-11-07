// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import ts from "typescript";

const outputSignatures = new Set([
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.FunctionExpression,
  ts.SyntaxKind.ArrowFunction,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.MethodSignature,
  ts.SyntaxKind.FunctionType,
  ts.SyntaxKind.ConstructorType,
  ts.SyntaxKind.CallSignature,
  ts.SyntaxKind.ConstructSignature,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.IndexSignature,
]);

/** Select TypeScript's lexical mode without consulting project configuration or imports.
 * @param filename - Linted source path used to select the parser's JavaScript or TypeScript mode.
 * @returns The TypeScript script kind matching the explicit source extension.
 */
function scriptKind(filename) {
  if (/\.(?:js|mjs|cjs)$/u.test(filename)) {
    return ts.ScriptKind.JS;
  }
  if (/\.jsx$/u.test(filename)) {
    return ts.ScriptKind.JSX;
  }
  if (/\.tsx$/u.test(filename)) {
    return ts.ScriptKind.TSX;
  }
  return ts.ScriptKind.TS;
}

/** Collect top-level same-file aliases and interfaces for deterministic local expansion.
 * @param sourceFile - Syntax tree for the one file being linted.
 * @returns Top-level declarations; nested scopes, imports and cross-file symbols stay unresolved.
 */
function localTypeDeclarations(sourceFile) {
  const declarations = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      declarations.set(statement.name.text, statement);
    }
    for (const doc of statement.jsDoc ?? []) {
      for (const tag of doc.tags ?? []) {
        if (ts.isJSDocTypedefTag(tag) && ts.isIdentifier(tag.name) && tag.typeExpression?.type) {
          declarations.set(tag.name.text, tag);
        }
      }
    }
  }
  return declarations;
}

/** Return the syntax node that carries one local alias's type contract.
 * @param declaration - Top-level type alias, interface, or JSDoc typedef.
 * @returns The alias body, or the interface declaration whose members form that body.
 */
function declaredType(declaration) {
  if (ts.isTypeAliasDeclaration(declaration)) {
    return declaration.type;
  }
  if (ts.isJSDocTypedefTag(declaration)) {
    return declaration.typeExpression?.type;
  }
  return declaration;
}

/** Detect a generic argument that names the caller's own type parameter.
 * @param argument - Type argument supplied to a local alias.
 * @param parameter - Alias parameter receiving the argument.
 * @param substitutions - Existing alias bindings from outer expansions.
 * @param shadowed - Type parameters owned by the enclosing callable or alias.
 * @returns Whether adding this binding would substitute a parameter with itself.
 */
function isSelfBoundGeneric(argument, parameter, substitutions, shadowed) {
  return (
    ts.isTypeReferenceNode(argument) &&
    ts.isIdentifier(argument.typeName) &&
    argument.typeName.text === parameter.name.text &&
    shadowed.has(parameter.name.text) &&
    !substitutions.has(parameter.name.text)
  );
}

/** Bind one local alias's supplied arguments while preserving generic name scope.
 * @param reference - Type reference that names the local alias.
 * @param declaration - Local alias or interface declaration being expanded.
 * @param substitutions - Existing alias bindings from outer expansions.
 * @param shadowed - Generic parameters that take precedence over local aliases.
 * @returns New substitution and shadowing maps for the alias body.
 */
function bindAliasParameters(reference, declaration, substitutions, shadowed) {
  const nextSubstitutions = new Map(substitutions),
    nextShadowed = new Set(shadowed);
  for (const [index, parameter] of (declaration.typeParameters ?? []).entries()) {
    const name = parameter.name.text;
    nextShadowed.add(name);
    let argument = reference.typeArguments?.[index] ?? parameter.default;
    if (
      argument &&
      ts.isTypeReferenceNode(argument) &&
      ts.isIdentifier(argument.typeName) &&
      substitutions.has(argument.typeName.text)
    ) {
      argument = substitutions.get(argument.typeName.text);
    }
    if (argument && !isSelfBoundGeneric(argument, parameter, substitutions, shadowed)) {
      nextSubstitutions.set(name, argument);
    }
  }
  return { substitutions: nextSubstitutions, shadowed: nextShadowed };
}

/** Resolve one type reference to a substitution, local alias, or cycle boundary.
 * @param reference - Type reference to resolve.
 * @param declarations - Same-file aliases and interfaces.
 * @param substitutions - Generic type parameter bindings from enclosing aliases.
 * @param active - Alias declarations already expanded along this path.
 * @param shadowed - Generic parameters that take precedence over local aliases.
 * @param activeSubstitutions - Parameter replacement nodes already expanded along this path.
 * @returns The next type-expansion state, a stop marker for a repeated binding, or `null` to inspect syntax children.
 */
function resolveTypeReference(
  reference,
  declarations,
  substitutions,
  active,
  shadowed,
  activeSubstitutions,
) {
  if (!ts.isTypeReferenceNode(reference) || !ts.isIdentifier(reference.typeName)) {
    return null;
  }
  const name = reference.typeName.text;
  if (substitutions.has(name)) {
    const replacement = substitutions.get(name),
      resolving = activeSubstitutions.get(name);
    if (resolving?.has(replacement)) {
      return { kind: "stop" };
    }
    const nextActiveSubstitutions = new Map(activeSubstitutions),
      nextResolving = new Set(resolving);
    nextResolving.add(replacement);
    nextActiveSubstitutions.set(name, nextResolving);
    return {
      kind: "expand",
      node: replacement,
      substitutions,
      active,
      shadowed,
      activeSubstitutions: nextActiveSubstitutions,
    };
  }
  if (shadowed.has(name)) {
    return { kind: "stop" };
  }
  const declaration = declarations.get(name);
  if (!declaration || active.has(declaration)) {
    return null;
  }
  const bindings = bindAliasParameters(reference, declaration, substitutions, shadowed),
    nextActive = new Set(active);
  nextActive.add(declaration);
  return {
    kind: "expand",
    node: declaredType(declaration),
    substitutions: bindings.substitutions,
    active: nextActive,
    shadowed: bindings.shadowed,
    activeSubstitutions,
  };
}

/** Visit a callable's returned type shape with local alias and cycle context.
 * Function parameter types are excluded because they describe accepted values. Imported symbols
 * and inferred return values need a TypeScript program and remain outside this syntax-only rule.
 * @param node - Type node in the returned value shape.
 * @param declarations - Top-level same-file aliases, interfaces, and JSDoc typedefs.
 * @param substitutions - Generic type parameter bindings from local aliases.
 * @param active - Alias declarations currently expanded on this path.
 * @param shadowed - Generic parameters that take precedence over same-named local aliases.
 * @param activeSubstitutions - Type parameter replacement nodes currently expanded on this path.
 * @returns Whether this return contract contains a bare any or unknown type.
 */
function hasBroadOutput(
  node,
  declarations,
  substitutions = new Map(),
  active = new Set(),
  shadowed = new Set(),
  activeSubstitutions = new Map(),
) {
  if (!node || ts.isTypePredicateNode(node)) {
    return false;
  }
  if (node.kind === ts.SyntaxKind.AnyKeyword || node.kind === ts.SyntaxKind.UnknownKeyword) {
    return true;
  }
  const reference = resolveTypeReference(
    node,
    declarations,
    substitutions,
    active,
    shadowed,
    activeSubstitutions,
  );
  if (reference?.kind === "stop") {
    return false;
  }
  if (reference?.kind === "expand") {
    return hasBroadOutput(
      reference.node,
      declarations,
      reference.substitutions,
      reference.active,
      reference.shadowed,
      reference.activeSubstitutions,
    );
  }
  if (
    ts.isFunctionTypeNode(node) ||
    ts.isConstructorTypeNode(node) ||
    ts.isCallSignatureDeclaration(node) ||
    ts.isConstructSignatureDeclaration(node) ||
    ts.isMethodSignature(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isGetAccessor(node) ||
    ts.isIndexSignatureDeclaration(node)
  ) {
    const nextShadowed = new Set(shadowed);
    for (const parameter of node.typeParameters ?? []) {
      nextShadowed.add(parameter.name.text);
    }
    return hasBroadOutput(
      node.type,
      declarations,
      substitutions,
      active,
      nextShadowed,
      activeSubstitutions,
    );
  }
  if (ts.isTypeParameterDeclaration(node)) {
    return false;
  }
  return ts.forEachChild(
    node,
    /** Visit one syntax child with unchanged alias/scope context.
     * @param child - Child node in the type's syntax tree.
     * @returns Whether this child's returned shape contains a broad type.
     */
    (child) =>
      hasBroadOutput(child, declarations, substitutions, active, shadowed, activeSubstitutions),
  );
}

/** Warn when a declared callable result exposes broad data, including local aliases and JSDoc.
 * This syntax-only rule does not infer return types or resolve imported declarations.
 */
const noBroadOutputTypes = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Reject any or unknown in explicit callable outputs and same-file aliased return contracts.",
    },
    schema: [],
    messages: {
      broadOutput:
        "Validate external data before returning it; callable outputs cannot be any or unknown.",
    },
  },
  /** Parse the file once and inspect explicit callable return positions and local type aliases.
   * @param context - ESLint source and diagnostic services for this file.
   * @returns A program-exit visitor for the deterministic same-file syntax analysis.
   */
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      /** Report each explicit callable output whose local shape contains a broad type.
       * @returns Nothing; imports and inferred return types are not resolved by this rule.
       */
      "Program:exit"() {
        const sourceFile = ts.createSourceFile(
            context.filename,
            sourceCode.text,
            ts.ScriptTarget.Latest,
            true,
            scriptKind(context.filename),
          ),
          declarations = localTypeDeclarations(sourceFile);
        /** Inspect explicit callable return annotations, then descend into nested signatures.
         * @param node - Current node in the TypeScript source tree.
         * @returns Nothing; broad return contracts are reported at their type annotation.
         */
        function visit(node) {
          if (outputSignatures.has(node.kind) && node.type) {
            const start = sourceCode.getLocFromIndex(node.type.getStart(sourceFile)),
              end = sourceCode.getLocFromIndex(node.type.end);
            const shadowed = new Set(
              (node.typeParameters ?? []).map(
                /** Preserve generic parameter shadowing when local aliases share its name.
                 * @param parameter - Type parameter owned by this callable signature.
                 * @returns Its identifier used by return-type alias expansion.
                 */
                (parameter) => parameter.name.text,
              ),
            );
            if (hasBroadOutput(node.type, declarations, new Map(), new Set(), shadowed)) {
              context.report({ loc: { start, end }, messageId: "broadOutput" });
            }
          }
          for (const doc of node.jsDoc ?? []) {
            for (const tag of doc.tags ?? []) {
              const type = ts.isJSDocReturnTag(tag) ? tag.typeExpression?.type : undefined;
              if (type && hasBroadOutput(type, declarations)) {
                context.report({
                  loc: {
                    start: sourceCode.getLocFromIndex(type.getStart(sourceFile)),
                    end: sourceCode.getLocFromIndex(type.end),
                  },
                  messageId: "broadOutput",
                });
              }
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(sourceFile);
      },
    };
  },
};

export default noBroadOutputTypes;
