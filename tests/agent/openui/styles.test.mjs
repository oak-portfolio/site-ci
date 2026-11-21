import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import postcss from "postcss";
import { runDesignLint } from "../../../scripts/design-policy/run.mjs";

const unknown = async (file, rule = ".oak-openui-probe { color: var(--oak-violet); }\n") => {
  const result = await runDesignLint({ print: false, only: [file], contents: new Map([[file, rule]]) });
  assert.equal(result.css.results.length, 1, `${file} is linted`);
  return result.css.results.flatMap(item => item.warnings).filter(warning => /Unknown CSS variable/.test(warning.text));
};

test("styles: a component stylesheet in src/styles/openui/ reads the agent tokens", async () => {
  assert.deepEqual(await unknown("src/styles/openui/index.css"), []);
  assert.deepEqual(await unknown("src/styles/openui/role.css", ".oak-openui-probe { gap: var(--oak-openui-gap); }\n"), [], "and the shared OpenUI tokens");
  assert.equal((await unknown("src/styles/oakOwner.css")).length, 1, "a sheet outside the folder still reports an agent token");
});

test("styles: the component stylesheets load right after the agent's own", () => {
  const imports = [...readFileSync("src/styles/theme.css", "utf8").matchAll(/^@import "([^"]+)";$/gm)].map(match => match[1]);
  assert.equal(imports.indexOf("./openui/index.css"), imports.indexOf("./oakAgent.css") + 1);
});

test("styles: every OpenUI rule lives in src/styles/openui/, each sheet imported once by index.css", () => {
  const open = [];
  postcss.parse(readFileSync("src/styles/oakAgent.css", "utf8")).walkRules(rule => { if (/oak-openui/.test(rule.selector)) open.push(rule.selector); });
  assert.deepEqual(open, [], "oakAgent.css holds no .oak-openui rule");
  const index = readFileSync("src/styles/openui/index.css", "utf8");
  const imports = [...index.matchAll(/^@import "\.\/([^"]+)";$/gm)].map(match => match[1]);
  const sheets = readdirSync("src/styles/openui").filter(file => file.endsWith(".css") && file !== "index.css").sort();
  assert.deepEqual([...imports].sort(), sheets, "each sheet once, none missing");
  assert.equal(imports[0], "shared.css", "the shared rules load first");
  assert.equal(postcss.parse(index).nodes.filter(node => node.type !== "comment" && !(node.type === "atrule" && node.name === "import")).length, 0, "index.css only imports");
});
