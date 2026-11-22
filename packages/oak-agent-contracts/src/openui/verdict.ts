import { z } from 'zod';
import { OAK_OPENUI_BLOCKS } from './blocks.generated.ts';
import {
  OAK_OPENUI_PROGRAM_BYTES, oakLayoutCovers, oakLayoutDropRepeats, oakLayoutJoinSteps, oakLayoutLeadFirst, oakLayoutParse,
  oakLayoutPlaceMissing, oakLayoutPrint, oakLayoutSalvage, oakLayoutShows, oakLayoutStepsFor, type OakLayoutProgram,
} from './program.ts';

export { OAK_CARD_OPENERS, OAK_OPENUI_PROGRAM_BYTES, OAK_OPENUI_STEPS_QUESTION, oakLayoutLeadStream as oakOpenUILeadStream } from './program.ts';

/** Q17: the arranged layout of one validated answer, reconciled by id `<requestId>:ui` beside `data-answer`. */
export const oakAnswerUiSchema = z.strictObject({
  requestId: z.uuid(),
  program: z.string().max(OAK_OPENUI_PROGRAM_BYTES),
  status: z.enum(['streaming', 'done', 'fallback']),
});
export type OakAnswerUi = z.infer<typeof oakAnswerUiSchema>;

/*
 * The string form of the layout program (program.ts): each function below parses the text once, runs one pass and prints
 * once. Text that does not parse comes back unchanged from a rewrite, and fails a check. Passes and their history live in
 * program.ts; callers that hold a parsed program (the Worker's arrange call) use the passes directly.
 */
const onText = (text: string, pass: (program: OakLayoutProgram) => OakLayoutProgram) => {
  const program = oakLayoutParse(text);
  return program ? oakLayoutPrint(pass(program)) : text;
};

/** The program's `name = Component(...)` statements in order (a statement may span lines inside open brackets); null when any is not one. */
export function oakOpenUIStatements(program: string) {
  const parsed = oakLayoutParse(program);
  return parsed && [...parsed.statements];
}

/** The structural check every side runs without the OpenUI runtime (oakLayoutCovers). */
export function oakOpenUIProgramCovers(program: string, claimIds: readonly string[]) {
  // The raw cap first, as before ARCH: an oversized text is refused before the (quadratic on an unclosed line) parse.
  if (new TextEncoder().encode(program).byteLength > OAK_OPENUI_PROGRAM_BYTES) return false;
  const parsed = oakLayoutParse(program);
  return !!parsed && oakLayoutCovers(parsed, claimIds);
}

/** A cut or deadline-stopped stream's statements kept when they stand (oakLayoutSalvage); null when nothing usable arrived. */
export function oakOpenUISalvage(program: string, claimIds: readonly string[]) {
  const kept = oakLayoutSalvage(program, claimIds);
  return kept && oakLayoutPrint(kept);
}

/** Each missing claim placed as Prose before Sources (oakLayoutPlaceMissing); null when the program cannot be completed. */
export function oakOpenUIPlaceMissing(program: string, claimIds: readonly string[]) {
  const parsed = oakLayoutParse(program);
  const placed = parsed && oakLayoutPlaceMissing(parsed, claimIds);
  return placed ? oakLayoutPrint(placed) : null;
}

/** A repeated claim keeps its first placement (oakLayoutDropRepeats). */
export function oakOpenUIDropRepeats(program: string) {
  return onText(program, oakLayoutDropRepeats);
}

/** Prose-only answers to a question asking for an order become a lead and one Steps block (oakLayoutStepsFor). */
export function oakOpenUIStepsFor(program: string, question: string, claimIds: readonly string[]) {
  return onText(program, parsed => oakLayoutStepsFor(parsed, question, claimIds));
}

/** Steps blocks side by side become one build story (oakLayoutJoinSteps). */
export function oakOpenUIJoinSteps(program: string, question: string) {
  return onText(program, parsed => oakLayoutJoinSteps(parsed, question));
}

/** A layout opening on one multi-claim card, or on cards or numbers with an overview, leads with a sentence (oakLayoutLeadFirst). */
export function oakOpenUILeadFirst(program: string, claimIds: readonly string[] | null, overview: string | null = null) {
  return onText(program, parsed => oakLayoutLeadFirst(parsed, claimIds, overview));
}

