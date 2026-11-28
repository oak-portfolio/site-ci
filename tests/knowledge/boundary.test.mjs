import test from 'node:test';
import assert from 'node:assert/strict';
import { extractRenderedDocument } from '../../scripts/knowledge/rendered.mjs';
import { extractAuthoredMarkdown } from '../../scripts/knowledge/markdown.mjs';
import { applyPassageExceptions, selectEligibleDocuments, selectAnswerEvidence } from '../../src/lib/knowledge/eligibility.ts';

const document = (overrides = {}) => ({
  id: 'work:fixture', kind: 'work', title: 'Fixture', canonicalUrl: 'https://steveoak.com/work/fixture',
  sourceFingerprint: 'exact-source', sourceFiles: ['synthetic-fixture'], representations: [
    'https://steveoak.com/work/fixture', 'https://steveoak.com/work/fixture.md', 'https://steveoak.com/api/md/work/fixture', 'https://steveoak.com/api/machine/work/fixture.json'],
  dates: { published: '2025-01-01', updated: null, period: '2024', inspected: '2026-10-03', factualReview: null },
  ownership: { author: 'Steve Oak', subject: 'Steve Oak', role: 'Contributor', contributions: [], collaborators: ['A team member'], qualifiers: ['Team prototype.'] },
  disclosure: 'public', decision: { state: 'historical-baseline', sourceFingerprint: 'exact-source', basis: 'synthetic review' }, gaps: [],
  passages: [{ id: 'work:fixture:section-001:passage-001', sectionId: 'work:fixture:section-001', kind: 'narrative',
    text: 'I contributed to the team prototype in 2024.', headingPath: ['Prototype'], citationUrl: 'https://steveoak.com/work/fixture#prototype', disclosure: 'public', conflict: null }],
  ...overrides,
});

const html = (body) => `<html><head><link rel="canonical" href="https://steveoak.com/work/fixture"></head><body>
<nav>NAVIGATION_CANARY</nav><section class="work-article-body">${body}</section></body></html>`;

test('published private, contact-only, pending and stale documents cannot enter evidence', () => {
  const fixtures = ['private', 'contact-only'].map((disclosure) => document({ id: disclosure, disclosure,
    passages: [{ ...document().passages[0], text: `${disclosure}_CANARY` }] }));
  fixtures.push(document({ id: 'pending', decision: { state: 'pending', reason: 'Published is not review.' },
    passages: [{ ...document().passages[0], text: 'PENDING_CANARY' }] }));
  fixtures.push(document({ id: 'stale', sourceFingerprint: 'changed-source',
    passages: [{ ...document().passages[0], text: 'STALE_CANARY' }] }));
  const result = selectEligibleDocuments([document(), ...fixtures]);
  assert.equal(result.length, 1);
  assert.equal(result[0].representations, undefined);
  assert.doesNotMatch(JSON.stringify(result), /CANARY|sourceFiles|synthetic review/);
  assert.equal(result[0].evidenceScope, 'historical-source');
  assert.deepEqual(result[0].ownership.collaborators, ['A team member']);
});

test('restricted/private/conflicting passages cannot piggyback on a public document', () => {
  const safe = document().passages[0];
  const result = selectEligibleDocuments([document({ passages: [safe,
    { ...safe, id: 'private', disclosure: 'private', text: 'PRIVATE_BODY_CANARY' },
    { ...safe, id: 'restricted', disclosure: 'contact-only', text: 'OWNER_COMPENSATION_CANARY' },
    { ...safe, id: 'conflicting', conflict: 'unresolved', text: 'CONFLICT_CANARY' }] })]);
  assert.equal(result[0].passages.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /CANARY/);
  const contact = selectAnswerEvidence({ documents: [document()], topic: 'steve-availability' });
  assert.deepEqual(contact, { kind: 'contact-steve', documents: [] });
  const product = selectAnswerEvidence({ documents: [document()], topic: 'product-subscriptions' });
  assert.equal(product.kind, 'evidence');
  assert.equal(product.documents.length, 1);
});

