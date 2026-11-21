export const JUDGE_WIDTHS = [320, 390, 768, 1024, 1440, 1920];

export const GALLERY_PAGE_WIDTHS = [390, 1440];
export const GALLERY_LAYOUT_WIDTHS = [320, 390, 1440];

export const RULE_REFS = {
  "card-in-card": "R6-C22",
  "icon-doubling": "R6-C8",
  "uneven-row": "R6-C21",
  "hue-count": "R6 color restraint",
  "tight-spacing": "R6 spacing floor",
  "edge-miss": "R6-C16",
  "stray-blur": "Q22 B",
  "white-panel": "R10-C2",
  "no-picture": "QJ9",
  "case-image-frame": "QJ10",
  "glass-contrast": "QJ11",
  "text-overlap": "QJ13",
  "reflow": "QJ13",
  "metric-numeral": "QJ15",
  "prose-cell": "QJ15",
  "top-bar": "QJ16",
  "heading-break": "QJ18",
  "capsule-radius": "TS1",
  "elevation-tier": "TS1",
  "inert-closed": "BU17",
  "verified-claim": "PV2",
  "invented-chart": "PT11",
  "generated-image": "PT11",
  "emoji-icon": "PT11",
  "plus-n-sources": "PT11",
  "dense-paragraph": "PT11",
};

export const PAGE_RULE_IDS = [
  "card-in-card", "icon-doubling", "uneven-row", "hue-count", "tight-spacing", "edge-miss", "stray-blur", "white-panel",
  "no-picture", "case-image-frame", "glass-contrast", "metric-numeral", "prose-cell", "top-bar", "capsule-radius",
  "elevation-tier", "inert-closed", "verified-claim", "invented-chart", "generated-image", "emoji-icon", "plus-n-sources",
  "dense-paragraph",
];

export const LAYOUT_RULE_IDS = ["text-overlap", "reflow", "heading-break"];

export const DEFAULTS = {
  root: ".oak-workspace, .oc",
  blockSelector: ".oak-openui > :not(p), [data-block]",
  pendingSelector: "[aria-busy=true], [data-pending], [class*=skeleton]",
  answerScope: ".oak-openui, .ui-message:not(:has(.ui-bubble:not(.ui-bubble--ghost)))",
  hueExempt: "[data-candy-tile], [data-cover-accent], img, picture, canvas, video",
  whiteOk: "[data-candy-tile], [data-media], .oak-media-tile",
  floating: "[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [role=tooltip], [popover], [data-floating], [data-sheet], [class*=__popup], [class*=popover], [class*=__sheet], [class*=drawer], [class*=dialog]",
  glass: ".site-header__inner, .oak-composer__surface, .work-toc__copy-menu",
  caseImage: "img[src*='/assets/generated/work/'], img[data-case-image]",
  mediaFrame: "[data-media], [data-backdrop], .oak-media-tile",
  metricNumeral: ".oak-openui__metric-value > span:first-child, [data-metric-numeral]",
  topBar: ".oak-workspace__header, [data-top-bar]",
  search: "[data-nav-search], button, a",
  shadowTiers: ["--shadow-popover", "--shadow-workspace", "--shadow-glass"],
  pictureOk: {},
  tickingText: ".ui-rolling-number",
};

const makeCtx = (cfg) => {
  const root = document.querySelector(cfg.root) || document.body;
  const css = (node) => getComputedStyle(node);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const pen = canvas.getContext("2d", { willReadFrequently: true });
  const memo = new Map();
  const channel = (token, scale) => (token.endsWith("%") ? (parseFloat(token) / 100) * scale : Number(token));
  const rgba = (value) => {
    if (memo.has(value)) return memo.get(value);
    let out;
    let m = /^rgba?\(([^)]+)\)$/.exec(value);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean);
      out = [channel(p[0], 255), channel(p[1], 255), channel(p[2], 255), p.length > 3 ? channel(p[3], 1) : 1];
    } else if ((m = /^color\(srgb\s+([^)]+)\)$/.exec(value))) {
      const p = m[1].split(/[\s/]+/).filter(Boolean);
      out = [Number(p[0]) * 255, Number(p[1]) * 255, Number(p[2]) * 255, p.length > 3 ? channel(p[3], 1) : 1];
    } else {
      pen.clearRect(0, 0, 1, 1);
      pen.fillStyle = "#000";
      pen.fillStyle = value;
      pen.fillRect(0, 0, 1, 1);
      const d = pen.getImageData(0, 0, 1, 1).data;
      out = [d[0], d[1], d[2], d[3] / 255];
    }
    memo.set(value, out);
    return out;
  };
  const hsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const hi = Math.max(r, g, b), lo = Math.min(r, g, b), l = (hi + lo) / 2, d = hi - lo;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
  const box = (node) => node.getBoundingClientRect();
  const label = (node) => node.tagName.toLowerCase() + (typeof node.className === "string" && node.className.trim() ? "." + node.className.trim().split(/\s+/)[0] : "");
  const skip = "script, style, [hidden], [inert], .sr-only";
  const shut = (node) => {
    for (let d = node.closest("details:not([open])"); d; d = d.parentElement && d.parentElement.closest("details:not([open])")) {
      const summary = d.querySelector(":scope > summary");
      if (!(summary && summary.contains(node))) return true;
    }
    return false;
  };
  const live = (node) => node.getClientRects().length > 0 && css(node).visibility !== "hidden" && !node.closest(skip) && !shut(node);
  const own = (node) => [...node.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  const ok = (rule, node) => {
    for (let a = node; a && a.getAttribute; a = a.parentElement) {
      const v = a.getAttribute("data-judge-ok");
      if (v && v.split(";").some((part) => part.trim().startsWith(rule + ":"))) return true;
    }
    return false;
  };
  const clear = (value) => rgba(value)[3] < 0.03;
  const sides = (s) => ["Top", "Right", "Bottom", "Left"].filter((k) => parseFloat(s["border" + k + "Width"]) > 0 && s["border" + k + "Style"] !== "none" && rgba(s["border" + k + "Color"])[3] > 0.02).length;
  const framed = (node) => {
    const s = css(node);
    if (/text/.test(s.webkitBackgroundClip || s.backgroundClip)) return false;
    return !clear(s.backgroundColor) || sides(s) >= 3 || (/gradient/.test(s.backgroundImage) && parseFloat(s.borderTopLeftRadius) >= 4);
  };
  const capsule = (node) => { const b = box(node); const r = parseFloat(css(node).borderTopLeftRadius) || 0; return r > 0 && r >= Math.min(b.width, b.height) / 2 - 0.5; };
  const chip = (node) => node.matches("button, input, textarea, select, [role=button], [role=tab], [role=checkbox], [role=switch]") || (capsule(node) && box(node).height <= 64);
  const rb = box(root);
  const isCard = (node) => {
    if (node === root || /^(IMG|PICTURE|VIDEO|CANVAS)$/.test(node.tagName) || !framed(node) || chip(node)) return false;
    const b = box(node);
    if (b.width < 96 || b.height < 40) return false;
    if (b.width >= rb.width * 0.95 && b.height >= rb.height * 0.5) return false;
    return (parseFloat(css(node).borderTopLeftRadius) || 0) >= 12;
  };
  const all = [...root.querySelectorAll("*")].filter((node) => !node.parentElement.closest("svg") && live(node) && !node.matches("[role=tooltip], .ui-dialog__backdrop"));
  const blocks = [...root.querySelectorAll(cfg.blockSelector)].filter((node) => live(node) && !node.matches(cfg.pendingSelector));
  const kind = (block) => block.getAttribute("data-kind") || (String(block.className).split(" ")[0] || block.tagName.toLowerCase()).replace(/^oak-openui[-_]+/, "");
  const answers = [...root.querySelectorAll(cfg.answerScope)].filter(live);
  const words = (node) => ((node.innerText || "").trim().replace(/\s+/g, " ").split(" ").filter(Boolean).length);
  const controls = "button, a, summary, label, [role=button], [role=tab], [role=menuitem], [role=menuitemradio], [role=option], [role=radio], [role=checkbox]";
  return { root, css, rgba, hsl, lum, ratio, over, box, label, live, shut, own, ok, framed, chip, capsule, isCard, all, blocks, kind, answers, words, controls, cfg };
};

