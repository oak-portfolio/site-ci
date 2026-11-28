import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { decodeChartProps } from '../../scripts/knowledge/chart-projection.mjs';
import { extractRenderedDocument } from '../../scripts/knowledge/rendered.mjs';
import { applyPassageExceptions, selectEligibleDocuments } from '../../src/lib/knowledge/eligibility.ts';

const sourceFingerprint = 'a'.repeat(64);
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const encode = (value) => Array.isArray(value) ? [1, value.map(encode)] : value === undefined ? [0] :
  [0, value !== null && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)])) : value];
const props = (mode) => ({ type: mode === 'numeric-percent' ? 'bar' : 'radar', categoryKey: 'label',
  valueFormatter: mode === 'numeric-percent' ? 'percent' : 'raw', axisFormatter: mode === 'numeric-percent' ? 'percent' : 'raw',
  series: [{ key: 'value', label: 'Reviewed field' }], optional: undefined,
  data: [{ label: 'First', value: 75, detail: 'First authored detail by 2025.' },
    { label: 'Second', value: 20, detail: 'Second authored detail without a year.' }] });

function fixture(mode = 'numeric-percent', overrides = {}) {
  const encoded = Object.fromEntries(Object.entries(props(mode)).map(([name, value]) => [name, encode(value)]));
  const rule = { id: 'reviewed-chart', sourceFingerprint, title: 'Reviewed title', caption: 'Reviewed scope caption.',
    propsFingerprint: fingerprint(encoded), projection: mode, categoryKey: 'label',
    ...(mode === 'numeric-percent' ? { valueKey: 'value' } : {}),
    qualifiers: ['Historical external context, not project outcomes.', 'Current status is not established.'] };
  const figure = (serialized = JSON.stringify(encoded), attrs = '', title = rule.title, caption = rule.caption) =>
    `<figure class="work-mdx-chart" ${attrs}><header><h3>${title}</h3><p>Visible summary.</p></header>
    <astro-island component-url="/_astro/WorkChartGraphic.Fixture.js" component-export="default" props="${serialized.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></astro-island>
    <figcaption>${caption}</figcaption></figure>`;
  const run = ({ body = `${figure()}<p>After the chart.</p>`, rules = [rule], source = sourceFingerprint } = {}) =>
    extractRenderedDocument({ html: `<html><head><link rel="canonical" href="https://steveoak.com/work/fixture"></head>
      <body><main class="work-article-body"><h2 id="context">Containing section</h2>${body}</main></body></html>`,
    scopeClasses: ['work-article-body'], documentId: 'work:fixture', bindings: [{ id: 'work:fixture:stable-section', anchor: 'context' }],
    sourceFingerprint: source, published: '2025-12-15', figureProjections: rules, ...overrides });
  return { encoded, rule, figure, run };
}

test('reviewed percentages append stable passages while ordinary passage bytes remain unchanged', () => {
  const { run } = fixture();
  const baseline = run({ rules: [] });
  const projected = run();
  assert.deepEqual(projected.passages.slice(0, -1), baseline.passages);
  const added = projected.passages.at(-1);
  assert.equal(added.id, 'work:fixture:stable-section:figure-reviewed-chart');
  assert.equal(added.citationUrl, 'https://steveoak.com/work/fixture#context');
  assert.deepEqual(added.headingPath, ['Containing section', 'Reviewed title']);
  assert.deepEqual(added.sectionReferences, [{ id: 'work:fixture:stable-section', heading: 'Containing section', anchor: 'context' }]);
  assert.match(added.text, /article published 2025-12-15/);
  assert.match(added.text, /First: 75%\. First authored detail by 2025\./);
  assert.match(added.text, /Second: 20%\. Second authored detail without a year\./);
  assert.match(added.text, /not project outcomes/);
  assert.match(added.text, /Current status is not established/);
});

test('detail-only projects category and exact detail text without radar scores or formatter fields', () => {
  const { run } = fixture('detail-only');
  const added = run().passages.at(-1);
  assert.match(added.text, /First: First authored detail by 2025\./);
  assert.match(added.text, /Second: Second authored detail without a year\./);
  assert.doesNotMatch(added.text, /75|20%|value|raw|radar/);
});

test('unselected chart datasets stay excluded even when their captions are visible', () => {
  const { run, figure } = fixture('detail-only');
  const hidden = JSON.stringify({ data: encode([{ label: 'UNSELECTED_LABEL_CANARY', value: 99, detail: 'UNSELECTED_DETAIL_CANARY' }]) });
  const result = run({ body: `${figure(hidden, '', 'Other title', 'Other caption.')}${figure()}` });
  assert.equal(result.passages.filter((passage) => passage.id.includes(':figure-')).length, 1);
  assert.doesNotMatch(JSON.stringify(result.passages), /UNSELECTED_.*CANARY|99/);
  assert.ok(result.passages.some((passage) => passage.text === 'Other caption.'));
});

