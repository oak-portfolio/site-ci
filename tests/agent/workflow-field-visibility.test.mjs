import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as jsx from 'react/jsx-runtime';
import { strictLoader } from './design-rework/load-tsx.mjs';

// Exercise the public conversation owner with a controlled commit/focus/layout
// boundary. These are the retained V63 DOM rectangles, not a CSS layout engine
// or proof of native keyboard hittability. Unrelated children are not mounted.
function conversationFixture(t) {
  const frames = new Map(), observers = [], slots = [], effects = [];
  let cursor = 0, nextFrame = 0, submissions = 0;
  const eventTarget = () => {
    const listeners = new Map();
    return {
      addEventListener(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); },
      removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
      dispatch(name) { for (const listener of listeners.get(name) ?? []) listener({ type: name }); },
      get listenerCount() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
    };
  };
  const visible = Object.assign(eventTarget(), { width: 402, height: 384, offsetTop: 0, offsetLeft: 0, scale: 1 });
  const view = Object.assign(eventTarget(), {
    visualViewport: visible, scrollX: 0, scrollY: 120,
    requestAnimationFrame(fn) { const id = ++nextFrame; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.target = target; }
      disconnect() { this.target = null; }
    },
  });
  const document = { defaultView: view, activeElement: null };
  const originalResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = view.ResizeObserver;
  let geometry = { top: 53, left: 0, height: 274, width: 384, fieldTop: 269, intentTop: 430 };
  const reading = Object.assign(eventTarget(), {
    ownerDocument: document, isConnected: true, scrollTop: 0, scrollLeft: 7, clientTop: 0, clientLeft: 0,
    getBoundingClientRect() { return { ...geometry, bottom: geometry.top + geometry.height, right: geometry.left + geometry.width }; },
    contains(element) { return element === description || element === intent; },
  });
  Object.defineProperties(reading, {
    clientHeight: { get: () => geometry.height }, clientWidth: { get: () => geometry.width },
  });
  const field = (id, position) => ({
    id, tagName: 'TEXTAREA', isConnected: true, value: 'T09 retained field draft marker', selectionStart: 12, selectionEnd: 22,
    matches(selector) { return /input|textarea/.test(selector); },
    getClientRects() { return this.isConnected ? [this.getBoundingClientRect()] : []; },
    getBoundingClientRect() {
      const top = geometry[position] - reading.scrollTop;
      return { top, bottom: top + 44, height: 44, left: 24, right: 205.234375, width: 181.234375 };
    },
    focus() { document.activeElement = this; reading.dispatch('focusin'); },
  });
  const description = field('oak-role-description', 'fieldTop'), intent = field('oak-role-intent', 'intentTop');
  const transcript = { scrollTop: 91 };
  const hooks = {
    useId: () => 'visibility-composer',
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useState(initial) { const index = cursor++; slots[index] ??= { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { slots[index].value = value; }]; },
    useEffect() { cursor++; },
    useLayoutEffect(callback, dependencies) {
      const index = cursor++, previous = slots[index];
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        effects.push(() => { previous?.cleanup?.(); slots[index] = { dependencies, cleanup: callback() }; });
      }
    },
  };
  const requires = {
    // R11 (intentional update): verification mode lives in OakTurnstile; these render tests never need a Turnstile pass.
    "./OakTurnstile": { OakVerification: "div", useOakVerification: () => ({ verifying: false, mounted: false, attempt: 0, dismiss() {} }) },
    react: hooks, 'react/jsx-runtime': jsx, '@base-ui/react/field': { Field: { Root: 'field', Label: 'label', Control: 'control' } },
    '@shadcn/react/message-scroller': {}, '@/components/ui/button': {}, '@/components/ui/Icon': {},
    '@/lib/oakDocumentsWorkspace': { useOakDocumentsWorkspace: () => ({ open: false, documents: [], usedSelections: [] }) },
    '@/lib/oakWorkspace': { getOakResearchNeed: () => null, oakRoleDraftError: () => null,
      isOakDraftReady: () => true, submitOakTurn: () => { submissions++; },
      oakSurface: value => value.roleDraft ? 'role' : 'chat' },
    '../../../packages/oak-agent-contracts/src/transport': { roleDescriptionMaxBytes: 8000 },
    // D116: the role intake reads its field meanings from the shared map.
    '@/lib/oakMeaningIcons': { oakMeaningIcons: new Proxy({}, { get: (_, meaning) => String(meaning) }) },
  };
  const host = strictLoader(import.meta.url, { missing: 'empty' })('../../src/components/agent/OakConversation.tsx', requires);
  const state = { messages: [], draft: '', roleDraft: { roleDescription: description.value, intent: intent.value },
    historyRevision: 0, historyLifecycle: { phase: 'idle' }, presentation: 'human-agent' };
  const visit = (node, fn) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(child => visit(child, fn)); return; }
    fn(node); visit(node.props?.children, fn);
  };
  function render(overrides = {}) {
    Object.assign(state, overrides); cursor = 0;
    const tree = host.OakConversation({ state, geometryKey: '540:60', onContact() {} });
    visit(tree, node => {
      if (node.props?.className === 'oak-workspace__reading' && node.props.ref) node.props.ref.current = reading;
      if (node.props?.id === description.id && node.props.ref) node.props.ref.current = description;
    });
    effects.splice(0).forEach(effect => effect());
    return tree;
  }
  const settle = () => {
    let count = 0;
    while (frames.size) {
      assert.ok(++count < 10, 'visibility work must settle without polling');
      const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback());
    }
  };
  const resize = overrides => {
    geometry = { ...geometry, ...overrides };
    observers.filter(observer => observer.target).forEach(observer => observer.callback());
  };
  const landscape = () => {
    Object.assign(visible, { width: 750, height: 78, offsetTop: 156 });
    resize({ top: 13, height: 48, width: 229.234375, fieldTop: 353, intentTop: 514 });
    visible.dispatch('resize');
  };
  let mounted = true;
  const unmount = () => {
    if (!mounted) return;
    mounted = false;
    slots.forEach(slot => slot?.cleanup?.());
    globalThis.ResizeObserver = originalResizeObserver;
  };
  t.after(unmount);
  return { reading, description, intent, document, visible, view, transcript, observers, frames,
    render, settle, resize, landscape, unmount, get submissions() { return submissions; },
    fieldNodes(tree) { const found = []; visit(tree, node => { if (node.props?.id === description.id || node.props?.id === intent.id) found.push(node); }); return found; },
  };
}

