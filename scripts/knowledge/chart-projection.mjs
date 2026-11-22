import { createHash } from 'node:crypto';

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0 && value.length <= 6000;
const key = (value) => typeof value === 'string' && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(value) &&
  !['constructor', 'prototype', '__proto__'].includes(value);
const reviewRequired = (id, reason) => new Error(`Figure review required for ${id}: ${reason}`);

// Astro's JSON tuples are data only. Unsupported runtime types never get revived.
export function decodeChartProps(serialized) {
  if (typeof serialized !== 'string' || serialized.length > 65536) throw new Error('Invalid chart props size');
  const encoded = JSON.parse(serialized);
  let visited = 0;
  function budget(depth) {
    if (++visited > 10000 || depth > 32) throw new Error('Chart props complexity limit exceeded');
  }
  function object(value, depth) {
    budget(depth);
    if (!plainObject(value)) throw new Error('Invalid chart props object');
    const result = Object.create(null);
    for (const [name, item] of Object.entries(value)) {
      if (!key(name)) throw new Error('Invalid chart props key');
      result[name] = tuple(item, depth + 1);
    }
    return result;
  }
  function tuple(value, depth) {
    budget(depth);
    if (!Array.isArray(value) || value.length < 1 || value.length > 2) throw new Error('Invalid Astro chart tuple');
    if (value[0] === 0) {
      if (value.length === 1) return undefined;
      const item = value[1];
      if (plainObject(item)) return object(item, depth + 1);
      if (item === null || ['string', 'boolean'].includes(typeof item) ||
          (typeof item === 'number' && Number.isFinite(item))) return item;
      throw new Error('Unsupported Astro chart primitive');
    }
    if (value[0] === 1 && value.length === 2 && Array.isArray(value[1])) {
      return value[1].map((item) => tuple(item, depth + 1));
    }
    throw new Error('Unsupported Astro chart tuple type');
  }
  return { props: object(encoded, 0), fingerprint: hash(encoded) };
}

export function projectReviewedChartFigures({ documentId, sourceFingerprint, published, rules = [], figures }) {
  if (!Array.isArray(rules)) throw reviewRequired(documentId, 'invalid projection ledger');
  const ids = new Set();
  return rules.map((rule) => {
    if (!rule || !/^[a-z][a-z0-9-]{1,63}$/.test(rule.id) || ids.has(rule.id) ||
        !/^[a-f0-9]{64}$/.test(rule.sourceFingerprint) || !/^[a-f0-9]{64}$/.test(rule.propsFingerprint) ||
        !text(rule.title) || !text(rule.caption) || !key(rule.categoryKey) ||
        !['numeric-percent', 'detail-only'].includes(rule.projection) ||
        (rule.projection === 'numeric-percent' ? !key(rule.valueKey) : rule.valueKey !== undefined) ||
        !Array.isArray(rule.qualifiers) || rule.qualifiers.length === 0 || rule.qualifiers.some((item) => !text(item))) {
      throw reviewRequired(documentId, 'invalid or duplicate projection rule');
    }
    ids.add(rule.id);
    if (sourceFingerprint !== rule.sourceFingerprint) throw reviewRequired(documentId, 'authored source changed');
    if (typeof published !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(published)) {
      throw reviewRequired(documentId, 'dated article context unavailable');
    }
    const matches = figures.filter((figure) => figure.title === rule.title && figure.caption === rule.caption);
    if (matches.length !== 1) throw reviewRequired(documentId, 'reviewed title/caption is missing or ambiguous');
    const figure = matches[0];
    if (!/^\/_astro\/WorkChartGraphic\.[\w-]+\.js$/.test(figure.componentUrl ?? '') || figure.componentExport !== 'default') {
      throw reviewRequired(documentId, 'unexpected chart component');
    }
    let decoded;
    try { decoded = decodeChartProps(figure.serializedProps); }
    catch { throw reviewRequired(documentId, 'unsupported or malformed serialized props'); }
    if (decoded.fingerprint !== rule.propsFingerprint) throw reviewRequired(documentId, 'serialized props changed');
    const { props } = decoded;
    if (props.categoryKey !== rule.categoryKey || !Array.isArray(props.data) || props.data.length === 0 ||
        props.data.length > 100 || (rule.projection === 'numeric-percent' &&
        (props.valueFormatter !== 'percent' || props.axisFormatter !== 'percent' || !Array.isArray(props.series) ||
        props.series.length !== 1 || props.series[0]?.key !== rule.valueKey))) {
      throw reviewRequired(documentId, 'projection fields do not match reviewed chart');
    }
    const labels = new Set();
    const rows = props.data.map((row) => {
      if (!plainObject(row) || !Object.hasOwn(row, rule.categoryKey) || !text(row[rule.categoryKey]) ||
          !Object.hasOwn(row, 'detail') || !text(row.detail) || labels.has(row[rule.categoryKey])) {
        throw reviewRequired(documentId, 'missing or ambiguous chart row');
      }
      labels.add(row[rule.categoryKey]);
      if (rule.projection === 'detail-only') return `${row[rule.categoryKey]}: ${row.detail}`;
      const value = row[rule.valueKey];
      if (!Object.hasOwn(row, rule.valueKey) || typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
        throw reviewRequired(documentId, 'invalid percentage');
      }
      return `${row[rule.categoryKey]}: ${value}%. ${row.detail}`;
    });
    return { ...figure.context, id: `${figure.context.sectionId}:figure-${rule.id}`, kind: 'narrative',
      text: [`The article published ${published} reports this chart: ${rule.title}.`,
        ...rule.qualifiers, rule.caption, ...rows].join('\n') };
  });
}
