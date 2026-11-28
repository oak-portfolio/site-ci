#!/usr/bin/env node
// Resolve skill names to their current SKILL.md, so goal files name skills instead of versioned paths.
// Usage: node scripts/agent/skill-path.mjs poteto-mode pstack:unslop premium-ui:premium-ui-qa taste-skill:redesign-skill
// A bare name checks this repo, ~/.agents/skills, ~/.codex/skills and ~/.codex/skills/.system, then plugin caches.
// `plugin:name` searches only that plugin. The newest plugin version wins. Exit 1 when any name is unresolved.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const home = homedir();
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(home, '.codex/plugins/cache');
const userRoots = [path.join(repo, '.agents/skills'), path.join(home, '.agents/skills'), path.join(home, '.codex/skills'), path.join(home, '.codex/skills/.system')];
const dirs = dir => { try { return readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name); } catch { return []; } };
const newest = names => [...names].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];

// Every <cache>/<namespace>/<plugin>/<newest version>/skills tree, as [plugin, skillsDir].
const pluginTrees = dirs(cache).flatMap(ns => dirs(path.join(cache, ns)).map(plugin => {
  const version = newest(dirs(path.join(cache, ns, plugin)));
  return version ? [plugin, path.join(cache, ns, plugin, version, 'skills')] : null;
}).filter(Boolean));

// Skills sit at skills/<name>/SKILL.md or one group deeper (skills/engineering/<name>/SKILL.md).
function inTree(root, name) {
  const direct = path.join(root, name, 'SKILL.md');
  if (existsSync(direct)) return direct;
  for (const group of dirs(root)) { const nested = path.join(root, group, name, 'SKILL.md'); if (existsSync(nested)) return nested; }
  return null;
}

function resolve(spec) {
  const [plugin, name] = spec.includes(':') ? spec.split(':') : [null, spec];
  if (!plugin) for (const root of userRoots) { const hit = path.join(root, name, 'SKILL.md'); if (existsSync(hit)) return hit; }
  for (const [id, root] of pluginTrees) if (!plugin || id === plugin) { const hit = inTree(root, name); if (hit) return hit; }
  return null;
}

let missing = 0;
for (const spec of process.argv.slice(2)) {
  const hit = resolve(spec);
  if (!hit) missing += 1;
  console.log(`${spec}\t${hit ?? 'MISSING'}`);
}
process.exit(missing ? 1 : 0);
