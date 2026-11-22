import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { INTERNAL_PATTERNS as INTERNAL } from "../../scripts/quality/md-twins-built.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const src = path.join(root, "src");

globalThis.__mdTwinYamlParse = parseYaml;

function resolveAlias(relative) {
  for (const candidate of [relative, `${relative}.ts`, `${relative}.tsx`, `${relative}/index.ts`]) {
    const file = path.join(src, candidate);
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return undefined;
}

function contentStub() {
  return `
    import { readFileSync, readdirSync } from "node:fs";
    const parse = globalThis.__mdTwinYamlParse;
    export async function getCollection(name) {
      const dir = ${JSON.stringify(path.join(src, "content"))} + "/" + name;
      return readdirSync(dir).filter((file) => file.endsWith(".mdx")).sort().map((file) => {
        const match = readFileSync(dir + "/" + file, "utf8").match(/^---\\n([\\s\\S]*?)\\n---/);
        const data = parse(match[1]);
        return {
          id: file,
          data: {
            ...data,
            datePublished: new Date(data.datePublished),
            dateUpdated: new Date(data.dateUpdated),
            featured: data.featured === true,
            draft: data.draft === true,
            order: Number(data.order ?? 0),
          },
        };
      });
    }
    export async function render() { return { Content: () => null, headings: [] }; }
    export function getEntry() { return undefined; }
  `;
}

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "astro:content") return { url: "astro:content-stub", shortCircuit: true };
    if (specifier.startsWith("@/")) {
      const file = resolveAlias(specifier.slice(2));
      if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === "astro:content-stub") return { format: "module", source: contentStub(), shortCircuit: true };
    return next(url, context);
  },
});

const server = await import(pathToFileURL(path.join(src, "data/machineContent.server.ts")).href);
const work = await import(pathToFileURL(path.join(src, "lib/workContent.ts")).href);

const entries = await work.getWorkEntries();
const caseStudies = entries.map(work.workEntryToCaseStudy);
const held = caseStudies.flatMap((cs) => cs.metrics.filter((metric) => metric.status === "do-not-publish").map((metric) => metric.value));

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function caseStudyExpectation(caseStudy) {
  return {
    h1: caseStudy.projectName,
    headings: (caseStudy.machineQuestions ?? []).map((question) => question.heading),
    links: (caseStudy.sources ?? []).map((source) => source.href),
    dates: [isoDay(caseStudy.datePublished), isoDay(caseStudy.dateUpdated)],
    values: caseStudy.metrics.filter((metric) => metric.status === "verified").map((metric) => metric.value),
  };
}

function twinViolations(markdown, expect, heldValues) {
  const lines = markdown.split("\n");
  const headings = new Set(lines.filter((line) => /^#{1,6} /.test(line)).map((line) => line.replace(/^#{1,6} /, "").trim()));
  const h1Lines = lines.filter((line) => line.startsWith("# "));
  const violations = [];
  if (expect.h1 !== undefined && !h1Lines.some((line) => line.includes(expect.h1))) violations.push(`h1 missing: ${expect.h1}`);
  for (const heading of expect.headings ?? []) if (!headings.has(heading)) violations.push(`heading missing: ${heading}`);
  for (const link of expect.links ?? []) if (!markdown.includes(link)) violations.push(`link missing: ${link}`);
  for (const date of expect.dates ?? []) if (!markdown.includes(date)) violations.push(`date missing: ${date}`);
  for (const value of expect.values ?? []) if (!markdown.includes(value)) violations.push(`metric missing: ${value}`);
  for (const mention of expect.mentions ?? []) if (!markdown.includes(mention)) violations.push(`mention missing: ${mention}`);
  for (const value of heldValues) if (markdown.includes(value)) violations.push(`held metric: ${value}`);
  for (const pattern of INTERNAL) {
    const match = markdown.match(pattern);
    if (match) violations.push(`internal text: ${match[0]}`);
  }
  return violations;
}

const home = await server.getMachinePageByPath("/");
const workIndex = await server.getMachinePageByPath("/work");
const notFound = await server.getMachinePageByPath("/404");
const renders = [
  ["index", server.renderMachinePageMarkdown(home), {}],
  ["work", server.renderMachinePageMarkdown(workIndex), {}],
  ["404", server.renderMachinePageMarkdown(notFound), {}],
];
for (const caseStudy of caseStudies) {
  const page = await server.getMachinePageBySlug(caseStudy.slug);
  renders.push([`work/${caseStudy.slug}`, server.renderMachinePageMarkdown(page), caseStudyExpectation(caseStudy)]);
}
renders.push(["skill", await server.renderSkillMarkdownFromContent(), { mentions: caseStudies.map((cs) => cs.projectName) }]);

for (const [name, markdown, expect] of renders) {
  test(`${name} twin states its source facts and holds no held or internal text`, () => {
    assert.deepEqual(twinViolations(markdown, expect, held), []);
  });
}

const brain = renders.find(([name]) => name === "work/agentic-brain");

test("a twin missing one of its headings fails", () => {
  const [, markdown, expect] = brain;
  const without = markdown.replace("### What is Agentic Brain?\n", "");
  assert.notEqual(without, markdown, "fixture must remove the heading");
  assert.ok(twinViolations(without, expect, held).some((violation) => violation.includes("What is Agentic Brain?")));
});

test("a twin carrying a held metric value fails", () => {
  assert.ok(held.length > 0, "fixture needs a do-not-publish metric");
  const [, markdown, expect] = brain;
  const leaked = `${markdown}\n- Reliability outcomes: ${held[0]}\n`;
  assert.ok(twinViolations(leaked, expect, held).some((violation) => violation.includes(held[0])));
});

test("a twin carrying a local path or internal note fails", () => {
  const [, markdown, expect] = brain;
  const leaked = `${markdown}\nSource: /Users/oak/Downloads/Career/Oak Portfolio/notes.md\n`;
  assert.ok(twinViolations(leaked, expect, held).some((violation) => violation.includes("/Users/")));
});

test("each md twin source delegates to the machine renderer", () => {
  const delegates = [
    ["src/pages/index.md.ts", /getMachinePageByPath\("\/"\)/],
    ["src/pages/work.md.ts", /getMachinePageByPath\("\/work"\)/],
    ["src/pages/work/[slug].md.ts", /getMachinePageBySlug\(/],
    ["src/pages/skill.md.ts", /renderSkillMarkdownFromContent\(\)/],
    ["src/pages/404.md.ts", /getMachinePageByPath\("\/404"\)/],
  ];
  for (const [file, pattern] of delegates) {
    const source = readFileSync(path.join(root, file), "utf8");
    assert.match(source, /from "@\/data\/machineContent\.server"/, `${file} imports the server renderer`);
    assert.match(source, pattern, `${file} selects its page`);
  }
});

