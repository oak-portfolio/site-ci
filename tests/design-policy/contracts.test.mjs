import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { ESLint } from "eslint";
import stylelint from "stylelint";
import postcss from "postcss";
import { applyBaseline, assertCoverage, readBaseline, runDesignLint, sourceFiles } from "../../scripts/design-policy/run.mjs";
import { protectedTokens, runtimeStyles, uiModules } from "../../scripts/design-policy/policy.mjs";

const eslint = new ESLint({ cache: false });
const fixtureDir = "tests/design-policy/fixtures";
const read = (file) => fs.readFile(file, "utf8");
const baseline = await readBaseline();
// Real files carry today's ratcheted findings; apply the same baseline `npm run lint` applies.
const lint = async (text, file) => applyBaseline(file, (await eslint.lintText(text, { filePath: file }))[0].messages, (message) => message.ruleId, baseline).kept;
const jsRejects = async (text, file, rule) => {
  const messages = await lint(text, file);
  assert(messages.some((message) => message.ruleId === rule && message.line > 0 && message.column > 0), JSON.stringify(messages));
};
const cssLint = async (text, file) => (await stylelint.lint({ code: text, codeFilename: path.resolve(file), cache: false })).results
  .map((result) => ({ ...result, warnings: applyBaseline(file, result.warnings, (warning) => warning.rule, baseline).kept }));
const cssRejects = async (text, file, rule) => {
  const results = await cssLint(text, file);
  assert(results.some((result) => result.warnings.some((finding) => finding.rule === rule)), JSON.stringify(results.map((result) => result.warnings)));
};

test("all real authored source passes, with every parser and registered UI module covered", async () => {
  const result = await runDesignLint({ print: false });
  assert.equal(result.errors, 0, JSON.stringify(result.js.flatMap((item) => item.messages)));
  assert(Object.values(result.counts).every((count) => count > 0));
});

test("launcher viewport runtime style stays limited to its exact consumer and helper binding", async () => {
  for (const file of ["src/components/agent/OakWorkspace.tsx"]) {
    const source = await read(file);
    assert.deepEqual(await lint(source, file), []);
    await jsRejects(source.replace("style={launcherViewport?.style}", 'style={{ color: "red" }}'), file, "portfolio/runtime-style");
    await jsRejects(source.replace("const launcherViewport = useOakLauncherViewport();", "const launcherViewport = unrelatedStyle();"), file, "portfolio/runtime-style");
  }
});

for (const extension of ["tsx", "astro", "mdx"]) {
  test(`real ${extension} Button variant/class syntax passes`, async () => {
    const file = `${fixtureDir}/button.pass.${extension}`;
    assert.deepEqual(await lint(await read(file), file), []);
  });
  test(`real ${extension} forbidden caller styling fails upstream shadcn rule`, async () => {
    const file = `${fixtureDir}/button.fail.${extension}`;
    await jsRejects(await read(file), file, "shadcn/no-restyle");
  });
  for (const module of ["lucide-react", "lucide", "@radix-ui/react-dialog", "@mui/material", "@hugeicons/react", "@hugeicons-pro/core-stroke-rounded"]) {
    test(`${extension} forbids executable ${module} imports`, async () => {
      const statement = `import { Icon } from "${module}";`;
      const text = extension === "astro" ? `---\n${statement}\n---\n<div />` : `${statement}\n${extension === "mdx" ? "\n# Content\n" : "export const Example = () => <div />;"}`;
      await jsRejects(text, `${fixtureDir}/import.${extension}`, "portfolio/import-boundary");
    });
  }
  test(`${extension} inline authored appearance cannot bypass the component contract`, async () => {
    const element = '<div style={{ color: "#ff00ff" }} />';
    const text = extension === "astro" ? `---\n---\n${element}` : extension === "mdx" ? `# Content\n\n${element}` : `export const Example = () => ${element};`;
    await jsRejects(text, `${fixtureDir}/inline.${extension}`, "portfolio/runtime-style");
  });
  test(`${extension} static spread styles cannot bypass the runtime contract`, async () => {
    const element = '<div {...{ style: { color: "red" } }} />';
    const text = extension === "astro" ? `---\n---\n${element}` : extension === "mdx" ? `# Content\n\n${element}` : `export const Example = () => ${element};`;
    await jsRejects(text, `${fixtureDir}/spread.${extension}`, "portfolio/runtime-style");
  });
  test(`${extension} static spread classes still run upstream shadcn checks`, async () => {
    const element = '<Button {...{ className: "bg-red-500" }} />';
    const statement = 'import { Button } from "@/components/ui/button";';
    const text = extension === "astro" ? `---\n${statement}\n---\n${element}` : extension === "mdx" ? `${statement}\n\n${element}` : `${statement}\nexport const Example = () => ${element};`;
    await jsRejects(text, `${fixtureDir}/spread.${extension}`, "shadcn/no-restyle");
  });
  test(`${extension} malformed syntax fails instead of being skipped`, async () => {
    const text = extension === "astro" ? "---\nconst broken = ;\n---\n<div />" : extension === "mdx" ? "<div broken={ }" : "export const broken = <div";
    assert((await lint(text, `${fixtureDir}/broken.${extension}`)).some((finding) => finding.fatal));
  });
}