test('retained role description stays fully visible through portrait-to-48px rotation without changing the draft or focus', t => {
  const f = conversationFixture(t);
  f.render(); f.description.focus(); f.settle();
  assert.equal(f.reading.scrollTop, 0, 'portrait field is already fully visible');
  f.landscape(); f.settle();
  assert.equal(f.reading.scrollTop, 336, 'minimum scroll exposes the full retained 44px field');
  assert.deepEqual([f.description.getBoundingClientRect().top, f.description.getBoundingClientRect().bottom], [17, 61]);
  assert.equal(f.document.activeElement, f.description);
  assert.deepEqual([f.description.value, f.description.selectionStart, f.description.selectionEnd], ['T09 retained field draft marker', 12, 22]);
  assert.deepEqual([f.reading.scrollLeft, f.view.scrollX, f.view.scrollY, f.transcript.scrollTop, f.submissions], [7, 0, 120, 91, 0]);
  assert.deepEqual(f.fieldNodes(f.render()).map(node => node.props.form), ['visibility-composer', 'visibility-composer']);
  f.unmount();
});

test('closing cancels pending visibility work and late browser observations cannot restart it', t => {
  for (const pendingFrame of [true, false]) {
    const f = conversationFixture(t);
    f.render(); f.description.focus(); f.settle();
    const retainedObserver = f.observers[0];
    f.landscape();
    assert.equal(f.frames.size, 1, 'coalesced layout and viewport events');
    if (!pendingFrame) f.settle();
    const scrollBeforeClose = f.reading.scrollTop;
    f.render({ presentation: 'human-browse' });
    assert.equal(f.frames.size, 0);
    assert.equal(retainedObserver.target, null);
    assert.deepEqual([f.reading.listenerCount, f.view.listenerCount, f.visible.listenerCount], [0, 0, 0]);
    retainedObserver.callback();
    assert.equal(f.frames.size, 0, 'late delivery after disconnect is inert');
    assert.equal(f.reading.scrollTop, scrollBeforeClose);
    f.unmount();
  }
});

