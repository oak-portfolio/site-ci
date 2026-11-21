#!/usr/bin/env node
// Grant codes from the terminal (P09-G1). The oak-key-queue skill calls this; the owner page calls the same API.
//   node scripts/oak-grant-code.mjs create [--answers 20] [--days 7] [--label "Dana at Acme"]
//   node scripts/oak-grant-code.mjs list
//   node scripts/oak-grant-code.mjs revoke <id>
// OAK_OWNER_TOKEN: a current Clerk session token for the owner account (read from the environment, never printed).
// OAK_ORIGIN: defaults to https://steveoak.com. `create` prints the code once; `list` never shows codes.
import { execFileSync } from 'node:child_process';
const keychainToken = () => { try { return execFileSync('security', ['find-generic-password', '-s', 'oak-owner-api-token', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim() || undefined; } catch { return undefined; } };
const origin = process.env.OAK_ORIGIN ?? 'https://steveoak.com', token = process.env.OAK_OWNER_TOKEN ?? keychainToken();
const [command, ...rest] = process.argv.slice(2);
if (!token) { console.error('No owner token: add it to the Keychain as oak-owner-api-token, or set OAK_OWNER_TOKEN.'); process.exit(2); }

function flags(args) {
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i]?.startsWith('--') || args[i + 1] === undefined) { console.error(`Unexpected argument: ${args[i]}`); process.exit(2); }
    out[args[i].slice(2)] = args[i + 1];
  }
  return out;
}
async function call(path, body) {
  const response = await fetch(`${origin}/api/oak/owner/grants${path}`, { method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) { console.error(`Failed: HTTP ${response.status} ${json.error ?? ''}`); process.exit(1); }
  return json;
}

if (command === 'create') {
  const { answers, days, label } = flags(rest);
  console.log(JSON.stringify(await call('', { ...(answers ? { answers: Number(answers) } : {}), ...(days ? { days: Number(days) } : {}), ...(label ? { label } : {}) }), null, 2));
} else if (command === 'list') console.log(JSON.stringify(await call(''), null, 2));
else if (command === 'revoke' && rest[0]) console.log(JSON.stringify(await call('/revoke', { id: rest[0] }), null, 2));
else { console.error('Usage: oak-grant-code.mjs create [--answers N] [--days N] [--label TEXT] | list | revoke <id>'); process.exit(2); }
