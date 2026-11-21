import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const path = "/__owner/local/quality";
export const query = {};

export const REPORT_DIR = "artifacts/quality-bar";
export const COMMAND = `node scripts/quality/quality-bar.mjs --wave <name> --pairwise <pairwise.json> --out ${REPORT_DIR}`;

/** Ticket 20's newest wave report as pass or fail per capsule, or "not built" when none exists. Never a sample reading. */
export function create({ root }: { root: string }) {
  return async () => {
    const dir = join(root, REPORT_DIR);
    const files = existsSync(dir) ? readdirSync(dir).filter((file) => /^wave-[\w.-]+\.json$/.test(file)) : [];
    if (!files.length) return { state: "not-built", report: null, command: COMMAND };
    const newest = files.map((file) => ({ file, at: statSync(join(dir, file)).mtimeMs })).sort((a, b) => b.at - a.at)[0];
    const raw = JSON.parse(readFileSync(join(dir, newest.file), "utf8"));
    const capsules = Object.entries<{ pass?: unknown } | null>(raw.capsules ?? {}).map(([name, capsule]) => ({ name, pass: capsule?.pass === true }));
    return { state: "ready", command: COMMAND, report: { file: `${REPORT_DIR}/${newest.file}`, wave: String(raw.wave ?? ""), pass: raw.pass === true, at: Math.round(newest.at), capsules } };
  };
}
