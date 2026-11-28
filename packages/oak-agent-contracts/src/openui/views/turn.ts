import { oakOpenUIToolsQuestion } from '../verdict.ts';
import type { OakClaimFacts, OakOpenUINode } from './node.ts';

type OakTurnClaim = Readonly<{ id: string; text: string; citations?: readonly Readonly<{ documentId: string }>[] }>;
type OakTurnSource = Readonly<{ title: string; page: string; card?: unknown }>;
type OakTurnUi = Readonly<{ status: string; program?: string; dated?: boolean }>;

const STACK_STATEMENT = /^\s*\w+\s*=\s*Stack\(/m;

/**
 * Ticket 344: one reading of an arranged turn, the data half of the island's scope and the printer's input. The island adds
 * its render functions; the printer reads the same fields, so a new `ui` field reaches both from the turn as given.
 * `cardOf` reads this page's labels for a claim's first citation (each side owns its labels); `root` is the parsed layout,
 * so `stacked` (a Stack among the root's blocks, tickets 295 and 307) is the Answer block's own reading; `records` are the
 * record facts by document id, given only for the answer's own revision.
 */
export function oakOpenUITurnView<Ui extends OakTurnUi, Claim extends OakTurnClaim, Source extends OakTurnSource, Facts>({ ui, answer, question, root, cardOf, records }: Readonly<{
  ui: Ui | null | undefined;
  answer: Readonly<{ kind?: string; knowledgeRevision?: string; claims: readonly Claim[] }>;
  question: string;
  root?: OakOpenUINode;
  cardOf: (claim: Claim) => Source | null;
  records?: Readonly<Record<string, Facts>>;
}>) {
  const claims: ReadonlyMap<string, Claim> = new Map(answer.claims.map(claim => [claim.id, claim]));
  const claimFacts: OakClaimFacts = id => {
    const claim = claims.get(id);
    if (!claim) return undefined;
    const source = cardOf(claim);
    return { text: claim.text, document: claim.citations?.[0]?.documentId ?? '',
      ...(source?.card ? { card: { page: source.page, name: source.title.split(':')[0]!.trim() } } : {}) };
  };
  const blocks = root?.props?.children;
  return {
    ui,
    knowledgeRevision: answer.knowledgeRevision,
    gap: answer.kind === 'gap',
    claims,
    cardOf,
    claimFacts,
    dated: ui?.dated,
    stacked: Array.isArray(blocks) && blocks.some((child: OakOpenUINode) => child?.typeName === 'Stack'),
    tools: oakOpenUIToolsQuestion(question) ? { listed: STACK_STATEMENT.test(ui?.program ?? '') } : undefined,
    recordOf: (documentId: string): Facts | null => records?.[documentId] ?? null,
  };
}