for (const text of [
  'export { Icon } from "lucide-react";',
  'export * from "@radix-ui/react-dialog";',
  'const icon = import("@mui/material");',
  'const icon = require("@hugeicons/react");',
  'const family = "lucide-react"; const icon = import(family);',
  'export const Example = () => <svg><path fill="currentColor" /></svg>;',
]) {
  test(`AST import/icon boundary rejects ${text}`, async () => {
    await jsRejects(text, `${fixtureDir}/boundary.tsx`, "portfolio/import-boundary");
  });
}

test("a listed figure drawing may draw inline SVG; any other file is still reported", async () => {
  const drawing = 'export const Example = () => <div><svg><path d="M0 0" /></svg><svg><path d="M0 0" /></svg></div>;';
  assert.deepEqual((await lint(drawing, "src/lib/openui/components/EvidenceChartView.tsx")).filter(finding => finding.ruleId === "portfolio/import-boundary"), []);
  await jsRejects(drawing, "src/lib/openui/components/BoardView.tsx", "portfolio/import-boundary");
});

test("package-prefix lookalikes do not acquire Hugeicons ownership", async () => {
  assert.deepEqual(await lint('import value from "@hugeicons-example/not-icons";', `${fixtureDir}/lookalike.ts`), []);
  await jsRejects('import value from "@hugeicons-pro/core-solid-rounded/alternate";', "src/components/ui/Icon.tsx", "portfolio/import-boundary");
});

test("MDX fenced forbidden examples remain prose", async () => {
  const file = `${fixtureDir}/button.pass.mdx`;
  assert.deepEqual(await lint(await read(file), file), []);
});

test("CSS parser accepts approved tokens, URL fragments, comments and functions", async () => {
  const file = `${fixtureDir}/css.pass.css`;
  const results = await cssLint(await read(file), file);
  assert(results.every((result) => result.warnings.length === 0 && result.parseErrors.length === 0));
});

for (const rule of ["portfolio/token-contract", "portfolio/color-contract", "property-no-unknown"]) {
  test(`deliberate CSS fixture fails ${rule}`, async () => {
    const file = `${fixtureDir}/css.fail.css`;
    await cssRejects(await read(file), file, rule);
  });
}

test("real Astro local CSS and original line positions are checked", async () => {
  const file = `${fixtureDir}/button.pass.astro`;
  const text = await read(file);
  const results = await cssLint(text, file);
  assert(results.every((result) => result.warnings.length === 0));
  const negative = text.replace("color: var(--text)", "color: var(--panle)");
  const rejected = await cssLint(negative, file);
  const warning = rejected.flatMap((item) => item.warnings).find((item) => item.rule === "portfolio/token-contract");
  assert(warning && warning.line === 7 && warning.column > 0, JSON.stringify(rejected.map((result) => result.warnings)));
});

test("malformed CSS has an actual parser error", async () => {
  const results = await cssLint(".fixture { color #ffffff; }", `${fixtureDir}/broken.css`);
  assert(results.some((result) => result.warnings.some((finding) => finding.rule === "CssSyntaxError") || result.parseErrors.length > 0));
});

