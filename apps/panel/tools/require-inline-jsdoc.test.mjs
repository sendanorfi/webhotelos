// SPDX-License-Identifier: MIT
// Adapted from Palvelinhuone.fi scripts/eslint, commit 383da88.
import { parser } from "typescript-eslint";
import { RuleTester } from "eslint";
import requireInlineJsdoc from "./require-inline-jsdoc.mjs";

const tester = new RuleTester({
  languageOptions: {
    parser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

/** Build a missing-documentation diagnostic without coupling fixtures to English wording.
 * @param kind - Declaration category expected from the fixture under test.
 */
const missing = (kind) => ({ messageId: "missing", data: { kind } });

/** Identify a missing parameter description independently of translated diagnostic wording.
 * @param name - Formal binding name or named destructuring root expected in the diagnostic.
 */
const missingParam = (name) => ({ messageId: "missingParam", data: { name } });

/** Identify a destructured field whose contract still lacks reader-facing prose.
 * @param name - Dotted path beneath the documented parameter root.
 */
const missingProperty = (name) => ({ messageId: "missingParamProperty", data: { name } });

tester.run("sendanor/require-inline-jsdoc", requireInlineJsdoc, {
  valid: [
    "/** A locally accumulated count, intentionally mutable. */\ninterface Totals { /** Receipt count incremented by the private fold. */\n// eslint-disable-next-line no-unused-vars -- This private counter is incremented for each line.\ncount: number; }",
    "const id = (options.id ?? /** Generate one request identifier only when no injected source is configured. */ (() => crypto.randomUUID()))();",
    "const value = read(/** Return the frozen input without changing it.\n * @param input - Caller-owned value passed by the source.\n */ (((input: string) => input)));",
    "/** Preserve immutable prices while admitting an available time. */ export function admit() {}",
    "/** Read only public tariffs; availability is validated on submit. */\nexport const quote = () => 1;",
    "/** A reusable public tariff reader. */\nexport default function quote() {}",
    "/** Resolve the public page without loading private data. */\nexport default () => null;",
    "const api = { /** Read the retained result without network I/O. */ quote: () => 1 };",
    "const api = { /** Return one retained value. */ read() { return 1; }, /** Cached public value. */ get value() { return 1; } };",
    "/** Frozen commercial values stored with an accepted order. */\ninterface Price { /** Integer cents, never formatted text. */ readonly netCents: number; /** One canonical money conversion. */ format(): string; }",
    "/** Receipt data; it grants no new order authority. */\ntype Receipt = { /** Stable identifier of the accepted request. */ id: string; /** Resolve the owner's current view. */ open: () => void };",
    "/** Keeps the bounded public result private to this form. */\nclass Cache { /** Last validated result, replaced atomically. */ value = null; /** Initial state performs no reads. */ constructor() {} /** Clear only this instance. */ clear() {} }",
    "/** Public adapter that has no implementation in this package. */\ndeclare function read(): void;",
    "/** A caller-provided resolver. */\ntype Resolver = { /** Return an admitted result. */ (): number; /** Enumerate frozen entries.\n * @param name - Frozen entry key selected by the caller.\n */ [name: string]: unknown };",
    "/** Saved request lifecycle. */\nenum State { /** Nothing has been submitted. */ Draft, /** Verification completed. */ Confirmed }",
    "/** Input handed to a reusable component. */\ntype Props = { /** Visible label supplied by Hallinta. */ label: string };\n/** Render supplied content without persistence.\n * @param props - Published content supplied to this component.\n * @param props.label - Visible action text; this component does not choose sales copy.\n */\nconst Card = ({ label }: Props) => <button onClick={/** Leave persistence to the containing form. */ () => {}}>{label}</button>;",
    "const metadata = { title: 'Public title', enabled: true };",
    {
      code: "[1].map(/** Convert the fixture into the result under test.\n * @param value - Numeric fixture value before its expected transformation.\n */ value => value + 1);",
      options: [{ requireCallbacks: true }],
    },
    {
      code: "const data = { /** Stable owner-visible setting. */ enabled: true };",
      options: [{ requireObjectProperties: true }],
    },
    "/** Runtime adapter state. */\nclass Adapter { /** Establish the injected repository without I/O. */ constructor(/** Repository used only by this adapter. */ private repo: object) {} }",
    "/** A callable object created without changing the callback.\n * @param value - Caller-provided number retained without mutation.\n */\nconst handler = ((value: number) => value) satisfies (value: number) => number;",
    "/** Construct an isolated public cache without sharing its state. */\nconst Cache = class {};",
    "/** Runtime entry points for one module. */\nnamespace Adapter { /** Read public metadata only. */ export function read() {} }",
    "/** A named callback still exposes a callable declaration. */\nconst read = function resolve() {};",
    "/** Render supplied content without owning customer state. */\nconst Card = React.memo(React.forwardRef(() => <span />));",
    "/** Apply the accepted choice only on explicit submission. */\nconst save = useCallback(() => 1, []);",
    "const callbacks = { /** Persist only after explicit submission. */ save: /** Implementation shares its property's contract. */ () => 1 };",
    "/** Return the bounded number of requested entries.\n * @param [limit=10] - Maximum entries included in this page, before any later cursor.\n */\nfunction page(limit = 10) { return limit; }",
    "/** Combine already validated fragments without reading external state.\n * @param {...string} parts - Ordered fragments produced by the owning parser.\n */\nfunction combine(...parts: string[]) { return parts.join(','); }",
    "/** Read one frozen recipient without changing its source.\n * @param input - Accepted contact record supplied by the caller.\n * @param input.email - Confirmed address used by the private notification adapter.\n */\nfunction recipient({ email: address }) { return address; }",
    "/** Read one frozen recipient without changing its source.\n * @param input - Accepted contact record supplied by the caller.\n * @param input.contact.email - Confirmed private address inside the saved contact.\n */\nfunction recipient({ contact: { email } }) { return email; }",
    "/** Read the accepted contact without starting a delivery. */\nfunction recipient(/** Frozen address already validated by the owning parser. */ { email }) { return email; }",
    "/** Read the accepted contact without starting a delivery.\n * @param input - Frozen contact provided by the private adapter.\n */\nfunction recipient({ /** Confirmed recipient; never a replacement address. */ email }) { return email; }",
    "/** A public callback contract that performs no reads on its own.\n * @param value - Already validated item selected by the caller.\n */\ntype Handler = (value: string) => void;",
    "/** Public callback contracts supplied by the owning feature. */\ninterface Hooks { /** Notify after acceptance has completed.\n * @param id - Frozen identifier of the accepted request.\n */ accepted(id: string): void; }",
    "/** Holds the injected repository without accessing it during construction. */\nclass Adapter { /** Establish one adapter instance.\n * @param repo - Repository whose public contract supplies later persistence.\n */ constructor(private repo: object) {} }",
    "/** Apply a validated value without mutating the input. */\nconst apply = (/** Already parsed value supplied by the feature owner. */ value: string) => value;",
    "/** A factory contract that defers all work to its instance.\n * @param repo - Injected persistence contract retained by the new instance.\n */\ntype Factory = new (repo: object) => object;",
    "/** Retain this tuple without choosing new values.\n * @param pair - Ordered identifier and revision supplied by the caller.\n */\nconst pair = ([id, revision]) => [id, revision];",
    "/** Publish an accepted value without modifying it. */\nclass Adapter { /** Forward one accepted identifier to the owning feature.\n * @param id - Frozen request identifier validated before this method.\n */ publish(id: string) {} }",
    "/** Hold one caller-controlled value without persistence. */\nclass Adapter { /** Update only this instance's display value.\n * @param value - Already formatted content supplied by the view.\n */ set value(value: string) {} }",
    "/** Retain the caller's chosen page size without external reads. */\nconst page = (/** Entry limit for this returned page only. */ limit = 10) => limit;",
    "/** Callbacks accepted by the feature's public adapter. */\ninterface Hooks { /** Process an already verified value.\n * @param value - Caller-provided text already checked by the owning parser.\n */ handle: (value: string) => void; }",
    "/** Isolate a caller-supplied implementation. */\nabstract class Adapter { /** Process one previously validated value.\n * @param input - Canonical text supplied by the owning parser.\n */ abstract run(input: string): void; }",
    "const api = { /** Return the accepted value without mutation.\n * @param value - Frozen caller input already validated by the owner.\n */ retain(value) { return value; } };",
    "/** Keep cancellation optional while documenting its accepted reason.\n * @param reason - Optional cancellation reason supplied by the owning operation.\n */\nlet onCancel: ((reason: string) => void) | undefined;",
    "/** Optional reporter for a validated public value.\n * @param value - Accepted string value passed to the reporter when present.\n */\ntype OptionalReporter = ((value: string) => void) | null;",
    "/** Props for a view that may notify the parent about a selected key. */\ninterface OptionalCallbackProps { /** Notify the parent when a key is selected.\n * @param key - Selected key from the view's current public list.\n */ onSelect?: (key: string) => void; }",
  ],
  invalid: [
    {
      code: "interface Totals { // eslint-disable-next-line no-unused-vars -- A directive has no field purpose prose.\ncount: number; }",
      errors: [missing("interface"), missing("property")],
    },
    {
      code: "/** This prose belongs to the outer expression, not the callback. */ const id = options.id ?? (() => crypto.randomUUID());",
      errors: [missing("function")],
    },
    {
      code: "const id = (options.id ?? /* An ordinary block is not JSDoc. */ (() => crypto.randomUUID()))();",
      errors: [missing("function")],
    },
    { code: "function quote() {}", errors: [missing("function")] },
    { code: "export function quote() {}", errors: [missing("function")] },
    { code: "const quote = () => 1;", errors: [missing("function")] },
    { code: "export default () => null;", errors: [missing("function")] },
    { code: "const api = { quote: () => 1 };", errors: [missing("function property")] },
    { code: "const api = { read() {} };", errors: [missing("method")] },
    { code: "const api = { get value() { return 1; } };", errors: [missing("method")] },
    {
      code: "interface Price { netCents: number; format(): string }",
      errors: [missing("interface"), missing("property"), missing("method")],
    },
    { code: "type Receipt = { id: string }", errors: [missing("type alias"), missing("property")] },
    {
      code: "class Cache { value = null; clear() {} }",
      errors: [missing("class"), missing("property"), missing("method")],
    },
    { code: "class Cache { clear = () => {}; }", errors: [missing("class"), missing("property")] },
    { code: "declare function read(): void;", errors: [missing("function")] },
    {
      code: "type Resolver = { (): number; [name: string]: unknown }",
      errors: [missing("type alias"), missing("type signature"), missing("type signature")],
    },
    { code: "enum State { Draft }", errors: [missing("enum"), missing("enum member")] },
    { code: "const Cache = class {};", errors: [missing("class")] },
    { code: "const Card = memo(() => <span />);", errors: [missing("function")] },
    {
      code: "namespace Adapter { function read() {} }",
      errors: [missing("namespace"), missing("function")],
    },
    {
      code: "/** A useful comment for the previous declaration. */\nconst value = 1;\nfunction quote() {}",
      errors: [missing("function")],
    },
    { code: "/** */\nfunction quote() {}", errors: [missing("function")] },
    { code: "/** @returns {number} */\nfunction quote() {}", errors: [missing("function")] },
    { code: "/* Read only public tariffs. */\nfunction quote() {}", errors: [missing("function")] },
    {
      code: "/** Read only public tariffs. */\n\nfunction quote() {}",
      errors: [missing("function")],
    },
    {
      code: "[1].map(value => value + 1);",
      options: [{ requireCallbacks: true }],
      errors: [missing("function")],
    },
    {
      code: "const data = { enabled: true };",
      options: [{ requireObjectProperties: true }],
      errors: [missing("object property")],
    },
    {
      code: "/** Shared text cannot document two separate functions. */\nconst first = () => 1, second = () => 2;",
      errors: [missing("function"), missing("function")],
    },
    {
      code: "const Box = (props: { label: string }) => <div>{props.label}</div>;",
      errors: [missing("function"), missing("property")],
    },
    {
      code: "/** State shared by one adapter. */\nclass Adapter { /** Accept a repository without performing I/O. */ constructor(private repo: object) {} }",
      errors: [missingParam("repo")],
    },
    { code: "function quote(first, second, ...rest) {}", errors: [missing("function")] },
    {
      code: "// Describe this function for readers.\nfunction quote(value) {}",
      errors: [missing("function")],
    },
    {
      code: "/** Retain the caller's choice without performing I/O. */\nfunction quote(value) {}",
      errors: [missingParam("value")],
    },
    {
      code: "/** Retain the caller's choice without performing I/O.\n * @param value\n */\nfunction quote(value) {}",
      errors: [missingParam("value")],
    },
    {
      code: "/** Retain the caller's choice without performing I/O.\n * @param {string} value\n */\nfunction quote(value) {}",
      errors: [missingParam("value")],
    },
    {
      code: "/** Retain the caller's choice without performing I/O.\n * @param value - value\n */\nfunction quote(value) {}",
      errors: [missingParam("value")],
    },
    {
      code: "/** Select the caller's page size.\n * @param [limit=10] -\n */\nfunction page(limit = 10) {}",
      errors: [missingParam("limit")],
    },
    {
      code: "/** Combine the accepted fragments. */\nfunction combine(...parts) {}",
      errors: [missingParam("parts")],
    },
    {
      code: "/** Read the accepted contact. */\nfunction recipient({ email }) {}",
      errors: [missingParam("argument 1")],
    },
    {
      code: "/** Read the accepted contact.\n * @param input - Frozen contact record supplied by the private adapter.\n */\nfunction recipient({ email }) {}",
      errors: [missingProperty("input.email")],
    },
    {
      code: "/** Describe the public callback's side effects. */\ntype Handler = (value: string) => void;",
      errors: [missingParam("value")],
    },
    {
      code: "/** Public hooks provided by the owning feature. */\ninterface Hooks { /** Notify after acceptance. */ accepted(id: string): void; }",
      errors: [missingParam("id")],
    },
    {
      code: "[1].map(/** Transform the input for the owning calculation. */ value => value + 1);",
      errors: [missingParam("value")],
    },
    {
      code: "/** Purpose cannot be replaced by parameter tags.\n */\nconst run = (value) => value;",
      errors: [missingParam("value")],
    },
    {
      code: "/** @param value - Accepted caller input.\n */\nfunction run(value) {}",
      errors: [missing("function")],
    },
    {
      code: "/** A constructor contract retained by the calling module. */\ntype Factory = new (repo: object) => object;",
      errors: [missingParam("repo")],
    },
    {
      code: "/** Publish an accepted value without modifying it. */\nclass Adapter { /** Forward one accepted identifier to the owning feature. */ publish(id: string) {} }",
      errors: [missingParam("id")],
    },
    {
      code: "/** Hold a caller-controlled repository. */\nclass Adapter { constructor(private repo: object) {} }",
      errors: [missing("method")],
    },
    {
      code: "/** Callbacks accepted by the feature's public adapter. */\ninterface Hooks { /** Process an already verified value. */ handle: (value: string) => void; }",
      errors: [missingParam("value")],
    },
    {
      code: "/** Retain a caller-controlled value. */\nfunction retain(// the accepted input\n value) {}",
      errors: [missingParam("value")],
    },
    {
      code: "/** Read one dynamic field from the accepted object.\n * @param input - Frozen customer object selected by the caller.\n */\nfunction read({ [field]: value }) {}",
      errors: [missingProperty("input.[computed]")],
    },
    {
      code: "/** A caller-owned frozen lookup. */\ntype Lookup = { /** Read a frozen entry without network access. */ [key: string]: unknown };",
      errors: [missingParam("key")],
    },
    {
      code: "/** Isolate a caller-supplied implementation. */\nabstract class Adapter { /** Process one previously validated value. */ abstract run(input: string): void; }",
      errors: [missingParam("input")],
    },
    {
      code: "const api = { /** Return the accepted value without mutation. */ retain(value) { return value; } };",
      errors: [missingParam("value")],
    },
    {
      code: "/** @param value\n * Caller-controlled accepted data.\n */\nfunction retain(value) {}",
      errors: [missing("function")],
    },
    {
      code: "/** A callback mixed with an unrelated value has its own contract. */\nlet maybeRun: (() => void) | string;",
      errors: [missing("function")],
    },
    {
      code: "/** Two alternatives are not one nullable callback contract. */\ntype AmbiguousHandler = ((value: string) => void) | ((value: number) => void) | undefined;",
      errors: [missing("function"), missing("function")],
    },
  ],
});
