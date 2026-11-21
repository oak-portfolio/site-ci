import { parse } from "parse5";
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

export function walkFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(file) : [file];
  });
}

export function descendants(node) {
  if (!node) return [];
  return [node, ...(node.childNodes ?? []).flatMap(descendants)];
}

export function attribute(node, name) {
  return node?.attrs?.find((item) => item.name === name)?.value ?? "";
}

export function textContent(node) {
  return node?.nodeName === "#text" ? node.value : (node?.childNodes ?? []).map(textContent).join("");
}

export function readHtmlDocument(html) {
  const document = parse(html);
  const nodes = descendants(document);
  const byTag = (tag) => nodes.filter((node) => node.tagName === tag);
  const head = nodes.find((node) => node.tagName === "head");
  const headNodes = descendants(head);
  const metas = headNodes.filter((node) => node.tagName === "meta");
  const links = headNodes.filter((node) => node.tagName === "link");
  return {
    nodes,
    byTag,
    isDocument: nodes.some((node) => node.nodeName === "#documentType" && node.name === "html"),
    title: textContent(headNodes.find((node) => node.tagName === "title")).trim(),
    meta: (key) => attribute(metas.find((node) => attribute(node, "name") === key || attribute(node, "property") === key), "content"),
    links: (rel) => links.filter((node) => attribute(node, "rel").split(/\s+/).includes(rel)),
    link: (rel) => attribute(links.find((node) => attribute(node, "rel").split(/\s+/).includes(rel)), "href"),
    schemas: byTag("script").filter((node) => attribute(node, "type") === "application/ld+json").map(textContent),
  };
}

export function normalizeRoute(route) {
  return route === "/" ? "/" : route.replace(/\/+$/, "");
}

export function routeForFile(dist, file) {
  const relative = path.relative(dist, file).split(path.sep).join("/");
  if (relative === "index.html") return "/";
  return normalizeRoute(`/${relative.replace(/\/index\.html$/, "").replace(/\.html$/, "")}`);
}

export function findOutputFile(dist, href, origin = "https://steveoak.com") {
  const url = new URL(href, origin);
  if (url.origin !== origin) return undefined;
  const target = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
  if (target !== path.resolve(dist) && !target.startsWith(`${path.resolve(dist)}${path.sep}`)) return undefined;
  return [target, path.join(target, "index.html"), `${target}.html`].find((file) => existsSync(file) && statSync(file).isFile());
}