test("inline suppression cannot hide policy violations", async () => {
  await jsRejects('/* eslint-disable portfolio/import-boundary */\nimport value from "lucide-react";', `${fixtureDir}/suppressed.ts`, "portfolio/import-boundary");
  await cssRejects("/* stylelint-disable */\n.fixture { color: #ff00ff; }", `${fixtureDir}/suppressed.css`, "portfolio/color-contract");
});

for (const element of ['<style lang="scss">.x { color: red; }</style>', '<!-- postcss-ignore -->\n<style>.x { color: red; }</style>', '<style set:html={css} />']) {
  test(`Astro CSS extraction bypass rejects ${element}`, async () => {
    await jsRejects(`---\nconst css = "color:red";\n---\n${element}`, `${fixtureDir}/style-syntax.astro`, "portfolio/runtime-style");
  });
}

for (const token of Object.keys(protectedTokens)) {
  test(`changing protected token ${token} fails`, async () => {
    // A new redeclaration must not hide a prior valid declaration.
    await cssRejects(`${await read("src/styles/global.css")}\n:root { ${token}: #ff00ff; }`, "src/styles/global.css", "portfolio/token-contract");
  });
}

test("protected Button geometry cannot shrink to stale documentation values", async () => {
  await cssRejects(".ui-button--sm { min-height: 36px; }", `${fixtureDir}/button.css`, "portfolio/token-contract");
});

test("real workspace opaque muted token passes both CSS contracts", async () => {
  for (const file of ["src/styles/global.css", "src/styles/oakAgent.css"]) {
    const results = await cssLint(await read(file), file);
    assert(results.every((result) => result.warnings.length === 0 && result.parseErrors.length === 0));
  }
});

for (const [name, mutate, rule, file = "src/styles/oakAgent.css"] of [
  ["wrong value", (css) => css.replace("--muted: #b1b1b1", "--muted: rgba(255, 255, 255, 0.68)"), "portfolio/token-contract"],
  ["extra selector", (css) => css.replace(".oak-workspace {\n  --muted:", ".oak-workspace, .fixture {\n  --muted:"), "portfolio/token-contract"],
  ["media override", (css) => `${css}\n@media (max-width: 640px) { .oak-workspace { --muted: #b1b1b1; } }`, "portfolio/token-contract"],
  ["missing root token", (css) => css.replace("  --muted: rgba(255, 255, 255, 0.68);\n", ""), "portfolio/token-contract", "src/styles/global.css"],
  ["missing scoped token", (css) => css.replace("  --muted: #b1b1b1;\n", ""), "portfolio/token-contract"],
  ["color outside workspace", (css) => `${css}\n.fixture { color: #b1b1b1; }`, "portfolio/color-contract"],
]) {
  test(`workspace muted exception rejects ${name}`, async () => {
    const source = await read(file);
    const changed = mutate(source);
    assert.notEqual(changed, source, `Mutation no longer matches ${name}`);
    await cssRejects(changed, file, rule);
    if (name === "extra selector") await cssRejects(changed, file, "portfolio/color-contract");
  });
}

test("workspace muted exception cannot move outside the agent stylesheet", async () => {
  await cssRejects(".oak-workspace { --muted: #b1b1b1; }", `${fixtureDir}/workspace.css`, "portfolio/token-contract");
});

test("approved brand color cannot spill into an unrelated CSS selector", async () => {
  await cssRejects(`${await read("src/styles/global.css")}\n.fixture { color: #94c8ff; }`, "src/styles/global.css", "portfolio/color-contract");
});

test("CSS variable fallback colors cannot bypass the palette", async () => {
  await cssRejects(".x { --local: initial; color: var(--local, #ff00ff); }", `${fixtureDir}/fallback.css`, "portfolio/color-contract");
});

test("same-file and unreadable prop spreads cannot hide styles", async () => {
  for (const text of [
    'const options = { style: { color: "red" } }; export const X = () => <div {...options} />;',
    'export const X = ({ options }) => <div {...options} />;',
    'const recursive = { ...recursive }; export const X = () => <div {...recursive} />;',
    'export const X = ({ property }) => <div {...{ [property]: { color: "red" } }} />;',
    'let props = {}; props = { style: { color: "red" } }; export const X = () => <div {...props} />;',
    'const props = {}; props.style = { color: "red" }; export const X = () => <div {...props} />;',
    'const props = {}; Object.assign(props, { style: { color: "red" } }); export const X = () => <div {...props} />;',
  ]) await jsRejects(text, `${fixtureDir}/spread-reference.tsx`, "portfolio/runtime-style");
});

