import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = "artifacts/excalidraw/linkedin-growth-loop";

const palette = {
  bg: "#050505",
  panel: "#0b1724",
  panel2: "#102b44",
  green: "#8bd3b7",
  blue: "#9fc5ff",
  amber: "#f2c879",
  orange: "#f29a76",
  muted: "#8fa1b4",
  white: "#f7f7f4",
  grid: "#294057",
};

let seed = 1000;
const nextSeed = () => seed++;
const id = (prefix) => `${prefix}_${nextSeed().toString(36)}`;

function baseElement(type, props) {
  return {
    id: id(type),
    type,
    x: props.x ?? 0,
    y: props.y ?? 0,
    width: props.width ?? 0,
    height: props.height ?? 0,
    angle: 0,
    strokeColor: props.strokeColor ?? palette.green,
    backgroundColor: props.backgroundColor ?? "transparent",
    fillStyle: props.fillStyle ?? "solid",
    strokeWidth: props.strokeWidth ?? 2,
    strokeStyle: props.strokeStyle ?? "solid",
    roughness: props.roughness ?? 1,
    opacity: props.opacity ?? 100,
    groupIds: props.groupIds ?? [],
    frameId: null,
    roundness: type === "rectangle" ? { type: 3 } : null,
    seed: nextSeed(),
    version: 1,
    versionNonce: nextSeed(),
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...props.extra,
  };
}

function text(label, x, y, width, opts = {}) {
  return baseElement("text", {
    x,
    y,
    width,
    height: opts.height ?? Math.max(28, Math.ceil(label.length / 24) * (opts.fontSize ?? 22)),
    strokeColor: opts.color ?? palette.white,
    backgroundColor: "transparent",
    extra: {
      text: label,
      fontSize: opts.fontSize ?? 22,
      fontFamily: 1,
      textAlign: opts.align ?? "center",
      verticalAlign: "middle",
      containerId: null,
      originalText: label,
      lineHeight: 1.2,
    },
  });
}

function box(label, x, y, width, height, opts = {}) {
  return [
    baseElement("rectangle", {
      x,
      y,
      width,
      height,
      strokeColor: opts.stroke ?? palette.green,
      backgroundColor: opts.fill ?? palette.panel2,
      opacity: opts.opacity ?? 96,
    }),
    text(label, x + 16, y + height / 2 - 15, width - 32, {
      fontSize: opts.fontSize ?? 20,
      color: opts.color ?? palette.white,
      align: "center",
    }),
  ];
}

function pill(label, x, y, width, height, opts = {}) {
  return [
    baseElement("ellipse", {
      x,
      y,
      width,
      height,
      strokeColor: opts.stroke ?? palette.blue,
      backgroundColor: opts.fill ?? palette.panel,
      opacity: opts.opacity ?? 94,
    }),
    text(label, x + 16, y + height / 2 - 14, width - 32, {
      fontSize: opts.fontSize ?? 18,
      color: opts.color ?? palette.white,
    }),
  ];
}

function arrow(x1, y1, x2, y2, opts = {}) {
  return baseElement("arrow", {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    strokeColor: opts.color ?? palette.green,
    strokeWidth: opts.strokeWidth ?? 2,
    extra: {
      points: [
        [0, 0],
        [x2 - x1, y2 - y1],
      ],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: "arrow",
      elbowed: false,
    },
  });
}

function line(x1, y1, x2, y2, opts = {}) {
  return baseElement("line", {
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    strokeColor: opts.color ?? palette.grid,
    strokeWidth: opts.strokeWidth ?? 2,
    extra: {
      points: [
        [0, 0],
        [x2 - x1, y2 - y1],
      ],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
    },
  });
}

function scene(name, elements) {
  return {
    type: "excalidraw",
    version: 2,
    source: "https://steveoak.com/work/linkedin-growth-loop",
    elements,
    appState: {
      theme: "dark",
      viewBackgroundColor: palette.bg,
      currentItemFontFamily: 1,
      gridSize: null,
    },
    files: {},
    name,
  };
}