/**
 * R18: claim 1 is the answer's overview when it is a written summary (20 or more words) that cites two or more pages and
 * other claims follow it. A long claim about one page is not an overview (R18 review, interrogate M4): fronting several
 * cards with it is exactly what R17's guard prevents.
 */
export const OAK_OVERVIEW_MIN_WORDS = 20;
export function oakOpenUIOverviewClaim(claims: readonly { id: string; text: string; citations?: readonly { documentId: string }[] }[]) {
  const first = claims[0];
  if (!first || claims.length < 2 || first.text.trim().split(/\s+/).length < OAK_OVERVIEW_MIN_WORDS) return null;
  return new Set((first.citations ?? []).map(citation => citation.documentId)).size >= 2 ? first.id : null;
}

const OAK_COUNT_WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
/**
 * R17 (eval quality-default-2026-10-22T12-58-32-070Z: the arranger gave each case study a one-claim card in every card
 * case, so no claim could lead without emptying a card). A layout that opens on cards or numbers gets one framing line in
 * the app's own words, built only from what the layout shows: how many case studies or roles follow, or that the numbers
 * are as Steve's pages state them. No digit, no fact about Steve. Null when the layout already opens on a sentence.
 * `kinds` are the root blocks' component names in order.
 */
/**
 * Q25-G30 with review E M3: a visitor asking which tools, languages or stack Steve uses. Needs a tool word ("tech stack",
 * "frameworks") and either use wording ("does he use", "built with", "work with") or a plain "what is his stack". "Tools he
 * built", "full-stack projects", "stack up", "technology problems" and results questions are not tools questions.
 */
