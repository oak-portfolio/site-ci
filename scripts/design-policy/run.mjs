import fs from "node:fs/promises";
import path from "node:path";
import { ESLint } from "eslint";
import stylelint from "stylelint";
import { uiModules, agentModules, rules } from "./policy.mjs";

const baselineFile = "scripts/design-policy/agent-baseline.json";
const relative = (file) => path.relative(process.cwd(), file).split(path.sep).join("/");
/** Rules that started with violations in today's code. They ratchet against agent-baseline.json instead of failing outright. */
export const ratchetedRule = (rule) => /^(?:portfolio\/(?:raw-control|agent-base-ui-import|agent-tokens)|jsx-a11y-x\/)/.test(rule ?? "");
export async function readBaseline() {
  return JSON.parse(await fs.readFile(baselineFile, "utf8")).files;
}
/** Drop a file's ratcheted findings while their count stays within the baseline; report counts that fell so the baseline only shrinks. */
export function applyBaseline(file, findings, ruleOf, baseline) {
  const counts = new Map();
  for (const finding of findings) if (ratchetedRule(ruleOf(finding))) counts.set(ruleOf(finding), (counts.get(ruleOf(finding)) ?? 0) + 1);
  const allowed = baseline[file] ?? {};
  const kept = findings.filter((finding) => !ratchetedRule(ruleOf(finding)) || counts.get(ruleOf(finding)) > (allowed[ruleOf(finding)] ?? 0));
  const stale = Object.entries(allowed).filter(([rule, count]) => (counts.get(rule) ?? 0) < count)
    .map(([rule, count]) => `${file} ${rule}: baseline ${count}, found ${counts.get(rule) ?? 0}. Lower it in ${baselineFile}.`);
  return { kept, stale };
}

export async function sourceFiles(directory = "src") {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(file));
    else if (/\.(?:ts|tsx|astro|mdx|css|js|jsx|mjs|cjs|scss|sass|less|html|vue|svelte)$/.test(entry.name)) files.push(file);
  }
  return files.sort();
}

export function assertCoverage(files, modules = uiModules, agentRegistry = agentModules) {
  const unsupported = files.filter((file) => !/\.(?:ts|tsx|astro|mdx|css)$/.test(file));
  if (unsupported.length) throw new Error(`Unsupported authored source syntax: ${unsupported.join(", ")}`);
  const wrappers = files.filter((file) => file.startsWith("src/components/ui/"));
  for (const file of wrappers) {
    const entry = modules[file.slice("src/components/ui/".length)];
    if (!entry?.reason || !entry.fixture || !rules.some((rule) => rule.id === entry.contract)) throw new Error(`UI wrapper requires a reviewed policy and fixture: ${file}`);
  }
  const agentFiles = files.filter((file) => file.startsWith("src/components/agent/"));
  for (const file of agentFiles) {
    const entry = agentRegistry[file.slice("src/components/agent/".length)];
    if (!entry?.reason || !entry.fixture || !rules.some((rule) => rule.id === entry.contract)) throw new Error(`Agent UI module requires a reviewed policy and fixture: ${file}`);
  }
  for (const name of Object.keys(agentRegistry)) if (!agentFiles.includes(`src/components/agent/${name}`)) throw new Error(`Stale agent UI registry entry: ${name}`);
  for (const name of Object.keys(modules)) if (!wrappers.includes(`src/components/ui/${name}`)) throw new Error(`Stale UI wrapper registry entry: ${name}`);
}

/**
 * `only` (repo-relative paths) lints just those authored sources; coverage and the registry still check the whole tree.
 * `contents` (Map of repo-relative path to text, e.g. the staged index copy) lints that text under the real filename
 * instead of the disk copy; a scoped file missing from it is skipped.
 */
export async function runDesignLint({ print = true, only, contents } = {}) {
  const tree = await sourceFiles();
  assertCoverage(tree);
  const scoped = only !== undefined;
  const wanted = new Set((only ?? []).map((file) => relative(path.resolve(file))));
  const files = (scoped ? tree.filter((file) => wanted.has(file)) : tree).filter((file) => !contents || contents.has(file));
  const counts = Object.fromEntries(["ts", "tsx", "astro", "mdx", "css"].map((extension) => [extension, files.filter((file) => file.endsWith(`.${extension}`)).length]));
  if (!scoped && Object.values(counts).some((count) => count === 0)) throw new Error(`Design coverage must include every authored syntax: ${JSON.stringify(counts)}`);
  const eslint = new ESLint({ cache: false });
  const scriptFiles = files.filter((file) => !file.endsWith(".css"));
  for (const file of scriptFiles) {
    if (await eslint.isPathIgnored(file)) throw new Error(`Authored source unexpectedly ignored by ESLint: ${file}`);
  }
  const js = !scriptFiles.length ? [] : contents
    ? (await Promise.all(scriptFiles.map((file) => eslint.lintText(contents.get(file), { filePath: path.resolve(file) })))).flat()
    : await eslint.lintFiles(scriptFiles);
  const cssFiles = files.filter((file) => /\.(?:css|astro)$/.test(file));
  const css = !cssFiles.length ? { results: [] } : contents
    ? { results: (await Promise.all(cssFiles.map((file) => stylelint.lint({ code: contents.get(file), codeFilename: path.resolve(file), cache: false })))).flatMap((run) => run.results) }
    : await stylelint.lint({ files: cssFiles, cache: false });
  for (const file of cssFiles) {
    if (!css.results.some((result) => path.resolve(result.source) === path.resolve(file) && !result.ignored)) throw new Error(`Authored source unexpectedly ignored by Stylelint: ${file}`);
  }
  const baseline = await readBaseline();
  const stale = Object.keys(baseline).filter((file) => !tree.includes(file)).map((file) => `${file}: baseline entry for a file that no longer exists. Remove it from ${baselineFile}.`);
  for (const result of js) {
    const { kept, stale: fileStale } = applyBaseline(relative(result.filePath), result.messages, (message) => message.ruleId, baseline);
    Object.assign(result, { messages: kept, errorCount: kept.filter((message) => message.severity === 2).length, warningCount: kept.filter((message) => message.severity === 1).length });
    stale.push(...fileStale);
  }
  for (const result of css.results) {
    const { kept, stale: fileStale } = applyBaseline(relative(result.source), result.warnings, (warning) => warning.rule, baseline);
    result.warnings = kept;
    stale.push(...fileStale);
  }
  const errors = stale.length + js.reduce((count, result) => count + result.errorCount + result.warningCount, 0) + css.results.reduce((count, result) => count + result.warnings.length + result.parseErrors.length, 0);
  if (print) {
    const formatter = await eslint.loadFormatter("stylish");
    const eslintOutput = formatter.format(js);
    if (eslintOutput) process.stdout.write(eslintOutput);
    for (const result of css.results) {
      for (const finding of [...result.parseErrors, ...result.warnings]) console.error(`${result.source}:${finding.line ?? 1}:${finding.column ?? 1} ${finding.rule ?? "css-syntax-error"} ${finding.text}`);
    }
    for (const line of stale) console.error(`ratchet ${line}`);
    console.log(`Design lint${scoped ? ` (${files.length} of ${tree.length} files)` : ""}: ${errors} findings; coverage ${JSON.stringify(counts)}. ${css.results.length} CSS/Astro files parsed by Stylelint.`);
  }
  return { errors, counts, js, css, stale };
}
