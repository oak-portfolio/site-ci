import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { auditSearch } from "../../scripts/quality/search-audit.mjs";
import { readHtmlDocument } from "../../scripts/quality/html.mjs";

const origin = "https://steveoak.com";
const social = ["https://github.com/Absorber97"];
const routes = ["/", "/work/new-project", "/404"];
const ids = ["index", "new-project", "404"];
const identity = { "@type": "Person", "@id": `${origin}/#person`, name: "Steve Oak", alternateName: ["Oak"], url: `${origin}/`, image: `${origin}/portrait.png`, description: "Applied AI and design engineering.", jobTitle: "AI/design engineer", knowsAbout: ["Applied AI"], sameAs: social };

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "portfolio-search-"));
  const write = (file, content) => {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof content === "string" ? content : JSON.stringify(content));
  };
  write("profile.json", identity);
  write(".well-known/agent-profile.json", { same_as: social, primary_pages: routes.slice(0, -1).map((route) => origin + route), pages: routes.slice(0, -1).map((route) => ({ path: origin + route })) });
  write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap-index.xml\n`);
  write("sitemap-index.xml", `<sitemapindex><sitemap><loc>${origin}/sitemap-0.xml</loc></sitemap></sitemapindex>`);
  write("sitemap-0.xml", `<urlset>${routes.slice(0, -1).map((route) => `<url><loc>${origin + route}</loc></url>`).join("")}</urlset>`);
  const publicPages = [];
  routes.forEach((route, index) => {
    const title = index === 0 ? "Steve Oak" : index === 1 ? "New Project" : "Page not found";
    const canonical = origin + route;
    const description = `Public context for ${title}.`;
    const markdownHref = index === 0 ? "/index.md" : `${route}.md`;
    const markdown = `# ${title}\n\n${description}\n`;
    if (index !== 2) publicPages.push({ route, title, description, markdown });
    const machineHref = `/api/machine/${ids[index]}.json`;
    const markdownApiHref = `/api/md/${ids[index]}`;
    write(markdownHref, markdown);
    write(`${markdownApiHref}/index.html`, markdown);
    write(machineHref, { path: route, title, summary: description, markdownHref, markdownApiHref, machineJsonHref: machineHref, links: [] });
    const graph = { "@graph": [
      identity,
      { "@type": "WebSite", "@id": `${origin}/#website` },
      { "@type": index === 0 ? "ProfilePage" : "WebPage", url: canonical, name: title, description },
    ] };
    write(index === 0 ? "index.html" : `${route.slice(1)}/index.html`, `<!doctype html><html lang="en"><head>
      <title>${title}</title><meta name="description" content="${description}">
      <link rel="canonical" href="${canonical}"><link rel="alternate" href="${markdownHref}">
      ${index === 2 ? '<meta name="robots" content="noindex, nofollow">' : ""}
      <meta property="og:url" content="${canonical}"><meta property="og:title" content="${title}">
      <meta name="twitter:title" content="${title}"><meta property="og:description" content="${description}">
      <meta name="twitter:description" content="${description}"><meta property="og:image" content="${origin}/social.png">
      <meta name="twitter:image" content="${origin}/social.png"><meta property="og:site_name" content="SteveOak.com">
      <meta property="og:locale" content="en_US"><meta name="twitter:card" content="summary_large_image">
      <script type="application/ld+json">${JSON.stringify(graph)}</script></head><body><h1>${title}</h1></body></html>`);
  });
  const summary = publicPages.map((page) => `- [${page.title}](${origin + page.route}): ${page.description}`).join("\n");
  write("llms.txt", `# SteveOak.com\n${summary}\n`);
  write("llms-full.txt", `# SteveOak.com\n${summary}\n${publicPages.map((page) => page.markdown).join("\n")}`);
  write("skill.md", `# Steve Oak\n${origin}/profile.json\n${summary}\n`);
  return { directory, write, change: (file, transform) => write(file, transform(readFileSync(path.join(directory, file), "utf8"))) };
}

test("HTML parser preserves greater-than signs, quotes, entities, and attribute order", () => {
  const doc = readHtmlDocument('<!doctype html><title>A &amp; B</title><meta content="Oak > automation &quot;proof&quot;" name="description"><link href="https://steveoak.com/?q=a&amp;b=c" rel="canonical">');
  assert.equal(doc.title, "A & B");
  assert.equal(doc.meta("description"), 'Oak > automation "proof"');
  assert.equal(doc.link("canonical"), "https://steveoak.com/?q=a&b=c");
});

test("new Work page and generated resources are discovered without a page allowlist", (context) => {
  const { directory } = fixture();
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const report = auditSearch(directory);
  assert.deepEqual(report.findings, []);
  assert.ok(report.pages.includes("/work/new-project"));
});