export function oakOpenUIToolsQuestion(question: string) {
  const text = question.toLowerCase().replace(/full[- ]stack/g, '');
  if (/\b(?:results?|impact|numbers?|metrics?|outcomes?)\b|\bstack(?:s|ed)? up\b/.test(text)) return false;
  const tool = /\b(?:(?:tech(?:nology)?|tool) ?stack|stack|tools|frameworks|libraries|languages|technologies)\b/;
  if (!tool.test(text)) return false;
  if (/\b(?:tools|technologies) (?:has|did|does) (?:steve|he) (?:built|build|made|make|create|created)\b/.test(text)) return false;
  const uses = /\b(?:use[sd]?|using|work(?:s|ed)? with|built (?:it |them )?with|build (?:it |them )?with|made with|prefer|know|codes? in|writes? in)\b/;
  const asksStack = /\b(?:what(?:'s| is| are)?|which|tell me|list|show me)\b[^?]*\b(?:tech(?:nology)? ?stack|stack|tools|frameworks|languages)\b/;
  return uses.test(text) || (asksStack.test(text) && !/\b(?:built|made|created)\b/.test(text));
}

export function oakOpenUIIntro(kinds: readonly string[]) {
  const shown = kinds.filter(kind => kind !== 'Heading');
  const intro = OAK_OPENUI_BLOCKS[shown[0] ?? '']?.intro;
  if (!intro) return null;
  if (intro.line) return intro.line;
  const counted = Object.values(OAK_OPENUI_BLOCKS).filter(block => block.intro?.count)
    .map(block => ({ noun: block.intro!.count!, n: shown.filter(kind => kind === block.name).length })).filter(entry => entry.n);
  if (counted.length > 1) return `From Steve's ${counted.map(entry => entry.noun).join(' and ')}:`;
  const [{ noun, n }] = counted as [{ noun: string; n: number }];
  return `From ${n === 1 ? 'one' : OAK_COUNT_WORDS[n] ?? 'several'} of Steve's ${noun}:`;
}

/** The project or role a page belongs to: a case study and its older write-up (`work:x`, `legacy:x`) are one project. */
export function oakOpenUIProjectOf(documentId: string) {
  const [kind, ...rest] = documentId.split(':');
  if ((kind === 'work' || kind === 'legacy') && rest.length) return rest.join(':');
  return kind === 'experience' && rest.length ? documentId : null;
}

type FramingChild = { typeName?: string; props?: { claims?: unknown; claim?: unknown } } | null | undefined;
/**
 * Ticket 227 (absorbs 217): the Framing line over the root's blocks. With `counted` on, one kind of card (Project or Role)
 * whose claims cite more distinct projects than there are blocks reads as several ("From Steve's case studies:"), never
 * "one of"; otherwise, and with `counted` off, it is oakOpenUIIntro's line. `pagesOf` gives a claim's cited page ids.
 */
export function oakOpenUIFramingLine(children: readonly unknown[], pagesOf: (claimId: string) => readonly string[], counted: boolean) {
  const nodes = children as readonly FramingChild[];
  const intro = oakOpenUIIntro(nodes.map(child => child?.typeName ?? ''));
  const shown = nodes.filter(child => child?.typeName && child.typeName !== 'Heading');
  const noun = OAK_OPENUI_BLOCKS[shown[0]?.typeName ?? '']?.intro?.count;
  if (!counted || !intro || !noun) return intro;
  const blocks = shown.filter(child => OAK_OPENUI_BLOCKS[child!.typeName!]?.intro?.count);
  if (blocks.some(child => child!.typeName !== shown[0]!.typeName)) return intro;
  const ids = blocks.flatMap(child => { const { claims, claim } = child!.props ?? {};
    return Array.isArray(claims) ? claims.filter((id): id is string => typeof id === 'string') : typeof claim === 'string' ? [claim] : []; });
  const projects = new Set(ids.flatMap(id => pagesOf(id)).map(oakOpenUIProjectOf).filter(Boolean));
  return projects.size > blocks.length ? `From Steve's ${noun}:` : intro;
}

/** What a settled, valid layout shows beside its claims, for the controls that step aside for it. */
export function oakOpenUIShows(ui: OakAnswerUi | null | undefined, claimIds: readonly string[]) {
  if (ui?.status !== 'done') return null;
  const program = oakLayoutParse(ui.program);
  return program && oakLayoutCovers(program, claimIds) ? oakLayoutShows(program) : null;
}

/** The follow-up questions a done layout's Pills block will show (own words only, at most 3), so the answer's action row
 * can title them and place them under itself (review v5). */
export function oakOpenUIPillQuestions(ui: OakAnswerUi | null | undefined, claimIds: readonly string[]): string[] {
  if (ui?.status !== 'done') return [];
  const program = oakLayoutParse(ui.program);
  if (!program || !oakLayoutCovers(program, claimIds) || !oakLayoutShows(program).pills) return [];
  try {
    const parsed: unknown = JSON.parse((program.statements.find(value => value.component === 'Pills')?.body ?? '').trim());
    return Array.isArray(parsed) ? parsed.map(value => oakOpenUIOwnWords(value, 80)).filter((value): value is string => Boolean(value)).slice(0, 3) : [];
  } catch { return []; }
}

/**
 * Words the model writes itself (a heading, a label, a pill) may name or ask, never state a number, date or claim id, so
 * any digit drops them. Returns the text to show, or null.
 */
export function oakOpenUIOwnWords(text: unknown, max: number) {
  if (typeof text !== 'string') return null;
  const value = text.trim();
  return value && value.length <= max && !/\d/.test(value) ? value : null;
}

/** A number or date the claim itself states, as a whole token: "4" never matches inside "40%", nor "202" inside "2023". */
export function oakOpenUIStated(claimText: string, value: string) {
  const token = value.trim();
  if (!token) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w.,])${escaped}(?![\\w%]|[.,]\\d)`).test(claimText);
}

/** A block label the claim already says: the whole phrase, any case, whole words. An acronym token (IT, US) matches in its own case. */
export function oakOpenUIRepeats(claimText: string, label: string) {
  const token = label.trim();
  if (!token) return false;
  const text = claimText.trim();
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  const acronym = token.split(/\s+/).some(word => /^[^a-z]*[A-Z]{2,}[^a-z]*$/.test(word));
  return new RegExp(`(?<![\\w.,])${escaped}(?![\\w%]|[.,]\\d)`, acronym ? '' : 'i').test(text);
}
