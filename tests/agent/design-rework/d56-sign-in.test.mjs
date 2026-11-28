import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import postcss from "postcss";
import ts from "typescript";

const read = path => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");
// Load only the appearance object: the client module's runtime imports stay out of this test.
const source = read("src/lib/oakAccountClient.ts");
const block = source.slice(source.indexOf("const oakClerkRing"), source.indexOf("export type OakAccountErrorCode"));
const { oakClerkAppearance: appearance } = new Function(`${ts.transpile(block.replace("export const", "const"), { target: ts.ScriptTarget.ES2022 })}; return { oakClerkAppearance };`)();
const rgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
const channel = value => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

test("D56-G1 the mounted sign-in wears the workspace's look: a white primary (D69), 48px controls and ring focus", () => {
  const { elements, variables } = appearance;
  const primary = elements.formButtonPrimary;
  // D69: Continue is the workspace's white primary with near-black ink and no glow, like every other forward action.
  assert.equal(primary.backgroundColor, "#ffffff");
  assert.equal(primary.backgroundImage, "none", "no gradient fill");
  assert.equal(primary.color, "#050505");
  assert.ok(contrast(rgb(primary.color), rgb(primary.backgroundColor)) >= 4.5, "dark ink on white");
  assert.equal(primary.boxShadow, "none", "no glow");
  assert.equal(variables.colorPrimaryForeground, "#050505");
  for (const name of ["formFieldInput", "socialButtonsBlockButton"]) {
    assert.equal(elements[name].height, "3rem", `${name} is 48px`);
    assert.equal(elements[name].borderRadius, "0.75rem", `${name} has 12px corners`);
  }
  assert.equal(primary.height, "3rem");
  const focus = elements.formFieldInput["&:focus, &:focus-visible"];
  assert.equal(focus.outline, "none");
  assert.match(focus.background, /padding-box, linear-gradient\(120deg, #4b6fff[^)]*#f5b942 100%\) border-box/, "the launcher ring is the focused edge");
  assert.deepEqual(elements.header, { display: "none" }, "the panel names the step; Clerk's header is hidden");
  assert.equal(elements.cardBox.boxShadow, "none");
  assert.equal(elements.cardBox.border, "none");

  let suppressed = 0;
  postcss.parse(read("src/styles/oakAgent.css")).walkRules(rule => {
    if (!/outline:\s*none/.test(rule.toString()) || !rule.selector.includes("focus-visible")) return;
    if (rule.selector.includes(".cl-")) { suppressed++; assert.equal(rule.selector, ".oak-workspace :is(.cl-formFieldInput, .cl-otpCodeFieldInput):focus-visible", "only Clerk fields drop the white outline"); }
  });
  assert.equal(suppressed, 1);
  assert.ok(statSync(new URL("./fixtures/clerk-sign-in.png", import.meta.url)).size > 20000, "the live mount screenshot exists");
});
