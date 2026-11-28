import { execFileSync } from "node:child_process";
import { runDesignLint } from "./design-policy/run.mjs";

// `--staged` (the pre-commit hook) lints the staged index copy of the staged authored sources, so a partial stage cannot
// commit a violation and one lane's unstaged edits never block another lane's commit. A staged policy, lint config or token
// sheet (global.css, oakAgent.css: the token and radius-scale readers use both) can move findings in any file, so it lints
// every tracked source, still from the index. Plain `npm run lint` always lints the whole tree on disk.
const wholeTree = /^(?:scripts\/design-policy\/|scripts\/lint-design\.mjs$|(?:eslint|stylelint)\.config\.mjs$|src\/styles\/(?:global|oakAgent|openui\/shared)\.css$)/;
const git = (args, input) => execFileSync("git", args, { input, maxBuffer: 1 << 30 });
const list = (buffer) => buffer.toString("utf8").split("\0").filter(Boolean);
/** Read each path's index blob with one `git cat-file --batch`; a path not in the index is left out. */
function indexContents(paths) {
  const contents = new Map();
  if (!paths.length) return contents;
  const out = git(["cat-file", "--batch"], paths.map((file) => `:${file}\n`).join(""));
  let at = 0;
  for (const file of paths) {
    const end = out.indexOf(10, at);
    const header = out.subarray(at, end).toString("utf8");
    at = end + 1;
    const size = /^[0-9a-f]+ blob (\d+)$/.exec(header)?.[1];
    if (size === undefined) continue;
    contents.set(file, out.subarray(at, at + Number(size)).toString("utf8"));
    at += Number(size) + 1;
  }
  return contents;
}
function stagedScope() {
  const staged = list(git(["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]));
  const only = staged.some((file) => wholeTree.test(file)) ? list(git(["ls-files", "-z", "--", "src"])) : staged.filter((file) => file.startsWith("src/"));
  return { only, contents: indexContents(only) };
}

try {
  const result = await runDesignLint(process.argv.includes("--staged") ? stagedScope() : {});
  process.exitCode = result.errors ? 1 : 0;
} catch (error) {
  console.error(`Design lint setup failed: ${error.message}`);
  process.exitCode = 2;
}
