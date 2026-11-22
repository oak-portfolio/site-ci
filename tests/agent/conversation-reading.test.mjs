import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseFragment, serialize } from 'parse5';
import { loadTsx, strictLoader } from './design-rework/load-tsx.mjs';

// A desktop window lets the real viewport guard admit every panel.
globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const workspace = loadTsx('src/lib/oakWorkspace.ts');
const navigationExports = loadTsx('src/lib/oakPortfolioNavigation.ts');
// The chat primitives moved from OakChatPrimitives into src/components/ui and the conversation split into
// OakTranscript, OakTurn, OakComposer, OakEmptyState and the workflow panels; render that real tree.
const { OakConversation } = loadTsx('src/components/agent/OakConversation.tsx');
const { OakComposer } = loadTsx('src/components/agent/OakComposer.tsx');
const { OakTranscript } = loadTsx('src/components/agent/OakTranscript.tsx');
const { OakEmptyState } = loadTsx('src/components/agent/OakEmptyState.tsx');
const { OakConversationPanel } = loadTsx('src/components/agent/OakWorkflowPanels.tsx');
const { OakContactBriefEditor } = loadTsx('src/components/agent/OakContactBriefEditor.tsx');
const defaults = workspace.getOakWorkspace();

function render(messages, overrides = {}) {
  return renderToStaticMarkup(React.createElement(OakConversation, {
    state: { ...defaults, messages, draft: '', historyRevision: 0, conversationId: messages.length ? 'reading-fixture' : null, ...overrides },
    onContact: () => {}, geometryKey: '540:672',
  }));
}

const answer = { schema: 'oak.answer.v1', speaker: 'oak-ai-host', characterVersion: 'fixture', hardPolicyVersion: 'fixture', knowledgeRevision: 'fixture',
  operations: ['search', 'read'], kind: 'sourced', acknowledgment: null,
  claims: [{ id: 'ownership', text: 'Steve owned the app around the classifier.', citations: [{ documentId: 'work:ecosmartloop', passageId: 'p', sectionId: 's', url: 'https://steveoak.com/work/ecosmartloop/#ownership' }] }] };

test('empty starters have a keyboard-scrollable region without a transcript live-edge action', () => {
  const html = render([]);
  assert.match(html, /role="region" aria-label="Start a conversation" tabindex="0"/);
  for (const label of ["Ask about Steve&#x27;s work", 'What has Steve built?',
    'How does Steve approach AI systems?', 'Help me draft a question for Steve']) assert.ok(html.includes(label), label);
  assert.ok(!html.includes('Latest messages'), 'intro overflow is not a reason to jump to nonexistent messages');
  assert.ok(!html.includes('data-message-id'), 'starters must not enter transcript restoration or live-edge tracking');
});

test('actual long transcripts retain message items and the live-edge action', () => {
  const messages = Array.from({ length: 20 }, (_, index) => ({
    id: `reading-${index}`, role: index % 2 ? 'assistant' : 'user', text: `Message ${index}`, cards: [],
  }));
  const html = render(messages);
  assert.equal((html.match(/data-message-id=/g) ?? []).length, messages.length);
  assert.match(html, /aria-label="Conversation with Oak"/);
  assert.ok(html.includes('Latest messages'));
  assert.ok(!html.includes('data-empty="true"'));
  assert.ok(!html.includes('Help me draft a question for Steve'));
});

test('internal work cards stay on the current site without changing canonical evidence', () => {
  const canonical = 'https://steveoak.com/work/linkedin-growth-loop/#what-i-built';
  const card = { kind: 'navigate', label: 'Read LinkedIn Growth Loop', url: canonical };
  const html = render([{ id: 'navigation-fixture', role: 'assistant', text: 'A completed answer', cards: [card] }]);
  assert.ok(html.includes('href="/work/linkedin-growth-loop/#what-i-built"'));
  assert.equal(card.url, canonical);
  assert.equal(new URL(navigationExports.oakPortfolioNavigationHref(canonical), 'http://localhost:4321/work/ecosmartloop').origin,
    'http://localhost:4321');
});

