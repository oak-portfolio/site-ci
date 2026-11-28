import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { Field } from '@base-ui/react/field';
import { parseFragment } from 'parse5';
import ts from 'typescript';
import { strictLoader } from './design-rework/load-tsx.mjs';
import { oakCitationLabel, oakBriefCitationLabel, oakCitationUnverified, oakSourceCover, oakSourceShortLabel, oakSourceSite, oakSourceDocument } from '../../src/lib/oakCitationLabels.ts';
import * as documentAnswers from '../../packages/oak-agent-contracts/src/document-answer.ts';
import * as quoteHelpers from '../../src/lib/oakQuote.ts';
import { oakPublicUrlSchema } from '../../packages/oak-agent-contracts/src/transport.ts';

const brief = strictLoader(import.meta.url)('../../src/lib/oakContactBrief.ts', { '../../packages/oak-agent-contracts/src/transport': { oakPublicUrlSchema } });

const labels = { knowledgeRevision: 'reviewed-current', documents: [
  { documentId: 'work:eco', title: 'EcoSmartLoop: A long approved source title about agent systems and business decisions', canonicalUrl: 'https://steveoak.com/work/ecosmartloop/' },
  { documentId: 'experience:pnpp', title: 'PNPP Solutions', canonicalUrl: 'https://steveoak.com/work#pnppsolutions' },
] };
const citation = { documentId: 'work:eco', passageId: 'eligible-passage', sectionId: 'eligible-section', url: 'https://steveoak.com/work/ecosmartloop/#the-three-bin-pause' };
const claim = { id: 'claim-1', text: 'The supported claim stays next to its source.', citations: [citation] };
const identity = { schema: 'oak.answer.v1', speaker: 'oak-ai-host', knowledgeRevision: labels.knowledgeRevision, characterVersion: 'fixture', hardPolicyVersion: 'fixture', operations: ['read'] };
const sourced = { ...identity, kind: 'sourced', acknowledgment: null, claims: [claim] };
const historical = { ...sourced, knowledgeRevision: 'retired-revision' };
const fallback = 'Source 1';

test('approved source titles require matching revision and document identity', () => {
  assert.equal(oakCitationLabel(citation, identity.knowledgeRevision, labels, fallback), labels.documents[0].title);
  assert.equal(oakCitationLabel({ ...citation, title: 'Untrusted generated title' }, identity.knowledgeRevision, labels, fallback), labels.documents[0].title);
  for (const revision of [undefined, '', historical.knowledgeRevision]) {
    assert.equal(oakCitationLabel(citation, revision, labels, fallback), fallback);
  }
  assert.equal(oakCitationLabel({ ...citation, documentId: 'unknown:internal-id' }, identity.knowledgeRevision, labels, fallback), fallback);
  assert.equal(oakCitationLabel(citation, identity.knowledgeRevision, undefined, fallback), fallback);
  assert.equal(oakCitationLabel(citation, identity.knowledgeRevision, { ...labels, documents: [] }, fallback), fallback);
});

test('canonical routes permit intentional trailing slash and section links without changing href', () => {
  for (const url of ['https://steveoak.com/work/ecosmartloop', citation.url, 'https://steveoak.com/work/ecosmartloop#the-three-bin-pause', `${citation.url}?section-detail`]) {
    const reference = { ...citation, url };
    assert.equal(oakCitationLabel(reference, identity.knowledgeRevision, labels, fallback), labels.documents[0].title);
    assert.equal(reference.url, url);
  }
  const timeline = { ...citation, documentId: 'experience:pnpp', url: 'https://steveoak.com/work/#pnppsolutions' };
  assert.equal(oakCitationLabel(timeline, identity.knowledgeRevision, labels, fallback), 'PNPP Solutions');
  for (const url of ['https://steveoak.com/work#hyperskalers', 'https://steveoak.com/work']) {
    assert.equal(oakCitationLabel({ ...timeline, url }, identity.knowledgeRevision, labels, fallback), fallback);
  }
});

