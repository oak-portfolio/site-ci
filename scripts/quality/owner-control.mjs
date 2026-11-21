#!/usr/bin/env node
// Read-only owner reads that take a candidate id (ADR 0005). The companion of .local-setup/p13-serving/control.mjs, which
// sends fixed operation names only. This sends one POST { authoritySha256, operation, candidateId } for `status-by-id` or
// `header-by-id` and nothing else, so it cannot reach a write. The setup secret is read from the Keychain helper in-process
// and never printed. Output matches control.mjs: one JSON line { op, status, out, preview } and a 0600 receipt in --dir.
//
// Usage: node scripts/quality/owner-control.mjs <status-by-id|header-by-id> <candidateId> <authoritySha256> --dir DIR
// owner-read.mjs runs this inside its guarded workers.dev window; run it there, not by hand. OAK_OWNER_SERVICE_URL names
// the owner setup service and has no default, so the host stays out of the repo.
import { spawn } from "node:child_process";
import { writeFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const ID_READS = ["status-by-id", "header-by-id"];
const sha256 = /^[a-f0-9]{64}$/;
export const serviceUrl = process.env.OAK_OWNER_SERVICE_URL;

/** The exact request body, or a throw on anything but an id read with a 64-hex id and authority. */
export function requestBody(op, candidateId, authoritySha256) {
  if (!ID_READS.includes(op)) throw new Error(`Not an id read: ${op} (${ID_READS.join(", ")})`);
  if (!sha256.test(candidateId ?? "")) throw new Error("candidateId must be a 64-character lowercase hex sha256");
  if (!sha256.test(authoritySha256 ?? "")) throw new Error("authoritySha256 must be a 64-character lowercase hex sha256");
  return { authoritySha256, operation: op, candidateId };
}

export function parseArgs(argv) {
  const [op, candidateId, authority, flag, dir] = argv;
  if (flag !== "--dir" || !dir || argv.length !== 5) throw new Error("usage: owner-control.mjs <status-by-id|header-by-id> <candidateId> <authoritySha256> --dir DIR");
  return { body: requestBody(op, candidateId, authority), dir };
}

/** The Keychain helper control.mjs uses, beside the p13-serving dir in the main checkout's .local-setup. */
export const helperFor = dir => process.env.OAK_OWNER_KEYCHAIN_HELPER ?? path.join(dir, "..", "rag-v109-native", "keychain-helper");

const readSecret = helper => new Promise((ok, no) => {
  const child = spawn(helper, ["read"], { stdio: ["ignore", "pipe", "ignore"] }); let out = "";
  child.stdout.on("data", chunk => { out += chunk; });
  child.on("error", () => no(new Error("custody")));
  child.on("close", code => (code === 0 && sha256.test(out) ? ok(out) : no(new Error("custody"))));
});

export async function main(argv) {
  const { body, dir } = parseArgs(argv);
  if (!serviceUrl) throw new Error("OAK_OWNER_SERVICE_URL is not set: export the owner setup service URL before an id read");
  const secret = await readSecret(helperFor(dir));
  const res = await fetch(serviceUrl, { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  if (text.includes(secret)) throw new Error("secret-echo");
  const op = `${body.operation === "status-by-id" ? "status" : "header"}=${body.candidateId}`;
  const out = path.join(dir, `${body.operation}-${body.candidateId.slice(0, 8)}-${Date.now()}.json`);
  let parsed = "large";
  if (text.length < 200000) { try { parsed = JSON.parse(text || "null"); } catch { parsed = "unreadable"; } }
  writeFileSync(out, JSON.stringify({ op, status: res.status, at: new Date().toISOString(), body: parsed }, null, 1), { mode: 0o600 });
  console.log(JSON.stringify({ op, status: res.status, out, preview: text.slice(0, 700) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try { await main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 2; }
}