test('focus navigation reveals intent and description using only the minimum reading scroll', t => {
  const f = conversationFixture(t);
  f.render(); f.description.focus(); f.settle(); f.landscape(); f.settle();
  f.intent.focus(); f.settle();
  assert.equal(f.reading.scrollTop, 497);
  assert.deepEqual([f.intent.getBoundingClientRect().top, f.intent.getBoundingClientRect().bottom], [17, 61]);
  f.description.focus(); f.settle();
  assert.equal(f.reading.scrollTop, 340);
  assert.deepEqual([f.description.getBoundingClientRect().top, f.description.getBoundingClientRect().bottom], [13, 57]);
  assert.equal(f.document.activeElement, f.description);
  assert.deepEqual([f.intent.value, f.intent.selectionStart, f.intent.selectionEnd], ['T09 retained field draft marker', 12, 22]);
  assert.deepEqual([f.view.scrollY, f.transcript.scrollTop, f.submissions], [120, 91, 0]);
  f.unmount();
});

test('manual reading scroll survives unchanged geometry and an offset-only viewport change can reveal the focused field', t => {
  const f = conversationFixture(t);
  f.render(); f.description.focus(); f.settle(); f.landscape(); f.settle();
  f.reading.scrollTop = 0;
  f.reading.dispatch('scroll'); f.visible.dispatch('resize'); f.view.dispatch('orientationchange'); f.settle();
  assert.equal(f.reading.scrollTop, 0, 'unchanged geometry must not counteract reading');
  f.visible.offsetTop = 157; f.visible.dispatch('scroll'); f.settle();
  assert.equal(f.reading.scrollTop, 336, 'offset changes are distinct from the transcript width/height key');
  f.visible.dispatch('scroll'); f.settle();
  assert.equal(f.reading.scrollTop, 336, 'already visible field stays put');
  f.unmount();
});

test('geometry observation alone handles reading-size changes without a viewport event', t => {
  const f = conversationFixture(t);
  f.render(); f.description.focus(); f.settle();
  f.resize({ top: 13, height: 48, width: 229.234375, fieldTop: 353 }); f.settle();
  assert.equal(f.reading.scrollTop, 336);
  f.unmount();
});

test('unfocused, detached, non-field and outside controls cannot scroll the reading pane', t => {
  for (const focus of ['none', 'detached-field', 'outside', 'non-field', 'detached-pane']) {
    const f = conversationFixture(t);
    f.render(); f.settle();
    if (focus === 'detached-field') { f.description.focus(); f.description.isConnected = false; }
    else if (focus === 'detached-pane') { f.description.focus(); f.reading.isConnected = false; }
    else if (focus === 'outside') f.document.activeElement = { isConnected: true };
    else if (focus === 'non-field') { f.description.focus(); f.description.matches = () => false; }
    f.landscape(); f.settle();
    assert.equal(f.reading.scrollTop, 0, focus);
    f.unmount();
  }
});

test('leaving the workflow and unmounting release all visibility observation', t => {
  for (const leave of ['workflow', 'unmount']) {
    const f = conversationFixture(t);
    f.render(); f.description.focus(); f.settle();
    const observer = f.observers[0];
    f.landscape();
    if (leave === 'workflow') f.render({ roleDraft: null });
    else f.unmount();
    assert.equal(f.frames.size, 0);
    assert.equal(observer.target, null);
    assert.deepEqual([f.reading.listenerCount, f.view.listenerCount, f.visible.listenerCount], [0, 0, 0]);
    f.visible.dispatch('resize'); observer.callback(); f.settle();
    assert.equal(f.reading.scrollTop, 0);
    f.unmount();
  }
});
