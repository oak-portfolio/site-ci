import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { oakMascotContexts } from '../../../src/data/oakMascot.ts';

const notes = Object.entries(oakMascotContexts).flatMap(([id, entry]) =>
  entry.messages.map((message) => ({ id, message, text: typeof message === 'string' ? message : message.text })));

// Third-person self-reference, speaker labels and "mascot" meta talk read as a narrator, not the character.
const narrator = [
  /Steve(’|')s\b/, /\b(Ask|reach|to) Steve\b/, /\bmascot\b/i, /\bAI host\b/i, /\bsite-host\b/i,
  /\bOak (rule|note|builds|likes)\b/, /\bnote from Oak\b/i, /\b(Gym|Wizard|Tiny|lobster) Oak\b/,
  /\b(Claw|Orbi) (likes|trusts|keeps|watches|explains|handles|used|explained)\b/, /\bmade Orbi\b/,
];

test('D27-G1 every mascot note talks straight to the visitor with no speaker tag or quote attribution', async () => {
  assert.ok(notes.length > 200, `notes=${notes.length}`);
  for (const note of notes) {
    if (typeof note.message !== 'string') assert.deepEqual(Object.keys(note.message).sort().filter((key) => key !== 'triggers'), ['text'], note.id);
    for (const pattern of narrator) assert.doesNotMatch(note.text, pattern, `${note.id}: ${note.text}`);
  }
  const invites = oakMascotContexts['oak.agent-invite'].messages;
  assert.ok(invites.length >= 4 && invites.every((text) => /Oak AI Agent|Ask me/.test(text)), 'invites point at the agent');
  const component = await readFile(new URL('../../../src/components/OakMascot.tsx', import.meta.url), 'utf8');
  for (const label of ['Steve Oak’s words', '<q ', 'mascotIdentity', 'speech.attribution', '<strong aria-hidden']) assert.ok(!component.includes(label), label);
  assert.match(component, /aria-label=\{`\$\{mascotName\}\. \$\{speech\.text\}`\}/);
});