test('spoofed origins, queries, credentials and parser-normalized paths cannot borrow a trusted title', () => {
  for (const url of ['https://steveoak.com.evil.test/work/ecosmartloop/',
    'http://steveoak.com/work/ecosmartloop/', 'https://steveoak.com:8443/work/ecosmartloop/',
    'https://visitor@steveoak.com/work/ecosmartloop/', `${citation.url.split('#')[0]}?redirect=elsewhere`,
    'https://steveoak.com/work/ecosmartloop/?', 'https://steveoak.com/work/ecosmartloop/?#the-three-bin-pause',
    'https://steveoak.com/work/other/', 'https://steveoak.com/work/other/../ecosmartloop/',
    'https://steveoak.com/work/ecosmartloop//', '//steveoak.com/work/ecosmartloop/', 'not a URL']) {
    assert.equal(oakCitationLabel({ ...citation, url }, identity.knowledgeRevision, labels, fallback), fallback, url);
  }
});

test('brief labels require exact originating evidence in a current validated answer', () => {
  assert.equal(oakBriefCitationLabel(citation, [historical, sourced], labels, fallback), labels.documents[0].title);
  for (const answers of [[], [historical], [{ ...sourced, claims: [] }]]) {
    assert.equal(oakBriefCitationLabel(citation, answers, labels, fallback), fallback);
  }
  for (const key of ['documentId', 'passageId', 'sectionId', 'url']) {
    assert.equal(oakBriefCitationLabel({ ...citation, [key]: 'different' }, [sourced], labels, fallback), fallback, key);
  }
  const role = { ...identity, kind: 'role-fit', rows: [{ evidence: [claim] }] };
  const advice = { ...identity, kind: 'advice', evidence: [claim] };
  for (const answer of [role, advice]) assert.equal(oakBriefCitationLabel(citation, [answer], labels, fallback), labels.documents[0].title);
});