const pageRules = {
  "card-in-card": (c) => {
    const out = [];
    const cards = c.all.filter(c.isCard);
    const set = new Set(cards);
    const parentCard = (node) => { for (let a = node.parentElement; a && a !== c.root; a = a.parentElement) if (set.has(a)) return a; return null; };
    const kids = new Map();
    for (const card of cards) {
      const p = parentCard(card);
      if (p && !c.ok("card-in-card", card)) (kids.get(p) || kids.set(p, []).get(p)).push(card);
    }
    for (const [p, list] of kids) {
      if (list.length === 1 && !c.own(p)) {
        const pb = c.box(p), kb = c.box(list[0]);
        const gaps = [kb.left - pb.left, pb.right - kb.right, kb.top - pb.top, pb.bottom - kb.bottom];
        if (Math.max(...gaps) <= 17) { out.push(`${c.label(p)} is a wrapper around ${c.label(list[0])}`); continue; }
      }
      for (const card of list) out.push(`${c.label(card)} sits inside card ${c.label(p)}`);
    }
    return out;
  },
  "icon-doubling": (c) => {
    const units = "li, tr, dt, dd, article, section, [role=listitem], [data-unit]";
    const icons = c.all.filter((node) => node.matches("svg[data-icon]") && !node.closest(c.controls) && c.box(node).width <= 64 && !c.ok("icon-doubling", node));
    const unitOf = (icon) => { for (let a = icon.parentElement; a && a !== c.root; a = a.parentElement) if (a.matches(units) || c.isCard(a)) return a; return c.root; };
    const rows = icons.map((icon) => ({ name: icon.getAttribute("data-icon"), unit: unitOf(icon) }));
    const byUnit = new Map();
    for (const row of rows) (byUnit.get(row.unit) || byUnit.set(row.unit, []).get(row.unit)).push(row);
    const out = [];
    for (const [unit, list] of byUnit) if (unit !== c.root && list.length > 1) out.push(`${c.label(unit)} holds ${list.length} icons (${list.map((r) => r.name).join(", ")})`);
    for (const a of rows) for (const b of rows) if (a !== b && a.unit !== c.root && a.name === b.name && a.unit !== b.unit && a.unit.contains(b.unit)) out.push(`icon ${a.name} repeats in ${c.label(a.unit)} and in ${c.label(b.unit)} inside it`);
    return out;
  },
  "uneven-row": (c) => {
    const out = [];
    for (const parent of c.all) {
      if (!/grid|flex/.test(c.css(parent).display)) continue;
      const kids = [...parent.children].filter((k) => c.isCard(k) && c.box(k).width > 80 && !c.ok("uneven-row", k));
      if (kids.length < 2) continue;
      const rows = new Map();
      for (const kid of kids) {
        const b = c.box(kid);
        const key = [...rows.keys()].find((top) => Math.abs(top - b.top) <= 2) ?? b.top;
        rows.set(key, [...(rows.get(key) || []), b.height]);
      }
      for (const heights of rows.values()) if (heights.length > 1 && Math.max(...heights) - Math.min(...heights) > 2) out.push(`${c.label(kids[0])} siblings ${heights.map(Math.round).join(" vs ")}px tall in one row`);
    }
    return out;
  },
  "hue-count": (c) => {
    const out = [];
    for (const block of c.blocks) {
      if (c.ok("hue-count", block)) continue;
      const buckets = new Map();
      const see = (value, node, what, min = 0.08) => {
        const v = c.rgba(value);
        if (v[3] < min) return;
        const [h, s, l] = c.hsl(v);
        if (s > 0.3 && l >= 0.15 && l <= 0.9) { const k = Math.floor(h / 30) % 12; if (!buckets.has(k)) buckets.set(k, `${what} ${c.label(node)}`); }
      };
      for (const node of [block, ...block.querySelectorAll("*")]) {
        if (node.closest(c.cfg.hueExempt)) continue;
        const inSvg = !!node.closest("svg");
        if (!inSvg && !c.live(node)) continue;
        const s = c.css(node);
        if (inSvg) {
          if (node.tagName.toLowerCase() === "svg") continue;
          if (s.fill !== "none") see(s.fill, node, "icon fill");
          if (s.stroke !== "none") see(s.stroke, node, "icon stroke");
          continue;
        }
        if (c.own(node)) see(s.color, node, "text", 0.5);
        see(s.backgroundColor, node, "fill");
        if (c.framed(node) && parseFloat(s.borderTopWidth) > 0) see(s.borderTopColor, node, "border");
      }
      if (buckets.size > 3) out.push(`${c.kind(block)} block shows ${buckets.size} hues: ${[...buckets].map(([k, what]) => `${k * 30}deg ${what}`).join("; ")}`);
    }
    return out;
  },
  "tight-spacing": (c) => {
    const out = [];
    const targets = c.all.filter((node) => node.matches("a, button, [role=button]") && !c.ok("tight-spacing", node));
    const fused = (a, b) => a.parentElement === b.parentElement && (b.parentElement.matches("[role=tablist], [role=radiogroup], [role=group], [data-segmented]") || c.framed(b.parentElement));
    for (let i = 0; i < targets.length; i++) for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i], b = targets[j];
      if (a.contains(b) || b.contains(a) || fused(a, b)) continue;
      const ra = c.box(a), rb = c.box(b);
      const shareY = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top) >= Math.min(ra.height, rb.height) * 0.5;
      const gap = shareY ? Math.max(rb.left - ra.right, ra.left - rb.right) : -1;
      if (gap >= 0 && gap < 7.5) out.push(`${c.label(a)} and ${c.label(b)} are ${Math.round(gap * 10) / 10}px apart`);
    }
    const holdsText = (frame) => {
      const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!n.textContent.trim()) continue;
        let inner = false;
        for (let a = n.parentElement; a && a !== frame; a = a.parentElement) if (c.framed(a) && !a.closest("svg")) { inner = true; break; }
        if (!inner) return true;
      }
      return false;
    };
    for (const node of c.all) {
      const b = c.box(node);
      if (node.matches("svg") || !c.framed(node) || c.chip(node) || b.height < 36 || b.width < 96 || c.ok("tight-spacing", node) || !holdsText(node)) continue;
      const s = c.css(node);
      const pads = ["Top", "Right", "Bottom", "Left"].map((k) => Math.round(parseFloat(s["padding" + k]) || 0));
      const pad = Math.min(...pads);
      if (pad < 12) out.push(`${c.label(node)} holds text with ${pad}px padding${new Set(pads).size > 1 ? ` (${pads.join(" ")})` : ""}`);
    }
    return out;
  },
  "edge-miss": (c) => {
    const out = [];
    const dist = (p, r) => Math.hypot(Math.max(r.left - p.x, 0, p.x - r.right), Math.max(r.top - p.y, 0, p.y - r.bottom));
    for (const edge of c.root.querySelectorAll("svg [data-edge]")) {
      if (!c.live(edge.ownerSVGElement) || c.ok("edge-miss", edge)) continue;
      const from = c.root.querySelector(`[data-node="${edge.dataset.from}"]`), to = c.root.querySelector(`[data-node="${edge.dataset.to}"]`);
      const name = `edge ${edge.dataset.from} to ${edge.dataset.to}`;
      if (!from || !to) { out.push(`${name} has no node box`); continue; }
      if (!c.live(from) || !c.live(to)) continue;
      const fb = c.box(from), tb = c.box(to), m = edge.getScreenCTM(), len = edge.getTotalLength();
      const at = (t) => { const q = edge.getPointAtLength(t); return { x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }; };
      if (edge.dataset.edge === "ribbon") {
        const pts = Array.from({ length: 160 }, (_, i) => at((len * i) / 159));
        const lo = Math.min(...pts.map((p) => p.x)), hi = Math.max(...pts.map((p) => p.x));
        const [lb, rb] = fb.left <= tb.left ? [fb, tb] : [tb, fb];
        const dl = Math.max(...pts.filter((p) => p.x <= lo + 1).map((p) => dist(p, lb))), dr = Math.max(...pts.filter((p) => p.x >= hi - 1).map((p) => dist(p, rb)));
        if (dl > 4 || dr > 4) out.push(`ribbon ${edge.dataset.from} to ${edge.dataset.to} ends ${Math.round(dl)}/${Math.round(dr)}px from its nodes`);
        continue;
      }
      const p0 = at(0), p1 = at(len);
      if (!((dist(p0, fb) <= 4 && dist(p1, tb) <= 4) || (dist(p1, fb) <= 4 && dist(p0, tb) <= 4))) out.push(`${name} ends ${Math.round(Math.min(dist(p0, fb), dist(p1, fb)))}/${Math.round(Math.min(dist(p0, tb), dist(p1, tb)))}px from its nodes`);
    }
    return out;
  },
  "stray-blur": (c) => {
    const out = [];
    const afloat = (node) => {
      if (node === c.root) return c.root.matches(c.cfg.floating);
      for (let a = node; a && a !== c.root && a !== document.documentElement; a = a.parentElement) {
        if (/fixed|sticky|absolute/.test(c.css(a).position) || a.matches(c.cfg.floating) || a.matches(c.cfg.glass)) return true;
      }
      return false;
    };
    for (const node of document.body.querySelectorAll("*")) {
      const s = c.css(node);
      const filter = s.backdropFilter || s.webkitBackdropFilter;
      if (!filter || filter === "none" || !c.live(node) || c.ok("stray-blur", node) || afloat(node)) continue;
      out.push(`${c.label(node)} blurs what is behind it (${filter}) but is not a floating layer or sheet`);
    }
    return out;
  },
  "white-panel": (c) => c.all
    .filter((node) => !c.chip(node) && !node.closest(c.cfg.whiteOk) && !/^(IMG|PICTURE|VIDEO|CANVAS)$/.test(node.tagName) && !c.ok("white-panel", node))
    .filter((node) => {
      const b = c.box(node);
      if (b.width < 96 || b.height < 40) return false;
      const v = c.rgba(c.css(node).backgroundColor);
      return v[3] >= 0.85 && c.lum(v) > 0.6;
    })
    .map((node) => `${c.label(node)} paints a bright ${Math.round(c.box(node).width)}x${Math.round(c.box(node).height)} panel on the dark surface`),
  "no-picture": (c) => {
    if (innerWidth < 1000) return [];
    const quiet = /^(arrow|chevron|cancel|close|tick|add|plus|more|external|copy|send|menu|search)/i;
    const out = [];
    for (const block of c.blocks) {
      const kind = c.kind(block);
      if (block.getAttribute("data-picture-ok") || c.cfg.pictureOk[kind] || c.ok("no-picture", block)) continue;
      const pictured = [...block.querySelectorAll("*")].some((node) => {
        if (!c.live(node)) return false;
        if (node.matches("img, picture, canvas, video, [data-logo], [data-visual], [data-media], [data-node], [data-drawing]")) return true;
        if (node.matches("svg[data-icon]")) return !quiet.test(node.getAttribute("data-icon"));
        if (node.matches("svg")) return c.box(node).width >= 24;
        return /url\(/.test(c.css(node).backgroundImage) && Math.min(c.box(node).width, c.box(node).height) >= 24;
      });
      if (!pictured) out.push(`${kind} block shows no picture and declares no reason`);
    }
    return out;
  },
  "case-image-frame": (c) => [...c.root.querySelectorAll(c.cfg.caseImage)]
    .filter((img) => c.live(img) && c.box(img).width >= 96 && !img.closest(c.cfg.mediaFrame) && !c.ok("case-image-frame", img))
    .map((img) => `${c.label(img.parentElement)} shows a case image ${Math.round(c.box(img).width)}px wide outside a media frame`),
  "glass-contrast": (c) => {
    const out = [];
    const hasText = (node) => [...node.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const textNodes = (layer) => [...layer.querySelectorAll("*"), layer].filter((node) => hasText(node) && c.live(node));
    for (const layer of document.body.querySelectorAll("*")) {
      const s = c.css(layer);
      const filter = s.backdropFilter || s.webkitBackdropFilter;
      if (!filter || filter === "none" || !c.live(layer) || c.ok("glass-contrast", layer)) continue;
      const fill = c.rgba(s.backgroundColor);
      if (fill[3] >= 0.999) continue;
      const mine = textNodes(layer);
      if (!mine.length) continue;
      const b = c.box(layer), under = new Set();
      for (let i = 1; i < 6; i++) for (let j = 1; j < 4; j++) {
        const x = b.left + (b.width * i) / 6, y = b.top + (b.height * j) / 4;
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
        for (const node of document.elementsFromPoint(x, y)) if (!layer.contains(node) && !node.contains(layer) && hasText(node) && c.css(node).visibility !== "hidden" && Number(c.css(node).opacity) > 0) under.add(node);
      }
      if (!under.size) continue;
      const worst = [...under].map((node) => c.rgba(c.css(node).color)).sort((p, q) => c.lum(q) - c.lum(p))[0];
      const backdrop = c.over(fill, worst);
      let low = null;
      for (const node of mine) {
        let covered = false;
        const stack = [];
        for (let a = node; a && a !== layer; a = a.parentElement) {
          const bg = c.rgba(c.css(a).backgroundColor);
          if (bg[3] >= 0.999) { covered = true; break; }
          if (bg[3] > 0) stack.unshift(bg);
        }
        if (covered) continue;
        const ns = c.css(node);
        if (c.rgba(ns.color)[3] < 0.05 || /text/.test(ns.webkitBackgroundClip || ns.backgroundClip)) continue;
        const base = stack.reduce((acc, bg) => c.over(bg, acc), backdrop);
        const size = parseFloat(ns.fontSize), large = size >= 24 || (size >= 18.66 && Number(ns.fontWeight) >= 700);
        const r = c.ratio(c.over(c.rgba(ns.color), base), base);
        if (r < (large ? 3 : 4.5) && (!low || r < low.r)) low = { r, node };
      }
      if (low) out.push(`${c.label(layer)} (fill alpha ${fill[3].toFixed(2)}) leaves ${c.label(low.node)} at ${low.r.toFixed(2)}:1 over the brightest text behind it`);
    }
    return out;
  },
  "metric-numeral": (c) => {
    const out = [];
    for (const node of c.root.querySelectorAll(c.cfg.metricNumeral)) {
      if (!c.live(node) || c.ok("metric-numeral", node)) continue;
      const s = c.css(node), size = parseFloat(s.fontSize), text = node.textContent.trim().slice(0, 24);
      if (size < 40) out.push(`"${text}" is ${Math.round(size)}px, under 40px`);
      if (!/gradient/.test(s.backgroundImage) || !/text/.test(s.webkitBackgroundClip || s.backgroundClip)) out.push(`"${text}" has no gradient fill`);
    }
    return out;
  },
  "prose-cell": (c) => {
    const out = [];
    const pen = document.createElement("canvas").getContext("2d");
    const text = (node) => (node.innerText || "").trim().replace(/\s+/g, " ");
    const perLine = (node) => {
      const s = c.css(node);
      pen.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const inner = node.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      return { inner, chars: inner / (pen.measureText(text(node)).width / text(node).length) };
    };
    for (const grid of c.all) {
      const s = c.css(grid);
      if (c.ok("prose-cell", grid) || /auto|scroll/.test(s.overflowX)) continue;
      if (s.display === "grid" && s.gridTemplateColumns.split(" ").filter((t) => /px$/.test(t)).length >= 2) {
        const cells = [...grid.children].filter((cell) => c.live(cell) && c.words(cell) >= 12);
        if (cells.length < 2) continue;
        for (const cell of cells) { const m = perLine(cell); if (m.chars < 28) out.push(`a grid cell (${c.label(cell)}) is ${Math.round(m.inner)}px wide, about ${Math.round(m.chars)} characters a line`); }
      } else if (s.display === "flex" && /^row/.test(s.flexDirection) && s.flexWrap === "nowrap") {
        const kids = [...grid.children].filter((k) => c.live(k));
        if (!kids.some((k) => c.box(k).width >= 48 && (k.matches("img, svg, picture, canvas") || c.words(k) < 4))) continue;
        for (const cell of kids.filter((k) => c.words(k) >= 12 && !k.matches("img, svg, picture, canvas"))) { const m = perLine(cell); if (m.chars < 28) out.push(`a row keeps a picture beside prose (${c.label(cell)}): about ${Math.round(m.chars)} characters a line`); }
      }
    }
    return out;
  },
  "top-bar": (c) => {
    const out = [];
    const phone = innerWidth <= 560;
    const named = (node) => (node.getAttribute("aria-label") || node.textContent || "").trim().replace(/\s+/g, " ");
    for (const bar of c.root.querySelectorAll(c.cfg.topBar)) {
      if (!c.live(bar) || c.ok("top-bar", bar)) continue;
      const entry = [...bar.querySelectorAll(c.cfg.search)].find((node) => c.live(node) && /search/i.test(named(node)));
      if (!entry) { out.push(`${c.label(bar)} has no named Search entry`); continue; }
      const b = c.box(entry);
      if (phone && (b.width < 43.5 || b.height < 43.5)) out.push(`${c.label(bar)} Search entry is ${Math.round(b.width)}x${Math.round(b.height)}px at ${innerWidth}px, under 44`);
    }
    return out;
  },
  "capsule-radius": (c) => {
    const out = [];
    const picks = "button, [role=button], [role=tab], [class*=chip], [class*=pill]";
    for (const node of c.all) {
      if (!node.matches(picks) || node.matches("ul, ol, [role=tablist]") || !c.framed(node) || c.ok("capsule-radius", node)) continue;
      const b = c.box(node);
      if (b.height > 64 || b.height < 20 || node.parentElement.matches("[role=tablist], [role=radiogroup], [data-segmented]")) continue;
      const r = parseFloat(c.css(node).borderTopLeftRadius) || 0;
      if (r < b.height / 2 - 1) out.push(`${c.label(node)} has radius ${Math.round(r)}px on ${Math.round(b.height)}px height, not a capsule`);
    }
    return out;
  },
  "elevation-tier": (c) => {
    const out = [];
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden";
    c.root.append(probe);
    const tiers = new Set(["none"]);
    for (const token of c.cfg.shadowTiers) { probe.style.boxShadow = `var(${token})`; tiers.add(c.css(probe).boxShadow); }
    probe.remove();
    for (const node of c.all) {
      const shadow = c.css(node).boxShadow;
      if (tiers.has(shadow) || c.ok("elevation-tier", node)) continue;
      const lifts = shadow.split(/,(?![^(]*\))/).map((part) => part.trim()).filter((part) => part && !/\binset\b/.test(part)).filter((part) => {
        const nums = part.replace(/(rgba?|color)\([^)]*\)/g, "").match(/-?[\d.]+px/g) || [];
        return nums.length >= 3 && parseFloat(nums[2]) > 0;
      });
      if (lifts.length) out.push(`${c.label(node)} lifts with "${lifts[0].slice(0, 48)}", outside the three elevation tiers`);
    }
    return out;
  },
  "inert-closed": (c) => {
    const out = [];
    const reach = "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])";
    for (const trigger of c.root.querySelectorAll("[aria-expanded=false][aria-controls]")) {
      const region = document.getElementById(trigger.getAttribute("aria-controls"));
      if (!region || c.ok("inert-closed", region)) continue;
      const s = c.css(region);
      const reachable = !region.hidden && !region.inert && !region.closest("[inert], [aria-hidden=true]") && s.display !== "none" && s.visibility !== "hidden" && s.contentVisibility !== "hidden";
      const closed = region.getBoundingClientRect().height < 2 || Number(s.opacity) === 0;
      const holds = region.querySelector(reach) || (region.textContent || "").trim();
      if (reachable && closed && holds) out.push(`${c.label(region)} is closed but still in the tab and reading order`);
    }
    for (const row of c.root.querySelectorAll("[data-filtered]:not([data-filtered=false])")) {
      const s = c.css(row);
      if (!row.hidden && !row.inert && s.display !== "none" && s.visibility !== "hidden" && !row.closest("[inert], [aria-hidden=true]") && !c.ok("inert-closed", row)) out.push(`${c.label(row)} is filtered out but still in the tab and reading order`);
    }
    return out;
  },
  "verified-claim": (c) => {
    const out = [];
    const claim = /\b(verified|fact[- ]?checked|accurate)\b/i;
    const marks = /^(tick|checkmark|verified|fileVerified|securityCheck)$/;
    for (const area of c.answers) {
      const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, el = node.parentElement;
        if (!node.textContent.trim() || !c.live(el) || c.ok("verified-claim", el)) continue;
        const hit = claim.exec(node.textContent);
        if (hit) out.push(`text says "${hit[0]}" in ${c.label(el)}`);
        if (/[\u2713\u2714\u2611\u2705]/.test(node.textContent)) out.push(`a check mark character sits in ${c.label(el)}`);
      }
      for (const icon of area.querySelectorAll("svg[data-icon]")) if (marks.test(icon.getAttribute("data-icon")) && c.live(icon) && !icon.closest(c.controls) && !c.ok("verified-claim", icon)) out.push(`check mark icon "${icon.getAttribute("data-icon")}" sits beside a fact in ${c.label(icon.parentElement)}`);
      for (const node of area.querySelectorAll("[aria-label], [title]")) if (claim.test(node.getAttribute("aria-label") || node.getAttribute("title")) && c.live(node)) out.push(`${c.label(node)} is labelled "${(node.getAttribute("aria-label") || node.getAttribute("title")).slice(0, 32)}"`);
    }
    return out;
  },
  "invented-chart": (c) => [...c.root.querySelectorAll("[data-chart]")]
    .filter((node) => c.live(node) && !node.getAttribute("data-source") && !c.ok("invented-chart", node))
    .map((node) => `${c.label(node)} draws a chart with no recorded source`),
  "generated-image": (c) => [...c.root.querySelectorAll("img[data-generated]:not([data-generated=false]), [data-image-origin=generated]")]
    .filter((node) => c.live(node) && !c.ok("generated-image", node))
    .map((node) => `${c.label(node)} shows a generated picture of a project`),
  "emoji-icon": (c) => {
    const out = [];
    for (const area of c.answers) {
      const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode, el = node.parentElement, text = node.textContent.trim();
        if (text && text.length <= 8 && /^[\p{Extended_Pictographic}\u200d\ufe0f\s]+$/u.test(text) && c.live(el) && !c.ok("emoji-icon", el)) out.push(`${c.label(el)} uses the emoji ${text} as an icon`);
      }
    }
    return out;
  },
  "plus-n-sources": (c) => {
    const out = [];
    for (const area of c.answers) {
      if (c.words(area) > 80) continue;
      for (const node of area.querySelectorAll("*")) if (c.live(node) && c.own(node) && /\+\s?\d+\s+(more\s+)?sources?\b/i.test(node.textContent) && !c.ok("plus-n-sources", node)) out.push(`${c.label(node)} says "${node.textContent.trim().slice(0, 24)}" on a short answer`);
    }
    return out;
  },
  "dense-paragraph": (c) => {
    const out = [];
    for (const area of c.answers) for (const node of area.querySelectorAll("p, td, th, dd, [role=cell]")) {
      if (!c.live(node) || c.ok("dense-paragraph", node)) continue;
      const limit = node.matches("p") ? 80 : 25;
      if (c.words(node) > limit) out.push(`${c.label(node)} packs ${c.words(node)} words into one ${node.matches("p") ? "paragraph" : "cell"}`);
    }
    return out;
  },
};

