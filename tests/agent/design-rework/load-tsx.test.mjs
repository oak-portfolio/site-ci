import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { strictLoader } from "./load-tsx.mjs";

const dir = mkdtempSync(path.join(tmpdir(), "strict-loader-"));
after(() => rmSync(dir, { recursive: true, force: true }));
mkdirSync(path.join(dir, "lib"));
writeFileSync(path.join(dir, "lib/leaf.ts"), "export const leaf = 'real-leaf';\n");
writeFileSync(path.join(dir, "lib/sibling.ts"), "import { leaf } from './leaf';\nexport const sibling = 'sibling+' + leaf;\n");
writeFileSync(path.join(dir, "host.ts"), "import { sibling } from './lib/sibling';\nexport const host = sibling;\n");
writeFileSync(path.join(dir, "alias.ts"), "import { oakRelatedDrawer } from '@/lib/oakChatFlags';\nexport const alias = oakRelatedDrawer;\n");
writeFileSync(path.join(dir, "pkg.ts"), "import { z } from 'zod';\nexport const pkg = typeof z.string;\n");
writeFileSync(path.join(dir, "lib/table.json"), JSON.stringify({ rows: [1, 2, 3] }));
writeFileSync(path.join(dir, "json.ts"), "import table from './lib/table.json';\nexport const rows = table.rows.length;\n");
const host = path.join(dir, "host.ts");

test("throw mode rejects an unlisted import", () => {
  assert.throws(() => strictLoader(import.meta.url)(host), /Unexpected runtime import: \.\/lib\/sibling/);
});

test('missing "real" loads an unlisted relative import as the real file', () => {
  assert.equal(strictLoader(import.meta.url, { missing: "real" })(host).host, "sibling+real-leaf");
});

test("a listed entry wins over the real file", () => {
  const load = strictLoader(import.meta.url, { missing: "real" });
  assert.equal(load(host, { "./lib/sibling": { sibling: "stub" } }).host, "stub");
});

test('missing "real" resolves an @/ import and a bare package', () => {
  const load = strictLoader(import.meta.url, { missing: "real" });
  assert.equal(load(path.join(dir, "alias.ts")).alias, true);
  assert.equal(load(path.join(dir, "pkg.ts")).pkg, "function");
});

// Ticket 132: real mode reads JSON the way createLoader does (ticket 30's plan.ts imports a JSON table).
test('missing "real" loads an unlisted JSON import', () => {
  assert.equal(strictLoader(import.meta.url, { missing: "real" })(path.join(dir, "json.ts")).rows, 3);
});

test('a function-valued requires falls back to the real file under missing "real" when it returns undefined', () => {
  const load = strictLoader(import.meta.url, { missing: "real" });
  assert.equal(load(host, (name) => (name === "./nothing" ? {} : undefined)).host, "sibling+real-leaf");
});
