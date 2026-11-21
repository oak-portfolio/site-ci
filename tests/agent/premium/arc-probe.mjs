import { OAK_STATS_SLACK_LIMIT, oakStatsSlacks } from "../../../src/lib/oakStatsSlack.ts";
// R15 (Oak, review v12): rounder frames need their content re-spaced. Run inside a gallery page: for every framed surface
// with a corner of 20px or more (capsules included, measured by their half-height curve), measure how far each text
// line, icon and control sits inside the corner arc. A round control is measured by its own curve; nested frames 120px
// or wider are held by the concentric rule instead; hidden helpers are skipped. `min` is the clearance a leaf must keep.
export const arcProbe = (min = 8) => {
  const css = n => getComputedStyle(n);
  const clear = c => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  const bordered = n => { const s = css(n); return parseFloat(s.borderTopWidth) > 0 && /^(solid|dashed)$/.test(s.borderTopStyle) && !/, 0\)$/.test(s.borderTopColor); };
  const framed = n => !clear(css(n).backgroundColor) || bordered(n);
  const name = n => (n.getAttribute("class") || "").split(" ")[0] || n.tagName.toLowerCase();
  const root = document.querySelector(".oak-workspace");
  const out = [];
  for (const frame of root?.querySelectorAll("*") ?? []) {
    const fb = frame.getBoundingClientRect();
    if (fb.width < 120 || fb.height < 40 || !framed(frame) || css(frame).visibility === "hidden") continue;
    if (frame.matches(".ui-bubble:not(.ui-bubble--ghost), .ui-bubble:not(.ui-bubble--ghost) *, .oak-workspace__header *, [role=tooltip], .ui-dialog__backdrop")) continue;
    // R19: a media tile is a picture clipped to its own corner; the picture is not copy and has no inset to clear.
    if (frame.matches(".oak-media-tile, .oak-media-tile *")) continue;
    const r = Math.min(parseFloat(css(frame).borderTopLeftRadius), fb.height / 2);
    if (r < 20) continue;
    // Leaves: text runs and replaced or control elements not inside a nested frame of their own.
    const leaves = [];
    const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) { const t = walker.currentNode; if (!t.textContent.trim()) continue;
      const range = document.createRange(); range.selectNodeContents(t); for (const b of range.getClientRects()) leaves.push({ b, node: t.parentElement, what: t.textContent.trim().slice(0, 20) }); }
    for (const el of frame.querySelectorAll("svg, img, input, textarea, button, [role=radio], [role=checkbox], .ui-meter-ring, .oak-art-tile, .ui-radio-card__icon"))
      leaves.push({ b: el.getBoundingClientRect(), node: el, what: name(el) });
    let worst = null;
    for (const leaf of leaves) {
      const { node, what } = leaf; let b = leaf.b;
      const el = node.nodeType === 1 ? node : node.parentElement;
      // R25: a truncated line or a clamped block paints only inside the box that clips it (as insetProbe), so its hidden overflow, which is
      // wider on Linux metrics, is not ink near the arc (oak-next-step hint ellipsis, Depot fr1nj5h6x5 -17px). A scroll frame clips the same
      // way (ticket 54: a Mermaid journey wider than its .oak-drawn__svg frame scrolls inside it at 1280).
      for (let clip = el; clip && clip !== frame; clip = clip.parentElement) { const cs = css(clip);
        if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY)) { const cb = clip.getBoundingClientRect(); const x = /hidden|clip|auto|scroll/.test(cs.overflowX), y = /hidden|clip|auto|scroll/.test(cs.overflowY);
          b = { left: x ? Math.max(b.left, cb.left) : b.left, right: x ? Math.min(b.right, cb.right) : b.right, top: y ? Math.max(b.top, cb.top) : b.top, bottom: y ? Math.min(b.bottom, cb.bottom) : b.bottom }; b.width = b.right - b.left; b.height = b.bottom - b.top; } }
      // Visually hidden helpers (Base UI's 1px text, sr-only) and the decorative panel halo are not content; icons are
      // aria-hidden but visible, so they are measured. A full-width row target is a container; its text and icons are
      // measured instead. A leaf that is itself a frame 120px or wider is a nested surface, held to the concentric rule;
      // a smaller filled control (send button, art tile, meter ring) is measured by its own curve.
      if (el !== frame && ((framed(el) && b.width >= 120) || (el.matches("button, a, [role=radio], [role=menuitem]") && b.width > fb.width * 0.8))) continue;
      if (b.width < 3 || b.height < 3 || css(el).visibility === "hidden" || css(el).opacity === "0" || css(el).clipPath.startsWith("inset(50%") || el.getBoundingClientRect().width < 3 || el.closest(".sr-only, [style*='clip-path: inset(50%)'], .oak-panel-hero, [inert], [hidden]") || (el.closest("details:not([open])") && !el.closest("summary"))) continue;
      // A borderless field is measured by its text box, not its outer box.
      if (el.matches("input, textarea") && !bordered(el) && clear(css(el).backgroundColor)) { const s = css(el);
        b = { left: b.left + parseFloat(s.paddingLeft), right: b.right - parseFloat(s.paddingRight), top: b.top + parseFloat(s.paddingTop), bottom: b.top + parseFloat(s.paddingTop) + parseFloat(s.lineHeight || 20), width: 1, height: 1 }; }
      // Skip content that belongs to a nested frame: that frame's own corners are checked.
      let up = node.nodeType === 1 ? node : node.parentElement; let nested = false;
      while (up && up !== frame) { if (up !== node && up !== el && framed(up) && up.getBoundingClientRect().width < fb.width - 4) { nested = true; break; } up = up.parentElement; }
      if (nested) continue;
      if (b.right < fb.left || b.left > fb.right || b.bottom < fb.top || b.top > fb.bottom) continue;
      const L = fb.left + r, R = fb.right - r, T = fb.top + r, B = fb.bottom - r;
      // A round control (pill or circle) is measured by its own curve: its corner circle of radius lr.
      const lr = node.nodeType === 1 ? Math.min(parseFloat(getComputedStyle(node).borderTopLeftRadius) || 0, b.height / 2, b.width / 2) : 0;
      for (const [cx, cy, sx, sy, zone] of [[L, T, -1, -1, b.left < L && b.top < T], [R, T, 1, -1, b.right > R && b.top < T],
        [L, B, -1, 1, b.left < L && b.bottom > B], [R, B, 1, 1, b.right > R && b.bottom > B]]) {
        if (!zone) continue;
        // How far the leaf's corner circle centre reaches past the arc centre toward the frame corner (0 when it does not).
        const ix = sx < 0 ? b.left + lr : b.right - lr, iy = sy < 0 ? b.top + lr : b.bottom - lr;
        const dx = Math.max(0, sx * (ix - cx)), dy = Math.max(0, sy * (iy - cy));
        // Only a centre inside the corner square meets the arc; elsewhere the nearest boundary is a straight edge (padding).
        if (dx <= 0 || dy <= 0) continue;
        // A round control centred on the frame's own arc centre is concentric: the concentric rule holds it, not clearance.
        if (lr > 0 && Math.abs(ix - cx) < 2 && Math.abs(iy - cy) < 2) continue;
        const clearance = r - (Math.hypot(dx, dy) + lr);
        if (!worst || clearance < worst.clearance) worst = { clearance: Math.round(clearance), what };
      }
    }
    if (worst && worst.clearance < min) out.push(`${name(frame)} r${Math.round(r)}: "${worst.what}" clears the arc by ${worst.clearance}px`);
  }
  return [...new Set(out)];
};

