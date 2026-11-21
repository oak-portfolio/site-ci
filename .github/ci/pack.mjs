#!/usr/bin/env node
// Placed at .github/ci/pack.mjs in the public mirror. Run from the mirror root.
//   node .github/ci/pack.mjs files <npm script>    the script's test files that exist in this tree (private ones are absent)
//   node .github/ci/pack.mjs shard <index> <total> this shard's share of test:agent:ui: shard 0 is design-judge alone,
//                                                  shards 1 to total-1 pack the rest by timings.json
import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Its gallery pass is the longest file and prints nothing until it ends, so it gets a shard and a step timeout of its own.
export const ALONE = 'tests/agent/premium/design-judge.test.mjs';

export function pack(files, timings, bins = 8) {
  const out = Array.from({ length: bins }, () => ({ load: 0, files: [] }));
  const timed = files.filter((f) => f in timings).sort((a, b) => timings[b] - timings[a] || a.localeCompare(b));
  const untimed = files.filter((f) => !(f in timings)).sort();
  const guess = timed.length ? timed.reduce((s, f) => s + timings[f], 0) / timed.length : 0;
  for (const f of [...timed, ...untimed]) {
    const bin = out.reduce((min, b) => (b.load < min.load || (b.load === min.load && b.files.length < min.files.length) ? b : min));
    bin.files.push(f);
    bin.load += timings[f] ?? guess;
  }
  return out.map((b) => b.files);
}

export function shardFiles(all, timings, index, total) {
  if (index === 0) return all.filter((f) => f === ALONE);
  return pack(all.filter((f) => f !== ALONE), timings, total - 1)[index - 1];
}

export function testFiles(script) {
  const cmd = JSON.parse(readFileSync('package.json', 'utf8')).scripts[script];
  const args = cmd.split(/\s+/).filter((a) => a.startsWith('tests/'));
  return [...new Set(args.flatMap((a) => (a.includes('*') ? globSync(a) : [a])))].filter((f) => existsSync(f)).sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  let files;
  if (cmd === 'files') files = testFiles(rest[0]);
  else if (cmd === 'shard') {
    const timings = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'timings.json'), 'utf8'));
    const all = testFiles('test:agent:ui');
    files = shardFiles(all, timings, Number(rest[0]), Number(rest[1]));
    process.stderr.write(`shard ${rest[0]} of ${rest[1]}: ${files.length} of ${all.length} files\n`);
  } else {
    process.stderr.write('usage: pack.mjs files <npm script> | pack.mjs shard <index> <total>\n');
    process.exit(2);
  }
  if (!files?.length) process.exit(1);
  process.stdout.write(`${files.join('\n')}\n`);
}
