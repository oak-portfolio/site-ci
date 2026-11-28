import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import stylelint from "stylelint";
import valueParser from "postcss-value-parser";
import selectorParser from "postcss-selector-parser";
import { protectedTokens, responsiveTokens, runtimeVariables, componentDeclarations, responsiveComponentDeclarations, colorExceptions, declarationStylesheet, tokenSheets } from "./policy.mjs";

const sourceFile = (root) => path.relative(process.cwd(), root.source?.input.file ?? "").split(path.sep).join("/");
export function canonicalValue(value) {
  const ast = valueParser(value);
  ast.walk((node) => {
    if (node.type === "comment" || node.type === "space") node.value = "";
    if (node.type === "div") { node.before = ""; node.after = ""; }
    if (node.type === "word" && node.value.startsWith("#")) node.value = node.value.toLowerCase();
  });
  return ast.toString();
}
const selectors = (value) => selectorParser().astSync(value).nodes.map((node) => node.toString().trim().replace(/\s+/g, " "));
const same = (left, right) => canonicalValue(left) === canonicalValue(right);

function tokenContract(enabled) {
  return (root, result) => {
    if (!enabled) return;
    const file = sourceFile(root);
    const report = (node, message) => stylelint.utils.report({ ruleName: "portfolio/token-contract", result, node, message });
    const known = new Set(runtimeVariables);
    const global = postcss.parse(fs.readFileSync(new URL("../../src/styles/global.css", import.meta.url), "utf8"));
    global.walkDecls((decl) => { if (decl.prop.startsWith("--")) known.add(decl.prop); });
    for (const sheet of tokenSheets(file)) postcss.parse(fs.readFileSync(new URL(`../../${sheet}`, import.meta.url), "utf8")).walkDecls((decl) => { if (decl.prop.startsWith("--")) known.add(decl.prop); });
    root.walkDecls((decl) => { if (decl.prop.startsWith("--")) known.add(decl.prop); });
    const foundTokens = new Set();
    const foundComponents = new Set();
    root.walkDecls((decl) => {
      let media;
      // R20 red team L1: a protected token under two @media, or any @supports or @container, could be switched off while
      // its registered value still matched, so such nesting is reported below.
      let wrappers = 0, guarded = false;
      for (let parent = decl.parent; parent; parent = parent.parent) if (parent.type === "atrule") {
        if (parent.name === "media") { media = parent.params; wrappers += 1; }
        if (parent.name === "supports" || parent.name === "container") guarded = true;
      }
      valueParser(decl.value).walk((node) => {
        if (node.type !== "function" || node.value !== "var") return;
        const name = node.nodes.find((part) => part.type === "word")?.value;
        if (name?.startsWith("--") && !known.has(name)) report(decl, `Unknown CSS variable ${name}. Use an authored token or the exact registered runtime variable.`);
      });
      if (decl.prop in protectedTokens && (wrappers > 1 || guarded))
        report(decl, `Protected token ${decl.prop} sits under nested @media, @supports or @container. Set it in one registered @media or none.`);
      if (decl.prop in protectedTokens) {
        const approved = media ? responsiveTokens[decl.prop]?.[media] : protectedTokens[decl.prop];
        const rootToken = file === "src/styles/global.css" && decl.parent.selector === ":root" && approved !== undefined && same(decl.value, approved);
        const contexts = decl.parent.type === "rule" ? selectors(decl.parent.selector) : [];
        const scopedToken = decl.parent.selector !== ":root" && contexts.length > 0 && contexts.every((selector) => {
          // A scoped token under a media query passes only with its exact registered value for that query (R20 contrast).
          const expected = media === undefined ? componentDeclarations[selector]?.[decl.prop] : responsiveComponentDeclarations[media]?.[selector]?.[decl.prop];
          return declarationStylesheet(selector) === file && expected !== undefined && same(decl.value, expected);
        });
        if (!rootToken && !scopedToken) {
          report(decl, `Protected token ${decl.prop} must retain its approved root value/scope. See scripts/design-policy/policy.mjs.`);
        } else if (rootToken && !media) foundTokens.add(decl.prop);
      }
      if (decl.parent.type !== "rule") return;
      for (const selector of selectors(decl.parent.selector)) {
        const responsive = media && responsiveComponentDeclarations[media]?.[selector]?.[decl.prop];
        const expected = responsive || componentDeclarations[selector]?.[decl.prop];
        if (expected === undefined) continue;
        if (!same(decl.value, expected)) report(decl, `${selector} ${decl.prop} must remain ${expected}. Use the component variant/size contract.`);
        else foundComponents.add(`${responsive ? `${media}:` : ""}${selector}:${decl.prop}`);
      }
    });
    if (file === "src/styles/global.css") {
      for (const token of Object.keys(protectedTokens)) if (!foundTokens.has(token)) report(root, `Missing approved root token ${token}.`);
    }
    for (const [selector, properties] of Object.entries(componentDeclarations)) {
      if (declarationStylesheet(selector) !== file) continue;
      for (const property of Object.keys(properties)) if (!foundComponents.has(`${selector}:${property}`)) report(root, `Missing approved declaration ${selector} ${property}.`);
    }
    for (const [media, components] of Object.entries(responsiveComponentDeclarations)) {
      for (const [selector, properties] of Object.entries(components)) {
        if (declarationStylesheet(selector) !== file) continue;
        for (const property of Object.keys(properties)) if (!foundComponents.has(`${media}:${selector}:${property}`)) report(root, `Missing approved declaration ${media} ${selector} ${property}.`);
      }
    }
  };
}
tokenContract.ruleName = "portfolio/token-contract";
tokenContract.meta = { url: "https://github.com/Absorber97/steve-oak-portfolio/blob/main/DESIGN.md" };

