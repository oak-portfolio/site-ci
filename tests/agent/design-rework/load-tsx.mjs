import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../../..");
const nodeRequire = createRequire(path.join(root, "package.json"));
const isFile = (file) => { try { return statSync(file).isFile(); } catch { return false; } };
const jsxModes = { "react-jsx": ts.JsxEmit.ReactJSX, react: ts.JsxEmit.React };

/**
 * Named stub sets. A set is `{ stubs, guards }`: `stubs` replaces a module by the specifier a source file writes,
 * `guards` pins the imports of one source file so a new import fails loudly until it is listed here.
 */
export const stubSets = {
  // The Hugeicons Pro CJS build cannot load under Node's require; tests see each icon as a named svg.
  icons: { stubs: { "@/components/ui/Icon": { Icon: ({ name }) => createElement("svg", { "data-icon": name, "aria-hidden": "true" }) } }, guards: [] },
  react: { stubs: { react: { useSyncExternalStore() {} } }, guards: [] },
  /**
   * The Workspace store (src/lib/oakWorkspace.ts). A test passes the edges it drives (`account`, `handoff`, `transport`);
   * every other import loads for real, and an import not listed here fails loudly. Add a new store import once, here.
   */
  workspaceStore: ({ account, handoff, transport } = {}) => ({
    stubs: Object.fromEntries(Object.entries({ "./oakAccountClient": account, "./oakAuthHandoff": handoff, "./oakWorkspaceTransport": transport })
      .filter(([, stub]) => stub)),
    guards: [{ file: "src/lib/oakWorkspace.ts", real: [
      "react", "./oakAccountClient", "./oakAuthHandoff", "./oakWorkspaceTransport",
      "../../packages/oak-agent-contracts/src/output", "../../packages/oak-agent-contracts/src/transport",
      "../../packages/oak-agent-contracts/src/public-research", "../../packages/oak-agent-contracts/src/document-answer",
      "./oakContactBrief", "./oakFundingSession", "./oakVoiceCapture", "./oakVoiceWorkspace", "./oakSignInConfiguration",
      "./oakSavedHistoryClient", "./oakSavedHistoryWorkspace", "./oakSavedLifecycleActions", "./oakSavedLifecycleCopies",
      "./oakDocumentsWorkspace", "./oakViewportSupport", "./oakToolSteps", "./oakToasts", "./oakQuote", "./oakBridgeOnce", "./oakPrivateDocumentHistory", "./oakComposerInput",
    ] }],
  }),
};

/**
 * How both loaders resolve one import: a CSS stub, a real package, parsed JSON, or a module file for the caller to load.
 * `from` is the absolute path of the importing file.
 */
function resolveImport(specifier, from) {
  if (specifier.endsWith(".css")) return { value: {} };
  const base = specifier.startsWith("@/") ? path.join(root, "src", specifier.slice(2))
    : specifier.startsWith(".") ? path.resolve(path.dirname(from), specifier) : null;
  if (!base) return { value: nodeRequire(specifier) };
  const resolved = [base, `${base}.tsx`, `${base}.ts`, path.join(base, "index.ts")].find(isFile);
  if (!resolved) throw new Error(`Cannot resolve ${specifier} from ${from}`);
  if (resolved.endsWith(".json")) return { value: { __esModule: true, default: JSON.parse(readFileSync(resolved, "utf8")) } };
  return { file: resolved };
}

/**
 * One TS/TSX loader for tests. Resolves `@/` aliases, relative files and real packages; `use` takes stub sets,
 * `stubs` adds one-off replacements, `globals` become free variables of every loaded module, and `interop` wraps default and
 * namespace imports (off keeps stubs such as a promise-valued module untouched).
 * Returns `load(file)` with `file` relative to the repo root.
 * Only a file a stub set guards (today src/lib/oakWorkspace.ts) rejects an unlisted import; every module below it loads
 * for real. That is the trade this loader makes: the per-test loaders it replaced also failed on a new import deeper down
 * (oakSavedHistoryClient and the like), which cost ten edits per import and caught nothing the guarded file's tests miss.
 */
export function createLoader({ use = [], stubs = {}, globals = {}, jsx = "react-jsx", interop = false } = {}) {
  const sets = use.map((set) => (typeof set === "function" ? set() : set));
  const table = Object.assign({}, ...sets.map((set) => set.stubs), stubs);
  const guards = new Map(sets.flatMap((set) => set.guards).map((guard) => [path.resolve(root, guard.file), guard]));
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = { exports: {} };
    cache.set(absolute, module);
    const { outputText } = ts.transpileModule(readFileSync(absolute, "utf8"), {
      fileName: absolute,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: jsxModes[jsx], esModuleInterop: interop },
    });
    const guard = guards.get(absolute);
    const localRequire = (specifier) => {
      if (specifier in table) return table[specifier];
      if (guard && !guard.real.includes(specifier)) throw new Error(`Unexpected import ${specifier} in ${guard.file}: list it in stubSets in tests/agent/design-rework/load-tsx.mjs`);
      const found = resolveImport(specifier, absolute);
      return "file" in found ? load(found.file) : found.value;
    };
    new Function("require", "module", "exports", ...Object.keys(globals), outputText)(localRequire, module, module.exports, ...Object.values(globals));
    return module.exports;
  }
  return load;
}

const defaultLoad = createLoader({ use: [stubSets.icons, stubSets.workspaceStore()], interop: true });

/** Load a real TS/TSX module with `@/` aliases and real packages, for server-render tests of ui primitives. */
export const loadTsx = (file) => defaultLoad(file);

/** `createLoader` with the older positional shape: `(stubs, globals)`. */
export const stubbedLoader = (stubs = {}, globals = {}) => createLoader({ stubs, globals });

/**
 * One file with an explicit require table, for tests that wire a module's imports by hand. An import missing from the
 * table throws, or resolves to `{}` with `missing: "empty"`. `base` is the test's `import.meta.url`: a `file` starting
 * with `.` reads relative to the test, any other reads relative to the repo root. `requires` may be a function of the
 * specifier when a test resolves imports itself.
 * `missing: "real"` loads an unlisted relative or `@/` import as the real file (its own imports follow the same rules)
 * and a bare package name through `require`; a listed entry still wins, and a function `requires` that returns
 * `undefined` falls through to the real file.
 */
export const strictLoader = (base, { jsx = "react-jsx", globals = {}, missing = "throw" } = {}) => (file, requires = {}) => {
  const cache = new Map();
  const run = (absolute) => {
    if (cache.has(absolute)) return cache.get(absolute);
    // The file name tells TypeScript a .ts file is not TSX, so a generic arrow (`<T>(value: T) => value`) still parses.
    const source = readFileSync(absolute, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: absolute,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: jsxModes[jsx] },
    });
    const exports = {};
    cache.set(absolute, exports);
    const realImport = (name) => {
      const found = resolveImport(name, absolute);
      return "file" in found ? run(found.file) : found.value;
    };
    new Function("require", "exports", ...Object.keys(globals), outputText)((name) => {
      if (typeof requires === "function") {
        const value = requires(name);
        if (value !== undefined || missing !== "real") return value;
        return realImport(name);
      }
      if (Object.hasOwn(requires, name)) return requires[name];
      if (missing === "real") return realImport(name);
      if (missing === "empty") return {};
      throw new Error(`Unexpected runtime import: ${name}`);
    }, exports, ...Object.values(globals));
    return exports;
  };
  return run(file.startsWith(".") ? fileURLToPath(new URL(file, base)) : path.resolve(root, file));
};
