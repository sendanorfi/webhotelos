import js from "@eslint/js";
import globals from "globals";
import hooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import noUndefinedValues from "./tools/no-undefined-values.mjs";
import preferAsyncAwait from "./tools/prefer-async-await.mjs";
import promiseAllReason, { requireLocalDisableReason } from "./tools/promise-all-reason.mjs";
import preferReadonlyBoundaries from "./tools/prefer-readonly-boundaries.mjs";
import namedParameterContracts from "./tools/named-parameter-contracts.mjs";
import noUnknownAny from "./tools/no-unknown-any.mjs";
import noBroadOutputTypes from "./tools/no-broad-output-types.mjs";
import requireInlineJsdoc from "./tools/require-inline-jsdoc.mjs";
import requireEscapingThrowJsdoc from "./tools/require-escaping-throw-jsdoc.mjs";
import { readableFunctionSize, readableFileSize } from "./tools/readable-size.mjs";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: {
      hooks,
      webhotelos: { rules: { "no-undefined-values": noUndefinedValues } },
      sendanor: {
        rules: {
          "prefer-async-await": preferAsyncAwait,
          "promise-all-reason": promiseAllReason,
          "require-local-disable-reason": requireLocalDisableReason,
          "prefer-readonly-boundaries": preferReadonlyBoundaries,
          "named-parameter-contracts": namedParameterContracts,
          "no-unknown-any": noUnknownAny,
          "no-broad-output-types": noBroadOutputTypes,
          "require-inline-jsdoc": requireInlineJsdoc,
          "require-escaping-throw-jsdoc": requireEscapingThrowJsdoc,
          "readable-function-size": readableFunctionSize,
          "readable-file-size": readableFileSize,
        },
      },
    },
    rules: {
      "no-undef": "off",
      "webhotelos/no-undefined-values": "error",
      "sendanor/promise-all-reason": "error",
      "sendanor/prefer-async-await": "error",
      "sendanor/readable-file-size": [
        "error",
        { max: 500, skipComments: true, skipBlankLines: true },
      ],
      "sendanor/require-local-disable-reason": "error",
      "sendanor/named-parameter-contracts": "error",
      "sendanor/prefer-readonly-boundaries": "error",
      "sendanor/no-broad-output-types": "error",
      "hooks/rules-of-hooks": "error",
      "hooks/exhaustive-deps": "warn",
      "no-alert": "error",
      "no-dupe-keys": "error",
      curly: ["error", "all"],
    },
  },
  {
    files: ["*.mjs", "*.ts", "tools/**/*.mjs"],
    languageOptions: { globals: globals.node },
    rules: { "no-alert": "error", "no-dupe-keys": "error", curly: ["error", "all"] },
  },
);
