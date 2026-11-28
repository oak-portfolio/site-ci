import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strictLoader } from './design-rework/load-tsx.mjs';

// Exercise the real hook's render sizing with retained state. Native keyboard
// visibility and operability remain separate Simulator acceptance evidence.
const compile = strictLoader(import.meta.url);
const geometry = compile('../../src/lib/oakWorkspaceSize.ts', {});
const viewport = overrides => ({ width: 750, height: 402, left: 0, top: 0, layoutWidth: 750,
  safeTop: 0, safeRight: 0, safeBottom: 20, safeLeft: 0, ...overrides });
function render(visible) {
  // The hook keeps one piece of state: the measured viewport.
  const hook = compile('../../src/components/agent/useOakWorkspaceSize.ts', {
    react: { useState: () => [visible, () => { throw new Error('Render must not overwrite retained state'); }], useLayoutEffect() {} },
    '@/lib/oakWorkspaceSize': geometry,
  });
  return hook.useOakWorkspaceSize(true, { current: null });
}

test('short wide keyboard view renders a single control strip', () => {
  const shortened = render(viewport({ height: 110, top: 292, safeBottom: 0 }));
  assert.equal(shortened.inlineControls, true);
  assert.equal(shortened.fullScreen, false);
  assert.deepEqual(shortened.size, { width: 734, height: 60 });
  assert.equal(shortened.bounds.top, 300);
  const restored = render(viewport({ width: 1024, height: 800, layoutWidth: 1024 }));
  assert.equal(restored.inlineControls, false);
  assert.deepEqual(restored.size, { width: 1024, height: 800 });
});

test('narrow portrait and ordinary landscape fill the visible screen edge to edge', () => {
  const portrait = render(viewport({ width: 402, height: 110, layoutWidth: 402, safeBottom: 0 }));
  assert.equal(portrait.inlineControls, false);
  assert.deepEqual(portrait.size, { width: 402, height: 110 });
  const landscape = render(viewport({ height: 402 }));
  assert.equal(landscape.inlineControls, false);
  assert.deepEqual(landscape.size, { width: 750, height: 402 });
});

test('the window is always full screen at desktop size', () => {
  const size = render(viewport({ width: 1280, height: 800, layoutWidth: 1280, safeBottom: 0 }));
  assert.equal(size.fullScreen, true);
  assert.deepEqual(size.frame, { top: 0, left: 'auto', right: 0 });
  assert.deepEqual([size.size.width, size.size.height], [1280, 800]);
  assert.equal(size.geometryKey, '1280:800');
});