test('source, props, title, caption, missing figure, and duplicate figure drift all require review', () => {
  const { run, figure, encoded } = fixture();
  assert.throws(() => run({ source: 'b'.repeat(64) }), /authored source changed/);
  const changed = structuredClone(encoded);
  changed.data[1][0][1].value = [0, 76];
  assert.throws(() => run({ body: figure(JSON.stringify(changed)) }), /serialized props changed/);
  assert.throws(() => run({ body: figure(JSON.stringify(encoded), '', 'Changed title') }), /missing or ambiguous/);
  assert.throws(() => run({ body: figure(JSON.stringify(encoded), '', 'Reviewed title', 'Changed caption') }), /missing or ambiguous/);
  assert.throws(() => run({ body: '<p>No chart now.</p>' }), /missing or ambiguous/);
  assert.throws(() => run({ body: `${figure()}${figure()}` }), /missing or ambiguous/);
  assert.throws(() => run({ body: `${figure()}${figure(JSON.stringify(changed))}` }), /missing or ambiguous/);
});

test('unsupported Astro runtime types and malicious expressions are never executed', () => {
  for (const type of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
    assert.throws(() => decodeChartProps(JSON.stringify({ field: [type, 'globalThis.FIGURE_CANARY = true'] })), /Unsupported/);
  }
  assert.throws(() => decodeChartProps('{"field":[0,(()=>{globalThis.FIGURE_CANARY=true})()]}'), SyntaxError);
  assert.throws(() => decodeChartProps('{"__proto__":[0,{"polluted":[0,true]}]}'), /Invalid chart props key/);
  assert.equal(globalThis.FIGURE_CANARY, undefined);
  assert.equal({}.polluted, undefined);
  const { run, figure, encoded, rule } = fixture();
  const unsupported = { ...encoded, unexpected: [3, '2025-12-15'] };
  assert.throws(() => run({ body: figure(JSON.stringify(unsupported)), rules: [{ ...rule, propsFingerprint: fingerprint(unsupported) }] }), /unsupported or malformed/);
});

test('safe decoder rejects malformed tuples and enforces size, depth, and node bounds', () => {
  for (const value of [[], [0, []], [0, 1, 2], [1], [1, {}]]) {
    assert.throws(() => decodeChartProps(JSON.stringify({ field: value })), /Invalid|Unsupported/);
  }
  assert.throws(() => decodeChartProps(' '.repeat(65537)), /size/);
  let value = [0, 'nested'];
  for (let index = 0; index < 40; index++) value = [1, [value]];
  assert.throws(() => decodeChartProps(JSON.stringify({ field: value })), /complexity/);
  assert.throws(() => decodeChartProps(JSON.stringify({ field: [1, Array.from({ length: 10000 }, () => [0])] })), /complexity/);
});

test('invalid review projections cannot silently broaden to arbitrary values or incomplete rows', () => {
  const { run, rule, encoded, figure } = fixture();
  for (const changes of [{ projection: 'all-data' }, { valueKey: 'other' }, { categoryKey: 'constructor' },
    { qualifiers: [] }, { id: '' }, { propsFingerprint: '' }]) {
    assert.throws(() => run({ rules: [{ ...rule, ...changes }] }), /review required/);
  }
  assert.throws(() => run({ rules: [rule, rule] }), /duplicate projection rule/);
  for (const value of [-1, 101, '75']) {
    const changed = structuredClone(encoded);
    changed.data[1][0][1].value = [0, value];
    assert.throws(() => run({ body: figure(JSON.stringify(changed)), rules: [{ ...rule, propsFingerprint: fingerprint(changed) }] }), /invalid percentage/);
  }
  const changed = structuredClone(encoded);
  delete changed.data[1][0][1].detail;
  assert.throws(() => run({ body: figure(JSON.stringify(changed)), rules: [{ ...rule, propsFingerprint: fingerprint(changed) }] }), /missing or ambiguous chart row/);
});

test('figure projection inherits denied headings, wrappers, and nested conflicts before eligibility', () => {
  const { run, figure, encoded } = fixture();
  const document = (passages) => ({ id: 'work:fixture', disclosure: 'public', sourceFingerprint,
    decision: { state: 'historical-baseline', sourceFingerprint }, title: 'Fixture', dates: {}, ownership: {}, passages });
  for (const attrs of ['data-knowledge-disclosure="private"', 'data-knowledge-disclosure="contact-only"', 'data-knowledge-conflict="unresolved"']) {
    const result = run({ body: `<div ${attrs}>${figure()}</div>` });
    const added = result.passages.at(-1);
    assert.ok(added.disclosure !== 'public' || added.conflict !== null);
    assert.deepEqual(selectEligibleDocuments([document(result.passages)]), []);
  }
  const result = run({ body: `<h2 id="restricted" data-knowledge-disclosure="private">Restricted</h2>${figure()}` });
  assert.equal(result.passages.at(-1).disclosure, 'private');
  assert.deepEqual(selectEligibleDocuments([document(result.passages)]), []);
  const nested = run({ body: figure(JSON.stringify(encoded)).replace('<figcaption>', '<figcaption data-knowledge-conflict="caption-disputed">') });
  assert.equal(nested.passages.at(-1).conflict, 'caption-disputed');
  const publicResult = run();
  const denied = publicResult.passages.map((passage) => applyPassageExceptions(passage, [{ sectionId: 'work:fixture:stable-section', disclosure: 'private' }]));
  assert.equal(denied.at(-1).disclosure, 'private');
  assert.deepEqual(selectEligibleDocuments([document(denied)]), []);
});
