import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { archiveContent, contentAtoms, restoreAuthoredAtoms, assertRollbackInput } from '../../scripts/knowledge/content-owners.mjs';
import { assertRestoreOwner, isolatedWorkspaceFolders, isolatedWorkspaceFiles } from '../../scripts/knowledge/lifecycle-preview.mjs';

// shortcut: src/dev is skipped because the gallery is pruned from the production build; scan it too once the preview builds dev routes.
test('the isolated preview workspace copies every file the site source imports from outside src',async()=>{
  const missing=[];
  for(const entry of await readdir('src',{recursive:true,withFileTypes:true})){
    const file=join(entry.parentPath,entry.name);
    if(!entry.isFile()||!/\.(ts|tsx|astro|mjs|js|mdx)$/.test(file)||file.startsWith('src/dev/'))continue;
    for(const [,specifier]of (await readFile(file,'utf8')).matchAll(/(?:from|import)\s*\(?\s*['"](\.\.\/[^'"]+)['"]/g)){
      const target=normalize(join(dirname(file),specifier));
      if(target.startsWith('src/')||isolatedWorkspaceFolders.some(folder=>target.startsWith(`${folder}/`))||isolatedWorkspaceFiles.includes(target))continue;
      missing.push(`${file} -> ${target}`);
    }
  }
  assert.deepEqual(missing,[]);
});

// Every registered owner must support its declared restore format. The real CLI/CAS/HTTP
// tests exercise activation; this checks the actual source descriptors without rewriting files.
test('all18 registered authored owners have bounded restoration with renderer preservation',async()=>{
  const archive=await archiveContent(process.cwd());let checked=0;
  for(const [path,selected]of Object.entries(archive)){
    assertRestoreOwner(path);
    let activeText,renderer='';
    if(selected.owner.format==='file') activeText=selected.text+'\nSYNTHETIC_OWNER_EDIT\n';
    else if(selected.owner.format==='typescript') {
      const source=ts.createSourceFile(path,selected.text,ts.ScriptTarget.Latest,true),atom=selected.atoms.find(item=>!item.guardOnly)??selected.atoms.find(item=>item.restoreLiteral);
      if(!atom){assert.deepEqual(contentAtoms(selected.owner,selected.text),[]);checked++;continue;}
      let literal;const visit=node=>{if(!literal&&ts.isStringLiteral(node)&&node.getStart(source)>=atom.start&&node.end<=atom.end)literal=node;ts.forEachChild(node,visit);};visit(source);
      assert.ok(literal,`Actual authored literal: ${path}`);
      activeText=selected.text.slice(0,literal.getStart(source))+JSON.stringify(literal.text+' SYNTHETIC_OWNER_EDIT')+selected.text.slice(literal.end);
      renderer='\nexport const PROJECTION_RENDERER_FEATURE = true;\n';
    }else{
      const atom=selected.atoms[0];assert.ok(atom);
      const changed=atom.id.startsWith('text:')?atom.raw+' SYNTHETIC_OWNER_EDIT':JSON.stringify(atom.value+' SYNTHETIC_OWNER_EDIT');
      activeText=selected.text.slice(0,atom.start)+changed+selected.text.slice(atom.end);
      renderer='\n<style>.projection-renderer-feature { opacity: 1; }</style>\n';
    }
    const active={owner:selected.owner,text:activeText,atoms:contentAtoms(selected.owner,activeText)};
    const restored=restoreAuthoredAtoms(activeText+renderer,active,selected);
    assert.equal(restored,selected.text+renderer,`Authored-only restore: ${path}`);
    assert.equal(restoreAuthoredAtoms(selected.text+renderer,active,selected),selected.text+renderer,`Recognize selected value: ${path}`);
    assertRollbackInput({[path]:{...selected,atoms:contentAtoms(selected.owner,selected.text+renderer)}},{[path]:active},{[path]:selected});
    checked++;
  }
  assert.equal(checked,18);
});