test('reviewed legacy external cards retain their exact approved destination', () => {
  const legacy = 'https://independent-performance-642823.framer.app/codex/ai-automation-cloud';
  assert.equal(navigationExports.oakPortfolioNavigationHref(legacy), legacy);
  assert.equal(navigationExports.oakPortfolioNavigationHref(`${legacy}?redirect=elsewhere`), undefined);
});

test('card routing cannot turn malformed or ambiguous paths into external navigation', () => {
  for (const value of ['javascript:alert(1)', 'https://steveoak.com.evil.test/work',
    'https://steveoak.com:8443/work', 'https://visitor:secret@steveoak.com/work',
    'http://steveoak.com/work', '//evil.test/work', 'https://[bad']) {
    assert.equal(navigationExports.oakPortfolioNavigationHref(value), undefined, value);
  }
  assert.equal(navigationExports.oakPortfolioNavigationHref('https://steveoak.com//evil.test/work'),
    'https://steveoak.com//evil.test/work');
  assert.equal(navigationExports.oakPortfolioNavigationHref('/work#oaklabs'), '/work#oaklabs');
});


function nodes(node) {
  return [node, ...(node.childNodes ?? []).flatMap(nodes)];
}
function attribute(node, name) {
  return node.attrs?.find(attribute => attribute.name === name)?.value;
}
function hasClass(node, name) {
  return attribute(node, 'class')?.split(' ').includes(name);
}
function ancestor(node, predicate) {
  for (let parent = node.parentNode; parent; parent = parent.parentNode) if (predicate(parent)) return parent;
}
function renderedNodes(state = {}) {
  return nodes(parseFragment(render([], state)));
}
const icons = node => nodes(node).filter(child => attribute(child, 'data-icon') !== undefined);

test('real Latest control has a separate transcript lane and stays inert until reading can jump', () => {
  // Latest is now the ui/message MessageScrollerButton rendered by OakTranscript, still its own lane.
  const all = nodes(parseFragment(render([{ id: 'lane-answer', role: 'assistant', text: 'Answer with its citation', cards: [] }])));
  const latest = all.find(node => hasClass(node, 'oak-conversation__latest'));
  const viewport = all.find(node => hasClass(node, 'oak-conversation__viewport'));
  assert.ok(latest && viewport);
  assert.equal(latest.parentNode, viewport.parentNode, 'The jump control is a sibling lane, outside scrolling content.');
  assert.equal(ancestor(latest, node => hasClass(node, 'oak-conversation__viewport')), undefined);
  assert.equal(attribute(latest, 'type'), 'button');
  assert.equal(attribute(latest, 'data-active'), 'false');
  assert.equal(attribute(latest, 'inert'), '');
  assert.equal(attribute(latest, 'tabindex'), '-1');
});

test('core input and Send share a footer outside the reading and workflow region, with no resize control in it', () => {
  const all = renderedNodes();
  const footer = all.find(node => node.tagName === 'form' && hasClass(node, 'oak-composer'));
  const input = all.find(node => node.tagName === 'textarea' && attribute(node, 'placeholder') === "Ask about Steve's work");
  const send = all.find(node => node.tagName === 'button' && attribute(node, 'type') === 'submit');
  assert.ok(footer && input && send);
  assert.ok(nodes(send).some(node => attribute(node, 'data-icon') === 'send'));
  assert.equal(ancestor(input, node => node.tagName === 'form'), footer);
  assert.equal(ancestor(send, node => node.tagName === 'form'), footer);
  assert.equal(nodes(footer).some(node => /resize/i.test(attribute(node, 'aria-label') ?? '')), false, 'the window resizes from its edges, not the composer');
  assert.equal(ancestor(footer, node => hasClass(node, 'oak-workspace__reading')), undefined);
  const workflow = all.find(node => hasClass(node, 'oak-workspace__workflow'));
  assert.equal(workflow, undefined, 'empty workflow chrome must not consume the default reading canvas');
  // Tools is now an icon menu trigger named by aria-label rather than a text button.
  const tools = all.find(node => attribute(node, 'data-oak-tools-trigger') !== undefined);
  assert.ok(tools);
  assert.equal(attribute(tools, 'aria-label'), 'Tools');
  assert.equal(attribute(tools, 'aria-haspopup'), 'menu');
  assert.equal(attribute(tools, 'aria-expanded'), 'false');
  assert.equal(ancestor(tools, node => node.tagName === 'form'), footer);
});

