import { parse } from 'parse5';
import { combineConflicts, strictestDisclosure } from '../../src/lib/knowledge/eligibility.ts';
import { projectReviewedChartFigures } from './chart-projection.mjs';

export const attribute = (node, name) => node.attrs?.find((attr) => attr.name === name)?.value;
export const hasClass = (node, name) => (attribute(node, 'class') ?? '').split(/\s+/).includes(name);
export function findNodes(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...(node.childNodes ?? []).flatMap((child) => findNodes(child, predicate))];
}

function disclosureAttribute(node) {
  const value = attribute(node, 'data-knowledge-disclosure');
  if (value !== undefined && !['public', 'contact-only', 'private'].includes(value)) throw new Error('Invalid rendered disclosure');
  return value;
}

function ignored(node) {
  return ['script', 'style', 'template', 'nav', 'button', 'svg', 'noscript', 'dialog'].includes(node.tagName) ||
    attribute(node, 'aria-hidden') === 'true' || attribute(node, 'hidden') !== undefined ||
    ['work-grid-lightbox', 'work-toc', 'machine-page', 'work-image-grid__lightbox'].some((name) => hasClass(node, name));
}

export function readableText(node, canonical) {
  if (ignored(node)) return '';
  if (node.nodeName === '#text') return node.value;
  const body = (node.childNodes ?? []).map((child) => readableText(child, canonical)).join('');
  if (node.tagName === 'a' && attribute(node, 'href')) {
    const url = new URL(attribute(node, 'href'), canonical);
    if (['https:', 'http:', 'mailto:'].includes(url.protocol)) return `${body} (${url.href})`;
  }
  return `${body}${['p', 'li', 'tr', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'figcaption', 'div'].includes(node.tagName) ? '\n' : ''}${['td', 'th'].includes(node.tagName) ? ' | ' : ''}`;
}

