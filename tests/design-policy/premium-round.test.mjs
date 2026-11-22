import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import stylelint from "stylelint";
import { agentModules } from "../../scripts/design-policy/policy.mjs";

const cssFixture = "tests/design-policy/fixtures/design-rework.css";
const lintCss = async (code) => (await stylelint.lint({ code, codeFilename: path.resolve(cssFixture), cache: false })).results
  .flatMap((result) => result.warnings).filter((warning) => warning.rule === "portfolio/agent-tokens");

test("Q02-G2 policy reasons describe per-state sprite sheets and the favicon citations component", () => {
  assert.match(agentModules["OakActivitySprite.tsx"].reason, /per-state/);
  assert.match(agentModules["OakActivitySprite.css"].reason, /static reduced-motion frame/);
  assert.match(agentModules["OakCitations.tsx"].reason, /favicon/);
  assert.doesNotMatch(agentModules["OakCitations.tsx"].reason, /numbered pills/);
});

test("Q02-G2 Stylelint rejects the numbered disc on a source pill and names the favicon pattern", async () => {
  for (const code of [
    ".oak-message__source::before { content: attr(data-source-number); }",
    ".oak-source-pill::before { content: counter(source); }",
  ]) {
    const found = await lintCss(code);
    assert.equal(found.length, 1, code);
    assert.match(found[0].text, /favicon/);
  }
});

test("Q02-G2 Stylelint accepts a favicon cell and an animated per-state sprite sheet rule", async () => {
  const code = ".oak-source-face { display: grid; border-radius: var(--radius-pill); }\n.oak-source-face img { border-radius: var(--radius-sm); }\n" +
    ".oak-activity--searching { animation: oak-sheet-step var(--motion-page) steps(6) infinite; }\n" +
    "@media (prefers-reduced-motion: reduce) { .oak-activity--searching { animation: none; } }";
  assert.deepEqual(await lintCss(code), []);
});

const cardSelectors = [".oak-advice-card", ".oak-role-review", ".oak-document-answer", ".oak-proposal"];
const loaderSelectors = [".oak-turn__shimmer", ".oak-saved__row--skeleton", ".ui-chain-of-thought", ".ui-chain-of-thought__header", ".oak-cot"];

test("Q02-G3 the card step on a generated answer card, loader or reasoning wrapper is a finding", async () => {
  for (const selector of [...cardSelectors, ...loaderSelectors]) {
    assert.equal((await lintCss(`${selector} { border-radius: var(--oak-r-card); }`)).length, 1, selector);
  }
});

test("Q02-G3 the sheet step, or the sheet step less a space token, passes on the same selectors", async () => {
  for (const selector of [...cardSelectors, ...loaderSelectors]) {
    assert.deepEqual(await lintCss(`${selector} { border-radius: var(--oak-r-sheet); }`), [], selector);
    assert.deepEqual(await lintCss(`${selector} { border-radius: calc(var(--oak-r-sheet) - var(--space-xs)); }`), [], selector);
  }
});

test("Q02-G3 the card step stays valid on nested parts and descendants", async () => {
  for (const selector of [".oak-advice-card__next", ".oak-document-answer figure", ".oak-next-step"]) {
    assert.deepEqual(await lintCss(`${selector} { border-radius: var(--oak-r-card); }`), [], selector);
  }
});
