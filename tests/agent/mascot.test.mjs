import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { oakMascotContexts, oakMascotSections, oakMascotSprite } from '../../src/data/oakMascot.ts';

const baselineSource = await readFile(new URL('./fixtures/mascot/oakMascot.baseline.ts.txt', import.meta.url), 'utf8');
const base = await import(`data:text/javascript;base64,${Buffer.from(ts.transpile(baselineSource, { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext })).toString('base64')}`);
const manifest = JSON.parse(await readFile(new URL('./fixtures/mascot/COPY-MANIFEST.json', import.meta.url), 'utf8'));
const snapshot = JSON.parse(await readFile(new URL(`../../knowledge/releases/${manifest.baseline.acceptedKnowledgeRevision}/snapshot.json`, import.meta.url), 'utf8'));
const messageText = (message) => typeof message === 'string' ? message : message.text;

test('mascot baseline is the root-approved source; sprite and section allocations stay intact', () => {
  assert.equal(createHash('sha256').update(baselineSource).digest('hex'), manifest.baseline.files['src/data/oakMascot.ts']);
  assert.deepEqual(oakMascotSprite, base.oakMascotSprite);
  assert.deepEqual(oakMascotSections, base.oakMascotSections);
});

test('all existing notes keep their trigger pools, cooldowns, priority and animation; wording follows the direct-voice contract (D27)', () => {
  for (const [id, entry] of Object.entries(base.oakMascotContexts)) {
    const current = oakMascotContexts[id];
    assert.equal(current.animation, entry.animation, id);
    assert.equal(current.cooldownMs, entry.cooldownMs, id);
    assert.equal(current.priority, entry.priority, id);
    assert.equal(current.messages.length, entry.messages.length, id);
    entry.messages.forEach((message, index) => {
      assert.ok(messageText(current.messages[index]).trim().length > 0, `${id}:${index}`);
      assert.deepEqual(typeof current.messages[index] === 'string' ? undefined : current.messages[index].triggers,
        typeof message === 'string' ? undefined : message.triggers, `${id}:${index}:triggers`);
    });
  }
});

test('the reviewed EcoSmartLoop line is still Oak’s exact public wording', () => {
  const document = snapshot.documents.find((document) => document.id === 'work:ecosmartloop');
  const passage = document.passages.find((passage) => passage.id === 'work:ecosmartloop:section-013:passage-001');
  assert.equal(messageText(oakMascotContexts['oak.character.steve-quote'].messages[0]), passage.text);
});

test('client mascot imports only deliberate public copy and safe types', async () => {
  const component = await readFile(new URL('../../src/components/OakMascot.tsx', import.meta.url), 'utf8');
  const data = await readFile(new URL('../../src/data/oakMascot.ts', import.meta.url), 'utf8');
  for (const forbidden of ['agent-policy/', 'tests/agent/', 'work-answers.v1.json', 'character.json', 'hard-policy.json', 'owners.json', 'SYNTHETIC_PRIVATE_NOTE_CANARY_T04']) {
    assert.ok(!component.includes(forbidden) && !data.includes(forbidden), forbidden);
  }
  assert.ok(!component.includes('Steve Oak’s words'));
  assert.ok(!component.includes('<q '));
});