test("private owner and callback shells stay noindex and outside public context", context => {
  const f = fixture(); context.after(() => rmSync(f.directory, { recursive: true, force: true }));
  const source = readFileSync(path.join(f.directory, '404/index.html'), 'utf8');
  for (const route of ['/owner/services', '/oak/funding/callback']) {
    f.write(`${route.slice(1)}/index.html`, source.replaceAll(`${origin}/404`, origin + route).replaceAll('Page not found', 'Private utility'));
  }
  assert.deepEqual(auditSearch(f.directory).findings, []);
  f.change('llms.txt', text => text + `\n${origin}/owner/services\n`);
  assert.ok(auditSearch(f.directory).findings.some(row => row.rule === 'private-utility-promotion'));
});

test("private utility exception does not allow another noindex public route", context => {
  const f = fixture(); context.after(() => rmSync(f.directory, { recursive: true, force: true }));
  const source = readFileSync(path.join(f.directory, '404/index.html'), 'utf8');
  f.write('owner/other/index.html', source.replaceAll(`${origin}/404`, `${origin}/owner/other`));
  assert.ok(auditSearch(f.directory).findings.some(row => row.rule === 'indexability' && row.route === '/owner/other'));
});

const mutations = [
  ["canonical-route", (f) => f.change("index.html", (text) => text.replace('rel="canonical" href="https://steveoak.com/"', 'rel="canonical" href="https://steveoak.com/work"'))],
  ["indexability", (f) => f.change("index.html", (text) => text.replace("<title>", '<meta name="robots" content="noindex"><title>'))],
  ["sitemap-coverage", (f) => f.change("sitemap-0.xml", (text) => text.replace(/<url><loc>https:\/\/steveoak.com\/work\/new-project<\/loc><\/url>/, ""))],
  ["resource-exists", (f) => rmSync(path.join(f.directory, "work/new-project.md"))],
  ["markdown-api", (f) => f.write("api/md/new-project/index.html", "Different project context.")],
  ["schema-person", (f) => f.write("profile.json", { sameAs: ["https://example.com/wrong-person"] })],
  ["schema-json", (f) => f.change("index.html", (text) => text.replace('type="application/ld+json">{', 'type="application/ld+json">broken{'))],
  ["public-content", (f) => f.write("llms.txt", "Internal path: /Users/private/project")],
  ["resource-content", (f) => f.write("llms.txt", "")],
  ["aggregate-full-text", (f) => f.change("llms-full.txt", (text) => text.replace("# New Project\n\nPublic context for New Project.\n", ""))],
  ["aggregate-coverage", (f) => f.write("skill.md", `# Steve Oak\n${origin}/profile.json\n`)],
  ["profile-required", (f) => {
    f.change("profile.json", (text) => { const data = JSON.parse(text); delete data.name; return JSON.stringify(data); });
    for (const file of ["index.html", "work/new-project/index.html", "404/index.html"]) f.change(file, (text) => text.replace('"name":"Steve Oak",', ""));
  }],
  ["profile-recovery", (f) => f.change(".well-known/agent-profile.json", (text) => {
    const data = JSON.parse(text); data.primary_pages.push(`${origin}/404`); return JSON.stringify(data);
  })],
];

for (const [rule, mutate] of mutations) {
  test(`rejects ${rule} regression`, (context) => {
    const fixtureData = fixture();
    context.after(() => rmSync(fixtureData.directory, { recursive: true, force: true }));
    mutate(fixtureData);
    assert.ok(auditSearch(fixtureData.directory).findings.some((finding) => finding.rule === rule));
  });
}

test("draft indexing keeps public resource coverage independent of search eligibility", (context) => {
  const data = fixture();
  context.after(() => rmSync(data.directory, { recursive: true, force: true }));
  for (const file of ["index.html", "work/new-project/index.html"]) data.change(file, (text) => text.replace("<title>", '<meta name="robots" content="noindex"><title>'));
  data.write("robots.txt", `User-agent: *\nDisallow: /\n\nSitemap: ${origin}/sitemap-index.xml\n`);
  rmSync(path.join(data.directory, "sitemap-index.xml"));
  rmSync(path.join(data.directory, "sitemap-0.xml"));
  assert.deepEqual(auditSearch(data.directory, { stage: "draft" }).findings, []);
});

test("public CLI fails for a broken emitted site and does not accept empty output", (context) => {
  const data = fixture();
  context.after(() => rmSync(data.directory, { recursive: true, force: true }));
  data.write("robots.txt", "User-agent: *\nDisallow: /\n");
  const result = spawnSync(process.execPath, ["scripts/audit-search.mjs", "--dist", data.directory], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /robots-indexability/);
  assert.ok(auditSearch(path.join(data.directory, "missing")).findings.some((finding) => finding.rule === "build-exists"));
});