const requires = {
  '@/lib/useReducedMotionPreference': { scrollIntoViewGently: () => {} }, // Q13 (intentional update): the shared scroll helper
  react: React, 'react/jsx-runtime': jsxRuntime, '@base-ui/react/field': { Field },
  '@/components/ui/button': { Button: ({ children, variant: _variant, size: _size, ...props }) => React.createElement('button', props, children) },
  '@/components/ui/Icon': { Icon: () => null }, /* R14: the role-fit score ring. */ '@/components/ui/meter': { MeterRing: () => null },
  '@/components/ui/badge': { Badge: ({ children }) => React.createElement('span', null, children) },
  '@/components/ui/field': { Field: ({ children }) => React.createElement('div', null, children), FieldLabel: ({ children, htmlFor }) => React.createElement('label', { htmlFor }, children), FieldDescription: ({ children }) => React.createElement('p', null, children),
    FieldCount: ({ id, value, limit }) => React.createElement('span', { id }, `${value} / ${limit}`) },
  '@/components/ui/textarea': { Textarea: props => React.createElement('textarea', props) },
  '@/components/ui/input-group': { InputGroup: ({ children }) => React.createElement('div', null, children), InputGroupAddon: ({ children }) => React.createElement('div', null, children) },
  '@/lib/oakCitationLabels': { oakCitationLabel, oakBriefCitationLabel, oakCitationUnverified, oakSourceCover, oakSourceShortLabel, oakSourceSite, oakSourceDocument },
  // Q05 (intentional update): rows read a lazily loaded excerpt; none is loaded here.
  '@/lib/oakSourceExcerpts': { useOakExcerpt: () => null },
  '@/lib/oakToasts': { showOakToast: () => {} },
  // Answer-wide source documents, first appearance first (the real helper imports path aliases this loader does not resolve).
  '@/lib/oakAnswerActions': { oakAnswerSources: answer => [...new Map((answer.claims ?? answer.evidence ?? answer.rows?.flatMap(row => row.evidence) ?? [])
    .flatMap(claim => claim.citations).map(citation => [citation.documentId, citation])).values()] },
  // Icons render null here, so a stub map keeps link text and hrefs exact.
  '@/lib/oakMeaningIcons': { oakMeaningIcons: {}, oakSourceLabels: {}, oakSourceMeaning: () => 'source.article' },
  '@/lib/oakQuote': quoteHelpers,
  // The full source list folds through Motion; here it renders as a plain block.
  'motion/react': { AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
    motion: { div: ({ initial, animate, exit, transition, ...props }) => React.createElement('div', props) }, useReducedMotion: () => false },
  '@/lib/oakMotion': { oakMotion: () => ({}) },
  // The word reveal and rolling counts render their plain text here; their motion is browser-tested (D71).
  '@/components/ui/reveal-text': { RevealText: ({ text }) => text, revealWordCount: text => text.split(/\s+/).filter(Boolean).length },
  '@/components/ui/rolling-number': { RollingNumber: ({ value }) => String(value) },
  // The preview trigger is the link itself; the hover card is not part of the link text.
  '@/components/ui/preview-card': { PreviewCard: ({ children }) => React.createElement(React.Fragment, null, children),
    PreviewCardTrigger: ({ children, ...props }) => React.createElement('a', props, children), PreviewCardContent: () => null },
  '@/lib/oakContactBrief': brief, '@/lib/oakWorkspace': {}, './OakActivitySprite': { OakSprite: () => null },
  '@/lib/oakChatFlags': { oakEditEarlierOn: () => false },
  '@/lib/oakFlags/answerOrnament': { oakAnswerOrnamentOn: () => false },
  '@/lib/oakFlags/gapNoteBelow': { oakGapNoteBelowOn: () => false },
  '@/lib/oakFlags/kindSimilar': { oakKindSimilarOn: () => false },
  '@/lib/oakFlags/kindUnresolved': { oakKindUnresolvedOn: () => false },
  '@/lib/openui/cards': { OakArt: () => null }, '@/styles/agent/request-kinds.css': {},
  './WorkflowPanel': { WorkflowPanel: ({ title, children }) => React.createElement('section', null, React.createElement('h2', null, title), children) },
  './OakCitations': { get OakCitations() { return loadRenderer('OakCitations'); }, oakSourceArt: {} },
  // D122: a work answer's sources live in its chip's popover; here the popover renders open, as a plain list after the chip.
  './OakSourceChip': { get OakSourceChip() { return loadRenderer('OakSourceChip'); }, useOakWorkspaceHost: () => [null, () => {}] },
  './OakSourcesPanel': { OakSourcesPanel: () => null },
  // D131 (intentional update): a registry brand's bundled icon is found from the brand registry.
  '@/data/brandIconRegistry': { brandIconRegistry: {} },
  '@/components/ui/collapsible': { Collapsible: ({ children, open: _open, onOpenChange: _change, ...props }) => React.createElement('div', props, children),
    CollapsibleTrigger: ({ children, ...props }) => React.createElement('button', props, children), CollapsibleContent: ({ children, keepMounted: _keep, ...props }) => React.createElement('div', props, children) },
  '@/components/ui/popover': { Popover: ({ children }) => React.createElement(React.Fragment, null, children),
    PopoverTrigger: ({ children, openOnHover: _hover, delay: _delay, closeDelay: _close, ...props }) => React.createElement('button', props, children),
    PopoverContent: ({ children }) => React.createElement('div', null, children) },
  '../../../packages/oak-agent-contracts/src/transport': { roleRequirementLabel: 'From the role requirements' },
  '../../../packages/oak-agent-contracts/src/advice': { adviceProposalLabel: 'Advice for your project' },
  '../../../packages/oak-agent-contracts/src/document-answer': documentAnswers,
  // R21: a web source's favicon data URI is checked against the contract before it shows.
  '../../../packages/oak-agent-contracts/src/public-research': { faviconDataUriSchema: { safeParse: value => ({ success: /^data:image\/(png|jpeg|webp|gif|x-icon|vnd\.microsoft\.icon);base64,/.test(String(value)) }) } },
};
function loadRenderer(name) {
  return strictLoader(import.meta.url)(`../../src/components/agent/${name}.tsx`, requires)[name];
}
function nodes(node) { return [node, ...(node.childNodes ?? []).flatMap(nodes)]; }
function attribute(node, name) { return node.attrs?.find(value => value.name === name)?.value; }
function text(node) { return nodes(node).filter(value => value.nodeName === '#text').map(value => value.value).join(''); }
function render(name, props) {
  return nodes(parseFragment(renderToStaticMarkup(React.createElement(loadRenderer(name), { citationLabels: labels, ...props }))));
}