test('moved question and role controls retain the footer form owner and submit action', () => {
  for (const [state, values, label] of [
    [{ questionDraft: { topic: 'Public systems', goal: 'Ask about design decisions' } }, ['Public systems', 'Ask about design decisions'], 'Send'],
    [{ roleDraft: { roleDescription: 'Frontend engineering', intent: 'Compare public work' } }, ['Frontend engineering', 'Compare public work'], 'Compare'],
  ]) {
    const all = renderedNodes(state);
    const footer = all.find(node => node.tagName === 'form' && hasClass(node, 'oak-composer'));
    assert.ok(footer);
    for (const value of values) {
      const control = all.find(node => ['input', 'textarea'].includes(node.tagName) &&
        (attribute(node, 'value') ?? node.childNodes?.find(child => child.nodeName === '#text')?.value) === value);
      assert.ok(control, value);
      assert.equal(attribute(control, 'form'), attribute(footer, 'id'), value);
      assert.equal(ancestor(control, node => node.tagName === 'form'), undefined, value);
      assert.ok(ancestor(control, node => hasClass(node, 'oak-workspace__reading')), value);
    }
    const submit = nodes(footer).find(node => node.tagName === 'button' && attribute(node, 'type') === 'submit');
    assert.ok(nodes(submit).some(node => node.nodeName === '#text' && node.value === label));
  }
});

test('document role requirements show selection custody without the inline textarea or byte counter', () => {
  const documentId = '0f8c7a52-3b1e-4c6d-9a2f-5e4d3c2b1a09';
  const roleDraft = { roleDescription: '', intent: 'Compare selected requirements', requirementSource: {
    kind: 'document', sourceIds: [`visitor-document:${documentId}:section-1:0-40`, `visitor-document:${documentId}:section-2:0-40`] } };
  const html = render([], { roleDraft });
  assert.match(html, /2 document sections selected for this comparison/);
  assert.match(html, />Change selection</);
  assert(!html.includes('id="oak-role-description"'));
  assert(!html.includes('id="oak-role-limit"'));
  const all = renderedNodes({ roleDraft }), footer = all.find(node => node.tagName === 'form' && hasClass(node, 'oak-composer'));
  const intent = all.find(node => node.tagName === 'textarea' && node.childNodes?.some(child => child.value === roleDraft.intent));
  assert.equal(attribute(intent, 'form'), attribute(footer, 'id'));
  assert.equal(ancestor(intent, node => node.tagName === 'form'), undefined);
  const submit = nodes(footer).find(node => node.tagName === 'button' && attribute(node, 'type') === 'submit');
  assert.ok(nodes(submit).some(node => node.nodeName === '#text' && node.value === 'Compare'));
});

test('account continuation owns a separate form and running turns retain an explicit Stop button', () => {
  const all = renderedNodes({ authOpen: true, authStatus: { kind: 'account', phase: 'continue-required', configured: true } });
  const forms = all.filter(node => node.tagName === 'form');
  assert.equal(forms.length, 2);
  // The required purpose <select> became a required radio group inside the account Questionnaire form (D08).
  const account = all.find(node => node.tagName === 'input' && attribute(node, 'type') === 'radio' && attribute(node, 'required') !== undefined);
  assert.ok(account);
  const accountForm = ancestor(account, node => node.tagName === 'form');
  assert.ok(accountForm && !hasClass(accountForm, 'oak-composer'));
  assert.equal(attribute(account, 'form'), undefined);
  assert.equal(ancestor(accountForm, node => node.tagName === 'form'), undefined);
  assert.ok(ancestor(accountForm, node => hasClass(node, 'oak-workspace__reading')));
  const running = renderedNodes({ pending: true, progress: 'Working' });
  const footer = running.find(node => node.tagName === 'form' && hasClass(node, 'oak-composer'));
  assert.equal(nodes(footer).filter(node => node.tagName === 'button' && attribute(node, 'type') === 'submit').length, 0);
  const stop = nodes(footer).find(node => node.tagName === 'button' && nodes(node).some(child => child.nodeName === '#text' && child.value === 'Stop'));
  assert.equal(attribute(stop, 'type'), 'button');
  assert.ok(nodes(stop).some(node => attribute(node, 'data-icon') === 'stop'));
});

