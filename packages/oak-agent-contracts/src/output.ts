import type { OakAnswer, OakOperation, OakNextTool, PublicCitation, AnswerClaim } from './types.ts';
import { roleFitAnswerFieldsSchema, adviceAnswerFieldsSchema } from './transport.ts';
import { documentAnswerFieldsSchema, documentCoverageText, privateDocumentCitationLabel } from './document-answer.ts';

const operations: readonly string[] = ['read', 'search', 'navigate', 'draft'];

/** A client that can parse the contact reason sends this request header; the Worker adds the reason only then, so an older bundle keeps the answer it can read. */
export const OAK_READS_HEADER = 'X-Oak-Reads';
export const OAK_READS_CONTACT_REASON = 'contact-reason';
const nextTools: readonly string[] = ['role', 'advice', 'brief'] satisfies OakNextTool[];

/** Narrowing bounds shared by the Worker and every reader: 2 to 4 distinct plain options, no links. */
export function validClarify(question: unknown, options: unknown): options is readonly string[] {
  const plain = (text: unknown, max: number): text is string => typeof text === 'string' && text.trim().length > 0 &&
    text.length <= max && !/https?:\/\/|www\.|<|\]\(/i.test(text);
  return plain(question, 160) && Array.isArray(options) && options.length >= 2 && options.length <= 4 &&
    options.every(option => plain(option, 80)) &&
    new Set(options.map(option => (option as string).trim().toLocaleLowerCase('en-US'))).size === options.length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}

function isCitation(value: unknown): value is PublicCitation {
  return isRecord(value) && exactKeys(value, ['documentId', 'passageId', 'sectionId', 'url']) &&
    typeof value.documentId === 'string' && typeof value.passageId === 'string' &&
    typeof value.sectionId === 'string' && typeof value.url === 'string';
}

function isClaim(value: unknown): value is AnswerClaim {
  return isRecord(value) && exactKeys(value, ['id', 'text', 'citations']) &&
    typeof value.id === 'string' && typeof value.text === 'string' &&
    Array.isArray(value.citations) && value.citations.every(isCitation);
}

function isOperation(value: unknown): value is OakOperation {
  return typeof value === 'string' && operations.includes(value);
}

export function parseOakAnswer(value: unknown): OakAnswer | null {
  if (!isRecord(value) || value.schema !== 'oak.answer.v1' || value.speaker !== 'oak-ai-host' ||
      typeof value.characterVersion !== 'string' || typeof value.hardPolicyVersion !== 'string' ||
      typeof value.knowledgeRevision !== 'string' || !Array.isArray(value.operations) ||
      !value.operations.every(isOperation)) return null;
  const common = ['schema', 'speaker', 'characterVersion', 'hardPolicyVersion', 'knowledgeRevision', 'operations'];
  const identity = {
    schema: 'oak.answer.v1', speaker: 'oak-ai-host', characterVersion: value.characterVersion,
    hardPolicyVersion: value.hardPolicyVersion, knowledgeRevision: value.knowledgeRevision,
    operations: value.operations,
  } satisfies Pick<OakAnswer, 'schema' | 'speaker' | 'characterVersion' | 'hardPolicyVersion' | 'knowledgeRevision' | 'operations'>;
  switch (value.kind) {
    case 'document': {
      if (!exactKeys(value, [...common, 'kind', 'claims', 'coverage'])) return null;
      const fields = documentAnswerFieldsSchema.safeParse({ claims: value.claims, coverage: value.coverage });
      return fields.success ? { ...identity, kind: 'document', ...fields.data } : null;
    }
    case 'advice': {
      if (!exactKeys(value, [...common, 'kind', 'scope', 'proposal', 'evidence', 'uncertainty', 'contactOffer'])) return null;
      // Parse only answer-specific fields, retaining strict common-key checking.
      const advice = adviceAnswerFieldsSchema.safeParse({ scope: value.scope, proposal: value.proposal,
        evidence: value.evidence, uncertainty: value.uncertainty, contactOffer: value.contactOffer });
      if (!advice.success) return null;
      return { ...identity, kind: 'advice', ...advice.data };
    }
    case 'role-fit': {
      if (!exactKeys(value, [...common, 'kind', 'rows', 'contactTopics', ...('coverage' in value ? ['coverage'] : [])])) return null;
      const fields = roleFitAnswerFieldsSchema.safeParse({ rows: value.rows, contactTopics: value.contactTopics,
        ...('coverage' in value ? { coverage: value.coverage } : {}) });
      if (!fields.success) return null;
      return { ...identity, kind: 'role-fit', ...fields.data };
    }
    case 'sourced':
    case 'gap': {
      const hasNext = 'nextTool' in value;
      if (!exactKeys(value, [...common, 'kind', 'claims', 'acknowledgment', ...(hasNext ? ['nextTool'] : [])]) ||
          (hasNext && !nextTools.includes(value.nextTool as string)) ||
          !Array.isArray(value.claims) || !value.claims.every(isClaim) ||
          !(value.acknowledgment === null || typeof value.acknowledgment === 'string')) return null;
      return { ...identity, kind: value.kind, claims: value.claims, acknowledgment: value.acknowledgment,
        ...(hasNext ? { nextTool: value.nextTool as OakNextTool } : {}) };
    }
    case 'clarify':
      if (!exactKeys(value, [...common, 'kind', 'question', 'options']) || !validClarify(value.question, value.options)) return null;
      return { ...identity, kind: value.kind, question: value.question as string, options: [...value.options] };
    case 'proposal':
      if (!exactKeys(value, [...common, 'kind', 'action']) || value.action !== 'contact-brief') return null;
      return { ...identity, kind: value.kind, action: value.action };
    case 'contact': {
      const hasReason = 'reason' in value;
      if (!exactKeys(value, [...common, 'kind', 'control', 'offerDraft', ...(hasReason ? ['reason'] : [])]) || value.control !== 'Say Hi' ||
          typeof value.offerDraft !== 'boolean' || (hasReason && value.reason !== 'contact')) return null;
      return { ...identity, kind: value.kind, control: value.control, offerDraft: value.offerDraft, ...(hasReason ? { reason: 'contact' as const } : {}) };
    }
    case 'declined':
      if (!exactKeys(value, [...common, 'kind', 'acknowledgment']) || typeof value.acknowledgment !== 'string') return null;
      return { ...identity, kind: value.kind, acknowledgment: value.acknowledgment };
    default:
      return null;
  }
}