const layoutRules = {
  "text-overlap": (c) => {
    const out = [];
    const layerOf = (node) => {
      for (let a = node; a && a !== document.body; a = a.parentElement) {
        const s = c.css(a);
        if (s.position === "fixed" || s.position === "sticky") return a;
        if (/auto|scroll/.test(s.overflowY) && a.scrollHeight > a.clientHeight + 1) return a;
      }
      return null;
    };
    const runs = [];
    const walker = document.createTreeWalker(c.root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode, el = node.parentElement;
      if (!node.textContent.trim() || !el || el.closest("svg") || el.closest(c.cfg.tickingText) || !c.live(el) || Number(c.css(el).opacity) === 0 || c.ok("text-overlap", el)) continue;
      let clip = { l: 0, t: -1e9, r: innerWidth, b: 1e9 }, gone = false;
      for (let a = el; a && a !== document.body; a = a.parentElement) {
        const s = c.css(a);
        if (Number(s.opacity) === 0) { gone = true; break; }
        const cutX = /hidden|clip/.test(s.overflowX), cutY = /hidden|clip/.test(s.overflowY);
        if (!cutX && !cutY) continue;
        const q = a.getBoundingClientRect();
        if (cutX) clip = { ...clip, l: Math.max(clip.l, q.left), r: Math.min(clip.r, q.right) };
        if (cutY) clip = { ...clip, t: Math.max(clip.t, q.top), b: Math.min(clip.b, q.bottom) };
      }
      if (gone) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const q of range.getClientRects()) {
        const run = { l: Math.max(q.left, clip.l), t: Math.max(q.top, clip.t), r: Math.min(q.right, clip.r), b: Math.min(q.bottom, clip.b), node, el, layer: layerOf(el) };
        if (run.r - run.l >= 2 && run.b - run.t >= 2) runs.push(run);
      }
    }
    runs.sort((p, q) => p.t - q.t);
    for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length && runs[j].t < runs[i].b; j++) {
      const a = runs[i], b = runs[j];
      if (a.node === b.node || a.layer !== b.layer) continue;
      const iw = Math.min(a.r, b.r) - Math.max(a.l, b.l), ih = Math.min(a.b, b.b) - Math.max(a.t, b.t);
      if (iw < 3 || ih < 3) continue;
      const x = (Math.max(a.l, b.l) + Math.min(a.r, b.r)) / 2, y = (Math.max(a.t, b.t) + Math.min(a.b, b.b)) / 2;
      const stack = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? document.elementsFromPoint(x, y) : [];
      const ia = stack.findIndex((n) => a.el.contains(n)), ib = stack.findIndex((n) => b.el.contains(n));
      if (ia >= 0 && ib >= 0 && stack.slice(0, Math.max(ia, ib)).some((n) => !a.el.contains(n) && !b.el.contains(n) && !(n.contains(a.el) && n.contains(b.el)) && (/^(IMG|VIDEO|CANVAS)$/.test(n.tagName) || c.rgba(c.css(n).backgroundColor)[3] > 0.6))) continue;
      out.push(`"${a.node.textContent.trim().slice(0, 24)}" (${c.label(a.el)}) overlaps "${b.node.textContent.trim().slice(0, 24)}" (${c.label(b.el)})`);
    }
    return out;
  },
  "reflow": (c) => {
    const out = [];
    const de = document.documentElement;
    if (de.scrollWidth - innerWidth > 1) out.push(`the page scrolls sideways by ${de.scrollWidth - innerWidth}px`);
    const rootBox = c.box(c.root);
    const spill = c.root === document.body ? 0 : Math.round(Math.max(c.root.scrollWidth - c.root.clientWidth, rootBox.right - innerWidth, -rootBox.left));
    if (spill > 1) out.push(`${c.label(c.root)} overflows sideways by ${spill}px`);
    const blockOf = (n) => { let a = n.parentElement; while (a && c.css(a).display === "inline" && a.parentElement) a = a.parentElement; return a; };
    const lines = (host) => {
      const size = parseFloat(c.css(host).fontSize) || 16, tops = [];
      const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!n.textContent.trim() || n.parentElement.closest("svg") || !c.live(n.parentElement) || blockOf(n) !== host) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const q of range.getClientRects()) if (q.width > 0 && q.height > 0) tops.push(q.top);
      }
      tops.sort((p, q) => p - q);
      let count = 0, last = -1e9;
      for (const t of tops) if (t - last > size * 0.55) { count++; last = t; }
      return count;
    };
    const seen = new Set();
    for (const node of c.root.querySelectorAll("*")) {
      if (!c.live(node) || node.closest("svg") || !c.own(node) || c.ok("reflow", node)) continue;
      let host = node;
      while (host && c.css(host).display === "inline" && host.parentElement) host = host.parentElement;
      if (seen.has(host)) continue;
      const s = c.css(host);
      const content = host.clientWidth - (parseFloat(s.paddingLeft) || 0) - (parseFloat(s.paddingRight) || 0);
      if (content <= 0 || content >= 72) continue;
      seen.add(host);
      if (s.whiteSpace === "nowrap" || host.closest("button, [role=tab], select, option")) continue;
      if (lines(host) >= 2) out.push(`${c.label(host)} is ${Math.round(content)}px wide and wraps "${(host.innerText || "").trim().slice(0, 24)}"`);
    }
    return out;
  },
  "heading-break": (c) => {
    if (innerWidth > 430) return [];
    const out = [];
    for (const heading of c.root.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]")) {
      if (!c.live(heading) || c.ok("heading-break", heading)) continue;
      const size = parseFloat(c.css(heading).fontSize);
      const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (const word of node.textContent.matchAll(/[^\s\-\u2010\u2011]+/g)) {
          const range = document.createRange();
          range.setStart(node, word.index);
          range.setEnd(node, word.index + word[0].length);
          const tops = [...range.getClientRects()].filter((q) => q.width > 0).map((q) => q.top);
          if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > size * 0.6) out.push(`"${word[0]}" breaks across two lines in ${c.label(heading)} at ${innerWidth}px`);
        }
      }
    }
    return out;
  },
};