function svg(name, width, height, blocks) {
  const body = blocks.join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(name)}">
  <rect width="100%" height="100%" rx="28" fill="${palette.bg}"/>
  <style>
    text { font-family: Inter, Arial, sans-serif; fill: ${palette.white}; }
    .muted { fill: ${palette.muted}; }
    .eyebrow { fill: ${palette.green}; font-size: 18px; letter-spacing: 2px; font-weight: 700; }
    .title { font-size: 34px; font-weight: 800; }
    .label { font-size: 20px; font-weight: 700; }
    .small { font-size: 16px; fill: ${palette.muted}; }
    .box { fill: ${palette.panel2}; stroke: ${palette.green}; stroke-width: 2.5; }
    .box-blue { fill: ${palette.panel}; stroke: ${palette.blue}; stroke-width: 2.5; }
    .box-amber { fill: ${palette.panel}; stroke: ${palette.amber}; stroke-width: 2.5; }
    .arrow { stroke: ${palette.green}; stroke-width: 2.5; fill: none; marker-end: url(#arrow); }
    .line { stroke: ${palette.grid}; stroke-width: 2; fill: none; }
  </style>
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="${palette.green}"/>
    </marker>
  </defs>
${body}
</svg>`;
}

function escapeXml(value) {
  return String(value).replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[char]);
}

function rect(x, y, w, h, cls = "box", rx = 18) {
  return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}"/>`;
}

function label(value, x, y, cls = "label", anchor = "middle") {
  return `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
}

function multiline(lines, x, y, cls = "small", anchor = "middle", step = 22) {
  return lines.map((item, index) => `<text class="${cls}" x="${x}" y="${y + index * step}" text-anchor="${anchor}">${escapeXml(item)}</text>`).join("\n");
}

const responsibility = scene("LinkedIn Growth Loop - Agent Team Responsibility Map", [
  ...box("Orchestrator", 430, 70, 260, 76, { stroke: palette.green }),
  ...box("People-work agents", 80, 230, 260, 92, { stroke: palette.blue }),
  ...box("Public-interaction agents", 780, 230, 300, 92, { stroke: palette.blue }),
  ...pill("Hermes research advisor", 410, 245, 300, 72, { stroke: palette.amber }),
  ...box("Telegram control room", 380, 405, 360, 84, { stroke: palette.green }),
  ...box("Run memory", 165, 430, 210, 72, { stroke: palette.muted }),
  ...box("Validators", 785, 430, 210, 72, { stroke: palette.orange }),
  ...pill("Oak override", 440, 570, 260, 72, { stroke: palette.orange }),
  arrow(560, 146, 210, 230),
  arrow(560, 146, 930, 230),
  arrow(560, 146, 560, 245),
  arrow(340, 280, 380, 445),
  arrow(930, 322, 910, 430),
  arrow(560, 317, 560, 405),
  arrow(560, 489, 560, 570),
  arrow(740, 445, 785, 466),
  arrow(375, 466, 380, 445),
  text("Agent Team Responsibility Map", 290, 20, 560, { fontSize: 30, align: "left" }),
  text("Different failures need different owners.", 290, 665, 560, { fontSize: 20, color: palette.muted, align: "center" }),
]);

const reportLoop = scene("LinkedIn Growth Loop - Telegram Control Room Loop", [
  ...box("Agent run", 70, 160, 210, 82, { stroke: palette.blue }),
  ...box("Telegram report", 380, 130, 300, 112, { stroke: palette.green }),
  ...box("Human summary", 420, 290, 220, 70, { stroke: palette.green }),
  ...box("Hidden machine detail", 420, 400, 220, 70, { stroke: palette.muted }),
  ...box("Scan, approve, inspect", 760, 260, 300, 82, { stroke: palette.orange }),
  ...box("Agent handoff input", 760, 410, 300, 82, { stroke: palette.blue }),
  ...pill("Next run", 360, 560, 260, 72, { stroke: palette.green }),
  arrow(280, 201, 380, 186),
  arrow(530, 242, 530, 290),
  arrow(530, 360, 530, 400),
  arrow(640, 325, 760, 301),
  arrow(640, 435, 760, 451),
  arrow(910, 492, 620, 596),
  arrow(360, 596, 170, 242),
  text("Telegram Control Room Loop", 280, 36, 600, { fontSize: 30, align: "left" }),
  text("A report stopped being the end of a run.", 280, 86, 620, { fontSize: 20, color: palette.muted, align: "left" }),
  text("It became the handoff for the next pass.", 280, 620, 560, { fontSize: 20, color: palette.muted, align: "center" }),
]);

const failure = scene("LinkedIn Growth Loop - Weak Identity To Stop Condition", [
  ...box("Post appears", 70, 230, 190, 76, { stroke: palette.blue }),
  ...box("Identity unclear", 330, 220, 220, 96, { stroke: palette.amber }),
  ...box("Duplicate risk", 620, 220, 220, 96, { stroke: palette.orange }),
  ...box("Stop before action", 900, 220, 250, 96, { stroke: palette.green }),
  ...pill("Duplicate checks", 355, 430, 270, 72, { stroke: palette.green }),
  ...pill("Record the decision", 690, 430, 290, 72, { stroke: palette.muted }),
  ...pill("Next run uses rule", 500, 570, 300, 72, { stroke: palette.green }),
  arrow(260, 268, 330, 268),
  arrow(550, 268, 620, 268),
  arrow(840, 268, 900, 268),
  arrow(1010, 316, 625, 466),
  arrow(625, 466, 690, 466),
  arrow(835, 502, 650, 570),
  arrow(500, 606, 450, 316),
  text("Weak Identity To Stop Condition", 280, 36, 700, { fontSize: 30, align: "left" }),
  text("The useful rule was simple: if the agent cannot prove the object, it does not act publicly.", 280, 86, 820, { fontSize: 20, color: palette.muted, align: "left" }),
  text("A visible failure became a safer operating rule.", 280, 680, 640, { fontSize: 20, color: palette.muted, align: "center" }),
]);

const previews = [
  {
    slug: "01-agent-team-responsibility-map",
    name: "Agent Team Responsibility Map",
    scene: responsibility,
    svg: svg("Agent Team Responsibility Map", 1200, 760, [
      label("AGENT TEAM RESPONSIBILITY MAP", 64, 72, "eyebrow", "start"),
      label("Different failures need different owners", 64, 122, "title", "start"),
      rect(470, 155, 260, 76), label("Orchestrator", 600, 203),
      rect(90, 300, 260, 92, "box-blue"), label("People-work agents", 220, 353),
      rect(850, 300, 300, 92, "box-blue"), label("Public-interaction agents", 1000, 353),
      rect(430, 305, 340, 78, "box-amber"), label("Hermes research advisor", 600, 352),
      rect(415, 470, 370, 82), label("Telegram control room", 600, 521),
      rect(150, 500, 220, 72, "box-blue"), label("Run memory", 260, 545),
      rect(830, 500, 220, 72, "box-amber"), label("Validators", 940, 545),
      rect(470, 630, 260, 72, "box-amber"), label("Oak override", 600, 675),
      `<path class="arrow" d="M600 231 L220 300"/>`,
      `<path class="arrow" d="M600 231 L1000 300"/>`,
      `<path class="arrow" d="M600 231 L600 305"/>`,
      `<path class="arrow" d="M600 383 L600 470"/>`,
      `<path class="arrow" d="M600 552 L600 630"/>`,
      multiline(["Failures became easier to route because each job had a different owner."], 600, 735),
    ]),
  },
  {
    slug: "02-telegram-control-room-loop",
    name: "Telegram Control Room Loop",
    scene: reportLoop,
    svg: svg("Telegram Control Room Loop", 1200, 760, [
      label("TELEGRAM CONTROL ROOM LOOP", 64, 72, "eyebrow", "start"),
      label("Reports became input for the next run", 64, 122, "title", "start"),
      rect(90, 230, 210, 82, "box-blue"), label("Agent run", 195, 282),
      rect(420, 200, 310, 112), label("Telegram report", 575, 258),
      rect(455, 365, 240, 70), label("Human summary", 575, 409),
      rect(455, 485, 240, 70, "box-blue"), label("Hidden machine detail", 575, 529),
      rect(830, 330, 300, 82, "box-amber"), label("Scan, approve, inspect", 980, 382),
      rect(830, 490, 300, 82, "box-blue"), label("Agent handoff input", 980, 542),
      rect(445, 630, 260, 72), label("Next run", 575, 675),
      `<path class="arrow" d="M300 271 L420 256"/>`,
      `<path class="arrow" d="M575 312 L575 365"/>`,
      `<path class="arrow" d="M575 435 L575 485"/>`,
      `<path class="arrow" d="M695 400 L830 371"/>`,
      `<path class="arrow" d="M695 520 L830 531"/>`,
      `<path class="arrow" d="M980 572 L705 666"/>`,
      `<path class="arrow" d="M445 666 L195 312"/>`,
      multiline(["A report stopped being the end of a run. It became the handoff for the next pass."], 600, 735),
    ]),
  },
  {
    slug: "03-weak-identity-stop-condition",
    name: "Weak Identity To Stop Condition",
    scene: failure,
    svg: svg("Weak Identity To Stop Condition", 1200, 760, [
      label("FAILURE TO GUARDRAIL", 64, 72, "eyebrow", "start"),
      label("If the object is unclear, the agent stops", 64, 122, "title", "start"),
      rect(70, 270, 190, 76, "box-blue"), label("Post appears", 165, 318),
      rect(330, 260, 220, 96, "box-amber"), label("Identity unclear", 440, 318),
      rect(620, 260, 220, 96, "box-amber"), label("Duplicate risk", 730, 318),
      rect(900, 260, 250, 96), label("Stop before action", 1025, 318),
      rect(355, 470, 270, 72), label("Duplicate checks", 490, 515),
      rect(690, 470, 290, 72, "box-blue"), label("Record decision", 835, 515),
      rect(500, 610, 300, 72), label("Next run uses rule", 650, 655),
      `<path class="arrow" d="M260 308 L330 308"/>`,
      `<path class="arrow" d="M550 308 L620 308"/>`,
      `<path class="arrow" d="M840 308 L900 308"/>`,
      `<path class="arrow" d="M1025 356 L625 506"/>`,
      `<path class="arrow" d="M625 506 L690 506"/>`,
      `<path class="arrow" d="M835 542 L650 610"/>`,
      `<path class="arrow" d="M500 646 L440 356"/>`,
      multiline(["A visible failure became a safer operating rule."], 600, 735),
    ]),
  },
];

mkdirSync(outDir, { recursive: true });

for (const item of previews) {
  writeFileSync(join(outDir, `${item.slug}.excalidraw`), `${JSON.stringify(item.scene, null, 2)}\n`);
  writeFileSync(join(outDir, `${item.slug}.svg`), `${item.svg}\n`);
}

writeFileSync(
  join(outDir, "README.md"),
  `# LinkedIn Growth Loop Excalidraw Drafts

These are public-safe draft diagrams for /work/linkedin-growth-loop.

## Files

1. Agent Team Responsibility Map
   - ${previews[0].slug}.excalidraw
   - ${previews[0].slug}.svg
   - ${previews[0].slug}.png

2. Telegram Control Room Loop
   - ${previews[1].slug}.excalidraw
   - ${previews[1].slug}.svg
   - ${previews[1].slug}.png

3. Weak Identity To Stop Condition
   - ${previews[2].slug}.excalidraw
   - ${previews[2].slug}.svg
   - ${previews[2].slug}.png

## Public Safety

- No raw source paths.
- No commit hashes.
- No private IDs, names, URLs, notes, ledgers, metrics, or tokens.
- Diagrams explain mental models only.
`,
);

console.log(`Wrote ${previews.length} Excalidraw drafts to ${outDir}`);
