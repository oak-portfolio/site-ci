import { z } from 'zod';

export const splitLines = (text: string): string[] => {
  const body = text.replace(/\r\n/g, '\n').replace(/\n$/, '');
  return body === '' ? [] : body.split('\n');
};

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

const hostOf = (value: string): string | null => {
  try { return new URL(value).hostname.replace(/^www\./, '') || null; } catch { return null; }
};
export const httpsHref = (value: string | undefined): string | null => {
  try { return value && new URL(value).protocol === 'https:' ? new URL(value).href : null; } catch { return null; }
};
const heading = (line: string) => /^(#{1,6})\s+(.+?)\s*$/.exec(line);

function headingsOf(lines: string[]): [number, string][] {
  let fenced = false;
  const found: [number, string][] = [];
  for (const line of lines) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue; }
    const match = !fenced && heading(line);
    if (match) found.push([match[1]!.length, match[2]!]);
  }
  return found;
}

const clip = (line: string, max = 240) => line.length > max ? `${line.slice(0, max)}...` : line;

export type Digest = { lines: number; headings: number; topics: string[]; preview: string[] };

export function digest(text: string, kind: 'text' | 'json' | 'robots'): Digest {
  const lines = splitLines(text);
  const preview = lines.filter(line => line.trim() !== '').slice(0, 12).map(line => clip(line.trimEnd()));
  if (kind === 'json') {
    let keys: string[] = [];
    try { const parsed: unknown = JSON.parse(text); keys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : []; } catch { keys = []; }
    return { lines: lines.length, headings: 0, topics: keys.slice(0, 8), preview };
  }
  if (kind === 'robots') {
    const agents = lines.flatMap(line => /^User-agent:\s*(.+)$/i.exec(line)?.[1]?.trim() ?? []);
    return { lines: lines.length, headings: 0, topics: agents.slice(0, 8), preview };
  }
  const found = headingsOf(lines);
  return { lines: lines.length, headings: found.length, topics: found.slice(0, 8).map(([, title]) => title), preview };
}

const profileSchema = z.object({
  name: z.string().max(200).optional(), alternateName: z.array(z.string().max(200)).max(20).optional(), jobTitle: z.string().max(300).optional(),
  homeLocation: z.object({ name: z.string().max(200).optional() }).optional(), url: z.string().max(300).optional(), description: z.string().max(1000).optional(),
  knowsAbout: z.array(z.string().max(200)).max(50).optional(), sameAs: z.array(z.string().max(300)).max(50).optional(), subjectOf: z.array(z.unknown()).max(500).optional(),
  version: z.string().max(200).optional(),
});

export function parseProfile(text: string) {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  return { name: p.name ?? null, alternateNames: p.alternateName ?? [], jobTitle: p.jobTitle ?? null, home: p.homeLocation?.name ?? null, url: p.url ?? null,
    description: p.description ?? null, knowsAbout: p.knowsAbout ?? [], profiles: (p.sameAs ?? []).flatMap(link => hostOf(link) ?? []),
    articles: p.subjectOf?.length ?? 0, revision: p.version ? p.version.slice(0, 16) : null };
}

export function parseSkill(text: string) {
  const lines = splitLines(text);
  const meta = new Map<string, string>();
  let end = lines.findIndex(line => /^metadata:\s*$/.test(line));
  if (end >= 0) {
    for (end += 1; end < lines.length && /^\s+\S/.test(lines[end]!); end += 1) {
      const pair = /^\s+([\w-]+):\s*(.+)$/.exec(lines[end]!);
      if (pair) meta.set(pair[1]!, pair[2]!.trim());
    }
  } else end = 0;
  const intro = lines.slice(end).find(line => line.trim() !== '' && !line.startsWith('#')) ?? null;
  const outline: { title: string; items: number }[] = [];
  const fit: string[] = [];
  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) { outline.push({ title: h2[1]!, items: 0 }); continue; }
    const bullet = /^- (.+)$/.exec(line);
    const current = outline.at(-1);
    if (!bullet || !current) continue;
    current.items += 1;
    if (/^good fit$/i.test(current.title)) fit.push(bullet[1]!);
  }
  if (!intro && outline.length === 0) return null;
  return { intro, canonical: meta.get('canonical_profile') ?? null, actions: (meta.get('supported_actions') ?? '').split(',').map(action => action.trim()).filter(Boolean), fit, outline };
}