const script = (rules, config) => `(() => {
  const cfg = ${JSON.stringify(config)};
  const c = (${makeCtx})(cfg);
  const rules = {${Object.entries(rules).map(([id, fn]) => `${JSON.stringify(id)}: ${fn}`).join(",\n")}};
  const found = [];
  for (const [rule, run] of Object.entries(rules)) {
    try { for (const detail of run(c)) found.push({ rule, detail }); } catch (error) { found.push({ rule, detail: "judge error: " + error.message }); }
  }
  return found;
})()`;

const withRef = (found, extra = {}) => found.map((finding) => ({ ...finding, ref: RULE_REFS[finding.rule], ...extra }));

export const describeFinding = (finding) => `${finding.rule} (${finding.ref}${finding.width ? `, ${finding.width}px` : ""}): ${finding.detail}`;

export const judgePage = async (page, options = {}) => {
  const config = { ...DEFAULTS, ...options };
  const only = options.rules ?? PAGE_RULE_IDS;
  const rules = Object.fromEntries(Object.entries(pageRules).filter(([id]) => only.includes(id)));
  return withRef(await page.evaluate(script(rules, config)));
};

export const judgeLayout = async (page, options = {}) => {
  const config = { ...DEFAULTS, ...options };
  const widths = options.widths ?? JUDGE_WIDTHS;
  const only = options.rules ?? LAYOUT_RULE_IDS;
  const rules = Object.fromEntries(Object.entries(layoutRules).filter(([id]) => only.includes(id)));
  const before = page.viewportSize();
  const found = [];
  try {
    for (const width of widths) {
      await page.setViewportSize({ width, height: options.height ?? 900 });
      await page.waitForTimeout(options.settle ?? 120);
      found.push(...withRef(await page.evaluate(script(rules, config)), { width }));
    }
  } finally {
    if (before) await page.setViewportSize(before);
  }
  return found;
};