test('component-rich rendered prose preserves authored voice, links, answer text, table and captions', () => {
  const result = extractRenderedDocument({ html: html(`<h2 id="prototype">Prototype</h2>
    <p>I contributed to the team prototype.</p><aside class="work-mdx-qa"><p>Who built it?</p><strong>The team did.</strong></aside>
    <table><tr><th>Role</th><td>Team contributor</td></tr></table><figure><figcaption>Prototype screenshot.</figcaption></figure>
    <p><a href="https://example.com/proof">Public proof</a></p><script>SCRIPT_CANARY</script>
    <astro-island component-url="/WorkChartGraphic.js" props="ISLAND_PROP_CANARY"><p>Semantic chart summary.</p></astro-island>
    <div aria-hidden="true">DECORATION_CANARY</div>`), documentId: 'work:fixture', scopeClasses: ['work-article-body'] });
  const body = result.passages.map((passage) => passage.text).join('\n');
  assert.match(body, /I contributed/);
  assert.match(body, /Who built it\?[\s\S]*The team did\./);
  assert.match(body, /Role \| Team contributor/);
  assert.match(body, /Prototype screenshot/);
  assert.match(body, /Public proof \(https:\/\/example.com\/proof\)/);
  assert.doesNotMatch(body, /CANARY/);
  assert.ok(result.passages.every((passage) => passage.citationUrl.endsWith('#prototype')));
  assert.equal(result.gaps.length, 1);
});

test('stable section identity survives an explicit heading and anchor binding update', () => {
  const run = (heading, anchor) => extractRenderedDocument({ html: html(`<h2 id="${anchor}">${heading}</h2><p>Original wording.</p>`),
    documentId: 'work:fixture', scopeClasses: ['work-article-body'], bindings: [{ id: 'work:fixture:stable-story', anchor }] });
  assert.equal(run('Old title', 'old').passages[0].sectionId, run('New title', 'new').passages[0].sectionId);
  assert.throws(() => extractRenderedDocument({ html: html('<h2 id="actual">Story</h2>'),
    documentId: 'work:fixture', scopeClasses: ['work-article-body'], bindings: [{ id: 'stable', anchor: 'invented' }] }), /Missing bound anchor/);
});

test('real parsed body disclosure fixtures execute the selection boundary', () => {
  const parsed = extractRenderedDocument({ html: html(`<h2 id="prototype">Prototype</h2><p>Safe authored text.</p>
    <p data-knowledge-disclosure="private">PRIVATE_PARSED_BODY_CANARY</p>
    <p data-knowledge-disclosure="contact-only">CONTACT_PARSED_BODY_CANARY</p>`),
    documentId: 'work:fixture', scopeClasses: ['work-article-body'] });
  assert.equal(parsed.passages.length, 3);
  const eligible = selectEligibleDocuments([document({ passages: parsed.passages })]);
  assert.equal(eligible[0].passages.length, 1);
  assert.doesNotMatch(JSON.stringify(eligible), /CANARY/);
});

test('denied body copies nested in dates or ownership fail closed before evidence projection', () => {
  for (const restriction of [
    { disclosure: 'private', conflict: null, marker: 'PRIVATE_BODY_METADATA_CANARY' },
    { disclosure: 'contact-only', conflict: null, marker: 'CONTACT_BODY_METADATA_CANARY' },
    { disclosure: 'public', conflict: 'unresolved-owner', marker: 'CONFLICT_BODY_METADATA_CANARY' },
  ]) {
    const safe = document();
    const contaminated = document({
      dates: { ...safe.dates, period: `Copied ${restriction.marker}` },
      ownership: { ...safe.ownership, contributions: [`${restriction.marker} copied into contribution`],
        collaborators: ['A team member', restriction.marker], qualifiers: [restriction.marker] },
      passages: [...safe.passages, { ...safe.passages[0], id: 'denied', disclosure: restriction.disclosure,
        conflict: restriction.conflict, text: restriction.marker }],
    });
    const result = selectAnswerEvidence({ documents: [safe, contaminated], topic: 'project-design' });
    assert.equal(result.documents.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /METADATA_CANARY/);
    assert.deepEqual(result.documents[0].ownership, safe.ownership);
  }
});

test('nested body conflicts and overlapping public exceptions cannot reopen denied evidence', () => {
  const extracted = extractRenderedDocument({ html: html(`<h2 id="prototype">Prototype</h2>
    <p>Safe authored text.</p>
    <div data-knowledge-disclosure="private"><p data-knowledge-disclosure="public">ANCESTOR_PRIVATE_CANARY</p></div>
    <p data-knowledge-disclosure="contact-only"><span data-knowledge-disclosure="public">CONTACT_CANARY</span></p>
    <p>Claim <span data-knowledge-conflict="nested-owner">NESTED_CONFLICT_CANARY</span></p>`),
    documentId: 'work:fixture', scopeClasses: ['work-article-body'] });
  const exceptions = [
    { sectionId: 'work:fixture:section-001', disclosure: 'public' },
    { textIncludes: 'CONTACT_CANARY', disclosure: 'private', conflict: 'review-conflict' },
    { textIncludes: 'NESTED_CONFLICT_CANARY', disclosure: 'public', conflict: 'second-conflict' },
  ];
  const passages = extracted.passages.map((passage) => applyPassageExceptions(passage, exceptions));
  assert.equal(passages[1].disclosure, 'private');
  assert.equal(passages[2].disclosure, 'private');
  assert.match(passages[3].conflict, /nested-owner/);
  assert.match(passages[3].conflict, /second-conflict/);
  const result = selectEligibleDocuments([document({ passages })]);
  assert.equal(result[0].passages.length, 1);
  assert.doesNotMatch(JSON.stringify(result), /CANARY/);
});