// Built from pieces so this file never holds a literal key shape of its own.
const fake = {
  openrouter: "sk-or-v1-" + "a1b2c3d4e5f60718293a4b5c6d7e8f90",
  langsmith: "lsv2_pt_" + "0123456789abcdef0123456789abcdef_0123456789",
  exa: "EXA_API_KEY=" + "12345678-1234-4234-8234-123456789abc",
  clerk: "sk_live_" + "AbCdEfGhIjKlMnOpQrStUvWx",
  resend: "re_" + "AbCdEf12" + "_" + "GhIjKlMnOpQrStUvWxYz0123",
};
const privateMarkers = [
  ["local path", "Saved at /Users/oak/Downloads/notes.md"],
  ["home path", "Saved at /home/oak/projects/site"],
  ["OpenRouter key", `key ${fake.openrouter}`],
  ["LangSmith key", `key ${fake.langsmith}`],
  ["Exa key", fake.exa],
  ["Clerk secret", `key ${fake.clerk}`],
  ["Resend key", `key ${fake.resend}`],
  ["owner token name", "Send OWNER_API_TOKEN with the request"],
  ["owner bearer value", "Bearer oak_owner_" + "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcd"],
  [".local-setup", "See .local-setup/rounds/R30"],
  ["docs/planning", "See docs/planning/oak-ai-agent-2026-10-03/GATES.md"],
];

for (const [label, line] of privateMarkers) {
  test(`Q25-G2 a public resource with a ${label} fails the audit`, (context) => {
    const data = fixture();
    context.after(() => rmSync(data.directory, { recursive: true, force: true }));
    assert.deepEqual(auditSearch(data.directory).findings, []);
    data.change("llms.txt", (text) => `${text}${line}\n`);
    assert.ok(auditSearch(data.directory).findings.some((finding) => finding.rule === "private-marker" && finding.route === "/llms.txt"), label);
  });
}

// The one string the funding input shows as its placeholder; it is a hint, not a key.
const fundingPlaceholder = 'placeholder:"sk-or-v1-\u2026"';
const bundle = (data, file, content) => data.write(file, content);

for (const [label, line] of privateMarkers) {
  test(`Q25-G3 a built client script with a ${label} fails the audit`, (context) => {
    const data = fixture();
    context.after(() => rmSync(data.directory, { recursive: true, force: true }));
    bundle(data, "_astro/app.abc123.js", `const a=1;const note=${JSON.stringify(line)};`);
    assert.ok(auditSearch(data.directory).findings.some((finding) => finding.rule === "client-private-marker" && finding.route === "/_astro/app.abc123.js"), label);
  });
}

test("Q25-G3 an inline page script or a built JSON file with a key fails the audit", (context) => {
  const data = fixture();
  context.after(() => rmSync(data.directory, { recursive: true, force: true }));
  data.change("index.html", (html) => html.replace("</body>", `<script>window.k=${JSON.stringify(fake.openrouter)}</script></body>`));
  assert.ok(auditSearch(data.directory).findings.some((finding) => finding.rule === "client-private-marker" && finding.route === "/index.html"));
  const clean = fixture();
  context.after(() => rmSync(clean.directory, { recursive: true, force: true }));
  clean.write("_astro/data.abc123.json", JSON.stringify({ key: fake.openrouter }));
  assert.ok(auditSearch(clean.directory).findings.some((finding) => finding.rule === "client-private-marker" && finding.route === "/_astro/data.abc123.json"));
});

test("Q25-G3 a source map file and a sourceMappingURL comment fail the audit", (context) => {
  const data = fixture();
  context.after(() => rmSync(data.directory, { recursive: true, force: true }));
  bundle(data, "_astro/app.abc123.js", "const a=1;");
  assert.deepEqual(auditSearch(data.directory).findings, []);
  data.write("_astro/app.abc123.js.map", "{}");
  assert.ok(auditSearch(data.directory).findings.some((finding) => finding.rule === "source-map" && finding.route === "/_astro/app.abc123.js.map"));
  rmSync(path.join(data.directory, "_astro/app.abc123.js.map"));
  bundle(data, "_astro/app.abc123.js", "const a=1;\n//# sourceMappingURL=app.abc123.js.map");
  assert.ok(auditSearch(data.directory).findings.some((finding) => finding.rule === "source-map" && finding.route === "/_astro/app.abc123.js"));
});

test("Q25-G3 the funding input placeholder passes and a real key beside it still fails", (context) => {
  const data = fixture();
  context.after(() => rmSync(data.directory, { recursive: true, force: true }));
  bundle(data, "_astro/funding.abc123.js", `const f={${fundingPlaceholder},minLength:8};`);
  assert.deepEqual(auditSearch(data.directory).findings, []);
  bundle(data, "_astro/funding.abc123.js", `const f={${fundingPlaceholder}};const k="${fake.openrouter}";`);
  assert.ok(auditSearch(data.directory).findings.some((finding) => finding.rule === "client-private-marker"));
});