// R17 (Oak, review v14: "add vertical padding for visual harmony" on 12 cells, "too tight" on four menus): the arc probe
// holds content off the curve, it does not hold the four gaps equal. This walks the same frames and measures the content
// box: the union of each leaf (text run, icon, image, control) or, where a leaf sits in a nested frame such as a card or
// chip, that frame's whole box. A frame has one role pad, read from the stylesheet (never restated here):
//   frame  --oak-pad-frame (32px): a frame that holds copy or controls (buttons, chips, capsules) directly, and any
//          popover or menu, whatever it holds.
//   nest   --oak-pad-nest (24px): a frame that holds nested cards (frames that are not capsules) or full-width rows.
//   line   --oak-pad-block (12px): a single-line row (a capsule, or one band of 80px or less); its top and bottom match
//          within 2px.
// A round leaf at either end of a line sits concentric (its gap there equals the top gap), which waives the role pad
// on that side. All four gaps must reach the role pad. Top and bottom must then match each other within 4px, and the smaller side
// within 4px when the content spans the frame (a ragged or centred block has loose sides by design). The function is
// serialised into the page, so the short opt-out list, each entry with its reason, lives inside it; a surface not on it
// answers to the rule.
export const insetProbe = (tolerance = 4) => {
  const optOut = {
    "oak-composer__surface": "the message box is a capsule that sizes its own 44px control row (header rule: 1px surface padding)",
    "ui-input-group": "a field group is one control row; its fill is the text field and the addon bar pads itself",
    "oak-media-tile": "R19: a picture clipped to its own corner (a source page's cover); its scrim and title sit on the picture",
  };
  const css = n => getComputedStyle(n);
  const clear = c => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  const bordered = n => { const s = css(n); return parseFloat(s.borderTopWidth) > 0 && /^(solid|dashed)$/.test(s.borderTopStyle) && !/, 0\)$/.test(s.borderTopColor); };
  const framed = n => !clear(css(n).backgroundColor) || bordered(n);
  const name = n => (n.getAttribute("class") || "").split(" ")[0] || n.tagName.toLowerCase();
  const root = document.querySelector(".oak-workspace");
  const token = (prop, fallback) => { const probe = document.createElement("div"); probe.style.cssText = `position:absolute;visibility:hidden;width:var(${prop}, ${fallback})`; root.append(probe); const w = probe.getBoundingClientRect().width; probe.remove(); return Math.round(w); };
  const pads = { frame: token("--oak-pad-frame", "32px"), nest: token("--oak-pad-nest", "24px"), line: token("--oak-pad-block", "12px") };
  const rowLike = "li, [role=menuitem], [role=menuitemradio], [role=option], [role=radio], summary, tr, .ui-suggestion, .oak-saved__row, .ui-menu__item";
  const popup = ".ui-menu__popup, .ui-popover__popup, .oak-contact__popup, [role=menu]";
  const out = [];
  for (const frame of root?.querySelectorAll("*") ?? []) {
    const fb = frame.getBoundingClientRect();
    if (fb.width < 120 || fb.height < 40 || !framed(frame) || css(frame).visibility === "hidden") continue;
    if (frame.matches(".ui-bubble:not(.ui-bubble--ghost), .ui-bubble:not(.ui-bubble--ghost) *, .oak-workspace__header *, [role=tooltip], .ui-dialog__backdrop, .oak-panel-hero, .sr-only, [inert]")) continue;
    if (frame.closest("details:not([open])") && !frame.closest("summary")) continue;
    const r = Math.min(parseFloat(css(frame).borderTopLeftRadius), fb.height / 2);
    if (r < 20) continue;
    const id = name(frame);
    if (optOut[id] || [...frame.classList].some(c => optOut[c])) continue;
    // Content boxes: a leaf in a nested frame (smaller than this one) contributes that frame's box; every other leaf its own.
    const boxes = []; const round = []; let holdsCards = false;
    // A closed panel kept as hidden="until-found" lays out at 0px but never paints its rows.
    const visible = el => css(el).visibility !== "hidden" && css(el).opacity !== "0" && !el.closest(".sr-only, [style*='clip-path: inset(50%)'], [inert], [hidden]") && !(el.closest("details:not([open])") && !el.closest("summary"));
    const add = (b0, el, row) => {
      // A truncated line or a clamped block (text-overflow, line-clamp, overflow clip) paints only inside the box that clips it.
      let b = b0;
      for (let clip = el; clip && clip !== frame; clip = clip.parentElement) { const cs = css(clip); if (/hidden|clip|auto|scroll/.test(cs.overflowX + cs.overflowY)) { const cb = clip.getBoundingClientRect(); const x = /hidden|clip|auto|scroll/.test(cs.overflowX), y = /hidden|clip|auto|scroll/.test(cs.overflowY);
        b = { left: x ? Math.max(b.left, cb.left) : b.left, right: x ? Math.min(b.right, cb.right) : b.right, top: y ? Math.max(b.top, cb.top) : b.top, bottom: y ? Math.min(b.bottom, cb.bottom) : b.bottom }; b.width = b.right - b.left; b.height = b.bottom - b.top; } }
      if (b.width < 1 || b.height < 1 || !visible(el)) return;
      let box = b, up = el, nested = null;
      while (up && up !== frame) { if (framed(up) && up.getBoundingClientRect().width < fb.width - 4 && up.getBoundingClientRect().height >= 24) nested = up; up = up.parentElement; }
      if (nested) box = nested.getBoundingClientRect();
      if (box.right < fb.left || box.left > fb.right || box.bottom < fb.top || box.top > fb.bottom) return;
      boxes.push({ t: box.top, b: box.bottom, l: box.left, r: box.right });
      // A nested button or capsule is a control; any other nested frame is a card, and a leaf inside a row is a row's.
      if (row || (nested && !nested.matches("button, a, input, textarea, label, [role=button]") && parseFloat(css(nested).borderTopLeftRadius) < box.height / 2 - 1)) holdsCards = true;
      // Only a visible tile counts as a round leaf (a filled or ringed element, a button or an image): never bare text in a round span, never a progress track.
      const tile = nested ?? el, lr = parseFloat(css(tile).borderTopLeftRadius) || 0;
      if (tile !== frame && (framed(tile) || tile.matches("img, svg, .ui-meter-ring")) && lr >= Math.min(box.width, box.height) / 2 - 1 && box.width < fb.width * 0.9 && !tile.matches(".ui-meter-bar__track, [role=progressbar]")) round.push({ l: box.left, r: box.right });
    };
    const inRow = el => { const row = el.closest(rowLike); return !!row && row !== frame && frame.contains(row); };
    const walker = document.createTreeWalker(frame, NodeFilter.SHOW_TEXT);
    // R25: words, not whole text nodes: a space where a line wraps hangs past the content box unpainted, and a node's rects
    // counted it as ink 2px inside the pad (answer-openui-numbers-pages, end 22 of 24).
    while (walker.nextNode()) { const t = walker.currentNode; if (!t.textContent.trim()) continue;
      for (const word of t.textContent.matchAll(/\S+/g)) { const range = document.createRange(); range.setStart(t, word.index); range.setEnd(t, word.index + word[0].length);
        for (const b of range.getClientRects()) add(b, t.parentElement, inRow(t.parentElement)); } }
    // Ruling 26: a wall tile's placeholder ink (its skeleton bars, its empty or pending cover) counts when it paints a fill, a shimmer or a ring.
    // Bars outside the wall stay unmeasured: counting them failed eight streaming states whose frames are not padded for them (fl22b).
    const placeholder = ".oak-wall__tile .oak-openui-card__bar, .oak-wall__cover";
    for (const el of frame.querySelectorAll(`svg, img, input, textarea, .ui-meter-ring, .ui-spinner, .ui-meter-bar__track, [role=progressbar], .oak-art-tile, .ui-radio-card__icon, .oak-figure__bar, ${placeholder}`)) {
      if (el.matches(placeholder) && !framed(el) && css(el).backgroundImage === "none") continue;
      let b = el.getBoundingClientRect();
      // A borderless field is measured by its text box (padding off), as the arc probe does.
      if (el.matches("input, textarea") && !bordered(el) && clear(css(el).backgroundColor)) { const cs = css(el); b = { left: b.left + parseFloat(cs.paddingLeft), right: b.right - parseFloat(cs.paddingRight), top: b.top + parseFloat(cs.paddingTop), bottom: b.bottom - parseFloat(cs.paddingBottom) }; b.width = b.right - b.left; b.height = b.bottom - b.top; }
      add(b, el, inRow(el));
    }
    if (!boxes.length) continue;
    const gap = { top: Math.min(...boxes.map(b => b.t)) - fb.top, bottom: fb.bottom - Math.max(...boxes.map(b => b.b)), start: Math.min(...boxes.map(b => b.l)) - fb.left, end: fb.right - Math.max(...boxes.map(b => b.r)) };
    const mid = fb.top + fb.height / 2;
    // A capsule is one band by construction; any other frame is one when every leaf centres on its midline.
    const line = r >= fb.height / 2 - 1 || (fb.height <= 80 && boxes.every(b => Math.abs((b.t + b.b) / 2 - mid) <= 6));
    const inPopup = frame.matches(popup);
    const role = line ? "line" : inPopup || !holdsCards ? "frame" : "nest";
    const want = pads[role];
    const miss = [];
    // A round leaf (tile, avatar, loader, send disc) at an end of a line sits concentric: its gap there equals the top gap.
    const roundAt = { start: round.some(c => Math.abs(c.l - fb.left - gap.start) < 1), end: round.some(c => Math.abs(fb.right - c.r - gap.end) < 1) };
    const concentric = edge => line && roundAt[edge] && Math.abs(gap[edge] - gap.top) <= 2 && gap.top >= 4;
    // R19: an edge whose corners are square joins the next frame (consecutive roles share one frame), so it is a seam, not an edge.
    const joined = { top: parseFloat(css(frame).borderTopLeftRadius) < 1, bottom: parseFloat(css(frame).borderBottomLeftRadius) < 1 };
    const relaxed = edge => (edge === "top" || edge === "bottom") ? (joined[edge] || concentric("start") || concentric("end")) : concentric(edge);
    for (const [edge, v] of Object.entries(gap)) if (Math.round(v) < want - 1 && !relaxed(edge)) miss.push(`${edge} ${Math.round(v)}`);
    if (line) {
      if (Math.abs(gap.top - gap.bottom) > 2) miss.push(`top ${Math.round(gap.top)} vs bottom ${Math.round(gap.bottom)}`);
      for (const edge of ["start", "end"]) if (roundAt[edge] && !concentric(edge)) miss.push(`round leaf ${edge} ${Math.round(gap[edge])} not concentric (top ${Math.round(gap.top)})`);
    } else if (!miss.length) {
      const side = Math.min(gap.start, gap.end);
      if (!joined.top && !joined.bottom && Math.abs(gap.top - gap.bottom) > tolerance) miss.push(`top ${Math.round(gap.top)} vs bottom ${Math.round(gap.bottom)}`);
      else if (side <= want + 8) for (const edge of ["top", "bottom"]) if (Math.abs(gap[edge] - side) > tolerance) miss.push(`${edge} ${Math.round(gap[edge])} vs sides ${Math.round(side)}`);
    }
    if (miss.length) out.push(`${id} r${Math.round(r)} (${role} pad ${want}): ${[...new Set(miss)].join(", ")}`);
  }
  return [...new Set(out)];
};

