// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import ts from "typescript";

/** Select TypeScript's lexical mode from the file extension without inspecting source text.
 * @param filename - Linted source filename used only to select JavaScript or TypeScript syntax.
 * @returns The corresponding TypeScript compiler script kind.
 */
function scriptKind(filename) {
  if (/\.(?:jsx)$/u.test(filename)) {
    return ts.ScriptKind.JSX;
  }
  if (/\.(?:js|mjs|cjs)$/u.test(filename)) {
    return ts.ScriptKind.JS;
  }
  if (/\.tsx$/u.test(filename)) {
    return ts.ScriptKind.TSX;
  }
  return ts.ScriptKind.TS;
}

/** Visit only compiler-parsed JSDoc type nodes, leaving prose and examples untouched.
 * @param typeNode - Parsed type expression belonging to one JSDoc tag.
 * @param visit - Visitor receiving each nested compiler type node once.
 * @returns Nothing; the caller owns warning reporting and source locations.
 */
function visitJSDocType(typeNode, visit) {
  if (!typeNode) {
    return;
  }
  visit(typeNode);
  ts.forEachChild(
    typeNode,
    /** Visit one nested JSDoc type node without descending into comments or examples.
     * @param child - Compiler child belonging to the parsed type expression.
     * @returns Nothing; nested type nodes are reported through the supplied visitor.
     */
    (child) => visitJSDocType(child, visit),
  );
}

/** Find every parsed tag type and its declaration owner in one compiler source tree.
 * @param sourceFile - TypeScript's syntax-only AST for the current linted file.
 * @param visit - Callback for a JSDoc type node and its declaring owner.
 * @returns Nothing; no checker, module resolution, or project program is created.
 */
function visitJSDocTypes(sourceFile, visit) {
  /** Inspect one syntax node's attached tags, then continue through its parsed children.
   * @param node - Declaration or syntax node in the compiler source tree.
   * @returns Nothing; the supplied callback receives recognized JSDoc type nodes.
   */
  function visitDeclaration(node) {
    for (const documentation of node.jsDoc ?? []) {
      for (const tag of documentation.tags ?? []) {
        const owner = documentation.parent ?? node;
        if (tag.typeExpression?.type) {
          visitJSDocType(
            tag.typeExpression.type,
            /** Associate each parsed type node with the declaration owning its JSDoc tag.
             * @param typeNode - Nested compiler type in this tag's type expression.
             * @returns The visitor result for this type node and its declaration owner.
             */
            (typeNode) => visit(typeNode, owner),
          );
        }
        if (tag.constraint) {
          visitJSDocType(
            tag.constraint,
            /** Associate each template constraint with the declaration owning its JSDoc.
             * @param typeNode - Nested compiler type in this template constraint.
             * @returns The visitor result for this type node and its declaration owner.
             */
            (typeNode) => visit(typeNode, owner),
          );
        }
      }
    }
    ts.forEachChild(node, visitDeclaration);
  }
  visitDeclaration(sourceFile);
}

/** Report explicit `any` and `unknown` type declarations for review at their source location. */
const noUnknownAny = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Warn on explicit any or unknown types in TypeScript syntax and parsed JSDoc contracts.",
    },
    schema: [],
    messages: {
      broadType:
        "Avoid explicit '{{keyword}}'. Use a concrete contract; for external untrusted data, name its source and narrow it with a type guard.",
    },
  },
  /** Inspect type syntax and compiler-parsed JSDoc without resolving imports or project types.
   * @param context - ESLint source and diagnostic services for one file.
   * @returns Visitors for TypeScript type keywords and declaration-owned JSDoc types.
   */
  create(context) {
    const sourceCode = context.sourceCode;

    /** Emit the same warning shape for code types and JSDoc types.
     * @param node - TypeScript compiler type node carrying an explicit any or unknown keyword.
     * @param owner - Optional declaration owning a JSDoc comment that contains the type.
     * @param sourceFile - Compiler source tree used to map node offsets to ESLint locations.
     * @returns Nothing; the warning intentionally offers no automatic fix.
     */
    function reportType(node, owner, sourceFile) {
      const keyword = node.kind === ts.SyntaxKind.AnyKeyword ? "any" : "unknown";
      const target = owner ?? node;
      const startIndex = target.getStart(sourceFile);
      const start = sourceCode.getLocFromIndex(startIndex);
      const endIndex = owner ? startIndex + 1 : node.end;
      const end = sourceCode.getLocFromIndex(endIndex);
      context.report({ loc: { start, end }, messageId: "broadType", data: { keyword } });
    }

    return {
      /** Inspect compiler-parsed JSDoc tag types so contracts in JavaScript are covered too.
       * @returns Nothing; JSDoc diagnostics point to the declaration line that owns each tag.
       */
      "Program:exit"() {
        const sourceFile = ts.createSourceFile(
          context.filename,
          sourceCode.text,
          ts.ScriptTarget.Latest,
          true,
          scriptKind(context.filename),
        );
        const jsDocOwners = new WeakMap();
        const jsDocTypes = [];
        visitJSDocTypes(
          sourceFile,
          /** Retain each parsed JSDoc type's declaration owner for source-location reporting.
           * @param typeNode - Parsed type node from a documented tag.
           * @param owner - Declaration whose source line receives the warning.
           * @returns Nothing; duplicate nodes retain their first owning declaration.
           */
          (typeNode, owner) => {
            if (!jsDocOwners.has(typeNode)) {
              jsDocOwners.set(typeNode, owner);
              jsDocTypes.push(typeNode);
            }
          },
        );
        const reported = new WeakSet();
        /** Walk executable TypeScript syntax once, mapping parsed JSDoc types to their owners.
         * @param current - Compiler node in the current file's syntax tree.
         * @returns Nothing; matching any/unknown keywords are reported without inference.
         */
        function visitSyntax(current) {
          if (
            current.kind === ts.SyntaxKind.AnyKeyword ||
            current.kind === ts.SyntaxKind.UnknownKeyword
          ) {
            reportType(current, jsDocOwners.get(current), sourceFile);
            reported.add(current);
          }
          ts.forEachChild(current, visitSyntax);
        }
        visitSyntax(sourceFile);
        for (const typeNode of jsDocTypes) {
          if (
            !reported.has(typeNode) &&
            (typeNode.kind === ts.SyntaxKind.AnyKeyword ||
              typeNode.kind === ts.SyntaxKind.UnknownKeyword)
          ) {
            reportType(typeNode, jsDocOwners.get(typeNode), sourceFile);
          }
        }
      },
    };
  },
};

export default noUnknownAny;
