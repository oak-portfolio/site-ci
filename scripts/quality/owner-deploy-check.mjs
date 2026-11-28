#!/usr/bin/env node
// RETRO round 9: the retrieval ledgers run in the owner Worker (oak-rag-setup-owner), which Workers Builds never redeploys.
// R9b merged a ledger fix and the site stayed on the old owner for 20 minutes with semantic search 100% down. This prints
// whether the deployed owner is older than the last origin/main commit touching code it bundles, so a merge that needs an
// owner redeploy says so in one line.
//
// Usage: node scripts/quality/owner-deploy-check.mjs   ->   owner-deployed=<iso> owner-code=<sha> <iso> owner-stale=0|1
// Redeploy (approved per round): npx wrangler deploy -c workers/oak-agent/setup/wrangler.jsonc
//   --var RETRIEVAL_ACCOUNT_ID:<account> --profile oak-agent-native, then control.mjs owner-status, then turn workers.dev off.
import { execFileSync } from "node:child_process";

// What the owner bundles: its entry (src/setup), the knowledge ledgers and actors, shared contracts and its own config.
const OWNER_PATHS = ["workers/oak-agent/src/setup", "workers/oak-agent/src/knowledge", "workers/oak-agent/setup", "packages/oak-agent-contracts/src"];

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
sh("git", ["fetch", "-q", "origin", "main"]);
const [sha, committed] = sh("git", ["log", "-1", "--format=%h %cI", "origin/main", "--", ...OWNER_PATHS]).split(" ");
const deployments = JSON.parse(sh("npx", ["wrangler", "deployments", "list", "--name", "oak-rag-setup-owner", "--profile", "oak-agent-native", "--json"]));
const deployed = deployments.map(d => d.created_on).sort().at(-1);
const stale = Date.parse(committed) > Date.parse(deployed) ? 1 : 0;
console.log(`owner-deployed=${deployed} owner-code=${sha} ${committed} owner-stale=${stale}`);
process.exitCode = stale;