// R18 (Oak, review v15, document-selected: "these minor error thing and gap fix"): a selected row painted a 5% white fill
// with square corners inside the list's 7% fill and 40px curve, so its top edge started 13px under the frame's curve and
// read as a lighter strip. Oak v13 holds the rule: no gray element with its own frame inside a gray wrapper. This walks the
// workspace and flags a painted fill (a background, not a border) whose nearest filled ancestor also has a fill, unless the
// descendant carries a corner of its own of 16px or more (a card, concentric with its frame) or is a capsule/circle. The
// function is serialised into the page, so the short opt-out list, each entry with its reason, lives inside it.
export const tintProbe = () => {
  const optOut = {
    "ui-checkbox": "a checkbox is a real object (a keycap-size control), its fill is its checked state",
    "ui-switch": "a switch is a real object; its track fill is its on state",
    "ui-meter-bar__fill": "a progress fill is data painted on its own track",
    "ui-meter-bar__track": "a progress track is data, not a surface",
    "ui-meter-bar__indicator": "a progress fill is data painted on its own track",
    "ui-kbd": "a keycap is a real object",
    "oak-art-tile": "a pictogram tile is a real object with its own artwork",
    "oak-media-tile": "R19: a picture clipped to its own corner; its scrim is part of the picture",
  };
  const css = n => getComputedStyle(n);
  const clear = c => /rgba\(0, 0, 0, 0\)|transparent/.test(c) || /\/ 0\)$/.test(c);
  const filled = n => !clear(css(n).backgroundColor) || (css(n).backgroundImage !== "none" && !/gradient\(.*(transparent|rgba\(0, 0, 0, 0\))/.test(css(n).backgroundImage));
  const name = n => (n.getAttribute("class") || "").split(" ")[0] || n.tagName.toLowerCase();
  const root = document.querySelector(".oak-workspace");
  const out = [];
  for (const el of root?.querySelectorAll("*") ?? []) {
    const b = el.getBoundingClientRect();
    if (b.width < 8 || b.height < 8 || css(el).visibility === "hidden" || css(el).opacity === "0" || !filled(el)) continue;
    if (el.matches("svg, svg *, img, canvas, video, .sr-only, [inert], [role=tooltip], .ui-dialog__backdrop, .oak-panel-hero, .oak-panel-hero *") || el.closest("details:not([open])") && !el.closest("summary")) continue;
    // Text painted from a background (a shimmer gradient clipped to the glyphs) is type, not a surface.
    if (/text/.test(css(el).webkitBackgroundClip || css(el).backgroundClip)) continue;
    if ([...el.classList].some(c => optOut[c]) || el.closest(Object.keys(optOut).map(c => `.${c}`).join(","))) continue;
    // The filled ancestor that this fill sits on: a gray element inside a gray wrapper is the pattern.
    let up = el.parentElement;
    while (up && up !== root && !filled(up)) up = up.parentElement;
    if (!up || up === root || !filled(up)) continue;
    const ub = up.getBoundingClientRect();
    if (ub.width < 24 || ub.height < 24) continue;
    const r = parseFloat(css(el).borderTopLeftRadius) || 0;
    const capsule = r >= Math.min(b.width, b.height) / 2 - 1;
    if (r >= 16 || capsule) continue;
    out.push(`${name(el)} r${Math.round(r)} paints a fill inside ${name(up)} (${Math.round(b.width)}x${Math.round(b.height)}): remove the inner fill or give it a 16px+ corner`);
  }
  return [...new Set(out)];
};