test('validated tool activity selects one decorative semantic icon and keeps status text authoritative', () => {
  // D06-G2 and D35: progress lives in the pending turn's reasoning header (role=status) and its step rail, never the status line.
  const turn = state => ({ id: 'reading-turn', role: 'assistant', text: '', cards: [], state: 'pending',
    steps: [{ id: 'read-0', operation: 'read', state }] });
  const all = nodes(parseFragment(render([turn('running')], { presentation: 'human-agent', pending: true, progress: 'Reading a public passage',
    activity: { kind: 'tool', operation: 'read', phase: 'started' } })));
  assert.equal(all.find(node => hasClass(node, 'oak-workspace__status')), undefined, 'the status line carries errors only');
  // Q03-G4 (intentional update): the transcript's one polite sr-only region announces the step (its text arrives after
  // mount, tested in tests/agent/premium/q03-status.test.mjs); the shimmering label in the header is visual only.
  const statuses = all.filter(node => attribute(node, 'role') === 'status' && hasClass(node, 'sr-only'));
  assert.equal(statuses.length, 1, 'one live region');
  const status = statuses[0];
  const label = all.find(node => hasClass(node, 'oak-turn__shimmer') && hasClass(node, 'oak-cot__label'));
  assert.equal(attribute(label, 'aria-hidden'), 'true');
  assert.ok(status);
  assert.equal(icons(status).length, 0, 'the status text stands alone');
  assert.ok(nodes(label).some(node => node.nodeName === '#text' && node.value === 'Reading a public passage'));
  const glyph = all.find(node => hasClass(node, 'oak-cot__glyph'));
  assert.equal(attribute(glyph, 'aria-hidden'), 'true', 'the header art is decorative');
  const semantic = all.filter(node => hasClass(node, 'oak-cot__node'));
  assert.equal(semantic.length, 1);
  assert.equal(attribute(semantic[0], 'aria-hidden'), 'true');
  assert.deepEqual(icons(semantic[0]).map(node => attribute(node, 'data-icon')), ['bookOpenText']);
  const completed = render([turn('done')], { presentation: 'human-agent', pending: true, progress: 'Public passage read',
    activity: { kind: 'tool', operation: 'read', phase: 'completed' } });
  assert.match(completed, /class="oak-cot__step" data-state="done" data-kind="read"/);
  assert.ok(completed.includes('Read a passage'));
});

test('interrupted, failed and held markers get one matching hidden icon each, and a settled answer shows none', () => {
  // D06-G5: interrupted and failed now share one stopped note (alert); usage needs a validated answer to show.
  const all = nodes(parseFragment(render([
    { id: 'stopped', role: 'assistant', text: '', cards: [], state: 'interrupted', taskKind: 'question' },
    { id: 'failed', role: 'assistant', text: '', cards: [], state: 'failed', taskKind: 'question' },
    { id: 'held', role: 'assistant', text: 'Held answer', answer, cards: [], state: 'complete', usage: { state: 'held' } },
    { id: 'settled', role: 'assistant', text: 'Settled answer', answer, cards: [], state: 'complete', usage: { state: 'settled' } },
  ])));
  // v3 review (intentional update): a settled answer needs no receipt line; only a held one says it is still settling.
  const markers = [...all.filter(node => hasClass(node, 'oak-turn__stopped')), ...all.filter(node => hasClass(node, 'oak-turn__usage'))];
  assert.equal(markers.length, 3);
  assert.deepEqual(markers.map(marker => icons(marker).map(icon => attribute(icon, 'data-icon'))), [['alert'], ['alert'], ['clock']]);
  for (const marker of markers) assert.equal(attribute(icons(marker)[0], 'aria-hidden'), 'true');
});


