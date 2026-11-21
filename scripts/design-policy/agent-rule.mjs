import { relativeFile } from "./import-rule.mjs";

const rawControls = new Set(["textarea", "select", "input"]);

/** Form controls render through src/components/ui primitives so fields share one look and one accessible structure. */
export const rawControl = {
  meta: { type: "problem", schema: [], messages: { raw: "Raw <{{name}}> belongs in src/components/ui. Use the ui primitive instead." } },
  create(context) {
    if (relativeFile(context.filename).startsWith("src/components/ui/")) return {};
    return {
      JSXOpeningElement(node) {
        if (node.name.type === "JSXIdentifier" && rawControls.has(node.name.name)) context.report({ node, messageId: "raw", data: { name: node.name.name } });
      },
    };
  },
};

/** Agent code reaches Base UI through src/components/ui wrappers only. */
export const agentBaseUiImport = {
  meta: { type: "problem", schema: [], messages: { direct: 'Import "{{name}}" through a src/components/ui primitive, not directly in agent code.' } },
  create(context) {
    if (!relativeFile(context.filename).startsWith("src/components/agent/")) return {};
    return {
      ImportDeclaration(node) {
        const name = node.source.value;
        if (typeof name === "string" && /^@base-ui\/react(?:\/|$)/.test(name)) context.report({ node, messageId: "direct", data: { name } });
      },
    };
  },
};