/**
 * R19 (Oak, review v16: the Stats tiles "are not even the same height"): framed siblings that sit side by side in one
 * row of the same grid or flex container (tops within 2px, both framed by a fill or border with a 16px or larger radius)
 * share one height. R18 top-aligned the tiles to satisfy the inset probe and shipped uneven tiles past every check.
 */
export const equalHeightProbe = (tolerance = 2) => {
  const css = n => getComputedStyle(n);
  const clear = c => /rgba\(0, 0, 0, 0\)|transparent/.test(c);
  const framed = n => { const s = css(n); return (!clear(s.backgroundColor) || (parseFloat(s.borderTopWidth) > 0 && !/, 0\)$/.test(s.borderTopColor))) && parseFloat(s.borderTopLeftRadius) >= 16; };
  const root = document.querySelector(".oak-workspace");
  const out = [];
  for (const parent of root?.querySelectorAll("*") ?? []) {
    const display = css(parent).display;
    if (!/grid|flex/.test(display)) continue;
    const kids = [...parent.children].filter(kid => css(kid).visibility !== "hidden" && kid.getBoundingClientRect().width > 80 && framed(kid));
    if (kids.length < 2) continue;
    const rows = new Map();
    for (const kid of kids) { const r = kid.getBoundingClientRect(); const key = [...rows.keys()].find(top => Math.abs(top - r.top) <= 2) ?? r.top; rows.set(key, [...(rows.get(key) ?? []), r.height]); }
    for (const heights of rows.values()) if (heights.length > 1 && Math.max(...heights) - Math.min(...heights) > tolerance) {
      out.push(`${(kids[0].getAttribute("class") || kids[0].tagName).split(" ")[0]} siblings ${heights.map(Math.round).join(" vs ")}px tall in one row`);
    }
  }
  return out;
};

/**
 * RETRO Q24 rounds 27j to 27n, line 1: the Stats rule shipped three times (R27g sentence lengths, R27l long values, R27n
 * tile kinds) and each time the next live answer left a stretched tile empty (about 180, then 130, then 120px), because
 * the rule guesses height from a proxy and no check measured the tile. This measures it: inside every Stats tile, no
 * vertical run between consecutive pieces of content (or after the last one) is taller than `limit` px.
 * Retro arch 4: the measure is src/lib/oakStatsSlack.ts, the same function StatsView runs, shipped as source text.
 * Call it from node as `slackProbe(page)`; it returns the misses as messages.
 */
export const slackProbe = async (page, limit = OAK_STATS_SLACK_LIMIT) =>
  (await page.evaluate(oakStatsSlacks)).filter(slack => slack.run > limit)
    .map(slack => `Stats tile "${slack.label}" has ${Math.round(slack.run)}px of empty space (limit ${limit})`);
