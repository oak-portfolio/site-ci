/**
 * One measure of empty space inside Stats tiles, shared by the renderer (StatsView in openui.tsx) and the gallery check
 * (slackProbe in tests/agent/premium/arc-probe.mjs). Retro arch 4: the rule had shipped four times and the two copies had
 * already drifted on a missing-parent guard.
 *
 * `oakStatsSlacks` is shipped into Playwright's page.evaluate as source text, so its body references nothing outside itself:
 * no imports, no module constants, no helpers. tests/quality/oak-stats-slack.test.mjs builds it from its own source to guard that.
 */
export const OAK_STATS_SLACK_LIMIT = 56;

/** For every `.oak-openui-stats__tile` under `root`: the tallest empty vertical run above the first painted line, between lines, or under the last. */
export const oakStatsSlacks = (root: ParentNode = document): { label: string; run: number }[] => {
  const out: { label: string; run: number }[] = [];
  for (const tile of root.querySelectorAll<HTMLElement>(".oak-openui-stats__tile")) {
    const box = tile.getBoundingClientRect();
    if (box.height < 1) continue;
    // Content is every painted line of text (a claim's sentence is a bare text node beside its chip) and every image.
    const rects: DOMRect[] = [];
    const walker = document.createTreeWalker(tile, NodeFilter.SHOW_TEXT);
    for (let text = walker.nextNode(); text; text = walker.nextNode()) {
      const parent = text.parentElement;
      // Screen-reader-only text paints nothing, and a 1px line inside an empty stretch would split the gap.
      if (!text.textContent?.trim() || !parent || getComputedStyle(parent).visibility === "hidden" || parent.closest(".sr-only")) continue;
      const range = document.createRange(); range.selectNodeContents(text); rects.push(...range.getClientRects());
    }
    for (const node of tile.querySelectorAll("img, svg, .oak-openui__meter-track, [class*='meter'] > span:empty")) rects.push(node.getBoundingClientRect());
    const leaves = rects.filter(rect => rect.height >= 2 && rect.width >= 2).sort((a, b) => a.top - b.top);
    if (!leaves.length) continue;
    const style = getComputedStyle(tile);
    let bottom = leaves[0].bottom;
    let run = leaves[0].top - (box.top + parseFloat(style.paddingTop || "0"));
    for (const rect of leaves.slice(1)) { run = Math.max(run, rect.top - bottom); bottom = Math.max(bottom, rect.bottom); }
    run = Math.max(run, box.bottom - parseFloat(style.paddingBottom || "0") - bottom);
    out.push({ label: (tile.textContent || "").trim().slice(0, 24), run });
  }
  return out;
};