export function extractRenderedDocument({ html, scopeClasses, documentId, bindings = [],
  figureProjections = [], sourceFingerprint, published }) {
  const tree = parse(html);
  const canonical = findNodes(tree, (node) => node.tagName === 'link' && attribute(node, 'rel') === 'canonical')[0];
  const canonicalUrl = attribute(canonical ?? {}, 'href');
  if (!canonicalUrl || new URL(canonicalUrl).origin !== 'https://steveoak.com') throw new Error(`Invalid canonical for ${documentId}`);
  const anchors = new Set(findNodes(tree, (node) => attribute(node, 'id') !== undefined).map((node) => attribute(node, 'id')));
  const isScope = (node) => scopeClasses.some((name) => hasClass(node, name));
  const scopes = findNodes(tree, isScope).filter((node) => {
    for (let parent = node.parentNode; parent; parent = parent.parentNode) if (isScope(parent)) return false;
    return true;
  });
  if (scopes.length === 0) throw new Error(`Missing narrative scope for ${documentId}`);
  const passages = [], sections = [], gaps = [], deniedReferences = [], figures = [];
  let sectionId = `${documentId}:intro`, headingPath = [], anchor = '', headingScopes = [], sectionOrdinal = 0;
  const ordinals = new Map();
  function visit(node, inheritedDisclosure = 'public', inheritedConflict = null) {
    const nodeDisclosure = strictestDisclosure([inheritedDisclosure, disclosureAttribute(node)]);
    const nodeConflict = combineConflicts([inheritedConflict, attribute(node, 'data-knowledge-conflict')]);
    if (ignored(node)) return;
    if (/^h[1-6]$/.test(node.tagName ?? '')) {
      const heading = readableText(node, canonicalUrl).trim().replace(/\s+/g, ' ');
      const emitted = attribute(node, 'id');
      const depth = Number(node.tagName[1]);
      headingScopes = headingScopes.slice(0, depth - 1);
      const disclosure = strictestDisclosure([nodeDisclosure, ...findNodes(node, (child) => attribute(child, 'data-knowledge-disclosure') !== undefined).map(disclosureAttribute)]);
      const conflict = combineConflicts([nodeConflict, ...findNodes(node, (child) => attribute(child, 'data-knowledge-conflict') !== undefined).map((child) => attribute(child, 'data-knowledge-conflict'))]);
      const binding = emitted ? bindings.find((entry) => entry.anchor === emitted) : undefined;
      const id = emitted ? binding?.id ?? `${documentId}:section-${String(++sectionOrdinal).padStart(3, '0')}` : null;
      if (emitted && binding) sectionOrdinal++;
      headingScopes[depth - 1] = { heading, anchor: emitted, id, disclosure, conflict };
      const effectiveDisclosure = strictestDisclosure(headingScopes.map((scope) => scope?.disclosure));
      const effectiveConflict = combineConflicts(headingScopes.map((scope) => scope?.conflict));
      if (effectiveDisclosure !== 'public' || effectiveConflict !== null) deniedReferences.push(...[heading, emitted].filter(Boolean));
      else if (emitted) sections.push({ id, anchor: emitted, heading });
      const active = headingScopes.filter((scope) => scope?.anchor).at(-1);
      sectionId = active?.id ?? `${documentId}:intro`;
      anchor = active?.anchor ?? '';
      headingPath = headingScopes.map((scope) => scope?.heading);
      return;
    }
    if (['p', 'ul', 'ol', 'table', 'blockquote', 'figcaption'].includes(node.tagName) ||
        ['work-mdx-qa', 'work-mdx-metric-strip', 'work-mdx-proof-grid'].some((name) => hasClass(node, name))) {
      const text = readableText(node, canonicalUrl).trim().replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n');
      if (text) {
        const ordinal = (ordinals.get(sectionId) ?? 0) + 1;
        ordinals.set(sectionId, ordinal);
        passages.push({ id: `${sectionId}:passage-${String(ordinal).padStart(3, '0')}`,
        sectionId, kind: node.tagName === 'table' ? 'table' : node.tagName === 'figcaption' ? 'caption' : 'narrative',
        text, headingPath: headingPath.filter(Boolean), citationUrl: anchor ? `${canonicalUrl}#${anchor}` : canonicalUrl,
        sectionReferences: headingScopes.filter((scope) => scope?.id)
          .map((scope) => ({ id: scope.id, heading: scope.heading, anchor: scope.anchor })),
        disclosure: strictestDisclosure([nodeDisclosure, ...headingScopes.map((scope) => scope?.disclosure), ...findNodes(node, (child) => attribute(child, 'data-knowledge-disclosure') !== undefined).map(disclosureAttribute)]),
        conflict: combineConflicts([nodeConflict, ...headingScopes.map((scope) => scope?.conflict), ...findNodes(node, (child) => attribute(child, 'data-knowledge-conflict') !== undefined).map((child) => attribute(child, 'data-knowledge-conflict'))]),
        ...(headingScopes.some((scope) => scope && (scope.disclosure !== 'public' || scope.conflict !== null)) ? {
          deniedReferences: headingScopes.filter((scope) => scope && (scope.disclosure !== 'public' || scope.conflict !== null))
            .flatMap((scope) => [scope.heading, scope.anchor].filter(Boolean)) } : {}) });
      }
      return;
    }
    if (node.tagName === 'astro-island' && /chart/i.test(attribute(node, 'component-url') ?? '')) {
      gaps.push(figureProjections.length
        ? 'Unselected client chart numeric series are not extracted from serialized island props. Semantic captions and tables remain evidence.'
        : 'Client chart numeric series are not extracted from serialized island props. Semantic captions and tables remain evidence.');
      if (figureProjections.length) {
        let figure = node.parentNode;
        while (figure && !(figure.tagName === 'figure' && hasClass(figure, 'work-mdx-chart'))) figure = figure.parentNode;
        if (figure) figures.push({
          title: findNodes(figure, (child) => child.tagName === 'h3').map((child) => readableText(child, canonicalUrl).trim()).join('\n'),
          caption: findNodes(figure, (child) => child.tagName === 'figcaption').map((child) => readableText(child, canonicalUrl).trim()).join('\n'),
          componentUrl: attribute(node, 'component-url'), componentExport: attribute(node, 'component-export'),
          serializedProps: attribute(node, 'props'),
          context: { sectionId, headingPath: headingPath.filter(Boolean),
            citationUrl: anchor ? `${canonicalUrl}#${anchor}` : canonicalUrl,
            sectionReferences: headingScopes.filter((scope) => scope?.id)
              .map((scope) => ({ id: scope.id, heading: scope.heading, anchor: scope.anchor })),
            disclosure: strictestDisclosure([nodeDisclosure, ...headingScopes.map((scope) => scope?.disclosure),
              ...findNodes(figure, (child) => attribute(child, 'data-knowledge-disclosure') !== undefined).map(disclosureAttribute)]),
            conflict: combineConflicts([nodeConflict, ...headingScopes.map((scope) => scope?.conflict),
              ...findNodes(figure, (child) => attribute(child, 'data-knowledge-conflict') !== undefined).map((child) => attribute(child, 'data-knowledge-conflict'))]),
            ...(headingScopes.some((scope) => scope && (scope.disclosure !== 'public' || scope.conflict !== null)) ? {
              deniedReferences: headingScopes.filter((scope) => scope && (scope.disclosure !== 'public' || scope.conflict !== null))
                .flatMap((scope) => [scope.heading, scope.anchor].filter(Boolean)) } : {}) },
        });
      }
    }
    for (const child of node.childNodes ?? []) visit(child, nodeDisclosure, nodeConflict);
  }
  for (const node of scopes) {
    const ancestors = [];
    for (let parent = node.parentNode; parent; parent = parent.parentNode) ancestors.push(parent);
    if (ancestors.some(ignored)) continue;
    visit(node, strictestDisclosure(ancestors.map(disclosureAttribute)),
      combineConflicts(ancestors.map((parent) => attribute(parent, 'data-knowledge-conflict'))));
  }
  for (const binding of bindings) if (!anchors.has(binding.anchor)) throw new Error(`Missing bound anchor ${documentId}#${binding.anchor}`);
  passages.push(...projectReviewedChartFigures({ documentId, sourceFingerprint, published, rules: figureProjections, figures }));
  const ids = passages.map((passage) => passage.id);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate passage identity in ${documentId}`);
  return { canonicalUrl, passages, sections, gaps: [...new Set(gaps)],
    ...(deniedReferences.length ? { deniedReferences: [...new Set(deniedReferences)] } : {}) };
}
