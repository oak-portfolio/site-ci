import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { ESLint } from "eslint";
import stylelint from "stylelint";
import { applyBaseline, readBaseline } from "../../scripts/design-policy/run.mjs";

const eslint = new ESLint({ cache: false });
const baseline = await readBaseline();
const cssFixture = "tests/design-policy/fixtures/design-rework.css";
const lintCss = async (code) => (await stylelint.lint({ code, codeFilename: path.resolve(cssFixture), cache: false })).results
  .flatMap((result) => result.warnings).filter((warning) => warning.rule === "portfolio/agent-tokens");
const lintJs = async (code, filePath) => (await eslint.lintText(code, { filePath }))[0].messages;
const ruleCount = (messages, rule) => messages.filter((message) => message.ruleId === rule).length;

test("D02-G1 Stylelint rejects px type, spacing and radius, rgba shadows and numeric z-index in .oak-* and .ui-* rules", async () => {
  for (const declaration of ["font-size: 14px", "line-height: 20px", "gap: 12px", "padding: 8px 16px", "margin-top: 4px", "border-radius: 16px",
    "box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5)", "z-index: 10"]) {
    for (const selector of [".oak-fixture", ".ui-fixture--sm"]) {
      assert.equal((await lintCss(`${selector} { ${declaration}; }`)).length, 1, `${selector} { ${declaration} } must be rejected`);
    }
  }
});

test("D02-G1 Stylelint accepts the token form and leaves other selectors alone", async () => {
  const tokens = ".oak-fixture { font-size: var(--text-ui-md); line-height: var(--leading-ui); gap: var(--space-xs); padding: var(--space-xs) var(--space-sm); " +
    "margin-top: var(--space-micro); border-radius: var(--radius-md); box-shadow: var(--shadow-popover); z-index: var(--z-overlay); border-width: 1px; padding-block: 0; }";
  assert.deepEqual(await lintCss(tokens), []);
  assert.deepEqual(await lintCss(".work-fixture { padding: 12px; z-index: 3; }"), []);
});

test("D02-G2 ESLint rejects raw form controls outside src/components/ui and direct Base UI imports in agent code", async () => {
  for (const element of ["<textarea />", "<select />", "<input />"]) {
    const code = `export const Field = () => ${element};`;
    assert.equal(ruleCount(await lintJs(code, "src/components/agent/FixtureField.tsx"), "portfolio/raw-control"), 1, element);
    assert.equal(ruleCount(await lintJs(code, "src/components/ui/fixture-field.tsx"), "portfolio/raw-control"), 0, `${element} is allowed in ui`);
  }
  const direct = 'import { Dialog } from "@base-ui/react/dialog"; export const D = Dialog;';
  assert.equal(ruleCount(await lintJs(direct, "src/components/agent/FixtureDialog.tsx"), "portfolio/agent-base-ui-import"), 1);
  assert.equal(ruleCount(await lintJs(direct, "src/components/ui/fixture-dialog.tsx"), "portfolio/agent-base-ui-import"), 0);
});

test("D02-G2 the ratchet keeps baselined violations, fails a new one and makes a fixed one lower the count", async () => {
  const total = (rule) => Object.values(baseline).reduce((sum, rules) => sum + (rules[rule] ?? 0), 0);
  assert.equal(total("portfolio/raw-control") + total("portfolio/agent-base-ui-import"), 0, "D08 burned both rules down to zero in agent-baseline.json");
  const file = "src/components/agent/FixtureRatchet.tsx";
  const source = "export const A = () => <input />;\nexport const B = () => <select />;\n";
  const recorded = { [file]: { "portfolio/raw-control": 2 } };
  const ruleOf = (message) => message.ruleId;
  const today = applyBaseline(file, await lintJs(source, file), ruleOf, recorded);
  assert.equal(ruleCount(today.kept, "portfolio/raw-control"), 0);
  assert.deepEqual(today.stale, []);
  const added = applyBaseline(file, await lintJs(`${source}export const C = () => <textarea />;\n`, file), ruleOf, recorded);
  assert(ruleCount(added.kept, "portfolio/raw-control") > 0, "one more raw control than the baseline fails");
  const fewer = applyBaseline(file, await lintJs("export const A = () => <input />;\n", file), ruleOf, recorded);
  assert(fewer.stale.some((line) => line.includes("portfolio/raw-control")), "a fixed violation must lower the baseline");
  const real = applyBaseline(file, await lintJs(source, file), ruleOf, baseline);
  assert.equal(ruleCount(real.kept, "portfolio/raw-control"), 2, "against the real baseline every raw control fails");
});

test("D04-G3 shadcn/no-restyle flags a restyled new primitive and accepts the variant form", async () => {
  for (const [name, file, props] of [["Input", "input", ""], ["Textarea", "textarea", ""], ["Checkbox", "checkbox", ""], ["Callout", "callout", ' variant="destructive"'],
    ["Bubble", "bubble", ' variant="ghost"'], ["Marker", "marker", ' role="status"'], ["Message", "message", ' align="end"']]) {
    const restyled = `import { ${name} } from "@/components/ui/${file}"; export const Fixture = () => <${name}${props} className="oak-restyled" />;`;
    assert.equal(ruleCount(await lintJs(restyled, "src/components/agent/FixtureRestyle.tsx"), "shadcn/no-restyle"), 1, `${name} with className must be flagged`);
    const variant = `import { ${name} } from "@/components/ui/${file}"; export const Fixture = () => <${name}${props} />;`;
    assert.equal(ruleCount(await lintJs(variant, "src/components/agent/FixtureRestyle.tsx"), "shadcn/no-restyle"), 0, `${name} without className passes`);
  }
});

test("Q24-G16 R11 a corner one step in still lands on the 16px floor", async () => {
  for (const radius of ["calc(var(--radius-md) - var(--space-sm))", "calc(var(--oak-r-row) - var(--space-micro))", "calc(var(--oak-r-card) - var(--space-sm))"]) {
    assert.equal((await lintCss(`.oak-fixture { border-radius: ${radius}; }`)).length, 1, `${radius} is under 16px and must be rejected`);
  }
  for (const radius of ["calc(var(--radius-md) - var(--space-xs))", "calc(var(--oak-r-card) - var(--space-xs))", "var(--oak-r-row)", "var(--radius-pill)"]) {
    assert.equal((await lintCss(`.oak-fixture { border-radius: ${radius}; }`)).length, 0, `${radius} is on the scale`);
  }
});
