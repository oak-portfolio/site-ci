import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as React from 'react';
import * as jsx from 'react/jsx-runtime';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
// Controlled geometry executes installed provider/host code, not browser CSS layout.
const observations = [];
const layouts = [], frames = [];
const hooks = { ...React, useRef: value => ({ current: value }), useCallback: fn => fn,
  useMemo: fn => fn(), useLayoutEffect: fn => layouts.push(fn), useEffect: () => {} };
const compiled = ts.transpile(readFileSync(require.resolve('@shadcn/react/message-scroller'), 'utf8'), {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
});
const library = {};
new Function('require', 'exports', compiled)(name => name === 'react' ? hooks :
  name === 'react/jsx-runtime' ? jsx : {}, library);
let scroll = 0, height = 428, context;
class Box {
  attributes = new Map(); style = {}; hidden = false; isConnected = true;
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  toggleAttribute(name, value) { if (value) this.setAttribute(name, ''); else this.removeAttribute(name); }
}
globalThis.HTMLElement = Box;
globalThis.window = { getComputedStyle: node => node === content ? {
  paddingBlockStart: '16px', paddingBlockEnd: '24px', paddingTop: '16px', paddingBottom: '24px', rowGap: '24px',
} : {}, requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
  cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {} };
const spacer = new Box(); spacer.hidden = true;
const items = [132, 260].map((size, index) => {
  const box = new Box(); box.dataset = { messageId: `message-${index}`, scrollAnchor: 'false' };
  box.size = size;
  box.getBoundingClientRect = () => {
    const top = 61 + 16 + (index ? items[0].size + 24 : 0) - scroll;
    return { top, bottom: top + box.size, height: box.size };
  };
  return box;
});
const naturalHeight = () => 16 + items.reduce((sum, item) => sum + item.size, 0) + 24 + 24;
const contentHeight = () => Math.max(height, naturalHeight() + (spacer.hidden ? 0 : Number.parseFloat(spacer.style.height) || 0));
const content = new Box(); content.children = [...items, spacer]; spacer.parentElement = content;
content.contains = element => content.children.includes(element);
content.getBoundingClientRect = () => ({ top: 61 - scroll, bottom: 61 - scroll + contentHeight(), height: contentHeight() });
const viewport = new Box();
Object.defineProperties(viewport, {
  clientHeight: { get: () => height }, scrollHeight: { get: contentHeight },
  scrollTop: { get: () => scroll, set: value => { scroll = Math.max(0, Math.min(contentHeight() - height, value)); } },
});
viewport.getBoundingClientRect = () => ({ top: 61, bottom: 61 + height, height });
viewport.scrollTo = ({ top }) => { viewport.scrollTop = top; };
const tree = library.MessageScroller.Provider({ autoScroll: true, defaultScrollPosition: 'end' });
context = tree.props.value;
context.setRootElement(new Box()); context.setViewportElement(viewport);
context.setContentElement(content); context.setSpacerElement(spacer);
items.forEach(item => tree.props.children.props.value(item.dataset.messageId, item, null));
layouts.forEach(fn => fn()); context.handleContentChange();
const settle = () => { let count = 0; while (frames.length) { if (++count > 100) throw new Error('Runaway frame loop'); frames.shift()(); } };
settle();
const record = phase => ({ phase, contentHeight: contentHeight(), viewportHeight: height,
  scrollTop: scroll, spacerHidden: spacer.hidden, spacerStyle: { ...spacer.style } });
observations.push(record('desktop-follow'));
height = 96;
for (let i = 0; i < 20; i++) { context.handleResize(); settle(); }
observations.push(record('short-follow-20-resizes'));
context.scrollToStart({ behavior: 'instant' }); settle();
context.scrollToMessage('message-0', { align: 'start', scrollMargin: 0, behavior: 'instant' }); settle();
for (let i = 0; i < 20; i++) { context.handleResize(); settle(); }
observations.push(record('short-restored-20-resizes'));
// A real explicit jump can create virtual padding. It should be bounded and clear on End.
height = 428;
context.scrollToMessage('message-1', { align: 'start', scrollMargin: 0, behavior: 'instant' }); settle();
observations.push(record('explicit-last-message-jump'));
height = 96; context.handleResize(); settle();
context.scrollToEnd({ behavior: 'instant' }); settle();
observations.push(record('short-end-after-jump'));

// Evaluate the actual host callbacks against the same installed-provider context.
const host = {};
const hostSource = readFileSync('src/components/agent/OakTranscript.tsx', 'utf8');
const hostCompiled = ts.transpile(hostSource, { module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX });
new Function('require', 'exports', hostCompiled + '\nexports.captureTranscript=captureTranscript; exports.RestoreTranscript=RestoreTranscript;')(name =>
  name === 'react' ? hooks : name === 'react/jsx-runtime' ? jsx :
  name === '@shadcn/react/message-scroller' ? { ...library, useMessageScroller: () => context } : {}, host);
globalThis.getComputedStyle = window.getComputedStyle;
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;
viewport.querySelectorAll = () => items;
viewport.querySelector = () => content;
height = 428; context.scrollToEnd({ behavior: 'instant' }); settle();
host.captureTranscript(viewport, 'recorded-live-edge');
height = 96;
for (let i = 0; i < 20; i++) {
  layouts.length = 0;
  host.RestoreTranscript({ viewport: { current: viewport }, conversationKey: 'recorded-live-edge', geometryKey: `short-${i}`, latestId: items.at(-1).dataset.messageId });
  layouts.forEach(fn => fn()); context.handleResize(); settle();
  host.captureTranscript(viewport, 'recorded-live-edge');
}
observations.push(record('production-host-live-edge-20-restores'));
height = 428; context.scrollToStart({ behavior: 'instant' }); settle();
host.captureTranscript(viewport, 'recorded-away-from-end');
height = 96;
for (let i = 0; i < 20; i++) {
  layouts.length = 0;
  host.RestoreTranscript({ viewport: { current: viewport }, conversationKey: 'recorded-away-from-end', geometryKey: `short-${i}`, latestId: items.at(-1).dataset.messageId });
  layouts.forEach(fn => fn()); context.handleResize(); settle();
  host.captureTranscript(viewport, 'recorded-away-from-end');
}
observations.push(record('production-host-free-reading-20-restores'));


test('installed scroller resize and actual host restoration stay bounded with preserved free-reading and live-edge positions', () => {
  const phase = name => observations.find(item => item.phase === name);
  for (const name of ['short-follow-20-resizes', 'short-restored-20-resizes',
    'production-host-live-edge-20-restores', 'production-host-free-reading-20-restores']) {
    const result = phase(name);
    assert.equal(result.contentHeight, 456, name);
    assert.equal(result.viewportHeight, 96, name);
    assert.equal(result.spacerHidden, true, name);
    assert.ok(result.scrollTop >= 0 && result.scrollTop <= 360, name);
  }
  assert.equal(phase('production-host-live-edge-20-restores').scrollTop, 360);
  assert.equal(phase('production-host-free-reading-20-restores').scrollTop, 0);
});

test('real scroller jumps create bounded virtual padding and End clears it before short-height following', () => {
  const jump = observations.find(item => item.phase === 'explicit-last-message-jump');
  const end = observations.find(item => item.phase === 'short-end-after-jump');
  assert.equal(jump.spacerHidden, false);
  assert.equal(jump.spacerStyle.height, '128px');
  assert.equal(jump.contentHeight, 584);
  assert.equal(end.spacerHidden, true);
  assert.equal(end.spacerStyle.height, '0px');
  assert.equal(end.contentHeight, 456);
  assert.equal(end.scrollTop, 360);
});