test('denied heading scope covers nested sections and resets at public sibling or ancestor headings', () => {
  const extracted = extractRenderedDocument({ html: html(`<h2 id="public-before">Public before</h2><p>First safe passage.</p>
    <h2 id="private-section" data-knowledge-disclosure="private">PRIVATE_HEADING_CANARY</h2><p>Ordinary private section paragraph.</p>
    <h3 id="nested-public" data-knowledge-disclosure="public">Nested ordinary title</h3><p>Nested section stays private.</p>
    <h4 id="deep-public">Deeper ordinary title</h4><p>Deeper section stays private.</p>
    <h2 id="contact-section" data-knowledge-disclosure="contact-only">CONTACT_HEADING_CANARY</h2><p>Contact section paragraph.</p>
    <h2 id="conflicted-section" data-knowledge-conflict="unresolved-heading">CONFLICT_HEADING_CANARY</h2><p>Conflicted section paragraph.</p>
    <h3 id="nested-conflict">Nested conflict child</h3><p>Conflict child paragraph.</p>
    <h2>Public sibling without an anchor</h2><p>Safe sibling cites the page.</p>
    <h1 id="public-return">Public return</h1><p>Safe ancestor return.</p>`), documentId: 'work:fixture', scopeClasses: ['work-article-body'] });
  assert.equal(extracted.passages[1].disclosure, 'private');
  assert.equal(extracted.passages[2].disclosure, 'private');
  assert.equal(extracted.passages[3].disclosure, 'private');
  assert.equal(extracted.passages[4].disclosure, 'contact-only');
  assert.match(extracted.passages[5].conflict, /unresolved-heading/);
  assert.match(extracted.passages[6].conflict, /unresolved-heading/);
  const result = selectEligibleDocuments([document({ passages: extracted.passages })]);
  assert.deepEqual(result[0].passages.map((passage) => passage.text), [
    'First safe passage.', 'Safe sibling cites the page.', 'Safe ancestor return.']);
  assert.equal(result[0].passages[1].citationUrl, 'https://steveoak.com/work/fixture');
  assert.equal(result[0].passages[2].citationUrl, 'https://steveoak.com/work/fixture#public-return');
  assert.doesNotMatch(JSON.stringify(result), /CANARY|private-section|contact-section|conflicted-section|nested-public|nested-conflict|deniedReferences/);
  assert.doesNotMatch(JSON.stringify(extracted.sections), /CANARY|private-section|contact-section|conflicted-section|nested-public|nested-conflict/);
  const headingOnly = extractRenderedDocument({ html: html(`<h2 id="PRIVATE_EMPTY_ANCHOR_CANARY" data-knowledge-disclosure="private">PRIVATE_EMPTY_HEADING_CANARY</h2><h2 id="returned">Returned</h2><p>Safe returned paragraph.</p>`), documentId: 'work:fixture', scopeClasses: ['work-article-body'] });
  assert.deepEqual(selectEligibleDocuments([document({ title: 'PRIVATE_EMPTY_HEADING_CANARY', passages: headingOnly.passages, deniedReferences: headingOnly.deniedReferences })]), []);
  const polluted = document({ ownership: { ...document().ownership, qualifiers: ['PRIVATE_HEADING_CANARY'] }, passages: extracted.passages });
  assert.deepEqual(selectEligibleDocuments([polluted]), []);
});

