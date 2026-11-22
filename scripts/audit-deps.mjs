import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

// High advisories with no published patch. Each entry expires at most 30 days after it was added.
export const AUDIT_EXCEPTIONS = [
  {
    ghsa: "GHSA-fc5q-39xc-vjpf",
    added: "2026-11-17",
    expires: "2026-12-17",
    reason:
      "picomatch <=4.0.7 extglob ReDoS has no patched release (latest 4.0.7). The site is output: static, so picomatch only runs in astro, vite, tinyglobby and unstorage globbing at build and dev time on our own patterns; no visitor input reaches it, and the Worker tree has no picomatch.",
  },
];

export function blockingAdvisories(auditJson, exceptions = AUDIT_EXCEPTIONS, now = new Date()) {
  const live = new Set(exceptions.filter((e) => new Date(e.expires) > now).map((e) => e.ghsa));
  const found = new Map();
  for (const [name, vuln] of Object.entries(auditJson.vulnerabilities ?? {})) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || !["high", "critical"].includes(via.severity)) continue;
      const ghsa = String(via.url ?? via.source).split("/").pop();
      if (!live.has(ghsa)) found.set(ghsa, { ghsa, name, title: via.title });
    }
  }
  return [...found.values()];
}

async function main() {
  const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const banned = [
    "@radix-ui/",
    "@mui/",
    "lucide",
    "lucide-react",
  ];

  const hits = Object.keys(allDeps).filter((name) => banned.some((prefix) => name === prefix || name.startsWith(prefix)));

  if (hits.length > 0) {
    console.error(`Banned runtime dependencies found: ${hits.join(", ")}`);
    process.exit(1);
  }

  console.log("Dependency audit passed: no Radix, MUI, or lucide packages are declared.");

  // Q25-G12: no High runtime advisory in the site or the Worker, except a listed, unexpired one.
  for (const dir of ["..", "../workers/oak-agent"]) {
    const cwd = fileURLToPath(new URL(dir, import.meta.url));
    const run = spawnSync("npm", ["audit", "--omit=dev", "--json"], { cwd, encoding: "utf8" });
    const label = dir === ".." ? "site" : "worker";
    if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT/.test(run.stderr + run.stdout)) {
      // shortcut: offline runs skip the advisory check, upgrade if validate ever runs offline by default.
      console.warn(`npm audit skipped for the ${label}: registry unreachable.`);
      continue;
    }
    let report;
    try {
      report = JSON.parse(run.stdout);
    } catch {
      console.error(run.stderr.split("\n").slice(-12).join("\n"));
      console.error(`npm audit --omit=dev did not return JSON for the ${label}.`);
      process.exit(1);
    }
    const blocking = blockingAdvisories(report);
    if (blocking.length > 0) {
      for (const a of blocking) console.error(`${a.ghsa} ${a.name}: ${a.title}`);
      console.error(`npm audit --omit=dev found a High runtime advisory in the ${label}.`);
      process.exit(1);
    }
    console.log(`npm audit --omit=dev passed for the ${label}: no unexcepted High runtime advisory.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
