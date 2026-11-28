import type { OakFigureItem } from "../figure/OakFigure";

/** Q10 B's general types for lazy Mermaid; `architecture-beta` and `usecase-beta` wait as "build later" while Mermaid 12.3 marks them beta. */
export const OAK_MERMAID_TYPES = {
  sequenceDiagram: "sequence", stateDiagram: "state", "stateDiagram-v2": "state", journey: "journey", gitGraph: "gitGraph",
  C4Context: "c4", C4Container: "c4", C4Component: "c4", C4Dynamic: "c4",
} as const;
export type OakDrawnType = "flowchart" | (typeof OAK_MERMAID_TYPES)[keyof typeof OAK_MERMAID_TYPES];
export type OakDrawnSpec = Readonly<{ type: OakDrawnType; title: string; source: string; items: readonly OakFigureItem[] }>;

export const OAK_DRAWN_SPEC_CHARS = 640;
export const OAK_DRAWN_CAPTIONS: Record<OakDrawnType, string> = {
  flowchart: "Flowchart", sequence: "Sequence diagram", state: "State diagram", journey: "User journey", gitGraph: "Git graph",
  c4: "C4 diagram",
};

/** Steve, his projects and the employers in the knowledge snapshot's experience records, plurals and possessives included. */
const STEVE = /\b(?:steve|okkar|kyaw|oak[\s-]*ai|oak[\s-]*labs|agentic[\s-]*brain|eco[\s-]*smart[\s-]*loop|linkedin[\s-]*growth[\s-]*loop|oakminder|omni[\s-]*social|hyper[\s-]*skalers?|san[\s-]*francisco[\s-]*bay[\s-]*university|sfbu|uhttention|global[\s-]*edtech[\s-]*organi[sz]ation|pnpp(?:[\s-]*solutions?)?)s?\b/i;
const UNSAFE = /<\s*[a-z/!?]|&#|#[a-z0-9]+;|:\/\/|javascript:|url\s*\(|@\{|@import|:::|%%|\bUpdate\w*Style\b|\$(?:bgColor|fontColor|borderColor|textColor|lineColor|link)\b|^\s*(?:click|call|href|style|classDef|class|linkStyle|cssClass)\b/im;
const EDGE = /^([A-Za-z][\w '-]{0,31}?)\s*->\s*([A-Za-z][\w '-]{0,31}?)(?:\s*:\s*([^"]{1,40}))?$/;
const SYNTAX_ONLY = /^(?:end|direction \w+|\}|section .*|title .*)$/;
/** C4 rows default to four shapes, wider than the reading column; Mermaid reads the row size only from the diagram. */
const C4_LAYOUT = `\nUpdateLayoutConfig($c4ShapeInRow="2", $c4BoundaryInRow="1")`;

/** Words a reader can follow in place of the drawing: arrows read "to", brackets and quotes drop out. */
const readable = (line: string) => line.replace(/\[\*\]/g, "start or end").replace(/:[LRTB]\b|\b[LRTB]:/g, " ")
  .replace(/[-.=]+>>?|<[-.=]+|--+/g, " to ").replace(/[()[\]{}"]/g, " ").replace(/\s+/g, " ").replace(/\s*:\s*/g, ": ").trim();

/**
 * The model's spec, line 1 the title and the rest the diagram. A spec naming Steve or his work, holding a number, or reaching
 * for HTML, links, styles or directives is rejected whole (null), and the Explainer degrades to its Prose summary.
 */
export function oakDrawnSpec(preset: string, spec: string | undefined): OakDrawnSpec | null {
  spec = spec?.normalize("NFKC");
  if (!spec || spec.length > OAK_DRAWN_SPEC_CHARS || STEVE.test(spec)) return null;
  const [head = "", ...rest] = spec.replace(/\r/g, "").split("\n");
  const title = head.trim();
  // Ticket 203 (m7 P3-1): accTitle and accDescr become hidden SVG title and desc text that no reader sees drawn.
  const lines = rest.join("\n").replace(/%%\{[\s\S]*?\}%%/g, "").replace(/^---\n[\s\S]*?\n---$/m, "").replace(/^\s*%%.*$/gm, "")
    .replace(/^[ \t]*accDescr\s*\{[\s\S]*?\}/gim, "").replace(/^[ \t]*acc(?:Title|Descr)\b.*$/gim, "")
    .split("\n").map(line => line.trimEnd()).filter(line => line.trim());
  if (!title || title.length > 60 || title in OAK_MERMAID_TYPES || !lines.length || UNSAFE.test(lines.join("\n"))) return null;
  const keyword = lines[0]!.trim() as keyof typeof OAK_MERMAID_TYPES;
  const numberless = `${title}\n${lines.join("\n")}`.replace(/\bstateDiagram-v2\b|\bC4\w*/g, "")
    .replace(OAK_MERMAID_TYPES[keyword] === "journey" ? /:\s*[1-5]\s*:/g : /$^/, ":");
  if (/\p{Nd}/u.test(numberless)) return null;
  return preset === "drawn" ? drawn(title, lines) : preset === "mermaid" && keyword in OAK_MERMAID_TYPES ? {
    type: OAK_MERMAID_TYPES[keyword], title, source: `${lines.join("\n")}${OAK_MERMAID_TYPES[keyword] === "c4" ? C4_LAYOUT : ""}`,
    items: lines.slice(1).map(line => line.trim()).filter(line => !SYNTAX_ONLY.test(line)).map((line, index) => ({ label: `${index + 1}`, value: readable(line) })),
  } : null;
}

function drawn(title: string, lines: readonly string[]): OakDrawnSpec | null {
  const edges = lines.map(line => EDGE.exec(line.trim()));
  if (edges.length > 10 || edges.some(edge => !edge)) return null;
  const names = [...new Set(edges.flatMap(edge => [edge![1]!.trim(), edge![2]!.trim()]))];
  if (names.length > 8) return null;
  const node = (name: string) => `n${names.indexOf(name)}["${name}"]`;
  const rows = edges.map(edge => ({ from: edge![1]!.trim(), to: edge![2]!.trim(), label: edge![3]?.trim() }));
  return {
    type: "flowchart", title,
    source: `flowchart TD\n${rows.map(row => `${node(row.from)} -->${row.label ? `|"${row.label}"|` : ""} ${node(row.to)}`).join("\n")}`,
    items: rows.map(row => ({ label: `${row.from} to ${row.to}`, value: row.label ?? "next step" })),
  };
}
