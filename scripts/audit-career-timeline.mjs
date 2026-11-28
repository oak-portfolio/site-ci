import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const source = await read("src/data/careerTimeline.ts");
const javascript = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { careerTimelineItems: items } = await import(`data:text/javascript;base64,${Buffer.from(javascript).toString("base64")}`);
const expected = [
  ["oaklabs", "May 2026 - Present", "self-employed"],
  ["hyperskalers", "Feb 2026 - May 2026", "contract"],
  ["sanfranciscobayuniversity", "May 2024 - Dec 2025", "part-time"],
  ["uhttention", "Jan 2024 - Jan 2025", "part-time"],
  ["globaledtechorganization", "Nov 2022 - Feb 2024", "part-time"],
  ["pnppsolutions", "Nov 2018 - Jan 2024", "full-time"],
];
const normalize = (text) => text.replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&#x([a-f0-9]+);/gi, (_, number) => String.fromCodePoint(parseInt(number, 16)))
  .replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">")
  .replace(/\s+/g, " ").trim();
const count = (text, token) => text.split(token).length - 1;
const leaves = (value) => typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(leaves) : value && typeof value === "object" ? Object.values(value).flatMap(leaves) : [];
const assertContains = (haystack, needle, label) => assert(normalize(haystack).includes(normalize(needle)), `${label} missing ${needle}`);
const allHashes = items.flatMap((item) => [item.id, ...item.aliases]);
assert.equal(new Set(allHashes).size, allHashes.length, "Career IDs and aliases must be unique");
assert.deepEqual(items.map((item) => item.id), expected.map(([id]) => id), "Six entries in agreed order");

for (const [id, date, engagement] of expected) {
  const item = items.find((entry) => entry.id === id);
  assert.equal(item.date, date, `${id} dates`);
  assert(!("role" in item), `${id} has a duplicate role field`);
  assert(item.contexts.some((context) => context.type === "employment" && context.engagement === engagement), `${id} employment context`);
  assert.equal(item.badges.length, 3, `${id} has exactly three focus badges`);
  assert.equal(new Set(item.badges).size, 3, `${id} badges are distinct`);
  for (const field of ["highlights", "stack"]) {
    assert(item[field].length > 0, `${id} ${field} nonempty`);
    for (const group of item[field]) {
      assert.equal(typeof group, "object", `${id} ${field} uses groups`);
      assert(group.items.length > 0 && group.items.every((text) => typeof text === "string" && text.trim()), `${id} ${field} has complete items`);
    }
  }
  if (id !== "sanfranciscobayuniversity") {
    assert.equal(item.highlights.length, 1, `${id} keeps one highlight list`);
    assert(!item.highlights[0].label, `${id} avoids redundant highlight headings`);
  }
  const legacy = `career-${item.place.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
  assert(item.aliases.includes(legacy), `${id} legacy alias preserved`);
}

const sfbu = items.find((item) => item.id === "sanfranciscobayuniversity");
assert.equal(sfbu.label, "2024-2025");
assert.equal(sfbu.contexts.length, 2, "One SFBU card with two contexts");
assert(sfbu.contexts.some((context) => context.type === "education" && context.status === "completed"));
const sfbuCopy = leaves(sfbu).join(" ");
for (const term of ["60%", "1,000+", "3.89", "100%", "Scholarship", "Flask", "OpenAI", "EcoSmartLoop", "Next.js", "AWS", "team"]) assertContains(sfbuCopy, term, "SFBU");
const supportOutcome = sfbu.highlights.find((group) => group.label === "Student support")?.items.find((text) => text.includes("60%"));
assert(supportOutcome && /reported/i.test(supportOutcome), "SFBU measurement retains its reported qualifier");
assert(!/Candidate|8K\+|100K|2K tokens|700K|500K|450K|BetterAuth|Supabase|FastAPI|Tremendous/.test(sfbuCopy), "SFBU held details remain excluded");
assert(!/35%|80%|deterministic/i.test(leaves(items[0]).join(" ")), "Oak Labs modeled details remain excluded");
assert(!/MCP|LangGraph|100K|2K tokens/.test(leaves(items[3]).join(" ")), "Uhttention does not backdate held technologies");
assert(!/2,000|35%|medical-device/.test(leaves(items[5]).join(" ")), "PNPP unsupported precision remains excluded");
assertContains(leaves(items[4]).join(" "), "$100M", "EdTech organization revenue");
console.log("SOURCE PASS: six complete, qualified timeline entries");

if (!process.argv.includes("--source-only")) {
  const page = JSON.parse(await read("dist/api/machine/work.json"));
  const markdown = normalize(await read("dist/work.md"));
  const apiMarkdown = normalize(await read("dist/api/md/work/index.html"));
  const full = await read("dist/llms-full.txt");
  const sectionStart = full.indexOf("# Work | Steve Oak\n");
  assert(sectionStart >= 0, "Work section in llms-full");
  const nextPage = full.indexOf("\n# ", sectionStart + 1);
  const workSection = normalize(full.slice(sectionStart, nextPage < 0 ? full.length : nextPage));
  const workHtml = await read("dist/work/index.html");
  const homeHtml = await read("dist/index.html");
  const careerFacts = page.facts.filter((fact) => items.some((item) => fact.label.includes(item.place)));
  assert.equal(careerFacts.length, 6, "Exactly six career facts");
  assertContains(homeHtml, 'href="/work#oaklabs"', "Homepage latest-career destination");
  for (const item of items) {
    assert.equal(count(workHtml, `id="${item.id}"`), 1, `${item.id} canonical DOM anchor`);
    const matching = careerFacts.filter((fact) => fact.label.includes(item.place));
    assert.equal(matching.length, 1, `${item.id} has one fact`);
    const fact = matching[0];
    assert.deepEqual(Object.keys(fact).filter((key) => !["label", "value", "items", "source"].includes(key)), [], "MachineFact public shape unchanged");
    const copy = [fact.label, fact.value, ...fact.items ?? []].join(" ");
    for (const context of item.contexts) {
      const qualification = context.type === "employment" ? context.engagement : context.status;
      assertContains(copy.toLowerCase(), qualification, `${item.id} context qualification`);
    }
    for (const term of [item.label, item.date, item.place, item.title, item.summary, ...item.badges,
      ...item.contexts.map((context) => context.title), ...item.highlights.flatMap((group) => [group.label, ...group.items].filter(Boolean)),
      ...item.stack.flatMap((group) => [group.label, ...group.items].filter(Boolean))]) {
      assertContains(copy, term, `${item.id} JSON`);
      for (const [label, text] of [["Markdown", markdown], ["Markdown API", apiMarkdown], ["llms Work section", workSection]]) assertContains(text, term, `${item.id} ${label}`);
    }
    for (const [label, text] of [["Markdown", markdown], ["Markdown API", apiMarkdown], ["llms Work section", workSection]]) {
      assert.equal(count(text, `- ${fact.label}:`), 1, `${item.id} appears once as a record in ${label}`);
    }
    for (const section of [page.answerBlocks, page.proofSignals]) assert(!JSON.stringify(section).includes(item.summary), `${item.id} not duplicated outside facts`);
    assert(!/\/Users\/|claims-review|derived-unverified|source packet|modeled estimate|COMPARISON\.md/.test(copy), `${item.id} has public copy only`);
  }
  console.log("RESOURCES PASS: six complete records in JSON, both Markdown routes and the llms Work section");
}
