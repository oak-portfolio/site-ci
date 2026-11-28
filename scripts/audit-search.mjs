import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { siteVisibility } from "../src/data/siteVisibility.ts";
import { auditSearch } from "./quality/search-audit.mjs";

const { values } = parseArgs({ options: { dist: { type: "string", default: "dist" }, json: { type: "string" } } });
const report = auditSearch(path.resolve(values.dist), { stage: siteVisibility.stage });
if (values.json) {
  await mkdir(path.dirname(values.json), { recursive: true });
  await writeFile(values.json, `${JSON.stringify(report, null, 2)}\n`);
}
for (const finding of report.findings) console.error(`${finding.route}: ${finding.rule}: ${finding.message}`);
console.log(`Search audit: ${report.pages.length} HTML pages, ${report.machinePages.length} Machine pages, ${report.findings.length} findings.`);
process.exitCode = report.findings.length ? 1 : 0;
