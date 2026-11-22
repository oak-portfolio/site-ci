import valueParser from "postcss-value-parser";
import tsParser from "@typescript-eslint/parser";
import { relativeFile } from "./import-rule.mjs";
import { runtimeStyles, runtimeDefinitions, chartStylesheetExpression, forwardedProps } from "./policy.mjs";

const expectedTokens = new Map();
function signature(text) {
  if (!expectedTokens.has(text)) {
    const ast = tsParser.parse(`const approved = ${text};`, { range: true, tokens: true });
    const [start, end] = ast.body[0].declarations[0].init.range;
    expectedTokens.set(text, JSON.stringify(ast.tokens.filter((token) => token.range[0] >= start && token.range[1] <= end).map((token) => token.value)));
  }
  return expectedTokens.get(text);
}
const actualSignature = (node, source) => JSON.stringify(source.getTokens(node).map((token) => token.value));
const unwrap = (node) => ["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression"].includes(node?.type) ? unwrap(node.expression) : node;
const attributeName = (node) => node.name?.type === "JSXIdentifier" ? node.name.name : undefined;
const expressionOf = (node) => unwrap(node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value);
const elementName = (node) => node.type === "JSXIdentifier" ? node.name : node.type === "JSXMemberExpression" ? `${elementName(node.object)}.${elementName(node.property)}` : "";
function ownerName(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") return parent.id.name;
    if (parent.type === "FunctionDeclaration") return parent.id?.name;
  }
  return null;
}

function binding(context, node) {
  if (node.type !== "Identifier") return;
  for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper) {
    const variable = scope.set.get(node.name);
    if (variable) return variable;
  }
}

function strings(node, found = []) {
  if (!node || typeof node !== "object") return found;
  if (node.type === "Literal" && typeof node.value === "string") found.push(node.value);
  if (node.type === "TemplateLiteral") found.push(...node.quasis.map((part) => part.value.cooked ?? ""));
  for (const [key, value] of Object.entries(node)) {
    if (["parent", "loc", "range", "tokens", "comments"].includes(key)) continue;
    if (Array.isArray(value)) value.forEach((item) => strings(item, found));
    else if (value && typeof value === "object") strings(value, found);
  }
  return found;
}

function hasClass(opening, name) {
  const attr = opening.attributes.find((item) => ["class", "className"].includes(attributeName(item)) || item.name?.namespace?.name === "class");
  return strings(attr?.value).some((text) => text.split(/\s+/).includes(name));
}

