import { z } from 'zod';
import { CLAIM_BLOCKS, OAK_OPENUI_PROGRAM_BYTES, oakLayoutCovers, oakLayoutParse, type OakOpenUIStatement } from './program.ts';

/**
 * Ticket 71a (Q36 A, story 83): one block of an arranged answer rewritten in place. The visitor names one statement and one
 * instruction from a fixed list; the Worker rewrites the text of the claims that statement holds and nothing else. The
 * program itself is unchanged, so the block keeps its component, its claim ids and their sources, and Undo is the stored
 * program as it was. Prose only: an edit that adds a claim, a number, a name or a link the held claims did not state is
 * refused (Q4), and the block stays as it was.
 */
export const OAK_REFINE_INSTRUCTIONS = ['shorter', 'simpler'] as const;
export type OakRefineInstruction = typeof OAK_REFINE_INSTRUCTIONS[number];

const CLAIM_TEXT_MAX = 1200;
const claimSchema = z.strictObject({ id: z.string().regex(/^claim-\d{1,3}$/), text: z.string().trim().min(1).max(CLAIM_TEXT_MAX) });

export const oakRefineRequestSchema = z.strictObject({
  requestId: z.uuid(), conversationId: z.uuid(), funding: z.enum(['sponsored', 'visitor']),
  program: z.string().min(1).refine(value => new TextEncoder().encode(value).byteLength <= OAK_OPENUI_PROGRAM_BYTES),
  statement: z.string().regex(/^[A-Za-z_]\w{0,63}$/),
  instruction: z.enum(OAK_REFINE_INSTRUCTIONS),
  claims: z.array(claimSchema).min(1).max(24),
});
export type OakRefineRequest = z.infer<typeof oakRefineRequestSchema>;

/** What the model answers: the held claims, each with its rewritten text. */
export const oakRefineReplySchema = z.strictObject({ claims: z.array(claimSchema).min(1).max(8) });

export const oakRefineEditSchema = z.strictObject({
  statement: z.string(), component: z.string(), instruction: z.enum(OAK_REFINE_INSTRUCTIONS), claims: z.array(claimSchema),
});
export type OakRefineEdit = z.infer<typeof oakRefineEditSchema>;

export type OakRefineRefusal = 'shape' | 'claims' | 'number' | 'name' | 'link' | 'not-shorter';

const CLAIM_ID = /["'](claim-\d+)["']/g;

/**
 * The statement a refine request may edit and the claims it holds, in order, or null: the program must stand on the
 * answer's claims (oakLayoutCovers), and the statement must be a claim block other than root.
 */
export function oakRefineTarget(request: Pick<OakRefineRequest, 'program' | 'statement' | 'claims'>) {
  const program = oakLayoutParse(request.program);
  const ids = request.claims.map(claim => claim.id);
  if (!program || new Set(ids).size !== ids.length || !oakLayoutCovers(program, ids)) return null;
  const statement: OakOpenUIStatement | undefined = program.statements.find(value => value.name === request.statement);
  if (!statement || statement.name === 'root' || !CLAIM_BLOCKS.has(statement.component)) return null;
  const held = [...statement.body.matchAll(CLAIM_ID)].map(match => match[1]!);
  if (!held.length) return null;
  const byId = new Map(request.claims.map(claim => [claim.id, claim]));
  return { statement: statement.name, component: statement.component, claims: held.map(id => byId.get(id)!) };
}

const NUMBER = /\d+(?:[.,]\d+)*/g;
const NUMBER_WORDS = new Set(['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
  'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety', 'hundred', 'hundreds', 'thousand', 'thousands', 'million', 'millions', 'billion', 'billions', 'dozen', 'dozens']);
const LINK = /\bhttps?:\/\/[^\s<>"')]+|\bwww\.[^\s<>"')]+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|org|net|io|ai|dev|app)\b(?:\/[^\s<>"')]*)?/gi;
const WORD = /[A-Za-z][\w'-]*/g;
/** Words that open a sentence without naming anything, so a capital there is not read as a new name. */
const OPENERS = new Set(['a', 'an', 'the', 'he', 'she', 'it', 'its', 'they', 'them', 'their', 'his', 'her', 'this', 'that', 'these',
  'those', 'there', 'here', 'then', 'first', 'next', 'later', 'so', 'and', 'but', 'or', 'also', 'after', 'before', 'when', 'while',
  'with', 'without', 'in', 'on', 'at', 'by', 'for', 'from', 'to', 'of', 'as', 'each', 'both', 'every', 'all', 'now', 'once', 'since']);

const links = (text: string) => (text.match(LINK) ?? [])
  .map(link => link.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[.,;:!?]+$/, '').replace(/\/$/, ''));