test("immutable local spread objects with ordinary props remain usable", async () => {
  assert.deepEqual(await lint('const props = { title: "Example" }; export const X = () => <div {...props} />;', `${fixtureDir}/spread-positive.tsx`), []);
});

const runtimeMutations = [
  ["src/components/agent/OakWorkspace.tsx", "width: sizing.size.width", "width: window.innerWidth"],
  ["src/components/ui/chart.tsx", "style={{ backgroundColor: indicatorColor, borderColor: indicatorColor }}", "style={{ backgroundColor: indicatorColor, borderColor: indicatorColor, padding: 8 }}"],
  ["src/components/ui/chart.tsx", "--color-${key}:", "padding-${key}:"],
  ["src/components/work/WorkChartGraphic.tsx", "style={{ backgroundColor: item.color }}", 'style={{ backgroundColor: "#ff00ff" }}'],
  ["src/components/OakMascot.tsx", 'style={{ "--oak-sprite-image": spriteImage, "--oak-sprite-image-compact": spriteImageCompact, backgroundPosition, backgroundSize } as React.CSSProperties}', 'style={{ "--oak-sprite-image": spriteImage, "--oak-sprite-image-compact": spriteImageCompact, backgroundPosition, backgroundSize, color: \'red\' } as React.CSSProperties}'],
  ["src/components/OakMascot.tsx", "${spriteFrameWidth * spriteColumns}px ${spriteFrameHeight * spriteRows}px", "${spriteFrameWidth * spriteColumns}px${spriteFrameHeight * spriteRows}px"],
  ["src/components/ContactMorph.tsx", "style={{ backgroundColor: CLOSED_TRIGGER_FILL_BACKGROUND }}", 'style={{ backgroundColor: "#ff00ff" }}'],
  ["src/components/work/WorkImageCarousel.tsx", "style={{ aspectRatio: image.aspectRatio }}", "style={{ aspectRatio: image.aspectRatio, padding: 8 }}"],
  ["src/components/work/ChartFigure.astro", "--work-chart-min-width: ${minWidthValue};", "padding: ${minWidthValue};"],
  ["src/components/work/ImageFigure.astro", "--work-image-max-width: ${maxWidth}px;", "color: ${maxWidth}px;"],
  ["src/components/work/VideoFigure.astro", "--work-video-aspect-ratio: ${mediaAspectRatio};", "padding: ${mediaAspectRatio};"],
  ["src/components/work/ExcalidrawFigure.astro", "aspect-ratio: ${aspectRatio};", "color: ${aspectRatio};"],
  ["src/dev/hero-variants.astro", "--dev-hero-bg: url", "color: url"],
];

for (const [file, needle, replacement] of runtimeMutations) {
  test(`precise established runtime exception in ${file} rejects nearby drift`, async () => {
    const original = await read(file);
    assert(original.includes(needle), `Mutation no longer matches ${file}`);
    await jsRejects(original.replace(needle, replacement), file, "portfolio/runtime-style");
  });
}

test("runtime exception cannot be copied onto a second node", async () => {
  const file = "src/components/ui/chart.tsx";
  await jsRejects(`${await read(file)}\nexport const Duplicate = () => <span className="ui-chart-legend__swatch" style={{ backgroundColor: item.color ?? itemConfig?.color }} />;`, file, "portfolio/runtime-style");
});

test("runtime exceptions fail when removed or moved to a different element", async () => {
  const file = "src/components/work/ExcalidrawFigure.astro";
  const source = await read(file);
  await jsRejects(source.replace('class="work-mdx-excalidraw__stage"', 'class="new-stage"'), file, "portfolio/runtime-style");
  await jsRejects(source.replace('<div class="work-mdx-excalidraw__stage"', '<section class="work-mdx-excalidraw__stage"').replace("</div>", "</section>"), file, "portfolio/runtime-style");
});

