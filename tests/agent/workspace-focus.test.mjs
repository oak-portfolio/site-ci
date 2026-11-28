import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strictLoader } from './design-rework/load-tsx.mjs';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

// Exercise the production recovery policy with controlled focus targets.
// This is not mounted DOM, Astro navigation, Base UI, or native focus proof.
let presentation = 'human-agent';
let documentPending = false, voicePhase = 'idle';
const operationCalls = [], controlProps = [];
const documentOwner = { subscribe() {}, snapshot: () => ({ pending: documentPending }), cancel: () => operationCalls.push('documents') };
const voiceOwner = { subscribe() {}, getSnapshot: () => ({ phase: voicePhase }), stop: () => operationCalls.push('voice-stop'), cancel: () => operationCalls.push('voice-cancel') };
const requires = {
  react: { useSyncExternalStore: (_subscribe, read) => read() }, 'react/jsx-runtime': jsx, '@/components/ui/dialog': {},
  '@/components/ui/button': { Button: props => { controlProps.push(props); return React.createElement('button', { type: props.type }, props.children); } }, '@/components/ui/Icon': { Icon: () => null },
  '@/lib/oakViewportSupport': {},
  '@/lib/oakWorkspace': { getOakWorkspace: () => ({ presentation }), getOakVoiceController: () => voiceOwner, stopOakTurn: () => operationCalls.push('model') },
  '@/lib/oakDocumentsWorkspace': { getOakDocumentsController: () => documentOwner },
  './OakContactMenu': {}, './OakConversation': {}, './OakActivitySprite': {},
  // R11 (intentional update): the header gains the account menu.
  './OakAccountMenu': {},
  './useOakWorkspaceSize': {},
  '@/lib/useOakCornerViewport': {},
  '@/components/ui/kbd': {}, '@/components/ui/toast': { ToastProvider: props => props.children, ToastViewport: () => null, createToastManager: () => ({ add() {} }) },
  '@/components/ui/tooltip': {}, '@/lib/oakToasts': { onOakToast: () => () => {} },
  '@/lib/oakFunnelClient': { getOakFunnel: () => ({ open() {}, contact() {}, observe() {} }) },
  '@/lib/oakFlags/commandPalette': { OakCommandPaletteSearch: () => null },
};
const exports = strictLoader(import.meta.url)('../../src/components/agent/OakWorkspace.tsx', requires);

function fixture() {
  presentation = 'human-agent';
  const calls = [];
  const document = { activeElement: { isConnected: true }, defaultView: { getComputedStyle: target => ({ visibility: target.visibility ?? 'visible' }) } };
  const target = (name, overrides = {}) => ({
    name, isConnected: true, inside: true,
    closest() { return this.blockedAncestor ? {} : null; },
    matches() { return Boolean(this.disabled); },
    getClientRects() { return this.noLayout ? [] : [{}]; },
    focus(options) { calls.push({ name: this.name, options }); if (!this.refusesFocus) document.activeElement = this; },
    ...overrides,
  });
  const popup = target('popup', { ownerDocument: document, contains: element => element === popup || Boolean(element?.inside) });
  const preferred = target('retained-control');
  const fallback = target('Close');
  return { document, calls, popup, preferred, fallback, target,
    recover: () => exports.restoreOakWorkspaceFocus(popup, preferred, fallback) };
}

test('current connected in-popup focus remains untouched, including a newly chosen control', () => {
  const f = fixture();
  f.document.activeElement = f.target('newly-focused-control');
  assert.equal(f.recover(), true);
  assert.deepEqual(f.calls, []);
  assert.equal(f.document.activeElement.name, 'newly-focused-control');
});

test('lost focus returns to the retained control without scrolling, and repeated recovery is inert', () => {
  const f = fixture();
  assert.equal(f.recover(), true);
  assert.equal(f.document.activeElement, f.preferred);
  assert.deepEqual(f.calls, [{ name: 'retained-control', options: { preventScroll: true } }]);
  assert.equal(f.recover(), true);
  assert.equal(f.calls.length, 1);
});

test('closed, detached, hidden or inert workspace cannot steal focus', () => {
  for (const mode of ['human-browse']) {
    const f = fixture(); presentation = mode;
    assert.equal(f.recover(), false);
    assert.deepEqual(f.calls, []);
  }
  for (const override of [{ isConnected: false }, { hidden: true }, { inert: true }]) {
    const f = fixture(); Object.assign(f.popup, override);
    assert.equal(f.recover(), false);
    assert.deepEqual(f.calls, []);
  }
});

test('unavailable or outside retained controls fall back to Close without scrolling', () => {
  for (const override of [{ isConnected: false }, { inside: false }, { blockedAncestor: true },
    { disabled: true }, { noLayout: true }, { visibility: 'hidden' }]) {
    const f = fixture(); Object.assign(f.preferred, override);
    assert.equal(f.recover(), true);
    assert.equal(f.document.activeElement, f.fallback);
    assert.deepEqual(f.calls, [{ name: 'Close', options: { preventScroll: true } }]);
  }
});

test('a failed retained focus attempt falls back to Close, and missing controls use the popup', () => {
  const f = fixture(); f.preferred.refusesFocus = true;
  assert.equal(f.recover(), true);
  assert.equal(f.document.activeElement, f.fallback);
  assert.deepEqual(f.calls.map(call => call.name), ['retained-control', 'Close']);
  const empty = fixture();
  assert.equal(exports.restoreOakWorkspaceFocus(empty.popup, null, null), true);
  assert.equal(empty.document.activeElement, empty.popup);
});


test('undersized fallback exposes the normal distinct active-owner Stop and Cancel actions', () => {
  for (const phase of ['permission', 'recording', 'stopping', 'transcribing', 'clip-ready', 'review']) {
    documentPending = true; voicePhase = phase; operationCalls.length = 0; controlProps.length = 0;
    const html = renderToStaticMarkup(React.createElement(exports.OakViewportWorkControls, { modelPending: true }));
    assert.match(html, /Stop preparation/); assert.match(html, />Stop</);
    assert.equal(html.includes('Stop recording'), phase === 'recording');
    assert.equal(html.includes('Cancel voice input'), phase !== 'review');
    for (const props of controlProps) props.onClick();
    assert(operationCalls.includes('documents')); assert(operationCalls.includes('model'));
    assert.equal(operationCalls.includes('voice-stop'), phase === 'recording');
    assert.equal(operationCalls.includes('voice-cancel'), phase !== 'review');
  }
  documentPending = false; voicePhase = 'idle'; controlProps.length = 0;
  renderToStaticMarkup(React.createElement(exports.OakViewportWorkControls, { modelPending: false }));
  assert.equal(controlProps.length, 0);
});