/** Words written with a capital (names, places, products), except a sentence's first word when it is a plain opener. */
function names(text: string) {
  const found: string[] = [];
  for (const match of text.matchAll(WORD)) {
    const before = text.slice(0, match.index).trimEnd();
    const opens = !before || /[.!?:;"“(]$/.test(before);
    if (/^[A-Z]/.test(match[0]) && !(opens && OPENERS.has(match[0].toLowerCase()))) found.push(match[0]);
  }
  return found;
}

/**
 * Checks a model reply against the claims the statement held: the same ids in the same order, each once, and no number,
 * name or link a held claim did not state. "shorter" must also shorten the block. Returns the edit or the refusal.
 */
export function oakRefineCheck(target: NonNullable<ReturnType<typeof oakRefineTarget>>, instruction: OakRefineInstruction, reply: unknown):
  { edit: OakRefineEdit } | { refused: OakRefineRefusal } {
  const parsed = oakRefineReplySchema.safeParse(reply);
  if (!parsed.success) return { refused: 'shape' };
  const edited = parsed.data.claims;
  if (edited.map(claim => claim.id).join() !== target.claims.map(claim => claim.id).join()) return { refused: 'claims' };
  const held = target.claims.map(claim => claim.text).join('\n');
  const heldNumbers = new Set(held.match(NUMBER) ?? []);
  const heldWords = new Set((held.match(WORD) ?? []).map(word => word.toLowerCase()));
  const heldLinks = new Set(links(held));
  for (const { text } of edited) {
    if (links(text).some(link => !heldLinks.has(link))) return { refused: 'link' };
    const words = (text.match(WORD) ?? []).map(word => word.toLowerCase());
    if ((text.match(NUMBER) ?? []).some(value => !heldNumbers.has(value)) || words.some(word => NUMBER_WORDS.has(word) && !heldWords.has(word))) return { refused: 'number' };
    if (names(text).some(word => !heldWords.has(word.toLowerCase()))) return { refused: 'name' };
  }
  if (instruction === 'shorter') {
    const length = (claims: readonly { text: string }[]) => claims.reduce((sum, claim) => sum + claim.text.length, 0);
    if (length(edited) >= length(target.claims) || edited.some((claim, i) => claim.text.length > target.claims[i]!.text.length)) return { refused: 'not-shorter' };
  }
  return { edit: { statement: target.statement, component: target.component, instruction, claims: edited } };
}

export const oakRefineSystemPrompt = [
  "You rewrite the text of one block of Oak's already-checked answer about Steve Oak's work. The input JSON has the instruction",
  '("shorter": fewer words, the same meaning; "simpler": plainer words, the same meaning) and the claims the block holds, each with',
  'an id and its checked text. Rewrite each claim\'s text on its own. Keep every fact it states and add none: no number, date, name,',
  'place, product or link it does not already state, and nothing from another claim. Never merge, split, drop or add a claim.',
  'Answer with JSON only, no fence: {"claims":[{"id":"<the same id>","text":"<the rewritten text>"}]}, the ids in the input order.',
].join(' ');