export function parseRobots(text: string) {
  const lines = splitLines(text);
  const groups: { agent: string; verdict: 'open' | 'blocked'; rules: string[] }[] = [];
  let pending: typeof groups = [];
  let sawRule = false;
  for (const line of lines) {
    const agent = /^User-agent:\s*(.+)$/i.exec(line)?.[1]?.trim();
    if (agent) {
      if (sawRule) { pending = []; sawRule = false; }
      const group = { agent, verdict: 'open' as const, rules: [] as string[] };
      pending.push(group);
      groups.push(group);
      continue;
    }
    const rule = /^(Allow|Disallow):\s*(\S*)\s*$/i.exec(line);
    if (!rule || !pending.length) continue;
    sawRule = true;
    for (const group of pending) group.rules.push(`${rule[1]![0]!.toUpperCase()}${rule[1]!.slice(1).toLowerCase()} ${rule[2]}`.trim());
  }
  const settled = groups.map(({ agent, rules }) => ({ agent, verdict: rules.includes('Disallow /') && !rules.includes('Allow /') ? 'blocked' as const : 'open' as const, rules }));
  const first = lines[0] ?? '';
  return { lead: first.startsWith('#') ? first.replace(/^#\s*/, '') : null, groups: settled,
    sitemaps: lines.flatMap(line => /^Sitemap:\s*(\S+)/i.exec(line)?.[1] ?? []) };
}

export function routesFrom(llms: string | null): Map<string, string> {
  const routes = new Map<string, string>();
  for (const line of splitLines(llms ?? '')) {
    const link = /^- \[(.+?)\]\((https?:\/\/[^)\s]+)\)/.exec(line);
    if (!link) continue;
    try { routes.set(link[1]!, new URL(link[2]!).pathname); } catch { continue; }
  }
  return routes;
}

const FACT_SECTIONS = /^(key facts|evidence)$/i;
const CREDENTIALS = /^##\s+Public credentials\s*$/;

export function parsePages(full: string, routes: Map<string, string>) {
  const lines = splitLines(full);
  const blocks: { title: string; lines: string[] }[] = [];
  let fenced = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) fenced = !fenced;
    const title = !fenced && /^#\s+(.+?)\s*$/.exec(line)?.[1];
    if (title) blocks.push({ title, lines: [] });
    else if (blocks.length) blocks.at(-1)!.lines.push(line);
  }
  return blocks.slice(1).map(({ title, lines: body }) => {
    const end = body.findIndex(line => CREDENTIALS.test(line));
    const own = end >= 0 ? body.slice(0, end) : body;
    let section = '', sections = 0, facts = 0, sourced = 0, passages = 0, previous = '';
    for (const line of own) {
      const h2 = /^##\s+(.+?)\s*$/.exec(line);
      if (h2) { section = h2[1]!; sections += 1; }
      else if (FACT_SECTIONS.test(section) && line.startsWith('- ')) { facts += 1; if (line.includes('[source:')) sourced += 1; }
      else if (/authored source excerpts/i.test(section) && line.startsWith('>') && !previous.startsWith('>')) passages += 1;
      previous = line;
    }
    return { title, route: routes.get(title) ?? null, sections, facts, sourced, passages };
  });
}

export function parseCredentials(full: string) {
  const lines = splitLines(full);
  const start = lines.findIndex(line => CREDENTIALS.test(line));
  if (start < 0) return [];
  const rest = lines.slice(start + 1);
  const stop = rest.findIndex(line => /^#{1,2}\s/.test(line));
  const body = stop >= 0 ? rest.slice(0, stop) : rest;
  const items: { title: string; lines: string[] }[] = [];
  for (const line of body) {
    const title = /^###\s+(.+?)\s*$/.exec(line)?.[1];
    if (title) items.push({ title, lines: [] });
    else items.at(-1)?.lines.push(line);
  }
  return items.map(({ title, lines: own }) => {
    const statement = own.find(line => line.trim() !== '' && !line.startsWith('[') && !line.startsWith('- ') && !/^scope notes:/i.test(line)) ?? '';
    const source = own.flatMap(line => /^\[Issuer source\]\(([^)\s]+)\)/.exec(line)?.[1] ?? [])[0];
    const href = httpsHref(source);
    const notes = own.findIndex(line => /^scope notes:/i.test(line));
    return { title, issuer: href ? hostOf(href) : null, summary: clip(/^(.+?[.!?])(\s|$)/.exec(statement)?.[1] ?? statement, 200), href,
      scopeNotes: notes < 0 ? 0 : own.slice(notes + 1).filter(line => line.startsWith('- ')).length };
  });
}