test('the default canvas has one Tools entry and keeps secondary workflows and save preparation out of the reading area', () => {
  const html = render([]);
  assert.equal((html.match(/data-oak-tools-trigger/g) ?? []).length, 1);
  // Dictate is now a labelled composer icon, so the check is scoped to the reading area it must stay out of.
  const reading = serialize(nodes(parseFragment(html)).find(node => hasClass(node, 'oak-workspace__reading')));
  for (const label of ['Compare a role', 'Get project advice', 'Dictate a message', 'Prepare your contact brief', 'Saved conversations', 'Account saving is being prepared']) {
    assert.ok(!reading.includes(label), label);
  }
  assert.ok(!html.includes('oak-workspace__workflow'));
  assert.ok(!html.includes('oak-saved-history'));
});

test('active workflows replace competing starters and tools while preserving their fields and the composer draft', () => {
  for (const state of [
    { roleDraft: { roleDescription: 'Frontend engineering', intent: 'Compare evidence' } },
    { questionDraft: { topic: 'Design decisions', goal: 'Ask about constraints' } },
    { voiceOpen: true },
    { draftKind: 'advice' },
  ]) {
    const html = render([], { draft: 'My exact draft', ...state });
    assert.ok(!html.includes('data-oak-tools-trigger'));
    assert.ok(!html.includes('What has Steve built?'));
    assert.ok(!html.includes('data-empty="true"'));
    assert.ok(html.includes('oak-workspace__workflow'));
    if (!state.roleDraft) assert.ok(html.includes('My exact draft'));
  }
});

test('real account and saved-history errors remain visible without opening secondary controls', () => {
  const html = render([], { saveError: 'Saving needs attention.' });
  assert.ok(html.includes('role="status">Saving needs attention.'));
  const required = render([], { authStatus: { kind: 'guest', phase: 'sign-in-required', configured: false } });
  // Review v4 supersedes the old guest card: with sign-in off, the account prompt is one compact inline notice.
  assert.ok(required.includes('oak-account-notice'));
  assert.ok(required.includes('Sign-in is unavailable right now'));
  assert.ok(required.includes('Your conversation and draft stay right here. Saving conversations returns once sign-in is back.'));
  assert.ok(!required.includes('Continue with an account'));
  assert.ok(!required.includes('data-oak-tools-trigger'));
});

// Run the actual component's local hooks and event callbacks against the real workspace store, which now owns the open surface.
// This checks view transitions, not Base UI timing, mounted DOM focus, or browser acceptance.
const root = path.resolve(import.meta.dirname, '../..');
const nodeRequire = createRequire(path.join(root, 'package.json'));
const conversationFile = path.join(root, 'src/components/agent/OakConversation.tsx');
function resolveModule(specifier) {
  if (specifier === '@/lib/oakDocumentsWorkspace') return { useOakDocumentsWorkspace: () => ({ open: false, documents: [], usedSelections: [] }) };
  // R11 (intentional update): verification mode reads the Turnstile store through one hook; these views need no check.
  if (specifier === './OakTurnstile') return { OakVerification: () => null, useOakVerification: () => ({ mounted: false, verifying: false, dismiss() {} }) };
  // Same Hugeicons stub as load-tsx.mjs; the Pro CJS build cannot load under Node's require.
  if (specifier === '@/components/ui/Icon') return { Icon: ({ name }) => React.createElement('svg', { 'data-icon': name, 'aria-hidden': 'true' }) };
  const base = specifier.startsWith('@/') ? path.join(root, 'src', specifier.slice(2))
    : specifier.startsWith('.') ? path.resolve(path.dirname(conversationFile), specifier) : null;
  if (!base) return nodeRequire(specifier);
  return loadTsx(['.tsx', '.ts'].map(extension => base + extension).find(existsSync));
}

