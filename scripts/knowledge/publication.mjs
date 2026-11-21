import { readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { parse } from 'parse5';
import { attribute, findNodes } from './rendered.mjs';
import { hashTree } from './release-boundary.mjs';

const normalize = (text) => text.replace(/\s+/g, ' ').trim();
const strings = (value) => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];

export function restrictedPublicationText(inventory) {
  return [...new Set(inventory.documents.flatMap(document => document.passages
    .filter(passage => document.disclosure !== 'public' || passage.disclosure !== 'public')
    .flatMap(passage => [passage.text, ...(passage.deniedReferences ?? [])])).map(normalize).filter(Boolean))];
}

// Selection protects evidence. Activation must independently protect the raw rendered site.
export async function assertPublishableRender({ root, outputDirectory, deniedText = [] }) {
  const directory = relative(resolve(root), resolve(root, outputDirectory));
  if (!directory || directory === '..' || directory.startsWith(`..${sep}`)) throw new Error('Publication output must be inside the workspace');
  const outputs = await hashTree(root, directory);
  const forbidden = deniedText.map(normalize).filter(Boolean);
  for (const path of Object.keys(outputs)) {
    const bytes = await readFile(join(root, path));
    const views = [normalize(bytes.toString())];
    if (path.endsWith('.html')) {
      const tree = parse(bytes.toString());
      const nodes = findNodes(tree, () => true);
      if (nodes.some(node => ['private', 'contact-only'].includes(attribute(node, 'data-knowledge-disclosure')))) {
        throw new Error(`Activation rejected: raw restricted disclosure in ${path}`);
      }
      views.push(normalize(nodes.filter(node => node.nodeName === '#text').map(node => node.value).join(' ')));
      views.push(...nodes.flatMap(node => (node.attrs ?? []).map(attr => normalize(attr.value))));
      for (const node of nodes.filter(node => node.tagName === 'script' && /json/i.test(attribute(node, 'type') ?? ''))) {
        try { views.push(...strings(JSON.parse((node.childNodes ?? []).map(child => child.value ?? '').join(''))).map(normalize)); }
        catch { throw new Error(`Activation rejected: malformed public JSON in ${path}`); }
      }
    } else if (path.endsWith('.json')) {
      views.push(...strings(JSON.parse(bytes.toString())).map(normalize));
    }
    if (forbidden.some(text => views.some(view => view.includes(text)))) {
      throw new Error(`Activation rejected: copied restricted body or reference in ${path}`);
    }
  }
  return { inspectedFiles: Object.keys(outputs).length, restrictedTextCount: forbidden.length };
}