const neutralHex = new Set(["#050505", "#0c0c0c", "#111111", "#ffffff", "#fff", "#000", "#000000", "#070707"]);
const neutralChannels = new Set([0, 3, 5, 7, 12, 16, 17, 18, 255]);
function neutralFunction(node) {
  if (!["rgb", "rgba"].includes(node.value)) return false;
  const values = node.nodes.filter((part) => part.type === "word").map((part) => Number(part.value));
  return values.length >= 3 && values.length <= 4 && values.every(Number.isFinite) && values[0] === values[1] && values[1] === values[2] &&
    neutralChannels.has(values[0]) && (values.length === 3 || (values[3] >= 0 && values[3] <= 1));
}

function colorContract(enabled) {
  return (root, result) => {
    if (!enabled) return;
    const file = sourceFile(root);
    const exceptions = colorExceptions.filter(([owner]) => owner === file);
    const used = new Set();
    const report = (node, message) => stylelint.utils.report({ ruleName: "portfolio/color-contract", result, node, message });
    root.walkDecls((decl) => {
      valueParser(decl.value).walk((node) => {
        if (node.type === "function" && node.value === "url") return false;
        const isHex = node.type === "word" && /^#[a-f0-9]{3,8}$/i.test(node.value);
        const isFunction = node.type === "function" && ["rgb", "rgba", "hsl", "hsla", "lab", "lch", "oklab", "oklch", "color"].includes(node.value);
        if (!isHex && !isFunction) return;
        const value = isHex ? node.value.toLowerCase() : valueParser.stringify(node);
        if ((isHex && neutralHex.has(value)) || (isFunction && neutralFunction(node))) return false;
        const contexts = decl.parent.type === "rule" ? selectors(decl.parent.selector) : [];
        const exception = exceptions.find(([, allowedSelectors, values]) => contexts.length > 0 && contexts.every((item) => allowedSelectors.includes(item)) && values.some((item) => same(item, value)));
        if (exception) used.add(exception);
        else report(decl, `Color ${value} is outside the approved palette/context. Use a semantic token or the scoped chart/brand color.`);
        return false;
      });
    });
    for (const exception of exceptions) {
      if (!used.has(exception)) report(root, `Stale color exception for ${exception[1].join(", ")}. Review its exact selector/value scope.`);
    }
  };
}
colorContract.ruleName = "portfolio/color-contract";
colorContract.meta = { url: "https://github.com/Absorber97/steve-oak-portfolio/blob/main/DESIGN.md" };