test("MDX media exception keeps AVIF/WebP and rejects arbitrary background CSS", async () => {
  const file = "src/content/work/ecosmartloop.mdx";
  const source = await read(file);
  await jsRejects(source.replace('"--work-grid-bg": "image-set(', '"padding": "image-set('), file, "portfolio/runtime-style");
  await jsRejects(source.replace("image-set(url('/assets/generated/work/ecosmartloop/team-capstone-origin-1800.avif')", "image-set(url('https://example.com/image.avif')"), file, "portfolio/runtime-style");
});

test("new UI module and unsupported authored language fail coverage", async () => {
  const files = await sourceFiles();
  assert.throws(() => assertCoverage([...files, "src/components/ui/new-card.tsx"]), /reviewed policy and fixture/);
  assert.throws(() => assertCoverage([...files, "src/components/ui/nested/button.tsx"]), /reviewed policy and fixture/);
  assert.throws(() => assertCoverage([...files, "src/components/new-card.vue"]), /Unsupported authored source syntax/);
  assert.throws(() => assertCoverage(files, { ...uiModules, "stale.tsx": { reason: "test", fixture: "button", contract: "shadcn/no-restyle" } }), /Stale UI wrapper/);
  assert(runtimeStyles.every((entry) => entry.element && entry.class && entry.file));
});


test("centered launcher contracts reject placement and visible-width drift", async () => {
  const file = "src/styles/oakAgent.css", global = "src/styles/global.css";
  const source = await read(file);
  assert.equal((await cssLint(source, file)).flatMap(result => result.warnings).length, 0);
  await cssRejects(source.replace("left: var(--oak-launcher-center, 50%)", "left: 16px"), file, "portfolio/token-contract");
  await cssRejects(source.replace("bottom: calc(var(--oak-launcher-bottom-offset, 0px) + var(--audience-dock-bottom))", "bottom: var(--audience-dock-bottom)"), file, "portfolio/token-contract");
  await cssRejects(source.replace("  max-width: var(--oak-launcher-max-width, min(220px, calc(100vw - 32px)));\n  transform: translateX(-50%);", "  max-width: var(--oak-launcher-max-width, min(220px, calc(100vw - 32px)));\n  transform: none;"), file, "portfolio/token-contract");
  await cssRejects(source.replace("max-width: var(--oak-launcher-max-width, min(220px, calc(100vw - 32px)))", "max-width: 220px"), file, "portfolio/token-contract");
  await cssRejects((await read(global)).replace("min-width: min(320px, 100%)", "min-width: 320px"), global, "portfolio/token-contract");
  assert.deepEqual(await lint('import { Button } from "@/components/ui/button"; export const Launcher = () => <Button variant="secondary" size="sm" className="oak-conversation__latest">Latest messages</Button>;', `${fixtureDir}/workspace.pass.tsx`), []);
  await jsRejects('import { Button } from "@/components/ui/button"; export const Bad = () => <Button className="oak-conversation__latest-unreviewed">Latest messages</Button>;', `${fixtureDir}/workspace.fail.tsx`, "shadcn/no-restyle");
});

test("new agent UI requires exact module registration", async () => {
  const files = await sourceFiles();
  assert.throws(() => assertCoverage([...files, "src/components/agent/unregistered.tsx"]), /Agent UI module requires/);
});

test("workspace sizing contracts reject nearby scope and compact-control drift", async () => {
  const workspace = "src/components/agent/OakWorkspace.tsx";
  const source = await read(workspace);
  assert.deepEqual(await lint(source, workspace), []);
  await jsRejects(source.replace("right: sizing.frame.right", "right: sizing.bounds.right"), workspace, "portfolio/runtime-style");
  await jsRejects(source.replace("height: sizing.size.height", "height: sizing.size.height, opacity: 0.5"), workspace, "portfolio/runtime-style");
  const cssFile = "src/styles/oakAgent.css", css = await read(cssFile);
  for (const [before, after] of [
    [".oak-workspace__header-actions .ui-button {\n  padding-inline: calc(var(--space-xs) + var(--space-micro) + 1px)", ".oak-workspace__header-actions .ui-button {\n  padding-inline: 28px"],
  ]) {
    const changed = css.replace(before, after);
    assert.notEqual(changed, css, "Negative fixture must change the workspace sizing contract.");
    await cssRejects(changed, cssFile, "portfolio/token-contract");
  }
  const globalFile = "src/styles/global.css", globalCss = await read(globalFile);
  await cssRejects(globalCss.replace(".oak-mascot[hidden] {\n  display: none", ".oak-mascot[hidden] {\n  display: grid"), globalFile, "portfolio/token-contract");
  await cssRejects(globalCss.replace("oak-mascot-scroll-sheen var(--motion-quick) ease-out", "oak-mascot-scroll-sheen 360ms ease-out"), globalFile, "portfolio/token-contract");
});