export function renderOakAnswer(answer: OakAnswer): string {
  switch (answer.kind) {
    case 'document':
      return [...answer.claims.map(claim => `${privateDocumentCitationLabel(claim.citation)}:\n“${claim.quote}”`),
        documentCoverageText(answer.coverage), 'These quotes come from your document. They do not verify Steve’s experience.'].join('\n\n');
    case 'advice':
      return [
        `Proposal for your project: ${answer.proposal.recommendation}`,
        ...answer.proposal.assumptions.map(value => `Assumption: ${value}`),
        ...answer.proposal.tradeoffs.map(value => `Tradeoff: ${value}`),
        `Next step: ${answer.proposal.nextStep}`,
        ...answer.evidence.map(claim => claim.text), answer.uncertainty,
        ...(answer.contactOffer ? ['Contact Steve if you want to discuss this project together.'] : []),
      ].join('\n\n');
    case 'role-fit':
      return [...answer.rows.map(row => [
        `Visitor-supplied role requirement: ${row.requirement.text}`,
        ...(row.requirement.source ? [privateDocumentCitationLabel(row.requirement.source)] : []),
        `${row.status === 'missing-evidence' ? 'Missing evidence' : row.status === 'transferable' ? 'Transferable experience' : 'Demonstrated experience'}.`,
        ...row.evidence.map(claim => claim.text), row.gap, ...row.questions,
      ].filter(Boolean).join('\n')), ...(answer.coverage ? [documentCoverageText(answer.coverage)] : [])].join('\n\n');
    case 'sourced':
    case 'gap':
      return [answer.acknowledgment, ...answer.claims.map((claim) => claim.text)].filter(Boolean).join('\n\n');
    case 'clarify':
      return [answer.question, ...answer.options.map(option => `- ${option}`)].join('\n');
    case 'proposal':
      return 'I can’t send messages for you. Open the brief to write to Steve; nothing is sent until you send it yourself.';
    case 'contact':
      return answer.reason === 'contact' ? `You can write to Steve directly through Say Hi.${answer.offerDraft ? ' I can help draft the contact brief if you want.' : ''}` :
        `I can't quote Steve's pricing, rates, or compensation, or commit to availability or a start date. Ask Steve directly through Say Hi.${answer.offerDraft ? ' I can help draft the question if you want.' : ''}`;
    case 'declined':
      return answer.acknowledgment;
  }
}
