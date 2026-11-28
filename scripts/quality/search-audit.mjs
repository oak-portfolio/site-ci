import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { attribute, findOutputFile, normalizeRoute, readHtmlDocument, routeForFile, textContent, walkFiles } from "./html.mjs";

const origin = "https://steveoak.com";
// Exact private utility shells. Their API data remains authenticated and no-store.
// Ticket 50: the replay gallery stays noindex until Oak reviews its replays at a sitting.
const privateUtilityRoutes = new Set(['/owner/services', '/oak/funding/callback', '/privacy', "/gallery"]);
const internalText = /\/Users\/|\/home\/[^/\s]+\/|Codex Workpad|source[- ]packet|claim[- ]safety|noindex-draft|do-not-publish|MOTION_PLUS_TOKEN|NPM_TOKEN/i;
// Q25-G2/G3: private markers that must never reach a public resource or a built client script.
// shortcut: key shapes are provider prefixes plus a minimum length, and Exa keys (plain UUIDs) only count beside their variable name; add a shape when a provider changes its format.
const secretNames = ["OWNER_API_TOKEN", "SESSION_SIGNING_KEY", "CLERK_SECRET_KEY", "CLERK_JWT_KEY", "LEDGER_INTERNAL_KEY", "DOCUMENT_SIGNING_KEY", "DOCUMENT_INTERNAL_KEY", "CLOUDFLARE_DOCUMENT_TOKEN", "KEY_QUEUE_MASTER_KEY", "SPONSOR_OPENROUTER_KEY", "LANGSMITH_API_KEY", "RESEND_API_KEY", "EXA_API_KEY", "DEEPGRAM_API_KEY", "TURNSTILE_SECRET_KEY", "OAK_RETRIEVAL_SETUP"];
const privateMarkers = [
  ["a local path", /\/Users\/[^/\s"'`]+|\/home\/[^/\s"'`]+\/|\/private\/var\/|\/var\/folders\/|\b[A-Z]:\\Users\\/],
  ["an OpenRouter key", /sk-or-v1-[\w-]*/],
  ["a LangSmith key", /\blsv2_(?:pt|sk)_[\w]{8,}|\bls__[\w]{16,}/],
  ["an Exa key", /exa[_-]?(?:api[_-]?)?key["'\s:=]{1,6}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ["a Clerk secret", /\bsk_(?:live|test)_[A-Za-z0-9]{10,}/],
  ["a Resend key", /\bre_[A-Za-z0-9]+_[A-Za-z0-9]{16,}/],
  ["an owner bearer value", /\boak_owner_[\w-]{20,}/],
  ["an owner token name", new RegExp(`\\b(?:${secretNames.join("|")})\\b`)],
  ["a .local-setup path", /\.local-setup/],
  ["a docs/planning path", /docs\/planning/],
];
// The funding input shows this as its placeholder. It is a hint about the key shape, never a key.
const allowedPlaceholders = ["sk-or-v1-\u2026", "sk-or-v1-\\u2026"];
const privateMarkersIn = (content) => {
  const clean = allowedPlaceholders.reduce((text, allowed) => text.replaceAll(allowed, ""), content);
  return privateMarkers.filter(([, pattern]) => pattern.test(clean)).map(([name]) => name);
};
const read = (file) => readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const normalizedText = (value) => value.replace(/\s+/g, " ").trim();

export function auditSearch(dist, { stage = "launch" } = {}) {
  const findings = [];
  const fail = (rule, route, message) => findings.push({ rule, route, message });
  const check = (condition, rule, route, message) => { if (!condition) fail(rule, route, message); };
  const resolve = (href, route) => {
    try {
      const url = new URL(href, origin);
      if (url.origin !== origin) return undefined;
      const file = findOutputFile(dist, url.href);
      check(Boolean(file), "resource-exists", route, `Missing local resource ${href}`);
      return file;
    } catch {
      fail("resource-url", route, `Invalid resource URL ${href}`);
      return undefined;
    }
  };
  if (!existsSync(dist)) return { findings: [{ rule: "build-exists", route: "/", message: "Build output is missing" }], pages: [], machinePages: [] };
  const htmlFiles = walkFiles(dist).filter((file) => file.endsWith(".html"));
  const pages = htmlFiles.map((file) => ({ file, route: routeForFile(dist, file), document: readHtmlDocument(read(file)) })).filter((page) => page.document.isDocument);
  check(pages.length > 0, "page-coverage", "/", "No full HTML pages were found");
  const canonicalPages = new Map();
  const profileFile = resolve("/profile.json", "/");
  const profile = profileFile ? json(profileFile) : undefined;
  const identityFields = ["name", "alternateName", "url", "image", "description", "jobTitle", "knowsAbout", "sameAs"];
  for (const field of identityFields) {
    const value = profile?.[field];
    const present = Array.isArray(value) ? value.length > 0 && value.every((entry) => typeof entry === "string" && entry.trim()) : typeof value === "string" && value.trim();
    check(present, "profile-required", "/profile.json", `Required identity field ${field} is missing or empty`);
  }
  check(profile?.["@type"] === "Person" && profile?.["@id"] === `${origin}/#person`, "profile-type", "/profile.json", "Expected the canonical Person identity");

  for (const { route, document: doc } of pages) {
    const canonical = doc.link("canonical");
    let canonicalRoute;
    try {
      const url = new URL(canonical);
      canonicalRoute = normalizeRoute(url.pathname);
      check(url.origin === origin && !url.search && !url.hash, "canonical-origin", route, "Canonical must be an absolute clean production URL");
    } catch { fail("canonical-url", route, "Canonical is missing or invalid"); }
    check(canonicalRoute === route, "canonical-route", route, `Canonical points at ${canonical}`);
    check(doc.links("canonical").length === 1, "canonical-count", route, "Expected exactly one canonical link");
    check(!canonicalPages.has(canonicalRoute), "canonical-unique", route, "Canonical duplicates another HTML page");
    canonicalPages.set(canonicalRoute, doc);
    const noindex = /(?:^|[,\s])noindex(?:$|[,\s])/i.test(doc.meta("robots"));
    check(noindex === (stage === "draft" || route === "/404" || privateUtilityRoutes.has(route)), "indexability", route, "Indexability must match the public page or explicit private utility route");
    check(doc.byTag("h1").length === 1, "heading", route, "Expected one server-rendered H1");
    check(doc.meta("og:url") === canonical, "social-canonical", route, "Open Graph URL must match canonical");
    check(doc.meta("og:title") === doc.title && doc.meta("twitter:title") === doc.title, "social-title", route, "Social titles must match the HTML title");
    check(doc.meta("og:description") === doc.meta("description") && doc.meta("twitter:description") === doc.meta("description"), "social-description", route, "Social descriptions must match the HTML description");
    check(doc.meta("og:image") === doc.meta("twitter:image"), "social-image", route, "Social image URLs must agree");
    check(doc.meta("og:site_name") === "SteveOak.com" && doc.meta("og:locale") === "en_US", "social-identity", route, "Expected site name and locale");
    check(doc.meta("twitter:card") === "summary_large_image", "social-card", route, "Expected a large-image social card");
    for (const alternate of doc.links("alternate")) resolve(attribute(alternate, "href"), route);
    for (const anchor of doc.byTag("a")) {
      const href = attribute(anchor, "href");
      if (href.startsWith("/") && !href.startsWith("//")) resolve(href, route);
    }
    try {
      const schemas = doc.schemas.flatMap((source) => {
        const value = JSON.parse(source);
        return value["@graph"] ?? [value];
      });
      const person = schemas.find((item) => item["@type"] === "Person");
      const website = schemas.find((item) => item["@type"] === "WebSite");
      const page = schemas.find((item) => ["WebPage", "ProfilePage"].includes(item["@type"]));
      check(Boolean(person && website && page), "schema-foundation", route, "Expected Person, WebSite, and WebPage or ProfilePage schema");
      check(page?.url === canonical && page?.name === doc.title && page?.description === doc.meta("description"), "schema-page", route, "Page schema must match visible page metadata");
      check(person?.["@id"] === `${origin}/#person` && same(person?.sameAs, profile?.sameAs), "schema-person", route, "Person identity and social profiles must match profile.json");
      for (const field of ["name", "alternateName", "url", "image", "description", "jobTitle", "knowsAbout"]) {
        check(same(person?.[field], profile?.[field]), "schema-profile", route, `Person ${field} differs from profile.json`);
      }
      check(!schemas.some((item) => /LocalBusiness/.test(JSON.stringify(item["@type"]))), "schema-business", route, "Personal portfolio must not claim a local business");
      if (route === "/") check(page?.["@type"] === "ProfilePage", "schema-home", route, "Homepage must describe the person profile");
    } catch (error) { fail("schema-json", route, error.message); }
  }

  const sitemapFile = stage === "draft" ? findOutputFile(dist, "/sitemap-index.xml") : resolve("/sitemap-index.xml", "/");
  const sitemapRoutes = [];
  if (sitemapFile) {
    const index = readHtmlDocument(read(sitemapFile));
    const sitemapUrls = index.byTag("loc").map(textContent);
    check(sitemapUrls.length > 0, "sitemap-index", "/", "Sitemap index is empty");
    for (const href of sitemapUrls) {
      const file = resolve(href, "/sitemap-index.xml");
      if (!file) continue;
      for (const loc of readHtmlDocument(read(file)).byTag("loc")) {
        try {
          const url = new URL(textContent(loc));
          check(url.origin === origin, "sitemap-origin", textContent(loc), "Sitemap URL must use the production origin");
          sitemapRoutes.push(normalizeRoute(url.pathname));
        } catch { fail("sitemap-url", "/", "Invalid sitemap location"); }
      }
    }
  }
  const contentRoutes = pages.map((page) => page.route).filter((route) => route !== "/404" && !privateUtilityRoutes.has(route)).sort();
  const expectedRoutes = stage === "draft" ? [] : contentRoutes;
  check(same([...sitemapRoutes].sort(), expectedRoutes), "sitemap-coverage", "/", `Sitemap must match indexable HTML routes. Expected ${expectedRoutes.join(", ")}; found ${sitemapRoutes.sort().join(", ")}`);

  const robotsFile = resolve("/robots.txt", "/");
  if (robotsFile) {
    const robots = read(robotsFile);
    const defaultGroup = robots.match(/User-agent:\s*\*\s*\n([\s\S]*?)(?=\n\s*User-agent:|$)/i)?.[1] ?? "";
    check(stage === "draft" ? /Disallow:\s*\/\s*(?:\n|$)/i.test(defaultGroup) : !/Disallow:\s*\/\s*(?:\n|$)/i.test(defaultGroup), "robots-indexability", "/robots.txt", "Default crawler policy does not match the launch stage");
    check(robots.includes(`Sitemap: ${origin}/sitemap-index.xml`), "robots-sitemap", "/robots.txt", "Missing canonical sitemap link");
  }

  const machineDirectory = path.join(dist, "api/machine");
  const machineFiles = existsSync(machineDirectory) ? walkFiles(machineDirectory).filter((file) => file.endsWith(".json")) : [];
  const machinePages = new Map();
  for (const file of machineFiles) {
    const page = json(file);
    const route = page.path;
    if (machinePages.has(route)) check(same(page, machinePages.get(route)), "machine-alias", route, "Machine JSON aliases disagree");
    machinePages.set(route, page);
    check(!internalText.test(read(file)), "public-content", route, "Machine JSON contains internal notes or local paths");
    check(canonicalPages.has(route), "machine-html", route, "Machine page must have a canonical HTML page");
    for (const href of [page.markdownHref, page.markdownApiHref, page.machineJsonHref, ...page.links.map((link) => link.href)].filter(Boolean)) resolve(href, route);
    const markdownFile = resolve(page.markdownHref, route);
    if (markdownFile) {
      const markdown = read(markdownFile);
      check(markdown.startsWith(`# ${page.title}\n`), "markdown-title", route, "Markdown title differs from Machine JSON");
      check(normalizedText(markdown).includes(normalizedText(page.summary)), "markdown-summary", route, "Markdown summary differs from Machine JSON");
      if (page.markdownApiHref) {
        const apiFile = resolve(page.markdownApiHref, route);
        if (apiFile) {
          const apiText = apiFile.endsWith(".html") ? textContent(readHtmlDocument(read(apiFile)).byTag("body")[0]) : read(apiFile);
          check(normalizedText(apiText) === normalizedText(markdown), "markdown-api", route, "Markdown API differs from its generated mirror");
        }
      }
    }
  }
  check(same([...machinePages.keys()].sort(), pages.filter(page => !privateUtilityRoutes.has(page.route)).map((page) => page.route).sort()), "machine-coverage", "/", "Every public HTML page must have one consistent generated Machine page; private utilities must stay absent");
  const agentFile = resolve("/.well-known/agent-profile.json", "/");
  if (agentFile) {
    const agent = json(agentFile);
    check(same(agent.same_as, profile?.sameAs), "profile-identity", "/", "Agent and Person profiles must share social links");
    check(!agent.primary_pages.includes(`${origin}/404`), "profile-recovery", "/", "Recovery pages must not be promoted as primary profile pages");
    check(same(agent.pages.map((page) => normalizeRoute(new URL(page.path).pathname)).sort(), contentRoutes), "profile-coverage", "/", "Agent profile must cover all public content pages");
  }
  for (const resource of ["/llms.txt", "/llms-full.txt", "/skill.md", "/profile.json", "/.well-known/agent-profile.json", ...[...machinePages.values()].map((page) => page.markdownHref)]) {
    const file = resolve(resource, resource);
    if (!file) continue;
    const content = read(file);
    check(content.trim().length > 0, "resource-content", resource, "Public resource is empty");
    check(!internalText.test(content), "public-content", resource, "Public resource contains internal notes or local paths");
    for (const marker of privateMarkersIn(content)) fail("private-marker", resource, `Public resource contains ${marker}`);
    check(![...privateUtilityRoutes].some(route => content.includes(origin + route)), "private-utility-promotion", resource, "Public context must not promote private utility routes");
    if (resource.startsWith("/llms")) check(!content.includes(`${origin}/404`), "llms-recovery", resource, "Recovery page must not be promoted in portfolio context");
    if (resource.startsWith("/llms") || resource === "/skill.md") {
      const urls = new Set(content.match(/https:\/\/steveoak\.com[^\s)]+/g) ?? []);
      for (const route of contentRoutes) {
        const page = machinePages.get(route);
        check(urls.has(origin + route) && Boolean(page?.title && content.includes(page.title)), "aggregate-coverage", resource, `Missing public page ${route}`);
        if (resource.startsWith("/llms")) check(Boolean(page?.summary && normalizedText(content).includes(normalizedText(page.summary))), "aggregate-summary", resource, `Missing source summary for ${route}`);
        if (resource === "/llms-full.txt" && page?.markdownHref) {
          const mirror = findOutputFile(dist, page.markdownHref);
          check(Boolean(mirror && normalizedText(content).includes(normalizedText(read(mirror)))), "aggregate-full-text", resource, `Missing full context for ${route}`);
        }
      }
      if (resource === "/skill.md") check(urls.has(`${origin}/profile.json`), "skill-profile", resource, "Skill must link the canonical identity profile");
    }
  }
  for (const file of walkFiles(dist)) {
    const route = `/${path.relative(dist, file).split(path.sep).join("/")}`;
    if (file.endsWith(".map")) fail("source-map", route, "The build must not ship a source map");
    // Q25-G3 review: inline page scripts and built JSON reach the browser too.
    if (file.endsWith(".html")) {
      const inline = [...read(file).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).join("\n");
      for (const marker of privateMarkersIn(inline)) fail("client-private-marker", route, `Inline page script contains ${marker}`);
    }
    if (file.endsWith(".json")) for (const marker of privateMarkersIn(read(file))) fail("client-private-marker", route, `Built JSON contains ${marker}`);
    if (!/\.(?:js|mjs|css)$/.test(file)) continue;
    const content = read(file);
    check(!/sourceMappingURL/.test(content), "source-map", route, "Built file points at a source map");
    if (/\.(?:js|mjs)$/.test(file)) for (const marker of privateMarkersIn(content)) fail("client-private-marker", route, `Built client script contains ${marker}`);
  }
  return { findings, stage, pages: pages.map(({ route }) => route), sitemapRoutes, machinePages: [...machinePages.keys()] };
}
