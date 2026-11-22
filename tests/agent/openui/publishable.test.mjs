import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { loadTsx } from "../design-rework/load-tsx.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const { oakPublishable } = loadTsx("src/lib/oakPublishable.ts");

const decided = { verified: true, "needs-oak": false, "do-not-publish": false };

test("oakPublishable decides every evidence status the content schema allows", () => {
  const schema = read("src/content.config.ts").match(/const evidenceStatus = z\.enum\(\[([^\]]+)\]\)/);
  assert.ok(schema, "src/content.config.ts declares evidenceStatus as a z.enum");
  const statuses = [...schema[1].matchAll(/"([^"]+)"/g)].map(([, status]) => status);
  assert.deepEqual(statuses.toSorted(), Object.keys(decided).toSorted(), "a new status needs a publish decision here first");
  for (const status of statuses) assert.equal(oakPublishable({ status }), decided[status], status);
});

test("oakPublishable keeps an unknown or missing status private", () => {
  for (const status of ["Verified", "verified ", "draft", "", undefined]) assert.equal(oakPublishable({ status }), false, String(status));
});

test("the verified-only rule lives in oakPublishable only, and covers, machine content and record facts call it", () => {
  const sources = (dir) => readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx|astro|mjs)$/.test(entry.name))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)));
  const copies = [...sources("src/lib"), ...sources("src/data"), ...sources("src/pages"), ...sources("src/components")]
    .filter((file) => file !== "src/lib/oakPublishable.ts")
    .filter((file) => /status\s*[!=]==\s*["'](verified|do-not-publish|needs-oak)["']/.test(read(file)));
  assert.deepEqual(copies, [], "compare an evidence status through oakPublishable");
  for (const file of ["src/lib/oakCitationCovers.server.ts", "src/data/machineContent.ts", "src/lib/oakRecordFacts.server.ts"])
    assert.match(read(file), /oakPublishable\(|filter\(oakPublishable\)|filter\(oakResultMetric\)/, file);
});
