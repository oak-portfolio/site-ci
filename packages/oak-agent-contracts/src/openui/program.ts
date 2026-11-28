/**
 * The layout program (retro arch 2, after ARCH@39 and ARCH@40's runner-up): an OpenUI program is parsed once into its
 * statements, changed by named passes that each take a program and return one, and printed once. A pass that changes
 * nothing returns the program it was given, so a program no pass changed prints back exactly as written; a changed one
 * prints one `name = Component(body)` per line. Before this, each verdict.ts function parsed the text again, read the root
 * list with its own copy of one regex and printed its own lines. No OpenUI runtime here: the Worker, the browser, saved
 * chats and the eval runner all read programs through verdict.ts, whose string functions run these passes.
 */
import { OAK_OPENUI_BLOCKS, type OakOpenUIBlock } from './blocks.generated.ts';

/** Q17: the most bytes an arranged layout may take. */
export const OAK_OPENUI_PROGRAM_BYTES = 2048;

/** One `name = Component(body)` statement; `body` is the text inside the call's outer parentheses. */
export type OakOpenUIStatement = Readonly<{ name: string; component: string; body: string }>;
/** A parsed program. `source` is the text it was parsed from, kept only while no pass has changed it. */
export type OakLayoutProgram = Readonly<{ statements: readonly OakOpenUIStatement[]; source?: string }>;

const blocksWhere = (keep: (block: OakOpenUIBlock) => boolean) => new Set(Object.values(OAK_OPENUI_BLOCKS).filter(keep).map(block => block.name));
/** The blocks that place claims (a fragment's `claims`). A claim id anywhere else (a heading, a label, a pill) fails the check. */
export const CLAIM_BLOCKS: ReadonlySet<string> = blocksWhere(block => block.claims !== null);
/** Blocks that hold a list of claims, so a repeated claim can leave the list and the block stays. */
export const CLAIM_LISTS: ReadonlySet<string> = blocksWhere(block => block.claims === 'list');
export const SALVAGE_CONTAINERS: ReadonlySet<string> = blocksWhere(block => block.salvageContainer);
const MOST_IDS: Readonly<Record<string, number>> = { one: 1, pair: 2 };
const CLAIM_ID = /["'](claim-\d+)["']/g;
const STATEMENT = /^([A-Za-z_]\w*)\s*=\s*([A-Z]\w*)\((.*)\)$/;

/** A visitor asking for an order: steps, a process, a walkthrough, how it was built. */
export const OAK_OPENUI_STEPS_QUESTION = /\b(?:step[- ]by[- ]step|steps|walk (?:me )?through|process|in order|how (?:did|does) (?:he|steve) (?:build|make|ship|go about))\b/i;
/** Blocks that open "on a card, numbers or a list": the reply needs a written sentence above them (R17, R18; Q25-G29 for Steps). */
export const OAK_CARD_OPENERS: ReadonlySet<string> = blocksWhere(block => block.opensOnCard);

/** Bracket depth left open by a line, ignoring brackets inside quoted strings. */
function openDepth(line: string) {
  let depth = 0, quote: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (quote) { if (char === '\\') i++; else if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'") quote = char;
    else if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
  }
  return depth;
}

/**
 * Reads lines in order, one statement per line (a statement may span lines inside open brackets; blank, `//` and `#`
 * lines are skipped), and returns the longest run of whole lines from the start that parses: how many lines it took and
 * its statements. A statement that is not `name = Component(...)` ends the run, as does one left open.
 */
function parseLines(lines: readonly string[]) {
  const statements: OakOpenUIStatement[] = [];
  let pending = '', end = 0, count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line && !/^(\/\/|#)/.test(line)) {
      pending = pending ? `${pending} ${line}` : line;
      if (openDepth(pending) > 0) continue;
      const match = pending.match(STATEMENT);
      pending = '';
      if (!match) break;
      statements.push({ name: match[1]!, component: match[2]!, body: match[3]! });
    } else if (pending) continue;
    end = i + 1; count = statements.length;
  }
  return { end, statements: statements.slice(0, count) };
}