test("short viewport retains scroll access and measures the actual locked containing width", async () => {
  const hook = "src/components/agent/useOakWorkspaceSize.ts", source = await read(hook);
  assert.deepEqual(await lint(source, hook), []);
  await jsRejects(source.replace("document.documentElement.getBoundingClientRect().width", "document.documentElement.clientWidth"), hook, "portfolio/runtime-style");
  const file = "src/styles/oakAgent.css", css = await read(file);
  await cssRejects(css.replace("  height: calc(100dvh - 48px);\n  min-width: 0;\n  min-height: 0;\n  overflow: clip;", "  height: calc(100dvh - 48px);\n  min-width: 0;\n  min-height: 0;\n  overflow: hidden;"), file, "portfolio/token-contract");
  await cssRejects(css.replace('.oak-workspace__reading {\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;', '.oak-workspace__reading {\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-height: 0;\n  overflow-y: hidden;'), file, "portfolio/token-contract");
  const winning = (suffix, property) => {
    let value;
    postcss.parse(css).walkRules(rule => {
      if (!rule.selectors.some(selector => [`.oak-workspace[data-compact="true"] ${suffix}`, `.oak-workspace[data-short-viewport="true"] ${suffix}`].includes(selector))) return;
      rule.walkDecls(property, declaration => { value = declaration.value; });
    });
    return value;
  };
  assert.equal(winning(".oak-composer__surface .ui-textarea", "height"), "44px", "Short-height rule must win over equally specific compact rule.");
  assert.equal(winning(".oak-composer__actions", "margin-top"), "0", "Short-height single-row spacing must win over equally specific compact spacing.");
  const composerSurface = '.oak-workspace[data-short-viewport="true"] .oak-composer__surface';
  let portraitColumns;
  postcss.parse(css).walkAtRules("media", media => {
    if (media.params !== "(max-width: 640px) and (orientation: portrait)") return;
    media.walkRules(composerSurface, rule => rule.walkDecls("grid-template-columns", declaration => { portraitColumns = declaration.value; }));
  });
  assert.equal(portraitColumns, "minmax(0, 1fr)", "Short portrait uses a full-width input above the action row.");
  for (const [before, after] of [
    ['.oak-workspace__reading .oak-conversation {\n  min-height: 96px;', '.oak-workspace__reading .oak-conversation {\n  min-height: 0;'],
    ['.oak-conversation {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  flex: 1;', '.oak-conversation {\n  position: relative;\n  display: flex;\n  flex-direction: column;\n  flex: none;'],
    ['.oak-conversation__viewport {\n  flex: 1;\n  min-height: 0;', '.oak-conversation__viewport {\n  flex: 1;\n  min-height: 96px;'],
    // D44: Latest floats over the transcript's edge and an idle pill is hidden, not a row.
    ['.oak-conversation__latest {\n  position: absolute;', '.oak-conversation__latest {\n  position: static;'],
    ['.oak-conversation__latest[data-active="false"] {\n  opacity: 0;\n  pointer-events: none;', '.oak-conversation__latest[data-active="false"] {\n  opacity: 0;\n  pointer-events: auto;'],
  ]) {
    const changed = css.replace(before, after);
    assert.notEqual(changed, css, "Negative fixture must alter transcript fill or the separate Latest lane.");
    await cssRejects(changed, file, "portfolio/token-contract");
  }
});

