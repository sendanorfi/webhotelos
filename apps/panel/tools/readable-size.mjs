// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import { builtinRules } from "eslint/use-at-your-own-risk";

const functionSize = builtinRules.get("max-lines-per-function");
const fileSize = builtinRules.get("max-lines");

/** Preserve ESLint's function/method/arrow/IIFE counting and options. Only the
 * diagnostic changes: a large body needs a semantic decomposition review,
 * rather than a mechanical extraction or a blanket increase of the limit. */
export const readableFunctionSize = {
  ...functionSize,
  meta: {
    ...functionSize.meta,
    docs: {
      ...functionSize.meta.docs,
      description:
        "Warn when a function needs decomposition into cohesive, independent responsibilities",
    },
    messages: {
      ...functionSize.meta.messages,
      exceed:
        "{{name}} spans {{lineCount}} code lines (review limit {{maxLines}}). Split it into cohesive, independent, easily understood functions with one clear responsibility. Keep an exception only with a concrete local reason.",
    },
  },
};

/** Preserve ESLint's native file/comment/blank-line accounting. The warning
 * asks for understandable module boundaries, without prescribing a framework
 * or automatically moving declarations across security or ownership seams. */
export const readableFileSize = {
  ...fileSize,
  meta: {
    ...fileSize.meta,
    docs: {
      ...fileSize.meta.docs,
      description: "Warn when a source file needs cohesive, independent module boundaries",
    },
    messages: {
      ...fileSize.meta.messages,
      exceed:
        "File spans {{actual}} code lines (review limit {{max}}). Split it into cohesive, independent modules whose responsibilities are easy to understand. Keep an exception only with a concrete local reason.",
    },
  },
};
