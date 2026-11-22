import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = path => readFileSync(`${root}${path}`, "utf8");
const json = path => JSON.parse(read(path));
const entry = "\0public-chunks-entry";
const source = `
export { default as SiteView } from "@/lib/openui/components/site/SiteView";
export { oakPlanFor, oakLinkedCaseStudy } from "${root}packages/oak-agent-contracts/src/openui/plan";
export { oakContactCardFacts, forceOakContactCardRecord, oakContactCardRecord } from "@/data/contactCard";
`;

const bundle = async () => {
  const out = await build({
    configFile: false, root, logLevel: "silent",
    resolve: { alias: { "@": `${root}src` }, dedupe: ["react", "react-dom"] },
    plugins: [{ name: "entry", resolveId: id => id === entry ? id : null, load: id => id === entry ? source : null }],
    build: { write: false, minify: true, rollupOptions: { input: entry, preserveEntrySignatures: "strict", external: [/^react/, /^@openuidev/, /^motion/, /^@base-ui/, /^@hugeicons/] } },
  });
  return [out].flat().flatMap(result => result.output).filter(file => file.type === "chunk").map(file => file.code).join("\n");
};

test("public chunks: the client bundle of SiteView, the answer plan and the contact card carries no internal note, path or unreviewed row", async () => {
  const code = await bundle();
  for (const needle of ["knowledge/", "scripts/", "validator:`", "Draft for Oak", "system instructions", "approved:!1"]) assert.ok(!code.includes(needle), `a client chunk carries ${needle}`);
  for (const row of json("packages/oak-agent-contracts/src/career-case-study-links.json").links.filter(link => link.approved !== true)) {
    assert.ok(!code.includes(row.source) && !code.includes(`entry:\`${row.entry}\``), `the unapproved career link ${row.entry} ships`);
  }
  const contact = read("src/data/contactCard.ts");
  const draft = contact.match(/availability: "([^"]+)"/)?.[1];
  assert.ok(draft, "the contact draft keeps its availability line in source");
  if (!/reviewed = true/.test(contact)) assert.ok(!code.includes(draft), "the unreviewed contact record ships");
});

test("public chunks: the shipped projections equal their sources", () => {
  const owners = json("knowledge/owners.json").owners.map(({ id, status, channels, outputs }) => ({ id, status, channels, outputs }));
  assert.deepEqual(json("src/data/siteOwners.json"), owners, "src/data/siteOwners.json is stale: re-project id, status, channels and outputs from knowledge/owners.json");
  const links = json("packages/oak-agent-contracts/src/career-case-study-links.json").links
    .filter(link => link.approved === true).map(({ entry, caseStudy, approved }) => ({ entry, caseStudy, approved }));
  assert.deepEqual(json("packages/oak-agent-contracts/src/career-case-study-links.approved.json"), { links }, "career-case-study-links.approved.json is stale: copy each approved row's entry, caseStudy and approved");
});
