import ts from 'typescript';
import { parse } from '@astrojs/compiler-rs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { digest, readJson } from './release-boundary.mjs';

export async function ownerFiles(root) {
  const registry = await readJson(join(root, 'knowledge/owners.json'));
  const files = [];
  for (const owner of registry.owners) {
    const paths = owner.path ? [owner.path] : owner.paths ?? (await readdir(join(root, owner.directory)))
      .filter(path => path.endsWith(owner.extension)).sort().map(path => `${owner.directory}/${path}`);
    for (const path of paths) files.push({ ...owner, path });
  }
  return files;
}

// Offset-bearing AST atoms let rollback restore authored values without restoring renderer code.
export function contentAtoms(owner, text) {
  if (owner.format === 'file') return [{ id: 'authored-file', start: 0, end: text.length, raw: text, value: text }];
  if (owner.format === 'typescript') {
    const source = ts.createSourceFile(owner.path, text, ts.ScriptTarget.Latest, true);
    const atoms = [];
    const guardedOrdinals = new Map();
    const readerFields = new Set(['summary','description','title','shortTitle','label','answer','heading','queryIntents','claimBoundaries','identityNotes','answerBlocks','claimBoundaries','facts']);
    const publicContext = node => {
      for(let parent=node.parent;parent;parent=parent.parent) {
        if(ts.isPropertyAssignment(parent) && readerFields.has(parent.name.getText(source).replaceAll('\"','').replaceAll("'",''))) return true;
        if(ts.isCallExpression(parent) && ['fact','answer','link'].includes(parent.expression.getText(source))) return true;
      }
      return false;
    };
    const scope = node => { for(let parent=node.parent;parent;parent=parent.parent) {
      if(ts.isFunctionDeclaration(parent)) return parent.name?.getText(source) ?? 'anonymous';
      if(ts.isVariableDeclaration(parent)) return parent.name.getText(source);
    } return 'module'; };
    const visit = node => {
      if(ts.isImportDeclaration(node) || ts.isTypeNode(node) || ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return;
      if (ts.isVariableDeclaration(node) && owner.names.includes(node.name.getText(source)) && node.initializer) {
        const init = node.initializer;
        atoms.push({ id: node.name.getText(source), start: init.getStart(source), end: init.end,
          raw: init.getText(source), value: ts.createPrinter({removeComments:true}).printNode(ts.EmitHint.Expression, init, source) });
        return;
      }
      if(owner.guardPublicCopy && ts.isPropertyAssignment(node) && readerFields.has(node.name.getText(source).replaceAll('\"','').replaceAll("'",''))) {
        const name=`${scope(node)}:field-${node.name.getText(source)}`,ordinal=(guardedOrdinals.get(name)??0)+1;guardedOrdinals.set(name,ordinal);
        const init=node.initializer;
        atoms.push({id:`public-field:${name}:${ordinal}`,start:init.getStart(source),end:init.end,raw:init.getText(source),value:ts.createPrinter({removeComments:true}).printNode(ts.EmitHint.Expression,init,source),guardOnly:true});
      }
      if(owner.guardPublicCopy && (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node))) {
        const value=node.text;
        const isPropertyKey=ts.isPropertyAssignment(node.parent) && node.parent.name===node;
        if(!isPropertyKey && value.trim() && (publicContext(node) || value.trim().split(/\s+/).length>=3)) {
          const name=scope(node),ordinal=(guardedOrdinals.get(name)??0)+1;guardedOrdinals.set(name,ordinal);
          atoms.push({id:`public-copy:${name}:${ordinal}`,start:node.getStart(source),end:node.end,raw:node.getText(source),value,guardOnly:true,restoreLiteral:true});
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (atoms.filter(atom=>!atom.guardOnly).length !== owner.names.length) throw new Error(`Missing registered authored initializer: ${owner.path}`);
    return atoms;
  }
  const { ast, diagnostics } = parse(text);
  if (diagnostics.some(item => item.severity === 'error' || item.severity === 1)) throw new Error(`Invalid authored Astro source: ${owner.path}`);
  const atoms = [], ordinals = new Map();
  const add = (kind, node, value) => {
    const ordinal = (ordinals.get(kind) ?? 0) + 1;
    ordinals.set(kind, ordinal);
    atoms.push({ id: `${kind}:${ordinal}`, start: node.start, end: node.end, raw: text.slice(node.start, node.end), value });
  };
  const attrs = new Set(['title','description','eyebrow','alt','href','id','aria-label','data-knowledge-disclosure','data-knowledge-conflict']);
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'AstroFrontmatter') return;
    if (node.type === 'JSXElement' && ['script','style'].includes(node.openingElement?.name?.name)) return;
    if (node.type === 'JSXText' && node.value.trim()) add('text', node, node.value.replace(/\s+/g, ' ').trim());
    if (node.type === 'JSXAttribute' && attrs.has(node.name?.name) && node.value?.type === 'Literal') {
      add(`attribute-${node.name.name}`, node.value, node.value.value);
    }
    if (node.type === 'JSXExpressionContainer' && node.expression?.type === 'Literal' && typeof node.expression.value === 'string') {
      add('expression-text', node.expression, node.expression.value);
    }
    for (const [key, value] of Object.entries(node)) if (key !== 'frontmatter') {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(ast);
  return atoms;
}

export async function archiveContent(root) {
  const archive = {};
  for (const owner of await ownerFiles(root)) {
    const text = await readFile(join(root, owner.path), 'utf8');
    archive[owner.path] = { owner, text, atoms: contentAtoms(owner, text) };
  }
  return archive;
}
export const contentProjection = archive => Object.fromEntries(Object.entries(archive).sort(([a],[b])=>a.localeCompare(b))
  .map(([path, value]) => [path, value.atoms.map(({id,value})=>({id,value}))]));
export async function captureContent(root) {
  const archive = await archiveContent(root), projection = contentProjection(archive);
  return { archive, contentFiles: Object.fromEntries(Object.entries(projection).map(([path, atoms])=>[path,digest(atoms)])), contentIdentity: digest(projection) };
}

export function restoreAuthoredAtoms(current, active, selected) {
  if (!active || !selected) throw new Error('Owner additions/removals need an explicit source edit before rollback');
  const now = contentAtoms(active.owner, current), edits = [];
  if(digest(now.map(({id,value})=>({id,value})))===digest(selected.atoms.map(({id,value})=>({id,value})))) return current;
  for (const target of selected.atoms) {
    const base = active.atoms.find(atom=>atom.id===target.id);
    if (!base) throw new Error(`Rollback requires an explicit structural source edit: ${target.id}`);
    if (base.value === target.value) continue;
        const existing = now.find(atom=>atom.id===target.id);
    if(existing?.value===target.value) continue;
    if (!existing || existing.value !== base.value) throw new Error(`Rollback would overwrite an unapproved authored edit: ${target.id}`);
    edits.push({ ...existing, replacement: target.raw });
  }
  if (active.atoms.some(atom=>!selected.atoms.some(other=>other.id===atom.id))) throw new Error('Rollback requires an explicit structural source edit');
  // Prefer bounded inner authored literals when guard fields describe the same changed copy.
  // Recheck the selected projection after applying the non-overlapping edits.
  const bounded=edits.filter(edit=>!edits.some(inner=>inner!==edit && inner.start>=edit.start && inner.end<=edit.end && (inner.start>edit.start||inner.end<edit.end)));
  const unique=bounded.filter((edit,index)=>bounded.findIndex(other=>other.start===edit.start&&other.end===edit.end)===index);
  const restored=unique.sort((a,b)=>b.start-a.start).reduce((text, edit)=>text.slice(0,edit.start)+edit.replacement+text.slice(edit.end),current);
  const after=contentAtoms(active.owner,restored);
  for(const target of selected.atoms) if(after.find(atom=>atom.id===target.id)?.value!==target.value) throw new Error(`Structural authored copy rollback needs an explicit owner edit: ${target.id}`);
  return restored;
}

export function assertRollbackInput(current,active,selected) {
  if(Object.keys(current).join()!==Object.keys(active).join() || Object.keys(active).join()!==Object.keys(selected).join()) throw new Error('Structural rollback needs explicit source edits');
  for(const [path,record] of Object.entries(current)) {
    if(digest(record.atoms.map(({id,value})=>({id,value})))===digest(selected[path].atoms.map(({id,value})=>({id,value})))) continue;
    for(const atom of record.atoms) {
      const base=active[path].atoms.find(other=>other.id===atom.id),target=selected[path].atoms.find(other=>other.id===atom.id);
      if(!base || !target || (atom.value!==base.value && atom.value!==target.value)) throw new Error('Rollback preserves unpublished authored edits; review or restore them explicitly first');
    }
    if(record.atoms.length!==active[path].atoms.length || record.atoms.length!==selected[path].atoms.length) throw new Error('Rollback preserves unpublished authored edits; structural source changes need explicit review');
  }
}
