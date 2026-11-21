type Mermaid = typeof import("mermaid").default;

/** DESIGN.md roles as hex: Mermaid derives shades from real colors, so CSS variables cannot reach it. */
const THEME = {
  darkMode: true, background: "#0C0C0C", mainBkg: "#111111", primaryColor: "#111111", secondaryColor: "#111111", tertiaryColor: "#0C0C0C",
  primaryTextColor: "#FFFFFF", textColor: "#FFFFFF", primaryBorderColor: "#373737", lineColor: "#AFAFAF",
  faceColor: "#111111", gitBranchLabel0: "#FFFFFF", gitBranchLabel1: "#FFFFFF", gitBranchLabel2: "#FFFFFF", fontFamily: "Inter, system-ui, sans-serif", fontSize: "14px",
};

/** C4 paints its boxes with inline !important colors, so only its own config reaches them. Its type line draws at 0.75 of the font size, so 16 keeps it at 12px. */
const C4 = {
  person_bg_color: "#111111", person_border_color: "#AFAFAF", system_bg_color: "#111111", system_border_color: "#AFAFAF",
  external_system_bg_color: "#0C0C0C", external_system_border_color: "#373737", container_bg_color: "#111111",
  container_border_color: "#AFAFAF", component_bg_color: "#111111", component_border_color: "#AFAFAF",
  useMaxWidth: false, diagramMarginX: 8, diagramMarginY: 0, c4ShapeMargin: 112, c4ShapePadding: 12, width: 180,
  personFontSize: 16, systemFontSize: 16, external_systemFontSize: 16, containerFontSize: 16, componentFontSize: 16, messageFontSize: 13,
};

let loaded: Promise<Mermaid> | null = null;

/** Mermaid's own chunk, fetched the first time a drawn or mermaid preset renders, never with the agent. */
export function oakMermaid() {
  loaded ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", htmlLabels: false, flowchart: { htmlLabels: false, useMaxWidth: false }, sequence: { useMaxWidth: false, diagramMarginX: 8 }, state: { useMaxWidth: false }, c4: C4, gitGraph: { showCommitLabel: false, useMaxWidth: false }, journey: { useMaxWidth: false, diagramMarginX: 8, leftMargin: 120, width: 140, taskMargin: 24, actorColours: ["#6FD394", "#4B6FFF", "#F5B942"] }, theme: "base", themeVariables: THEME, deterministicIds: true });
    return mermaid;
  }, error => { loaded = null; throw error; });
  return loaded;
}

export async function oakMermaidSvg(id: string, source: string) {
  const mermaid = await oakMermaid();
  await mermaid.parse(source);
  return oakSafeSvg((await mermaid.render(id, source)).svg);
}

/**
 * A second pass over Mermaid's strict, DOMPurify-cleaned SVG before insertion: no script or foreignObject, no event attributes,
 * no reference that leaves the document.
 * shortcut: string rules over trusted-renderer output, swap for a DOM sweep if model text ever reaches the SVG unparsed.
 */
export const oakSafeSvg = (svg: string) => svg
  .replace(/<(script|foreignObject)\b[\s\S]*?<\/\1\s*>/gi, "")
  .replace(/<(?:script|foreignObject)\b[^>]*\/>/gi, "")
  .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
  .replace(/\s(?:xlink:)?(?:href|src)\s*=\s*(?:"(?!#)[^"]*"|'(?!#)[^']*'|(?!["'#])[^\s>]+)/gi, "")
  .replace(/url\(\s*(?!['"]?#)[^)]*\)/gi, "none")
  .replace(/@import[^;]*;?/gi, "");