const NUMBER = /(?<![\w.-])-?\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?/g;

const EXACT = new Set(["elevation-tier"]);

export const debtDetail = (detail, rule) => (EXACT.has(rule) ? detail : detail.replace(NUMBER, "#"));

export const debtKey = ({ rule, width, detail }) => `${rule} at ${width}px: ${debtDetail(detail, rule)}`;

export const debtNumbers = (detail) => [...detail.matchAll(NUMBER)].map((m) => parseFloat(m[0]));

const MEASURES = [
  { rule: "tight-spacing", at: /#px apart|#px padding/, slots: { 0: "down" } },
  { rule: "glass-contrast", at: /at #:#/, slots: { 1: "down" } },
  { rule: "prose-cell", at: /about # characters/, slots: { 0: "down" } },
  { rule: "dense-paragraph", at: /packs # words/, slots: { 0: "up" } },
  { rule: "icon-doubling", at: /holds # icons/, slots: { 0: "up" } },
  { rule: "hue-count", at: /shows # hues/, slots: { 0: "up" } },
];

export const severitySlots = (rule, detail) => MEASURES.find((m) => m.rule === rule && m.at.test(debtDetail(detail, rule)))?.slots ?? {};

export const worstNumbers = (rule, detail, numbers = debtNumbers(detail)) => Object.fromEntries(Object.keys(severitySlots(rule, detail)).map((slot) => [slot, numbers[slot]]).filter(([, n]) => n !== undefined && !Number.isNaN(n)));

export const worsen = (rule, detail, a, b) => {
  const out = { ...a };
  for (const [slot, dir] of Object.entries(severitySlots(rule, detail))) {
    if (b[slot] === undefined) continue;
    out[slot] = out[slot] === undefined ? b[slot] : dir === "down" ? Math.min(out[slot], b[slot]) : Math.max(out[slot], b[slot]);
  }
  return out;
};

const EPSILON = 0.05;

const getsWorse = (entry, finding) => {
  const numbers = debtNumbers(finding.detail);
  return Object.entries(severitySlots(finding.rule, finding.detail)).some(([slot, dir]) => {
    const worst = entry.worst?.[slot];
    return worst === undefined || (dir === "down" ? numbers[slot] < worst - EPSILON : numbers[slot] > worst + EPSILON);
  });
};

const applies = (entry, platform) => !entry.platform || entry.platform === platform;

// `like` is the gallery state's judgeLike: a variant is allowed its base state's count unless it lists its own. Its use
// is recorded under its own id, so staleDebt never counts it toward the base.
export const unlistedFindings = (debt, stateId, found, platform = process.platform, like) => {
  const counts = new Map();
  for (const finding of found) counts.set(debtKey(finding), [...(counts.get(debtKey(finding)) || []), finding]);
  const unlisted = [], used = [];
  for (const [key, list] of counts) {
    const entry = debt.find((candidate) => applies(candidate, platform) && debtKey(candidate) === key);
    const allowed = entry?.states?.[stateId] ?? (like ? entry?.states?.[like] : undefined) ?? 0;
    if (allowed) used.push({ entry, stateId, seen: list.length });
    if (list.length > allowed) unlisted.push(`${stateId}: ${describeFinding(list[0])}${list.length > 1 ? ` (${list.length} times, ${allowed} listed)` : ""}`);
    else if (entry) for (const finding of list) if (getsWorse(entry, finding)) unlisted.push(`${stateId}: ${describeFinding(finding)} (worse than the ${JSON.stringify(entry.worst ?? "nothing")} its debt entry allows)`);
  }
  return { unlisted, used };
};

export const staleDebt = (debt, used, platform = process.platform) => debt.flatMap((entry, index) => (applies(entry, platform)
  ? Object.entries(entry.states).filter(([id, allowed]) => !entry.optional?.includes(id) && (used.get(`${index}|${id}`) ?? 0) < allowed).map(([id, allowed]) => `${id}: ${debtKey(entry)} (lists ${allowed}, saw ${used.get(`${index}|${id}`) ?? 0})`)
  : []));

export const waitForStill = async (page, { timeout = 4000 } = {}) => {
  try {
    await page.waitForFunction(() => {
      const moving = document.getAnimations().some((a) => a.playState === "running" && a.effect && a.effect.getComputedTiming().iterations !== Infinity);
      const sig = [...document.querySelectorAll("a, button, [role=button]")].map((n) => { const r = n.getBoundingClientRect(); return `${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)}`; }).join(";");
      const same = window.__judgeSig === sig;
      window.__judgeSig = sig;
      window.__judgeSame = same ? (window.__judgeSame || 0) + 1 : 0;
      return !moving && window.__judgeSame >= 3;
    }, null, { polling: "raf", timeout });
    return true;
  } catch (error) {
    if (error.name === "TimeoutError") return false;
    throw error;
  }
};

const GALLERY_PATH = "/__dev/oak-states";

// A gallery state whose setup needs a control a narrow page hides (the account trigger at 320px) reports "error" when loaded
// there, so that width falls back to resizing the page that loaded at a width where the state builds.
const loadFresh = async (page, width, height) => {
  const fresh = await page.context().browser().newPage({ viewport: { width, height } });
  try {
    await fresh.goto(page.url(), { waitUntil: "domcontentloaded" });
    if (new URL(fresh.url()).pathname !== GALLERY_PATH) return fresh;
    await fresh.waitForFunction(() => ["ready", "error"].includes(document.documentElement.dataset.oakGallery), null, { timeout: 60000 });
    if (await fresh.evaluate(() => document.documentElement.dataset.oakGallery) === "ready") {
      await fresh.waitForTimeout(300);
      return fresh;
    }
    await fresh.close();
    return null;
  } catch (error) {
    await fresh.close();
    throw new Error(`${page.url()} did not load at ${width}px`, { cause: error });
  }
};

// Chat transcripts scroll to their end after mount, and where they stop differs from load to load, which moves sticky bars over
// buttons. A page loaded again for a width is judged from the top, so two loads of one state read the same.
const fromTop = (page) => page.evaluate(() => new Promise((resolve) => {
  for (const node of document.querySelectorAll("*")) if (node.scrollTop) node.scrollTop = 0;
  scrollTo(0, 0);
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));

export const judgeGalleryState = async (page, { pageWidths = GALLERY_PAGE_WIDTHS, layoutWidths = GALLERY_LAYOUT_WIDTHS, height = 900, settleTimeout = 4000 } = {}) => {
  const found = [];
  const loadedAt = page.viewportSize()?.width;
  for (const width of [...new Set([...layoutWidths, ...pageWidths])].sort((a, b) => a - b)) {
    const fresh = width === loadedAt ? null : await loadFresh(page, width, height);
    const at = fresh ?? page;
    if (!fresh) await page.setViewportSize({ width, height });
    try {
      if (!(await waitForStill(at, { timeout: settleTimeout }))) found.push({ rule: "settle", ref: "QJ13", width, detail: `the page was still moving after ${settleTimeout}ms, so its measures come from mid-motion` });
      if (fresh) await fromTop(fresh);
      if (pageWidths.includes(width)) found.push(...(await judgePage(at)).map((finding) => ({ ...finding, width })));
      if (layoutWidths.includes(width)) found.push(...await judgeLayout(at, { widths: [width], height, settle: 0 }));
    } finally {
      if (fresh) await fresh.close();
    }
  }
  return found;
};

// The recording state starts a new one-shot animation for every waveform bar, so it never holds still for the settle check.
export const LIVE_STATES = ["voice-recording"];

// known-debt.json lists desktop findings at 1440, so a 1280 finding is looked up under that width.
const debtWidth = (width) => (width === 1280 ? 1440 : width);

// Opens each gallery state (four at a time), judges it, and checks what it found against known-debt.json. `open` is a
// Playwright browser or a function that takes a viewport and returns a page. `widths` sets both page and layout widths.
// `after(page, state)` runs before the state's page closes, for callers that take stills.
export const judgeStates = async (open, baseUrl, states, { widths, debt, platform = process.platform, after } = {}) => {
  if (widths?.includes(1280) && widths.includes(1440)) throw new Error("judgeStates widths hold both 1280 and 1440, which read the same 1440 debt entry twice; pass one of them");
  const newPage = typeof open === "function" ? open : (viewport) => open.newPage({ viewport });
  const judgeWidths = widths ? { pageWidths: widths, layoutWidths: widths } : {};
  const width = Math.max(...(widths ?? [...GALLERY_PAGE_WIDTHS, ...GALLERY_LAYOUT_WIDTHS]));
  const findings = [], unlisted = [], used = new Map(), queue = [...states];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let state = queue.shift(); state; state = queue.shift()) {
      const page = await newPage({ width, height: 900 });
      try {
        await page.goto(`${baseUrl}${GALLERY_PATH}?state=${state.id}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 30000 });
        await page.waitForTimeout(300);
        const found = (await judgeGalleryState(page, judgeWidths)).filter((item) => !(item.rule === "settle" && LIVE_STATES.includes(state.id)));
        findings.push(...found.map(({ rule, width, detail }) => ({ platform, state: state.id, rule, width, detail })));
        for (const at of new Set(found.map((item) => item.width))) {
          const listedAt = debtWidth(at);
          const result = unlistedFindings(debt, state.id, found.filter((item) => item.width === at).map((item) => ({ ...item, width: listedAt })), platform, state.judgeLike);
          unlisted.push(...result.unlisted.map((detail) => ({ state: state.id, width: at, detail: detail.replaceAll(`, ${listedAt}px)`, `, ${at}px)`) })));
          for (const { entry, stateId, seen } of result.used) used.set(`${debt.indexOf(entry)}|${stateId}`, seen);
        }
        if (after) await after(page, state);
      } finally { await page.close(); }
    }
  }));
  return { findings, unlisted, used };
};