test("touch composer preserves text size that avoids native focus zoom", async () => {
  const file = "src/styles/oakAgent.css", css = await read(file);
  const touchRule = '@media (hover: none) and (pointer: coarse) {\n  .oak-workspace :is(.ui-input, .ui-textarea, .ui-questionnaire__input) {\n    font-size: var(--text-body-md);';
  const changed = css.replace(touchRule, touchRule.replace("var(--text-body-md)", "14px"));
  assert.notEqual(changed, css, "Negative fixture must change the touch input size.");
  await cssRejects(changed, file, "portfolio/token-contract");
});


test("very short wide workspace keeps header and composer in one usable row", async () => {
  const file = "src/styles/oakAgent.css", css = await read(file);
  for (const [before, after] of [
    ['.oak-workspace[data-inline-controls="true"] {\n  flex-direction: row;', '.oak-workspace[data-inline-controls="true"] {\n  flex-direction: column;'],
    ['.oak-workspace[data-inline-controls="true"] [data-oak-contact-trigger] {\n  width: 44px;', '.oak-workspace[data-inline-controls="true"] [data-oak-contact-trigger] {\n  width: 32px;'],
    ['.oak-workspace[data-inline-controls="true"] .oak-composer__field {\n  min-width: 0;', '.oak-workspace[data-inline-controls="true"] .oak-composer__field {\n  min-width: 200px;'],
    ['.oak-workspace[data-inline-controls="true"] .oak-composer__surface > .oak-composer__field {\n  line-height: 0;', '.oak-workspace[data-inline-controls="true"] .oak-composer__field {\n  line-height: 0;'],
    ['.oak-workspace[data-inline-controls="true"] .oak-account-intake {\n  max-height: none;', '.oak-workspace[data-inline-controls="true"] .oak-account-intake {\n  max-height: 55%;'],
    ['.oak-workspace[data-inline-controls="true"] .oak-composer .oak-composer__surface {\n  grid-template-columns: minmax(44px, 1fr) auto;', '.oak-workspace[data-inline-controls="true"] .oak-composer .oak-composer__surface {\n  grid-template-columns: minmax(0, 1fr) auto;'],
    ['.oak-workspace[data-inline-controls="true"] .oak-workspace__body:has(.oak-workspace__reading[data-panel-open="true"], .oak-workspace__workflow, .oak-workspace__status, .oak-account-intake) {\n  flex-direction: row;', '.oak-workspace[data-inline-controls="true"] .oak-workspace__body:has(.oak-workspace__reading[data-panel-open="true"], .oak-workspace__workflow, .oak-workspace__status, .oak-account-intake) {\n  flex-direction: column;'],
  ]) {
    const changed = css.replace(before, after);
    assert.notEqual(changed, css, "Negative fixture must change the inline controls contract.");
    await cssRejects(changed, file, "portfolio/token-contract");
  }
});

test("inline status reserves intrinsic composer actions before dividing the reading pane", async () => {
  const file = "src/styles/oakAgent.css", css = await read(file);
  const selector = '.oak-workspace[data-inline-controls="true"] .oak-workspace__body:has(.oak-workspace__reading[data-panel-open="true"], .oak-workspace__workflow, .oak-workspace__status, .oak-account-intake) > .oak-composer';
  const before = `${selector} {\n  min-width: min-content;`;
  const changed = css.replace(before, `${selector} {\n  min-width: 0;`);
  assert(changed !== css, "Inline composer must reserve intrinsic actions rather than collapse below them.");
  await cssRejects(changed, file, "portfolio/token-contract");
});

test("workspace header and task menu preserve scoped 44px utility targets", async () => {
  const file = "src/styles/oakAgent.css", source = await read(file);
  for (const [before, after] of [
    ['.oak-workspace__header .ui-button--icon {\n  width: 44px;', '.oak-workspace__header .ui-button--icon {\n  width: 40px;'],
    ['.oak-workspace__header .ui-button--icon {', '.oak-workspace .ui-button--icon {'],
    ['  min-height: 44px;\n  padding: var(--space-xs) var(--space-sm);\n  border-radius: var(--radius-md);', '  min-height: 40px;\n  padding: var(--space-xs) var(--space-sm);\n  border-radius: var(--radius-md);'],
  ]) {
    const changed = source.replace(before, after);
    assert.notEqual(changed, source, "Negative fixture must change the intended scope.");
    await cssRejects(changed, file, "portfolio/token-contract");
  }
});
