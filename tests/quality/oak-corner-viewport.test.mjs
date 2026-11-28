import assert from "node:assert/strict";
import { test } from "node:test";
import { oakLauncherGeometry } from "../../src/lib/useOakCornerViewport.ts";

const desktop = { layoutWidth: 1280, layoutHeight: 720, width: 1280, height: 720, left: 0, top: 0, safeLeft: 0, safeRight: 0 };

test("normal desktop and mobile center the full-label launcher within available width", () => {
  assert.deepEqual(oakLauncherGeometry(desktop), { center: 640, bottom: 0, maxWidth: 220, compact: false });
  assert.deepEqual(oakLauncherGeometry({ ...desktop, layoutWidth: 320, width: 320 }), { center: 160, bottom: 0, maxWidth: 220, compact: true });
});

test("zoom and panning keep launcher edges within the visible safe region", () => {
  for (const viewport of [
    { ...desktop, width: 640, height: 360 },
    { ...desktop, width: 320, height: 360, left: 120, top: 90 },
    { ...desktop, width: 180, height: 360, left: 80, safeLeft: 20, safeRight: 44 },
  ]) {
    const geometry = oakLauncherGeometry(viewport);
    assert.equal(geometry.center, viewport.left + viewport.width / 2);
    assert(geometry.center - geometry.maxWidth / 2 >= viewport.left + Math.max(16, viewport.safeLeft));
    assert(geometry.center + geometry.maxWidth / 2 <= viewport.left + viewport.width - Math.max(16, viewport.safeRight));
    assert.equal(viewport.layoutHeight - geometry.bottom, viewport.top + viewport.height);
  }
});

test("an oversized reported visible width clamps to the actual remaining layout area", () => {
  const geometry = oakLauncherGeometry({ ...desktop, layoutWidth: 316, width: 320, left: 16 });
  assert.equal(geometry.center, 166);
  assert(geometry.center + geometry.maxWidth / 2 <= 300);
});