test('scope entry retains restrictive and ignored ancestors without duplicating nested scopes', () => {
  const parse = (body) => extractRenderedDocument({ html: `<html><head><link rel="canonical" href="https://steveoak.com/work/fixture"></head><body>${body}</body></html>`,
    documentId: 'work:fixture', scopeClasses: ['work-article-body'] });
  for (const marker of ['data-knowledge-disclosure="private"', 'data-knowledge-disclosure="contact-only"', 'data-knowledge-conflict="unresolved"']) {
    const extracted = parse(`<div ${marker}><section class="work-article-body" data-knowledge-disclosure="public"><h2 id="wrapped">Wrapper heading</h2><p>WRAPPER_CANARY</p></section></div>`);
    assert.equal(extracted.passages.length, 1);
    assert.deepEqual(selectEligibleDocuments([document({ passages: extracted.passages })]), []);
  }
  for (const wrapper of ['nav', 'div aria-hidden="true"', 'div hidden', 'div class="machine-page"']) {
    const extracted = parse(`<${wrapper}><section class="work-article-body"><p>IGNORED_ANCESTOR_CANARY</p></section></${wrapper.split(' ')[0]}>`);
    assert.equal(extracted.passages.length, 0);
  }
  const nested = parse('<section class="work-article-body"><h2 id="safe">Safe</h2><p>First passage.</p><section class="work-article-body"><p>Nested passage.</p></section></section>');
  assert.deepEqual(selectEligibleDocuments([document({ passages: nested.passages })])[0].passages.map(p => p.text), ['First passage.', 'Nested passage.']);
});

test('ledger section denial retains only its own references across nested sections and public return', () => {
  const extracted = extractRenderedDocument({ html: html(`<h1 id="article-title">Fixture</h1><h2 id="DENIED_ANCHOR_CANARY">DENIED_HEADING_CANARY</h2><p>Denied section statement.</p>
    <h3 id="child">Child section</h3><p>Child statement.</p><h2 id="safe">Safe heading</h2><p>Safe statement.</p>`), documentId: 'work:fixture', scopeClasses: ['work-article-body'] });
  const passages = extracted.passages.map(p => applyPassageExceptions(p, [
    { sectionId: 'work:fixture:section-002', disclosure: 'private' },
    { sectionId: 'work:fixture:section-003', disclosure: 'public' },
  ]));
  const safe = selectEligibleDocuments([document({ passages })]);
  assert.equal(passages[1].disclosure, 'private');
  assert.deepEqual(safe[0].passages.map(p => p.text), ['Safe statement.']);
  assert.equal(safe[0].title, 'Fixture');
  assert.doesNotMatch(JSON.stringify(safe), /CANARY|sectionReferences|deniedReferences/);
  for (const title of ['DENIED_HEADING_CANARY', 'DENIED_ANCHOR_CANARY']) {
    assert.deepEqual(selectEligibleDocuments([document({ passages, title })]), []);
  }
  const copiedReference = { ...passages.at(-1), headingPath: ['DENIED_HEADING_CANARY'] };
  assert.deepEqual(selectEligibleDocuments([document({ passages: [...passages, copiedReference] })]), []);
  const fallback = applyPassageExceptions(document().passages[0], [{ sectionId: 'work:fixture:section-001', disclosure: 'private' }]);
  assert.deepEqual(selectEligibleDocuments([document({ title: 'Prototype', passages: [fallback, passages.at(-1)] })]), []);
});

test('known denied body and scoped claim copies cannot reenter through ordinary public prose', () => {
  for (const restriction of [{ disclosure: 'private' }, { disclosure: 'contact-only' }, { conflict: 'unresolved' }]) {
    const original = document().passages[0];
    const denied = { ...original, id: 'denied', text: 'MAUVE-271_CANARY', ...restriction };
    const copied = { ...original, id: 'copied', text: 'The code is MAUVE-271_CANARY.' };
    assert.deepEqual(selectEligibleDocuments([document({ passages: [original, denied, copied] })]), []);
  }
  const original = document().passages[0];
  const denied = applyPassageExceptions({ ...original, id: 'claim', text: 'The review disputes CLAIM_FRAGMENT_CANARY in a longer paragraph.' },
    [{ textIncludes: 'CLAIM_FRAGMENT_CANARY', conflict: 'unresolved' }]);
  assert.deepEqual(selectEligibleDocuments([document({ passages: [original, denied,
    { ...original, id: 'copy', text: 'A short copy: CLAIM_FRAGMENT_CANARY.' }] })]), []);
});

test('Markdown skipped heading levels preserve sibling attribution and section exception scope', () => {
  const extracted = extractAuthoredMarkdown({ markdown: '# Root\n\n### First\n\nFirst paragraph.\n\n### Second\n\nSecond paragraph.\n',
    documentId: 'work:fixture', canonicalUrl: 'https://steveoak.com/work/fixture' });
  assert.deepEqual(extracted.passages[1].headingPath, ['Root', 'Second']);
  const passages = extracted.passages.map(p => applyPassageExceptions(p, [{ sectionId: 'work:fixture:section-002', disclosure: 'private' }]));
  assert.deepEqual(selectEligibleDocuments([document({ passages })])[0].passages.map(p => p.text), ['Second paragraph.']);
});
