// The forced-colors oracle (A23, tickets 196 and 201): judge one cue row on an open page, or focus on one control.
// Both return the problems found; an empty list is a pass. The page must already run with forcedColors: "active".

// Runs in the page. One color parser, one ink and one luminance serve every check.
function install() {
  const parse = value => {
    const n = (value.match(/[\d.]+/g) ?? []).map(Number);
    const scale = value.startsWith("color(") ? 255 : 1;
    return [n[0] * scale, n[1] * scale, n[2] * scale, n[3] ?? 1];
  };
  // An rgb key, or "" for a fully transparent color.
  const ink = value => { const [r, g, b, a] = parse(value); return a === 0 ? "" : `${r},${g},${b}`; };
  const lum = ([r, g, b]) => [r, g, b].map(c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
  const body = () => getComputedStyle(document.body);

  // An icon counts only when the svg itself shows: visible, non-zero, and some shape strokes or fills unlike the canvas.
  const paintedIcon = node => {
    const canvas = ink(body().backgroundColor);
    const svg = node.querySelector("svg");
    if (!svg || !svg.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    const { width, height } = svg.getBoundingClientRect();
    return width > 0 && height > 0 && [svg, ...svg.querySelectorAll("*")].some(shape => {
      const style = getComputedStyle(shape);
      return ["fill", "stroke"].some(side => style[side] !== "none" && ![canvas, ""].includes(ink(style[side])));
    });
  };

  // Every property here survives forced colors and is not a color; opacity is left out on purpose, a faded twin is still color alone.
  const look = node => {
    const text = ink(body().color);
    const shown = (style, side) => style[`${side}Style`] === "none" || parseFloat(style[`${side}Width`]) === 0 ? "none" : `${style[`${side}Style`]} ${style[`${side}Width`]}`;
    const of = style => [shown(style, "borderTop"), shown(style, "outline"), style.fontWeight, style.textDecorationLine, style.stroke === "none" ? "none" : style.strokeWidth, style.strokeDasharray, ink(style.backgroundColor) === text ? "solid" : "hollow"].join(" ");
    const part = pseudo => { const mark = getComputedStyle(node, pseudo); return mark.content === "none" ? "" : `${of(mark)} ${mark.width}x${mark.height}`; };
    return `${of(getComputedStyle(node))} ${paintedIcon(node) ? "icon" : ""} | ${part("::before")} | ${part("::after")}`;
  };

  // A mark is painted when it shows an icon, or one of its parts draws a border or a fill unlike the canvas (any alpha).
  const unpainted = (nodes, parts = ["", "::before", "::after"]) => {
    const canvas = ink(body().backgroundColor);
    return nodes.filter(node => !(parts.includes("") && paintedIcon(node)) && parts.map(part => getComputedStyle(node, part || null)).every(style => style.content === "none" ||
      (style.borderTopStyle === "none" || parseFloat(style.borderTopWidth) === 0) && [canvas, ""].includes(ink(style.backgroundColor)))).length;
  };

  // Chromium draws a Canvas backplate behind forced text (forced-color-adjust: auto), so that text reads against the canvas.
  const lowContrast = root => {
    const canvas = parse(body().backgroundColor);
    const behind = node => {
      if (getComputedStyle(node).forcedColorAdjust === "auto") return canvas;
      for (let at = node; at; at = at.parentElement) { const color = parse(getComputedStyle(at).backgroundColor); if (color[3] >= 0.5) return color; }
      return parse(getComputedStyle(document.documentElement).backgroundColor);
    };
    return [...root.querySelectorAll("*")].filter(node => node.checkVisibility() && [...node.childNodes].some(child => child.nodeType === 3 && child.textContent.trim())).flatMap(node => {
      const ratio = contrast(parse(getComputedStyle(node).color), behind(node));
      return ratio < 4.5 ? [`${node.className || node.tagName} ${ratio.toFixed(2)}`] : [];
    });
  };

  // The outline is drawn outside the box, so it is read, alpha composited, against the parent's painted background.
  const focusRing = () => {
    const node = document.activeElement;
    const style = getComputedStyle(node);
    let ground = parse(body().backgroundColor);
    for (let at = node.parentElement; at; at = at.parentElement) {
      const color = parse(getComputedStyle(at).backgroundColor);
      if (getComputedStyle(at).forcedColorAdjust === "auto" || color[3] >= 0.5) { if (color[3] >= 0.5) ground = color; break; }
    }
    const [r, g, b, a] = parse(style.outlineColor);
    const ring = [r, g, b].map((c, i) => a * c + (1 - a) * ground[i]);
    return { visible: node.matches(":focus-visible"), drawn: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0, ratio: contrast(ring, ground), color: style.outlineColor };
  };

  window.oakForcedColors = { look, unpainted, lowContrast, focusRing };
}

/**
 * Judge one cue row. `on` and `off` must differ in something other than color, every `marks` node stays painted in its
 * `parts`, `text` says the state in words, and no text under `.oak-conversation` falls under 4.5:1.
 * @param {import("playwright").Page} page
 * @param {{ block: string, on?: string, off?: string, marks?: string, parts?: string[], text?: string }} cue
 * @returns {Promise<string[]>}
 */
export async function judgeCue(page, cue) {
  await page.evaluate(install);
  const problems = [];
  if (cue.on) {
    if (!(await page.locator(cue.on).count() > 0 && await page.locator(cue.off).count() > 0)) return [`${cue.on} and ${cue.off} both render`];
    if (!await page.locator(cue.on).first().isVisible()) return [`${cue.on} is visible`];
    const look = selector => page.locator(selector).first().evaluate(node => window.oakForcedColors.look(node));
    const [on, off] = [await look(cue.on), await look(cue.off)];
    if (on === off) problems.push(`${cue.block}: the cue differs only by color (${on})`);
  }
  if (cue.marks) {
    if (!await page.locator(cue.marks).first().isVisible()) return [...problems, `${cue.marks} is visible`];
    if (await page.locator(cue.marks).evaluateAll((nodes, parts) => window.oakForcedColors.unpainted(nodes, parts ?? undefined), cue.parts ?? null)) problems.push(`${cue.marks} paint like the canvas, so they vanish`);
  }
  if (cue.text && !(await page.locator(cue.text).first().innerText()).trim()) problems.push(`${cue.text} says the state in words`);
  const low = await page.locator(".oak-conversation").first().evaluate(root => window.oakForcedColors.lowContrast(root));
  if (low.length) problems.push(`no text under 4.5:1 against its background: ${low.join(", ")}`);
  return problems;
}

/**
 * Judge focus on one control: Tab lands on `target`, it draws an outline, and the outline is at least 3:1 against
 * the background it sits on.
 * @param {import("playwright").Page} page
 * @param {{ block: string, target: string }} cue
 * @returns {Promise<string[]>}
 */
export async function judgeFocus(page, cue) {
  await page.evaluate(install);
  const target = page.locator(cue.target).first();
  await target.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  if (!await target.evaluate(node => node === document.activeElement)) return [`Tab lands on ${cue.target}`];
  const ring = await page.evaluate(() => window.oakForcedColors.focusRing());
  if (!(ring.visible && ring.drawn)) return [`${cue.target} draws a focus outline`];
  return ring.ratio >= 3 ? [] : [`${cue.block}: focus outline ${ring.color} is ${ring.ratio.toFixed(2)}:1 against its background, under 3:1`];
}
