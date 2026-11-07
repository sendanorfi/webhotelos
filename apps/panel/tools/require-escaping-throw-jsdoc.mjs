// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import ts from "typescript";
import {
  functionOwner,
  documentationAnchors,
  inlineDocumentation,
  describes,
} from "./inline-jsdoc-helpers.mjs";

/** Only executable function bodies own explicit escaping throws; nested callbacks have their own scope. */
const functionKinds = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

/** Find the nearest callable without attributing a nested callback's throw to its enclosing caller.
 * @param node - Explicit ThrowStatement whose lexical function boundary is needed.
 * @returns The executable callable, or null for a module-level throw outside this rule's scope.
 */
function enclosingFunction(node) {
  let current = node.parent;
  while (current && !functionKinds.has(current.type)) {
    current = current.parent;
  }
  return current ?? null;
}

/** Recognize a small proof that a finally body replaces the pending completion on every branch.
 * Loops, switches and labeled blocks are intentionally not guessed: their control-flow targets
 * need more than this local syntactic check. A conditional override must cover both branches.
 * @param node - Finally statement or nested block whose guaranteed abrupt completion is inspected.
 * @returns Whether a direct return/throw/break/continue is certain before this block falls through.
 */
function definitelyAbrupt(node) {
  if (!node) {
    return false;
  }
  if (
    ["ReturnStatement", "ThrowStatement", "BreakStatement", "ContinueStatement"].includes(node.type)
  ) {
    return true;
  }
  if (node.type === "BlockStatement") {
    for (const statement of node.body) {
      if (definitelyAbrupt(statement)) {
        return true;
      }
    }
  }
  if (node.type === "IfStatement") {
    return definitelyAbrupt(node.consequent) && definitelyAbrupt(node.alternate);
  }
  if (node.type === "TryStatement") {
    if (definitelyAbrupt(node.finalizer)) {
      return true;
    }
    return definitelyAbrupt(node.block) && (!node.handler || definitelyAbrupt(node.handler.body));
  }
  return false;
}

/** Check only lexical handlers in this function, including a provably replacing finally completion.
 * A throw in catch/finally is not caught by that same try's handler. Outer local handlers can
 * still catch it; a handler outside a nested callback never documents that callback's contract.
 * @param node - Explicit throw whose escape is being checked.
 * @param fn - Nearest executable callable, where this local analysis must stop.
 * @returns Whether the throw can reach the caller under this deliberately bounded structural model.
 */
function escapesFunction(node, fn) {
  let child = node;
  for (let parent = node.parent; parent && parent !== fn; child = parent, parent = parent.parent) {
    if (parent.type !== "TryStatement") {
      continue;
    }
    if (child !== parent.finalizer && definitelyAbrupt(parent.finalizer)) {
      return false;
    }
    if (child === parent.block && parent.handler) {
      return false;
    }
  }
  return true;
}

/**
 * Find broad keywords in an exception type without matching module-name strings.
 * @param type Source spelling of the parsed JSDoc exception type.
 * @returns Whether the type declares any or unknown rather than a concrete failure.
 */
function isBroadExceptionType(type) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, type);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.UnknownKeyword || token === ts.SyntaxKind.AnyKeyword) {
      return true;
    }
  }
  return false;
}

/** Warn about structurally missing exception contracts, without claiming transitive exception inference. */
const requireEscapingThrowJsdoc = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Document explicit escaping throws with typed descriptive JSDoc; injected-port failures still require review.",
    },
    schema: [],
    messages: {
      broadThrows:
        "Document a concrete thrown error type. External input guards may accept unknown, but @throws must describe the real typed failure boundary; do not suppress this requirement.",
      missingThrows:
        "Document this function's explicit escaping throw with @throws {Type} and its condition; async functions reject their Promise.",
      invalidThrows:
        "An @throws/@exception tag needs a nonempty {Type} and a description of when it escapes or rejects the Promise; the type name alone is insufficient.",
    },
  },
  /** Share comment attachment and tag parsing with the inline-JSDoc rule; no type program or I/O is used.
   * @param context - ESLint context for one source file and its syntax-only diagnostics.
   * @returns Visitors recording callable-local throws, followed by one documentation check per callable.
   */
  create(context) {
    const sourceCode = context.sourceCode;
    const functions = [],
      escaping = new WeakSet();
    return {
      /** Record every implementation separately so callbacks never borrow an outer function's tags.
       * @param node - Executable function whose immediately attached JSDoc owns this contract.
       */
      "FunctionDeclaration, FunctionExpression, ArrowFunctionExpression"(node) {
        functions.push(node);
      },
      /** Ignore only throws proven locally caught or replaced; calls and implicit language errors need review.
       * @param node - Explicit ThrowStatement emitted by the parser.
       */
      ThrowStatement(node) {
        const fn = enclosingFunction(node);
        if (fn && escapesFunction(node, fn)) {
          escaping.add(fn);
        }
      },
      /** Check one callable after all its own throws have been visited, avoiding one warning per throw.
       * Missing whole-function JSDoc belongs to the companion rule and is not reported twice here.
       */
      "Program:exit"() {
        for (const fn of functions) {
          const owner = functionOwner(fn) ?? fn;
          const doc = inlineDocumentation(sourceCode, documentationAnchors(owner));
          if (!doc) {
            continue;
          }
          if (doc.exceptions.length) {
            for (const tag of doc.exceptions) {
              if (!tag.type || !describes(tag.description, tag.type)) {
                context.report({ node: fn, messageId: "invalidThrows" });
                break;
              }
              if (isBroadExceptionType(tag.type)) {
                context.report({ node: fn, messageId: "broadThrows" });
                break;
              }
            }
          } else if (escaping.has(fn)) {
            context.report({ node: fn, messageId: "missingThrows" });
          }
        }
      },
    };
  },
};

export default requireEscapingThrowJsdoc;
