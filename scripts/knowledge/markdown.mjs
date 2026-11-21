import { unified } from 'unified';
import remarkParse from 'remark-parse';

export function extractAuthoredMarkdown({ markdown, documentId, canonicalUrl, bindings = [] }) {
  const tree = unified().use(remarkParse).parse(markdown);
  const passages = [], sections = [];
  let sectionId = `${documentId}:intro`, headingPath = [], sectionReferences = [], sectionOrdinal = 0;
  const ordinals = new Map();
  const exact = (node) => markdown.slice(node.position.start.offset, node.position.end.offset);
  const text = (node) => node.value ?? (node.children ?? []).map(text).join('');
  function passage(node) {
    const ordinal = (ordinals.get(sectionId) ?? 0) + 1;
    ordinals.set(sectionId, ordinal);
    passages.push({ id: `${sectionId}:passage-${String(ordinal).padStart(3, '0')}`, sectionId,
      kind: node.type === 'table' ? 'table' : 'narrative', text: exact(node), headingPath: headingPath.filter(Boolean),
      sectionReferences: sectionReferences.filter(Boolean),
      citationUrl: canonicalUrl, disclosure: 'public', conflict: null });
  }
  for (const node of tree.children) {
    if (node.type === 'heading') {
      const heading = text(node);
      const binding = bindings[sectionOrdinal];
      sectionId = binding?.id ?? `${documentId}:section-${String(++sectionOrdinal).padStart(3, '0')}`;
      if (binding) sectionOrdinal++;
      sections.push({ id: sectionId, heading });
      headingPath = headingPath.slice(0, node.depth - 1);
      headingPath[node.depth - 1] = heading;
      sectionReferences = sectionReferences.slice(0, node.depth - 1);
      sectionReferences[node.depth - 1] = { id: sectionId, heading };
    } else if (node.type === 'list') {
      node.children.forEach(passage);
    } else if (['paragraph', 'blockquote', 'table'].includes(node.type)) {
      passage(node);
    }
  }
  return { passages, sections, gaps: ['Crawler Markdown does not provide original rendered fragment anchors. All citations use the canonical article URL.'] };
}