function mediaBackground(node) {
  if (node?.type !== "Literal" || typeof node.value !== "string") return false;
  const parsed = valueParser(node.value);
  const meaningful = parsed.nodes.filter((item) => item.type !== "space");
  if (meaningful.length !== 1 || meaningful[0].type !== "function" || meaningful[0].value !== "image-set") return false;
  const urls = [];
  const types = [];
  let valid = true;
  parsed.walk((item) => {
    if (item.type === "function" && item.value === "url") {
      const url = valueParser.stringify(item.nodes).replace(/^['"]|['"]$/g, "");
      valid &&= /^\/assets\/[a-zA-Z0-9_./-]+$/.test(url) && !url.includes("..");
      urls.push(url);
      return false;
    }
    if (item.type === "function" && item.value === "type") {
      types.push(valueParser.stringify(item.nodes).replace(/^['"]|['"]$/g, ""));
      return false;
    }
    if (item.type === "function" && item.value !== "image-set") valid = false;
    if (item.type === "word" && !["1x", "2x"].includes(item.value)) valid = false;
  });
  return valid && urls.length === types.length && types.includes("image/avif") && types.includes("image/webp");
}

export default {
  meta: { type: "problem", schema: [], messages: { reject: "Use a semantic class. This style is outside the precise approved runtime contract.", stale: "Approved runtime exception {{anchor}} no longer matches. Review or remove its policy entry.", definition: "Runtime style source {{name}} changed. Review its permitted property/value grammar.", syntax: "Astro style coverage requires static CSS. Unsupported language, extraction bypass, or runtime injection must be registered and tested first." } },
  create(context) {
    const file = relativeFile(context.filename);
    const source = context.sourceCode;
    const exceptions = runtimeStyles.filter((item) => item.file === file);
    const used = new Map();
    const definitions = runtimeDefinitions[file] ?? {};
    const seenDefinitions = new Set();
    const forwards = forwardedProps.filter(([owner]) => owner === file);
    const usedForwards = new Set();
    let chartStyles = 0;
    const report = (node) => context.report({ node, messageId: "reject" });
    function checkStyle(node, expression, opening) {
      const exception = exceptions.find((item) => hasClass(opening, item.class) && (!item.element || elementName(opening.name) === item.element));
      if (exception) {
        used.set(exception, (used.get(exception) ?? 0) + 1);
        if (exception.expression) {
          if (!expression || actualSignature(expression, source) !== signature(exception.expression)) report(node);
          return;
        }
        if (expression?.type !== "ObjectExpression") return report(node);
        for (const property of expression.properties) {
          const key = property.key?.type === "Identifier" && !property.computed ? property.key.name : property.key?.value;
          if (property.type !== "Property" || !exception.values[key]?.some((allowed) => signature(allowed) === actualSignature(unwrap(property.value), source))) report(property);
        }
        return;
      }
      // Work MDX's established image-background custom property. No other inline property passes.
      if (/^src\/content\/work\/[^/]+\.mdx$/.test(file) && elementName(opening.name) === "div" && hasClass(opening, "work-mdx-image-grid__media")) {
        if (expression?.type === "ObjectExpression" && expression.properties.length === 1) {
          const property = expression.properties[0];
          if (property.type === "Property" && property.key?.value === "--work-grid-bg" && mediaBackground(property.value)) return;
        }
      }
      report(node);
    }
    function checkSpread(node, expression, opening, seen = new Set()) {
      const received = expression?.type === "Identifier" ? binding(context, expression) : undefined;
      if (received && received.references.some((reference) => {
        if (reference.init) return false;
        if (reference.isWrite()) return true;
        // The static-only invariant excludes property mutation and calls that could mutate it.
        return !["JSXSpreadAttribute", "SpreadElement"].includes(reference.identifier.parent?.type);
      })) return report(node);
      const definition = received?.defs[0];
      const resolved = unwrap(expression?.type === "Identifier" ? definition?.node?.init : expression);
      if (resolved?.type !== "ObjectExpression") {
        const forward = forwards.find(([, owner, element, name]) => expression?.type === "Identifier" && expression.name === name && elementName(opening.name) === element && ownerName(opening) === owner);
        const isReceived = definition?.type === "Parameter" || (file.endsWith(".astro") && source.getText(definition?.node?.init ?? node) === "Astro.props");
        if (forward && isReceived && !usedForwards.has(forward)) usedForwards.add(forward);
        else report(node);
        return;
      }
      if (received && definition?.parent?.kind !== "const") return report(node);
      if (seen.has(resolved)) return report(node);
      seen.add(resolved);
      for (const property of resolved.properties) {
        if (property.type === "SpreadElement") checkSpread(property, unwrap(property.argument), opening, seen);
        else {
          const key = property.key?.type === "Identifier" && !property.computed ? property.key.name : property.key?.value;
          if (key === undefined) report(property);
          else if (key === "style") checkStyle(property, unwrap(property.value), opening);
        }
      }
    }
    return {
      AstroHTMLComment(node) {
        if (/(?:^|\s)postcss-(?:ignore|disable|enable)\b/i.test(node.value)) context.report({ node, messageId: "syntax" });
      },
      VariableDeclarator(node) {
        if (node.id.type !== "Identifier" || !(node.id.name in definitions)) return;
        seenDefinitions.add(node.id.name);
        if (!node.init || actualSignature(node.init, source) !== signature(definitions[node.id.name])) context.report({ node, messageId: "definition", data: { name: node.id.name } });
      },
      JSXAttribute(node) {
        if (attributeName(node) === "style") checkStyle(node, expressionOf(node), node.parent);
      },
      JSXSpreadAttribute(node) {
        checkSpread(node, unwrap(node.argument), node.parent);
      },
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "style") return;
        // Static Astro CSS belongs to Stylelint. This rule sees its AstroRawText children.
        if (file.endsWith(".astro")) {
          for (const attr of node.attributes) {
            const name = attributeName(attr);
            if ((name === "lang" && expressionOf(attr)?.value !== "css") ||
                (name === "type" && expressionOf(attr)?.value !== "text/css") || name === "src" || name === "href" ||
                (attr.name?.type === "JSXNamespacedName" && ["set", "define"].includes(attr.name.namespace.name))) {
              context.report({ node: attr, messageId: "syntax" });
            }
          }
          return;
        }
        let owner = node.parent;
        while (owner && !(owner.type === "FunctionDeclaration" && owner.id?.name === "ChartStyle")) owner = owner.parent;
        const inner = node.attributes.find((attr) => attributeName(attr) === "dangerouslySetInnerHTML");
        const object = expressionOf(inner ?? {});
        const html = object?.properties?.find((prop) => prop.key?.name === "__html")?.value;
        if (file !== "src/components/ui/chart.tsx" || !owner || html?.type !== "TemplateLiteral" ||
            html.quasis.length !== 3 || html.quasis[0].value.cooked.trim() !== '[data-chart="' ||
            html.quasis[1].value.cooked.trim() !== '"] {' || html.quasis[2].value.cooked.trim() !== "}" ||
            html.expressions[0]?.type !== "Identifier" || html.expressions[0].name !== "id" || object.properties.length !== 1 ||
            actualSignature(html.expressions[1], source) !== signature(chartStylesheetExpression)) report(node);
        else chartStyles += 1;
      },
      "Program:exit"(node) {
        for (const item of exceptions) if ((used.get(item) ?? 0) !== (item.count ?? 1)) context.report({ node, messageId: "stale", data: { anchor: item.class } });
        for (const item of forwards) if (!usedForwards.has(item)) context.report({ node, messageId: "stale", data: { anchor: `${item[1] ?? item[2]} received props` } });
        for (const name of Object.keys(definitions)) if (!seenDefinitions.has(name)) context.report({ node, messageId: "definition", data: { name } });
        if (file === "src/components/ui/chart.tsx" && chartStyles !== 1) context.report({ node, messageId: "stale", data: { anchor: "ChartStyle generated stylesheet" } });
      },
    };
  },
};
