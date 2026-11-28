// The design judge's gallery pass can run in slices (JUDGE_SLICE=i/n in design-judge.test.mjs, each writing its findings
// to JUDGE_FINDINGS_OUT). This test joins every slice's findings and checks them against known-debt.json as one pass would:
// no unlisted finding and no stale debt.
//   JUDGE_SLICE_FINDINGS=<slice-0.json>,<slice-1.json>,... node --test tests/agent/premium/judge-merge.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareDebt, judgeLikes, readFindings, refreshCommand } from "../../../scripts/design-policy/judge-debt.mjs";
import { galleryStates } from "./gallery.mjs";

const files = (process.env.JUDGE_SLICE_FINDINGS ?? "").split(",").map((file) => file.trim()).filter(Boolean);

test("every slice's findings joined are listed in known-debt.json, and no debt is stale", { skip: !files.length && "set JUDGE_SLICE_FINDINGS to the slices' findings files" }, () => {
  const debt = JSON.parse(readFileSync(new URL("./design-judge-fixtures/known-debt.json", import.meta.url), "utf8"));
  const findings = files.flatMap((file) => readFindings(readFileSync(file, "utf8")));
  const platforms = [...new Set(findings.map((finding) => finding.platform))];
  assert.ok(platforms.length <= 1, `the slices ran on one platform, not ${platforms.join(" and ")}`);
  const platform = platforms[0] ?? process.platform;
  const { unlisted, stale } = compareDebt(debt, findings, { like: judgeLikes(galleryStates), platform });
  const rows = unlisted.map((row) => row.detail).sort();
  const refresh = rows.length || stale.length ? `\n${refreshCommand(platform === "darwin" ? "darwin" : "linux")}` : "";
  assert.deepEqual({ unlisted: rows, stale }, { unlisted: [], stale: [] }, `${files.length} slices: ${rows.length} unlisted findings, ${stale.length} stale debt states${refresh}`);
});