function conversationView() {
  const slots = [], effects = [], focusCalls = [];
  let cursor = 0, changed = false, tree;
  const hooks = {
    ...React,
    useId: () => 'composer-view-test',
    useRef: initial => slots[cursor++] ??= { current: initial },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => {
        const next = typeof value === 'function' ? value(slots[index]) : value;
        if (!Object.is(slots[index], next)) { slots[index] = next; changed = true; }
      }];
    },
    useEffect: () => {},
    useLayoutEffect(effect, dependencies) {
      const index = cursor++;
      if (!slots[index] || dependencies.some((value, i) => !Object.is(value, slots[index][i]))) {
        slots[index] = dependencies;
        effects.push(effect);
      }
    },
  };
  const view = strictLoader(import.meta.url)(conversationFile, name => name === 'react' ? hooks : resolveModule(name));
  const elements = element => !React.isValidElement(element) ? [] :
    [element, ...React.Children.toArray(element.props.children).flatMap(elements)];
  for (let i = 0; workspace.getOakSurface() !== 'chat'; i++) { assert.ok(i < 10, 'surface closes'); workspace.closeOakSurface(); }
  return {
    focusCalls,
    render(state, conversationResetVersion = 0) {
      workspace.setOakWorkspaceFixture({ messages: [], draft: '', draftKind: 'question', presentation: 'human-agent', historyRevision: 0,
        historyRestored: false, historyError: null, conversationId: null, briefOpen: false, briefDraft: null, ...state });
      let remaining = 5;
      do {
        changed = false; cursor = 0;
        const before = workspace.getOakWorkspace();
        tree = view.OakConversation({ state: before, onContact() {}, geometryKey: '540:672', conversationResetVersion });
        // The composer textarea now lives in OakComposer, which receives the conversation's ref.
        elements(tree).find(element => element.type === OakComposer).props.composerRef.current = { focus: options => focusCalls.push(options) };
        while (effects.length) effects.shift()();
        changed ||= workspace.getOakWorkspace() !== before;
        assert.ok(remaining--, 'component view must settle');
      } while (changed);
      return elements(tree);
    },
  };
}

test('successful restore and explicit New exit utilities, while a failed history load retains them', () => {
  const view = conversationView();
  // The Tools menu now lives in OakComposer, which forwards its selection through onSelectTool.
  const open = state => view.render(state).find(element => element.type === OakComposer).props.onSelectTool('history');
  const options = elements => elements.some(element => element.type === OakConversationPanel);
  open({});
  assert.equal(options(view.render({})), true);
  assert.equal(options(view.render({ historyError: 'Unable to open the saved conversation.' })), true);
  const restored = { historyRevision: 1, historyRestored: true, conversationId: 'restored',
    messages: [{ id: 'restored-message', role: 'assistant', text: 'Restored answer', cards: [] }] };
  const restoredView = view.render(restored);
  assert.equal(options(restoredView), false);
  assert.ok(restoredView.some(element => element.type === OakTranscript && element.props.state.messages.some(message => message.id === 'restored-message')));
  open(restored);
  assert.equal(options(view.render(restored)), true);
  const fresh = view.render({}, 1);
  assert.equal(options(fresh), false);
  assert.ok(fresh.some(element => element.type === OakEmptyState));
});

test('Return from a sourced advice brief restores its retained advice composer focus', () => {
  const view = conversationView();
  const brief = view.render({ draftKind: 'advice', briefOpen: true, briefDraft: { goals: 'Advice follow-up' } })
    .find(element => element.type === OakContactBriefEditor && typeof element.props.onReturnToChat === 'function');
  assert.ok(brief);
  brief.props.onReturnToChat();
  view.render({ draftKind: 'advice', briefOpen: false });
  assert.deepEqual(view.focusCalls, [{ preventScroll: true }]);
});