test('work, role-fit and advice render approved titles adjacent to claims with exact citation hrefs', () => {
  const cases = [
    ['OakWorkAnswer', sourced],
    ['OakRoleFitReview', { ...identity, kind: 'role-fit', rows: [{ id: 'row-1', requirement: { text: 'Visitor requirement' }, status: 'demonstrated', evidence: [claim], gap: null, questions: [] }], contactTopics: [] }],
    ['OakAdviceAnswer', { ...identity, kind: 'advice', proposal: { recommendation: 'Conditional suggestion', assumptions: [], tradeoffs: [], nextStep: 'Ask a question' }, uncertainty: 'Evidence is limited.', evidence: [claim], contactOffer: false }],
  ];
  for (const [name, answer] of cases) {
    const before = structuredClone(answer);
    const all = render(name, { answer, onContact: () => {}, contactPreference: 'open' });
    // D130 (intentional update): role-fit and advice evidence also close on the D122 source chip, so every case reads its popover rows.
    const anchor = all.find(node => node.tagName === 'a');
    assert.equal(text(all.find(node => attribute(node, 'class') === 'oak-source-row__title')), labels.documents[0].title, name);
    assert.equal(attribute(anchor, 'href'), citation.url, name);
    // D122: a work answer lists its sources as rows in the point's popover, not a nav of pills.
    assert.equal(anchor.parentNode.tagName, 'li');
    const point = { OakWorkAnswer: 'oak-answer__point', OakAdviceAnswer: 'oak-answer__point', OakRoleFitReview: 'oak-role-review__evidence' }[name];
    assert.ok(text(all.find(node => attribute(node, 'class') === point)).includes(claim.text));
    assert.deepEqual(answer, before);
    const older = render(name, { answer: { ...answer, knowledgeRevision: historical.knowledgeRevision }, onContact: () => {} });
    assert.equal(text(older.find(node => attribute(node, 'class') === 'oak-source-row__title')), 'Source');
  }
});

test('brief selection exposes the same approved identity in link and checkmark-row names while orphaned selections retain a fallback', () => {
  const orphan = { ...citation, passageId: 'orphaned-passage' };
  const draft = { ...brief.emptyOakContactBrief(), goals: 'My unchanged goal', references: [citation, orphan] };
  const before = structuredClone(draft);
  const all = render('OakContactBriefEditor', { draft, references: [citation], answers: [sourced], error: null });
  // D89: each reference is an iOS checkmark row named by its label, with its page opening from its own link.
  const anchors = all.filter(node => node.tagName === 'a');
  assert.deepEqual(anchors.map(node => attribute(node, 'aria-label')), [`Open ${labels.documents[0].title}`, 'Open Public source 2']);
  assert.deepEqual(anchors.map(node => attribute(node, 'href')), [citation.url, orphan.url]);
  const selected = all.filter(node => node.tagName === 'button' && attribute(node, 'role') === 'checkbox' && attribute(node, 'aria-checked') === 'true');
  assert.deepEqual(selected.map(text), [labels.documents[0].title, 'Public source 2']);
  const unselected = render('OakContactBriefEditor', { draft: brief.emptyOakContactBrief(), references: [citation], answers: [sourced], error: null });
  assert.equal(text(unselected.find(node => node.tagName === 'button' && attribute(node, 'aria-checked') === 'false')), labels.documents[0].title);
  assert.deepEqual(draft, before);
});

