import { RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import rule from "./no-undefined-values.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
    globals: { window: "readonly" },
  },
});
const missing = (name) => ({ messageId: "missingBinding", data: { name } });
tester.run("no-undefined-values", rule, {
  valid: [
    "type Item = External.Item; function value(input: Item) { return input; }",
    "function view(value: string) { return <div>{value}</div>; }",
    "typeof optionalFeature === 'undefined'; window.location;",
    "import { format } from './format'; format();",
  ],
  invalid: [
    { code: "missing();", errors: [missing("missing")] },
    { code: "const output = <Unknown />;", errors: [missing("Unknown")] },
    { code: "typeof missing.property;", errors: [missing("missing")] },
  ],
});