/** The program, or null when any line is not part of a whole `name = Component(...)` statement. */
export function oakLayoutParse(text: string): OakLayoutProgram | null {
  const lines = text.split('\n');
  const { end, statements } = parseLines(lines);
  return end === lines.length ? { statements, source: text } : null;
}

/** A streaming or cut program: the longest run of whole lines from the start that parses (maybe none), and the lines after it. */
export function oakLayoutParsePrefix(text: string) {
  const lines = text.split('\n');
  const { end, statements } = parseLines(lines);
  const program: OakLayoutProgram = { statements, source: lines.slice(0, end).join('\n') };
  return { program, lines: end, rest: lines.slice(end) };
}

/** The program's text: as written when no pass changed it, else one `name = Component(body)` per line. */
export function oakLayoutPrint(program: OakLayoutProgram) {
  return program.source ?? program.statements.map(value => `${value.name} = ${value.component}(${value.body})`).join('\n');
}

const claimIdsOf = (body: string) => [...body.matchAll(CLAIM_ID)].map(match => match[1]!);
const quotedList = (ids: readonly string[]) => `[${ids.map(id => `"${id}"`).join(', ')}]`;
/** Every quoted string in a body, so it can be blanked before names are read. */
export const OAK_LAYOUT_STRINGS = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g;
/** The top-level items of a list's inner text, split on commas outside quotes and brackets. */
export function oakLayoutListSplit(list: string) {
  const items: string[] = [];
  let depth = 0, quote: string | null = null, start = 0;
  for (let i = 0; i < list.length; i++) {
    const char = list[i]!;
    if (quote) { if (char === '\\') i++; else if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'") quote = char;
    else if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
    else if (char === ',' && !depth) { items.push(list.slice(start, i)); start = i + 1; }
  }
  return [...items, list.slice(start)].map(item => item.trim()).filter(Boolean);
}
/** The trimmed items of a body that is one bracketed list (`[a, b]`), or undefined. */
const listItems = (body: string) => { const list = body.match(/^\s*\[([\s\S]*)\]\s*$/)?.[1]; return list === undefined ? undefined : oakLayoutListSplit(list); };
/** An inline call whose arguments are one list (`Stats([m3, m4])`): its component and its arguments' text. */
const inlineList = (item: string) => item.match(/^([A-Z]\w*)\((\s*\[[\s\S]*\]\s*)\)$/);
const rootOf = (statements: readonly OakOpenUIStatement[]) => statements.find(value => value.name === 'root' && value.component === 'Answer');
/** The root Answer's list of block names, or undefined when there is no root list. */
const rootItems = (statements: readonly OakOpenUIStatement[]) => { const root = rootOf(statements); return root && listItems(root.body); };
/** Each statement named root, as the root Answer listing `items`. */
const withRoot = (statements: readonly OakOpenUIStatement[], items: readonly string[]) =>
  statements.map(value => value.name === 'root' ? { name: 'root', component: 'Answer', body: `[${items.join(', ')}]` } : value);
/** A statement name not taken yet: `base`, then `basex`, `basexx`. */
export function freshName(taken: { has(name: string): boolean }, base: string) {
  let name = base;
  while (taken.has(name)) name += 'x';
  return name;
}
const byNameOf = (statements: readonly OakOpenUIStatement[]) => new Map(statements.map(value => [value.name, value]));

/**
 * The structural check every side runs without the OpenUI runtime (Worker, browser, saved chats, eval runner): the byte
 * cap, one statement per line with `root = Answer(...)`, every statement reachable (nothing defined and left unplaced),
 * claim ids only inside claim blocks, one claim block per statement, and each of the answer's claims exactly once. The
 * browser's parse adds the grammar check on top.
 */
export function oakLayoutCovers(program: OakLayoutProgram, claimIds: readonly string[]) {
  if (new TextEncoder().encode(oakLayoutPrint(program)).byteLength > OAK_OPENUI_PROGRAM_BYTES) return false;
  const { statements } = program;
  if (!statements.length || !rootOf(statements)) return false;
  const names = new Set(statements.map(value => value.name));
  if (names.size !== statements.length) return false;
  // A name counts as placed when another statement mentions it outside a quoted string.
  const bare = statements.map(value => ({ ...value, refs: value.body.replace(OAK_LAYOUT_STRINGS, '""') }));
  // r97 P3-4: a reference to a name nothing defines passes here but fails the browser's parse, so the visitor got Markdown.
  if (bare.some(value => [...value.refs.matchAll(/(?<![\w.])([A-Za-z_]\w*)\b(?!\s*\()/g)].some(match => !names.has(match[1]!) && !['true', 'false', 'null'].includes(match[1]!)))) return false;
  // R18 review (interrogate H1): exactly once, so a block listed twice (`Answer([p, eco, p])`) cannot show its claims twice.
  for (const { name } of statements) if (name !== 'root' && bare.reduce((n, other) => n + (other.name === name ? 0 : other.refs.match(new RegExp(`\\b${name}\\b`, 'g'))?.length ?? 0), 0) !== 1) return false;
  const used: string[] = [];
  for (const value of statements) {
    const ids = claimIdsOf(value.body);
    if (!ids.length) continue;
    // A claim block holds only its own literals: no nested component call that could carry another id. R16 review: the
    // generated prompt allows sub-components inline, so Stats may hold Metric or Meter calls written in place.
    const nested = [...value.body.matchAll(/([A-Z]\w*)\(/g)].map(match => match[1]!);
    const holds = OAK_OPENUI_BLOCKS[value.component]?.holds ?? [];
    const inline = nested.length > 0 && nested.every(name => holds.includes(name));
    if (!inline && (!CLAIM_BLOCKS.has(value.component) || nested.length)) return false;
    // R18 review (interrogate L6): a block that shows one claim takes one id; the browser grammar rejects a second.
    // R27g: a CompareRow holds one shared point for two items, so it takes one or two ids.
    if (!CLAIM_LISTS.has(value.component) && !inline && ids.length > (MOST_IDS[OAK_OPENUI_BLOCKS[value.component]?.claims ?? ''] ?? 1)) return false;
    used.push(...ids);
  }
  const known = new Set(claimIds);
  return used.length === claimIds.length && new Set(used).size === used.length && used.every(id => known.has(id));
}

/**
 * R8 live (trace c9f3cc1e, reproduced 1 in 6): the model placed a claim twice, in Steps and again as a Callout, and the
 * whole layout fell back. A claim keeps its first placement: a repeat inside a list is dropped from that list, and a block
 * left holding only repeats is removed along with its mention in any parent list. Every claim still shows exactly once.
 */
export function oakLayoutDropRepeats(program: OakLayoutProgram): OakLayoutProgram {
  const { statements } = program;
  const seen = new Set<string>();
  const dropped = new Set<string>();
  const kept = statements.map(value => {
    if (!CLAIM_BLOCKS.has(value.component)) return value;
    const ids = claimIdsOf(value.body);
    if (!ids.length) return value;
    const fresh = ids.filter(id => !seen.has(id));
    fresh.forEach(id => seen.add(id));
    if (fresh.length === ids.length) return value;
    if (!fresh.length) { dropped.add(value.name); return null; }
    // Only a claims list can lose some of its ids; a single-claim block is all or nothing.
    if (!CLAIM_LISTS.has(value.component)) return value;
    return { ...value, body: quotedList(fresh) };
  }).filter((value): value is NonNullable<typeof value> => value !== null);
  if (!dropped.size && kept.every((value, index) => value === statements[index])) return program;
  const unlist = (body: string): string => {
    const items = listItems(body);
    return items ? `[${items.filter(item => !dropped.has(item)).map(item => { const call = inlineList(item); return call ? `${call[1]}(${unlist(call[2]!)})` : item; }).join(', ')}]` : body;
  };
  return { statements: dropped.size ? kept.map(value => ({ ...value, body: unlist(value.body) })) : kept };
}

/**
 * R6 live: a layout that left a claim out fell back whole (2 of 20 arranges). A program that is otherwise valid gets each
 * missing claim as its own Prose block before Sources, as the streaming view already shows unplaced claims; a duplicated or
 * misplaced id still fails. Returns the program to use, or null when it cannot be completed.
 */
export function oakLayoutPlaceMissing(program: OakLayoutProgram, claimIds: readonly string[]): OakLayoutProgram | null {
  if (oakLayoutCovers(program, claimIds)) return program;
  program = oakLayoutDropRepeats(program);
  if (oakLayoutCovers(program, claimIds)) return program;
  const { statements } = program;
  const root = rootOf(statements);
  if (!root) return null;
  const used = statements.flatMap(value => claimIdsOf(value.body));
  const missing = claimIds.filter(id => !used.includes(id));
  if (!missing.length) return null;
  const items = listItems(root.body);
  if (!items) return null;
  const names = new Set(statements.map(value => value.name));
  const added = missing.map((id, i) => { const name = freshName(names, `missing${i + 1}`); names.add(name); return { name, component: 'Prose', body: `"${id}"` }; });
  const sources = statements.find(value => value.component === 'Sources')?.name;
  const at = sources && items.includes(sources) ? items.indexOf(sources) : items.length;
  items.splice(at, 0, ...added.map(value => value.name));
  const completed = { statements: [...withRoot(statements, items), ...added] };
  return oakLayoutCovers(completed, claimIds) ? completed : null;
}

/**
 * R27g live (trace 6680c889): the arrange call streamed for 12 s and hit its deadline, and the whole layout was dropped. What
 * it had streamed is kept when it can stand: the complete statements (a cut last line is dropped), list references to names
 * that never arrived removed, unplaced statements dropped, and each claim still missing placed as Prose (oakLayoutPlaceMissing).
 * Returns null unless the model itself placed at least one claim, so a call that sent nothing usable stays a fallback.
 */
export function oakLayoutSalvage(text: string, claimIds: readonly string[]): OakLayoutProgram | null {
  // A stream that opened with a code fence is read without it, as a settled program is (R27g review).
  const parsed = oakLayoutParsePrefix(text.replace(/^\s*```[a-z-]*\n/, '').replace(/```\s*$/, '')).program.statements;
  if (!rootOf(parsed)) return null;
  // Salvage reads only lists of names (no quotes or nested brackets), and a mention inside single quotes still places a block.
  const listOf = (body: string) => { const items = listItems(body); return items?.every(item => /^[A-Za-z_]\w*$/.test(item)) ? items : undefined; };
  const defined = new Set(parsed.map(value => value.name));
  // R27g red team: a Heading whose block never arrived would stand over the placed prose ("Uhttention" over another role's
  // claims), and a Compare, Timeline or Stats cut to one item is no comparison, order or row; both go, and their claims read as prose.
  const rootList = listOf(parsed.find(value => value.name === 'root')!.body) ?? [];
  const orphanHeadings = rootList.filter((item, i) => parsed.find(value => value.name === item)?.component === 'Heading' &&
    (!rootList[i + 1] || !defined.has(rootList[i + 1]!)));
  let statements: readonly OakOpenUIStatement[] = parsed.filter(value => !orphanHeadings.includes(value.name)).map(value => {
    const items = SALVAGE_CONTAINERS.has(value.component) ? listOf(value.body) : undefined;
    return items && items.filter(item => defined.has(item)).length < 2 ? { ...value, body: '[]' } : value;
  });
  for (;;) {
    const names = new Set(statements.map(value => value.name));
    const pruned = statements.map(value => { const items = listOf(value.body); return items ? { ...value, body: `[${items.filter(item => names.has(item)).join(', ')}]` } : value; });
    const placed = pruned.filter(value => value.name === 'root' || pruned.some(other => other.name !== value.name &&
      new RegExp(`\\b${value.name}\\b`).test(other.body.replace(/"(?:[^"\\]|\\.)*"/g, '""'))));
    const empty = placed.filter(value => value.name !== 'root' && /^\s*\[\s*\]\s*$/.test(value.body)).map(value => value.name);
    const next = placed.filter(value => !empty.includes(value.name));
    if (next.length === statements.length && next.every((value, i) => value.body === statements[i]!.body)) break;
    statements = next;
  }
  if (!statements.some(value => claimIdsOf(value.body).length)) return null;
  // Every arranged answer ends with its Sources; one cut before it arrived is added back.
  if (!statements.some(value => value.component === 'Sources')) {
    const name = freshName(new Set(statements.map(value => value.name)), 'src');
    statements = [...statements.map(value => value.name === 'root' ? { ...value, body: value.body.replace(/\]\s*$/, m => `${/\[\s*\]\s*$/.test(value.body) ? '' : ', '}${name}${m}`) } : value),
      { name, component: 'Sources', body: '' }];
  }
  return oakLayoutPlaceMissing({ statements }, claimIds);
}

/**
 * R19 live (05:02Z): "Walk me through how Steve built EcoSmartLoop, step by step" came back as four Prose blocks, since the
 * prompt also keeps claims about one project as Prose. When the visitor asked for an order and the layout is only Prose
 * (with Sources and Pills), its claims after the first become one Steps block in the same order; the first stays the lead.
 * Any other layout, fewer than three claims, or a rewrite that would not cover is returned unchanged.
 */
export function oakLayoutStepsFor(program: OakLayoutProgram, question: string, claimIds: readonly string[]): OakLayoutProgram {
  if (!OAK_OPENUI_STEPS_QUESTION.test(question) || claimIds.length < 3) return program;
  const { statements } = program;
  const items = rootItems(statements);
  if (!items) return program;
  const byName = byNameOf(statements);
  const blocks = items.map(item => byName.get(item));
  if (blocks.some(block => !block || !['Prose', 'Sources', 'Pills'].includes(block.component))) return program;
  const prose = blocks.filter(block => block!.component === 'Prose');
  const ids = prose.map(block => claimIdsOf(block!.body)[0]!).filter(Boolean);
  if (ids.length < 3) return program;
  const steps = freshName(byName, 'steps');
  const lead = prose[0]!.name, dropped = new Set(prose.slice(1).map(block => block!.name));
  const order = items.flatMap(item => dropped.has(item) ? (item === prose[1]!.name ? [steps] : []) : [item]);
  const rewritten = { statements: [...withRoot(statements.filter(value => !dropped.has(value.name)), order), { name: steps, component: 'Steps', body: quotedList(ids.slice(1)) }] };
  return lead && oakLayoutCovers(rewritten, claimIds) ? rewritten : program;
}

/**
 * R27f live (16:17Z, "How did Steve build Oakminder, step by step?"): the layout came back as two Steps blocks side by side
 * (4 claims, then 2), so the numbering started again at 1 halfway through one build story. Steps blocks that sit next to each
 * other in the root list become one block, in the same order. A Heading between them is dropped with the join (live, EcoSmartLoop:
 * Steps, "Product Evolution", Steps); any other block keeps them apart.
 */
export function oakLayoutJoinSteps(program: OakLayoutProgram, question: string): OakLayoutProgram {
  // R27f red team: under headings like "What he built" and "What he learned", or one per project, the lists differ; only a
  // question that asks for an order is one build story.
  if (!OAK_OPENUI_STEPS_QUESTION.test(question)) return program;
  const { statements } = program;
  const items = rootItems(statements);
  if (!items) return program;
  const byName = byNameOf(statements);
  const claimsOf = (name: string) => { const body = byName.get(name)?.body; return body === undefined ? undefined : listItems(body); };
  const merged = new Map<string, string[]>(), dropped = new Set<string>(), from = new Map<string, number>();
  let run: string | undefined, total = 0;
  let headings: string[] = [];
  for (const item of items) {
    const component = byName.get(item)?.component;
    if (run && component === 'Heading') { headings.push(item); continue; }
    const claims = component === 'Steps' ? claimsOf(item) : undefined;
    if (!claims) { run = undefined; total = 0; headings = []; continue; }
    // R27f: lists side by side are one list, inside the Steps spec (2 to 8 since R27k: EcoSmartLoop's story ran 7). R27k review:
    // lists a Heading separates keep their headings, and a longer story keeps its lists; either way the later list continues the
    // count (Steps from), so one build story never restarts at 1 and no step sits under another section's heading.
    if (run && !headings.length && merged.get(run)!.length + claims.length <= 8) { merged.get(run)!.push(...claims); dropped.add(item); }
    else if (run) { from.set(item, total + 1); run = item; merged.set(item, [...claims]); }
    else { run = item; merged.set(item, [...claims]); }
    total += claims.length;
    headings = [];
  }
  if (!dropped.size && !from.size) return program;
  return { statements: withRoot(statements.filter(value => !dropped.has(value.name)), items.filter(item => !dropped.has(item))).map(value =>
    value.name !== 'root' && merged.has(value.name)
      ? { name: value.name, component: 'Steps', body: `[${merged.get(value.name)!.join(', ')}]${from.has(value.name) ? `, ${from.get(value.name)}` : ''}` }
      : value) };
}

/**
 * R17 (Oak, review v14: card answers "feel abrupt"; eval: the low-effort arranger opened on a card in 3 of 3 card cases
 * despite the prompt rule). When the first block after any Heading is the layout's only Project or Role and holds two or
 * more claims, its first claim moves out as a Prose lead just above it, so the reply opens on a sentence. With two or more
 * cards a claim about one page would wrongly front them all (R17 review), so oakOpenUIIntro frames those instead. Only an
 * id moves; every claim still shows once. R18: with an `overview` claim, a layout opening on cards or numbers leads with it
 * (oakLayoutLeadOverview) first. Q25-G29 (R29 judge, steps-linkedin): a layout opening on a numbered list of three or more
 * claims leads the same way, its first claim becoming the sentence above the list. Returns the program unchanged when no
 * lead is needed or would not cover; `claimIds` null skips the cover check (the browser, while streaming). Ticket 328: with
 * `asked`, a layout that opens off cards on a block that does not name the asked project moves claim 1's own Prose ahead of it.
 */
export function oakLayoutLeadFirst(program: OakLayoutProgram, claimIds: readonly string[] | null, overview: string | null = null,
  asked: OakLayoutAsked | null = null): OakLayoutProgram {
  const { statements } = program;
  const items = rootItems(statements);
  if (!items) return program;
  const byName = byNameOf(statements);
  const first = items.find(item => byName.get(item)?.component !== 'Heading');
  if (overview && first) {
    const overviewLed = oakLayoutLeadOverview(statements, items, byName, first, overview);
    if (overviewLed && (claimIds === null || oakLayoutCovers(overviewLed, claimIds))) return overviewLed;
  }
  if (asked && first) {
    const askedLed = oakLayoutLeadAsked(statements, items, byName, first, asked);
    if (askedLed) return askedLed;
  }
  const card = first ? byName.get(first) : undefined;
  if (!card || !['Project', 'Role', 'Steps'].includes(card.component)) return program;
  const steps = card.component === 'Steps';
  // A first list has no `from`; a list of two would be left with one step.
  if (steps ? !/^\s*\[[^\]]*\]\s*$/.test(card.body) : items.filter(item => ['Project', 'Role'].includes(byName.get(item)?.component ?? '')).length > 1) return program;
  const ids = claimIdsOf(card.body);
  if (ids.length < (steps ? 3 : 2)) return program;
  // Review E M5: a steps list gives up its first claim only when that claim is the overview; a real step 1 stays a step and the
  // list keeps its numbering (the app's framing line, oakOpenUIIntro, leads it instead).
  if (steps && overview !== ids[0]) return program;
  const lead = freshName(byName, 'lead');
  items.splice(items.indexOf(first!), 0, lead);
  const rewritten = { statements: [...withRoot(statements, items).map(value => value === card ? { ...value, body: quotedList(ids.slice(1)) } : value),
    { name: lead, component: 'Prose', body: `"${ids[0]}"` }] };
  return claimIds === null || oakLayoutCovers(rewritten, claimIds) ? rewritten : program;
}

/** Ticket 328: the visitor's question and the answer's claims, in the written answer's order. */
export type OakLayoutAsked = Readonly<{ question: string; claims: readonly { id: string; text: string; citations?: readonly { documentId: string }[] }[] }>;

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Ticket 328 (wave w25 screens-show and diagram-how, both judged for the written order): the arranger opened on a framing
 * claim or a diagram ahead of claim 1, the sentence that names the project the visitor asked for. The asked project is a
 * page the claims cite whose name the question spells. When the first block is not a card, holds claims but not claim 1 and
 * names no asked project, and claim 1 sits alone in a Prose in the root that does name it, that Prose moves to just above
 * the first block. A Prose under its own Heading stays with it (r328 review). Only the root's order changes. Null when no
 * move applies.
 */
function oakLayoutLeadAsked(statements: readonly OakOpenUIStatement[], items: readonly string[], byName: Map<string, OakOpenUIStatement>,
  first: string, asked: OakLayoutAsked): OakLayoutProgram | null {
  const lead = asked.claims[0];
  const opener = byName.get(first);
  if (!lead || !opener || OAK_CARD_OPENERS.has(opener.component)) return null;
  const question = squash(asked.question);
  const pages = new Set(asked.claims.flatMap(value => (value.citations ?? []).map(citation => squash(citation.documentId.split(':').pop() ?? ''))));
  const names = [...pages].filter(page => page.length >= 3 && question.includes(page));
  const namesAsked = (id: string) => {
    const text = asked.claims.find(value => value.id === id)?.text;
    return text !== undefined && names.some(page => squash(text).includes(page));
  };
  const opens = claimIdsOf(opener.body);
  if (!names.length || !opens.length || opens.includes(lead.id) || opens.some(namesAsked) || !namesAsked(lead.id)) return null;
  const holder = items.find(item => item !== first && byName.get(item)?.component === 'Prose' && claimIdsOf(byName.get(item)!.body).join() === lead.id);
  if (!holder || byName.get(items[items.indexOf(holder) - 1] ?? '')?.component === 'Heading') return null;
  const ordered = items.filter(item => item !== holder);
  ordered.splice(ordered.indexOf(first), 0, holder);
  return { statements: withRoot(statements, ordered) };
}

/**
 * R18 (Oak, review v15: "the reply text is too short before generative UI"; RETRO: a lead is a written summary of 20 or
 * more words, never the app's templated framing line). The Worker asks the model for claim 1 as a cited overview of the
 * whole answer, so when a layout opens on cards or numbers that overview moves out of wherever the arranger put it and
 * leads as Prose. A list keeps its other claims; a block left empty by the move is dropped from the root. A claim inside a
 * Metric, Meter, timeline or compare row stays put (its block has no list to shrink). Null when no move applies.
 */
function oakLayoutLeadOverview(statements: readonly OakOpenUIStatement[], items: readonly string[], byName: Map<string, OakOpenUIStatement>,
  first: string, overview: string): OakLayoutProgram | null {
  if (!OAK_CARD_OPENERS.has(byName.get(first)?.component ?? '')) return null;
  const holder = statements.find(value => value.name !== 'root' && claimIdsOf(value.body).includes(overview));
  if (!holder || !(CLAIM_LISTS.has(holder.component) || holder.component === 'Prose')) return null;
  const rest = claimIdsOf(holder.body).filter(id => id !== overview);
  const emptied = holder.component === 'Prose' || rest.length === 0;
  // An emptied block must sit directly in the root, or removing it would leave a dangling reference. A card is never
  // emptied (R18 review, interrogate M3): its page would lose its card, so the overview stays put and the framing line leads.
  if (emptied && (!items.includes(holder.name) || holder.component === 'Project' || holder.component === 'Role')) return null;
  const lead = freshName(byName, 'lead');
  const ordered = items.filter(item => !(emptied && item === holder.name));
  // Headings stay above the lead; the holder never precedes the first non-heading block, so this index still holds.
  ordered.splice(items.indexOf(first), 0, lead);
  return { statements: [...withRoot(statements.filter(value => !(emptied && value === holder)), ordered)
    .map(value => value === holder ? { ...value, body: quotedList(rest) } : value), { name: lead, component: 'Prose', body: `"${overview}"` }] };
}

/** The root's first non-heading block opens on a card or numbers. */
function oakLayoutOpensOnCard(program: OakLayoutProgram) {
  const items = rootItems(program.statements);
  if (!items) return false;
  const byName = new Map(program.statements.map(value => [value.name, value.component]));
  const first = items.find(item => byName.get(item) !== 'Heading');
  return OAK_CARD_OPENERS.has(byName.get(first ?? '') ?? '');
}

/** While streaming: the overview leads the first card before its own block arrives. Null when the layout opens on prose. */
function oakLayoutLeadPending(program: OakLayoutProgram, overview: string): OakLayoutProgram | null {
  if (!oakLayoutOpensOnCard(program)) return null;
  const { statements } = program;
  // As before the one-program refactor: the first statement named root, which only a program defining root twice tells apart.
  const root = statements.find(value => value.name === 'root')!;
  const byName = byNameOf(statements);
  const items = listItems(root.body)!;
  const first = items.find(item => byName.get(item)?.component !== 'Heading')!;
  const lead = freshName(byName, 'lead');
  items.splice(items.indexOf(first), 0, lead);
  return { statements: [...statements.map(value => value === root ? { name: 'root', component: 'Answer', body: `[${items.join(', ')}]` } : value),
    { name: lead, component: 'Prose', body: `"${overview}"` }] };
}

/**
 * R17 review: the Worker leads at settle, so the browser applies the same move while the layout streams, to the
 * statements that are complete (an unfinished last statement stays as it is), and the first claim never jumps out of its
 * card at done. A settled program that already leads is left unchanged.
 */
export function oakLayoutLeadStream(text: string, overview: string | null = null) {
  const { program: head, lines, rest } = oakLayoutParsePrefix(text);
  if (lines < 1) return text;
  // R18 review (code spec 1, interrogate M2): with an overview, the lead is placed as soon as the layout opens on a card,
  // before the block holding the overview has arrived, and R17's single-card move never runs, so the lead never swaps.
  // The unfinished tail drops the overview's id, so it never shows twice while its block streams.
  if (overview && !head.source!.includes(`"${overview}"`)) {
    const placed = oakLayoutLeadPending(head, overview);
    if (placed) return [oakLayoutPrint(placed), ...rest.map(line => line.replace(new RegExp(`["']${overview}["']\\s*,?\\s*`, 'g'), ''))].join('\n');
  }
  const led = oakLayoutLeadFirst(head, null, overview);
  if (overview && led === head && oakLayoutOpensOnCard(head)) return text;
  return led === head ? text : [oakLayoutPrint(led), ...rest].join('\n');
}

/** The moves the Worker makes on a settled layout, named as its trace logs them (arrange.ts oakArrangeSettle). */
export type OakLayoutMove = 'lead-first' | 'steps-for-order' | 'steps-joined' | 'one-item' | 'one-card' | 'stack-first' | 'stack-after-cards';

/** What a layout shows beside its claims: a Sources block, a Pills block and its Proposal's kind. */
export function oakLayoutShows(program: OakLayoutProgram) {
  const { statements } = program;
  const proposal = statements.find(value => value.component === 'Proposal')?.body.match(/^\s*["'](\w+)["']/)?.[1] ?? null;
  return { sources: statements.some(value => value.component === 'Sources'), pills: statements.some(value => value.component === 'Pills'), proposal };
}