// Same properties and literal patterns as design-rework gate D01-G4, so the lint and the gate agree.
const scaledProperty = /font-size|line-height|gap|padding|margin|border-radius/;
const pxLiteral = /(?<![\d.])(?:[2-9]|\d{2,})px/;
// D121 concentric radii (Apple: a capsule is half its height; an inner shape is its parent's radius less its padding):
// capsules, the window/sheet/card/row steps, or a step less a space token. Mid sizes such as 6, 9 or 12px read as neither.
const radiusPart = /^(?:0|inherit|50%|var\(--radius-(?:pill|md|lg)\)|var\(--oak-r-(?:window|frame|sheet|card|row|control|shell)\)|var\(--oak-card-radius(?:,\s*var\(--radius-md\))?\)|calc\(var\(--(?:radius-(?:md|lg)|oak-r-[a-z]+)\)\s*-\s*var\(--space-[a-z]+\)\))$/;
// R11 (Oak, review v8): a step less a space token must still land on the 16px floor, so no card or row reads as a sharp box.
// ARCH@34: the px scale is read from the tokens themselves (global.css :root, oakAgent.css .oak-workspace), so a token
// change moves the floor check with it. Only px literals, var(), calc() with + and -, and min()/max() are evaluated.
const scaleSheets = ["../../src/styles/global.css", "../../src/styles/oakAgent.css"].map((file) => new URL(file, import.meta.url));
export function tokenScale(sources = scaleSheets.map((url) => fs.readFileSync(url, "utf8"))) {
  const raw = new Map();
  for (const css of sources) postcss.parse(css).walkDecls(/^--(?:radius|oak-r|space)-/, (decl) => {
    if (decl.parent.type === "rule" && decl.parent.parent?.type === "root" && decl.parent.selector.split(",").some((item) => [":root", ".oak-workspace"].includes(item.trim()))) raw.set(decl.prop.slice(2), decl.value);
  });
  const scale = {};
  const resolve = (name, seen = new Set()) => {
    if (name in scale) return scale[name];
    if (!raw.has(name) || seen.has(name)) return NaN;
    seen.add(name);
    const evaluate = (nodes) => {
      let total = 0, sign = 1, terms = 0;
      for (const node of nodes) {
        if (node.type === "space" || node.type === "comment") continue;
        if (node.type === "word" && (node.value === "+" || node.value === "-")) { sign = node.value === "+" ? 1 : -1; continue; }
        total += sign * term(node); terms += 1; sign = 1;
      }
      return terms ? total : NaN;
    };
    const term = (node) => {
      if (node.type === "word") { const px = /^(-?\d+(?:\.\d+)?)px$/.exec(node.value); return px ? Number(px[1]) : NaN; }
      if (node.type !== "function") return NaN;
      if (node.value === "var") return resolve(node.nodes.find((part) => part.type === "word")?.value?.slice(2), seen);
      if (node.value === "calc" || node.value === "") return evaluate(node.nodes);
      if (node.value === "max" || node.value === "min") {
        const args = [[]];
        for (const part of node.nodes) part.type === "div" && part.value === "," ? args.push([]) : args.at(-1).push(part);
        return Math[node.value](...args.map(evaluate));
      }
      return NaN;
    };
    return (scale[name] = evaluate(valueParser(raw.get(name)).nodes));
  };
  for (const name of raw.keys()) resolve(name);
  return scale;
}
const scale = tokenScale();
export const stepFloor = (part, px = scale) => {
  const match = /^calc\(var\(--([a-z-]+)\)\s*-\s*var\(--([a-z-]+)\)\)$/.exec(part);
  return !match || (px[match[1]] ?? 0) - (px[match[2]] ?? 99) >= 16;
};
// Small fixed corners stay only where the shape is a real object: keycaps, checkboxes, favicons, pictograms, carets.
const smallRadiusSelector = /kbd|checkbox|caret|spinner__cell|shortcut|source-face img|size__glyph/;
const smallRadiusPart = /^(?:1px|var\(--radius-sm\)|calc\(var\(--radius-sm\)\s*\/\s*\d+\))$/;
// Q02 (brief O7): generated answer cards, loaders and the reasoning wrapper take the sheet step, not the card step.
// R21 (ARCH@34): the research card is one card in the answer family (D86), so it takes the sheet step too.
const sheetCardSelector = /(?:^|[\s>+~])\.(?:oak-advice-card|oak-role-review|oak-document-answer|oak-proposal|oak-research|oak-turn__shimmer|oak-saved__row--skeleton|oak-cot|ui-chain-of-thought|ui-chain-of-thought__header)(?![\w-])[^\s>+~]*$/;
// Q02 (brief O6): sources carry favicons, never a numbered disc.
const numberDisc = (selector, value) => /attr\(\s*data-source-number\s*\)/.test(value) || (/source/.test(selector) && /counter\(/.test(value));
const radiusParts = (value) => valueParser(value).nodes.filter((node) => node.type !== "space").map((node) => valueParser.stringify(node).trim());
function agentTokens(enabled) {
  return (root, result) => {
    if (!enabled) return;
    const report = (node, message) => stylelint.utils.report({ ruleName: "portfolio/agent-tokens", result, node, message });
    root.walkDecls((decl) => {
      if (decl.parent.type !== "rule" || !/\.(?:oak|ui)-/.test(decl.parent.selector)) return;
      const prop = decl.prop.toLowerCase();
      if (scaledProperty.test(prop) && pxLiteral.test(decl.value)) report(decl, `${prop} uses a px literal. Use a --space-*, --text-*, --leading-* or --radius-* token.`);
      else if (/^border(?:-[a-z]+)*-radius$/.test(prop) && radiusParts(decl.value).some((part) =>
        !(radiusPart.test(part) && stepFloor(part)) && !(smallRadiusSelector.test(decl.parent.selector) && smallRadiusPart.test(part))))
        report(decl, `${prop} is off the concentric scale. Use --radius-pill for controls, --oak-r-sheet/card/row (or a step less a --space-* token) for containers.`);
      else if (prop === "border-radius" && /var\(--oak-r-card\)/.test(decl.value) && selectors(decl.parent.selector).some((selector) => sheetCardSelector.test(selector)))
        report(decl, "Generated answer cards, loaders and the reasoning wrapper use var(--oak-r-sheet) (or the sheet step less a --space-* token), not --oak-r-card.");
      else if (prop === "content" && numberDisc(decl.parent.selector, decl.value))
        report(decl, "A numbered disc on a source pill is retired. Show the source's favicon cell (site initial or bundled icon) instead.");
      else if (prop === "box-shadow" && /rgba?\(/i.test(decl.value)) report(decl, "box-shadow uses a raw color. Use a --shadow-* token.");
      else if (prop === "z-index" && /^-?\d/.test(decl.value.trim())) report(decl, "z-index uses a number. Use a --z-* token.");
      // DESIGN.md front matter sets letterSpacing 0px on every type role; agent and ui text keeps it.
      else if (prop === "letter-spacing" && !/^(?:0|0px|0em|normal)$/i.test(decl.value.trim())) report(decl, "letter-spacing must be 0 (DESIGN.md type roles set letterSpacing 0px).");
    });
  };
}
agentTokens.ruleName = "portfolio/agent-tokens";
agentTokens.meta = { url: "https://github.com/Absorber97/steve-oak-portfolio/blob/main/DESIGN.md" };

export default [
  stylelint.createPlugin(tokenContract.ruleName, tokenContract),
  stylelint.createPlugin(colorContract.ruleName, colorContract),
  stylelint.createPlugin(agentTokens.ruleName, agentTokens),
];