test('P11-G2 every research host shows its bundled icon, and docs page chrome never reaches the excerpt', () => {
  for (const [url, icon] of [['https://developers.cloudflare.com/workers/platform/limits/', 'cloudflare'], ['https://docs.astro.build/en/guides/', 'astro'],
    ['https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data', 'vercel']]) {
    assert.equal(oakSourceSite(url).icon, `/assets/brand-icons/${icon}.png`);
    assert.ok(readFileSync(new URL(`../../public/assets/brand-icons/${icon}.png`, import.meta.url)).length > 100);
  }
  const source = readFileSync(new URL('../../src/components/agent/OakPublicResearch.tsx', import.meta.url), 'utf8');
  const clean = new Function(ts.transpile(source.match(/export function oakResearchExcerpt[\s\S]*?\n}\n/)[0], { target: ts.ScriptTarget.ES2022 })
    .replace('export ', '') + '; return oakResearchExcerpt;')();
  assert.equal(clean('Limits · Cloudflare Workers docs\n\n# Limits\n\nLast updated Oct 12, 2026| Copy Markdown| View as Markdown| Agent setup\n\n## Account plan limits\n\nPaid includes 10 million requests.',
    'Limits · Cloudflare Workers docs'), 'Account plan limits\nPaid includes 10 million requests.');
  // The exact shape Exa returned live on 2026-10-16: the bare page name, then a "Copy as Markdown" toolbar.
  assert.equal(clean('Limits\nLast updated Oct 12, 2026| Copy as Markdown| View as Markdown| Agent setup\nAccount plan limits\n| Feature | Workers Free |',
    'Limits · Cloudflare Workers docs'), 'Account plan limits\nFeature: Workers Free');
  // A table row is not chrome even though it is "|"-separated; it reads as one line per row, values named by column.
  assert.equal(clean('| Requests | 100,000/day | No limit |', 'T'), 'Requests: 100,000/day · No limit');
  // The live Cloudflare limits table (2026-10-17): header and divider rows fold into the column names.
  assert.equal(clean('Account plan limits\n| Feature | Workers Free | Workers Paid |\n| --- | --- | --- |\n| Requests | 100,000/day | No limit |\n| CPU time | 10 ms | 5 min |\nSee pricing.', 'T'),
    'Account plan limits\nRequests: Workers Free 100,000/day · Workers Paid No limit\nCPU time: Workers Free 10 ms · Workers Paid 5 min\nSee pricing.');
  // A two-column table needs no column names: "URL size: 16 KB", not "URL size: Value 16 KB".
  assert.equal(clean('| Limit | Value |\n| --- | --- |\n| URL size | 16 KB |', 'T'), 'URL size: 16 KB');
  assert.equal(clean('Only prose here.', 'Title'), 'Only prose here.');
  // Prose that merely mentions a toolbar phrase stays; only whole toolbar lines go.
  assert.equal(clean('You can copy page content into the dashboard.\nUse Edit this page to change the limit.', 'T'),
    'You can copy page content into the dashboard.\nUse Edit this page to change the limit.');
  assert.equal(clean('Last updated in 2024, the limit rose to 10 MB.', 'T'), 'Last updated in 2024, the limit rose to 10 MB.');
  // An excerpt that is all chrome falls back to the original text rather than showing nothing.
  assert.equal(clean('Copy page| View as Markdown', 'T'), 'Copy page| View as Markdown');
  assert.equal(clean('\n\nLIMITS · CLOUDFLARE WORKERS DOCS\nBody.', 'Limits · Cloudflare Workers docs'), 'Body.');
});
