import path from "node:path";
import { iconOwner } from "./policy.mjs";

export const relativeFile = (file) => path.relative(process.cwd(), file).split(path.sep).join("/");
const forbidden = /^(?:@radix-ui\/|@mui\/|@material-ui\/|radix-ui(?:\/|$)|lucide(?:-react)?(?:\/|$))/;
const iconPackage = /^(?:@hugeicons(?:-pro)?\/)/;
const allowedIconPackages = new Set(["@hugeicons/react", "@hugeicons-pro/core-solid-rounded"]);
/** Figure drawings (data charts inside OakFigure, ticket 40; the topic map wires, ticket 52; the Explainer presets, ticket 53) draw their own SVG; every other file keeps the Icon rule. */
const figureDrawings = new Set(["src/lib/openui/components/EvidenceChartView.tsx", "src/lib/openui/components/diagram/mindmap.tsx",
  "src/lib/openui/components/diagram/radar.tsx", "src/lib/openui/components/diagram/quadrant.tsx", "src/lib/openui/components/explainer/topicMap.tsx",
  "src/lib/openui/components/explainer/xrag.tsx", "src/lib/openui/components/explainer/xemb.tsx", "src/lib/openui/components/explainer/xtool.tsx",
  "src/lib/openui/components/explainer/statediag.tsx", "src/lib/openui/components/explainer/xeval.tsx", "src/lib/openui/components/explainer/xgrad.tsx",
  "src/lib/openui/components/explainer/xoffsteps.tsx"]);

export default {
  meta: { type: "problem", schema: [], messages: { forbidden: 'Import "{{name}}" bypasses the approved UI. Use Base UI wrappers and @/components/ui/Icon.', owner: 'Import "{{name}}" only in src/components/ui/Icon.tsx, using the Solid Rounded family.', svg: "Use the Icon wrapper. Inline SVG is reserved for its single approved Reddit brand mark.", dynamic: "Use a literal module specifier so the UI import boundary can be verified." } },
  create(context) {
    const file = relativeFile(context.filename);
    let svgCount = 0;
    function check(node, source) {
      if (!source || typeof source.value !== "string") return;
      const name = source.value;
      if (forbidden.test(name)) context.report({ node, messageId: "forbidden", data: { name } });
      else if (iconPackage.test(name) && (file !== iconOwner || !allowedIconPackages.has(name))) {
        context.report({ node, messageId: "owner", data: { name } });
      }
    }
    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression(node) {
        if (typeof node.source?.value !== "string") context.report({ node, messageId: "dynamic" });
        else check(node, node.source);
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          if (typeof node.arguments[0]?.value !== "string") context.report({ node, messageId: "dynamic" });
          else check(node, node.arguments[0]);
        }
      },
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "svg" || figureDrawings.has(file)) return;
        svgCount += 1;
        if (file !== iconOwner || svgCount > 1) context.report({ node, messageId: "svg" });
      },
    };
  },
};
