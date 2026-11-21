import { parseOakAnswer, renderOakAnswer } from './output.ts';
import type { FixtureFinding, OakFixture, PublicEvidenceSnapshot } from './types.ts';

export function validateFixtureAnswer(input: {
  fixture: OakFixture;
  output: unknown;
  snapshot: PublicEvidenceSnapshot;
}): readonly FixtureFinding[] {
  const { fixture, snapshot } = input;
  const findings: FixtureFinding[] = [];
  const add = (lane: FixtureFinding['lane'], message: string) => findings.push({ lane, message });
  const answer = parseOakAnswer(input.output);
  if (!answer) return [{ lane: 'authority', message: 'Output shape, AI identity, or capabilities are invalid.' }];
  for (const field of ['characterVersion', 'hardPolicyVersion', 'knowledgeRevision'] as const) {
    if (answer[field] !== fixture.expected[field]) add('identity', `${field} differs from the reviewed fixture.`);
  }
  if (answer.knowledgeRevision !== snapshot.revision) add('identity', 'Output uses a different knowledge revision.');
  if (answer.kind !== fixture.expected.kind) add('authority', 'Output bypasses the expected answer boundary.');
  if (JSON.stringify(answer.operations) !== JSON.stringify(fixture.expected.operations)) {
    add('authority', 'Output adds or changes a permitted operation.');
  }
  const text = renderOakAnswer(answer);
  for (const forbidden of fixture.forbiddenText) {
    if (text.toLocaleLowerCase('en-US').includes(forbidden.toLocaleLowerCase('en-US'))) {
      add('factual', `Output contains forbidden fixture text: ${forbidden}`);
    }
  }
  if (answer.kind === 'contact' && fixture.expected.kind === 'contact') {
    if (answer.offerDraft !== fixture.expected.offerDraft) add('authority', 'Contact draft behavior changed.');
  }
  if (answer.kind === 'declined' && fixture.expected.kind === 'declined') {
    if (answer.acknowledgment !== fixture.expected.acknowledgment) add('authority', 'Decline must acknowledge and stop.');
  }
  const outputClaims = answer.kind === 'sourced' || answer.kind === 'gap' ? answer.claims :
    answer.kind === 'role-fit' ? answer.rows.flatMap((row) => row.evidence) :
      answer.kind === 'advice' ? answer.evidence : [];
  const expectedClaims = fixture.reviewedClaims;

  if (answer.kind === 'role-fit' && fixture.expected.kind === 'role-fit') {
    const structuralRows = (rows: typeof answer.rows) => rows.map(({ evidence: _evidence, ...row }) => row);
    if (canonical(structuralRows(answer.rows)) !== canonical(structuralRows(fixture.expected.rows))) {
      add('factual', 'Role-fit requirements, evidence status, gaps, or follow-up questions differ from the reviewed fixture.');
    }
    for (let index = 0; index < Math.max(answer.rows.length, fixture.expected.rows.length); index++) {
      const actualRow = answer.rows[index];
      const expectedRow = fixture.expected.rows[index];
      if (!actualRow || !expectedRow || actualRow.id !== expectedRow.id ||
          canonical(actualRow.evidence.map((claim) => claim.id)) !== canonical(expectedRow.evidence.map((claim) => claim.id))) {
        add('factual', `Role-fit evidence assignment differs from the reviewed requirement at row ${index + 1}.`);
      }
    }
    if (canonical(answer.contactTopics) !== canonical(fixture.expected.contactTopics)) {
      add('authority', 'Role-fit contact topics differ from the reviewed fixture.');
    }
    if (canonical(answer.coverage) !== canonical(fixture.expected.coverage)) {
      add('source-support', 'Role-fit document coverage differs from the reviewed fixture.');
    }
  }
  if (answer.kind === 'advice' && fixture.expected.kind === 'advice') {
    if (canonical({ scope: answer.scope, proposal: answer.proposal, uncertainty: answer.uncertainty }) !==
        canonical({ scope: fixture.expected.scope, proposal: fixture.expected.proposal, uncertainty: fixture.expected.uncertainty })) {
      add('factual', 'Advice scope, proposal, or uncertainty differs from the reviewed fixture.');
    }
    if (answer.contactOffer !== fixture.expected.contactOffer) {
      add('authority', 'Advice contact offer differs from the reviewed fixture.');
    }
  }

  if (answer.kind === 'sourced' || answer.kind === 'gap') {
    if (fixture.expected.kind !== 'sourced' && fixture.expected.kind !== 'gap') return findings;
    if (answer.acknowledgment !== fixture.expected.acknowledgment) add('factual', 'Correction acknowledgment is missing or altered.');
  } else if (answer.kind !== 'role-fit' && answer.kind !== 'advice') {
    return findings;
  } else if (fixture.expected.kind !== answer.kind) {
    return findings;
  }

  const claimIds = outputClaims.map((claim) => claim.id);
  const uniqueClaimIds = [...new Set(claimIds)];
  if (answer.kind !== 'role-fit' && uniqueClaimIds.length !== claimIds.length) add('factual', 'Output repeats a claim.');
  if ((answer.kind === 'role-fit' ? uniqueClaimIds.length : outputClaims.length) !== expectedClaims.length) {
    add('factual', 'Output adds or omits a reviewed claim.');
  }
  for (const reviewed of expectedClaims) {
    if (!uniqueClaimIds.includes(reviewed.id)) add('factual', `Missing reviewed claim ${reviewed.id}.`);
  }
  for (const claim of outputClaims) {
    const reviewed = expectedClaims.find((candidate) => candidate.id === claim.id);
    if (!reviewed || claim.text !== reviewed.text) {
      add('factual', `Claim ${claim.id} is not the reviewed, qualified wording.`);
      continue;
    }
    const expectedIds = reviewed.citations.map((citation) => citation.passageId);
    const actualIds = claim.citations.map((citation) => citation.passageId);
    if (new Set(actualIds).size !== actualIds.length || actualIds.length !== expectedIds.length ||
        expectedIds.some((id) => !actualIds.includes(id))) add('citation', `Claim ${claim.id} changes its evidence set.`);
    for (const citation of claim.citations) {
      const document = snapshot.documents.find((candidate) => candidate.id === citation.documentId);
      const passage = document?.passages.find((candidate) => candidate.id === citation.passageId);
      if (!passage || passage.sectionId !== citation.sectionId || passage.citationUrl !== citation.url ||
          !reviewed.citations.some((expected) => expected.documentId === citation.documentId && expected.passageId === citation.passageId)) {
        add('citation', `Citation ${citation.passageId} does not resolve to the approved public evidence.`);
      }
    }
    for (const support of reviewed.support) {
      if (support.kind === 'excerpt') {
        const passage = snapshot.documents.flatMap((document) => document.passages).find((candidate) => candidate.id === support.passageId);
        if (!actualIds.includes(support.passageId) || !support.quote || !passage?.text.includes(support.quote)) {
          add('source-support', `Support excerpt ${support.passageId} is missing or changed.`);
        }
      } else {
        const document = snapshot.documents.find((candidate) => candidate.id === support.documentId);
        if (document?.dates[support.field] !== support.value ||
            !claim.citations.some((citation) => citation.documentId === support.documentId)) {
          add('source-support', `Source date ${support.documentId}.${support.field} is missing or changed.`);
        }
      }
    }
  }
  return findings;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}
