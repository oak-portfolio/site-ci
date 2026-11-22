import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  reducedMotionPreferenceStore,
  useReducedMotionPreference,
} from "../../src/lib/useReducedMotionPreference.ts";

test("the hook uses a stable reduced-motion snapshot during server rendering", () => {
  const priorWindow = globalThis.window;
  delete globalThis.window;
  try {
    function Preference() {
      return React.createElement("span", null, String(useReducedMotionPreference()));
    }
    assert.equal(renderToString(React.createElement(Preference)), "<span>false</span>");
    assert.equal(reducedMotionPreferenceStore.getServerSnapshot(), false);
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});

test("subscribers see both preference directions and detach cleanly", () => {
  let matches = false;
  const listeners = new Set();
  const query = {
    get matches() {
      return matches;
    },
    addEventListener(type, listener) {
      assert.equal(type, "change");
      listeners.add(listener);
    },
    removeEventListener(type, listener) {
      assert.equal(type, "change");
      listeners.delete(listener);
    },
  };
  const priorWindow = globalThis.window;
  globalThis.window = { matchMedia: (media) => {
    assert.equal(media, "(prefers-reduced-motion: reduce)");
    return query;
  } };

  try {
    let firstNotifications = 0;
    let secondNotifications = 0;
    const unsubscribeFirst = reducedMotionPreferenceStore.subscribe(() => firstNotifications++);
    const unsubscribeSecond = reducedMotionPreferenceStore.subscribe(() => secondNotifications++);

    assert.equal(reducedMotionPreferenceStore.getSnapshot(), false);
    assert.equal(listeners.size, 2);

    matches = true;
    for (const listener of listeners) listener();
    assert.equal(reducedMotionPreferenceStore.getSnapshot(), true);
    assert.equal(firstNotifications, 1);
    assert.equal(secondNotifications, 1);

    matches = false;
    for (const listener of listeners) listener();
    assert.equal(reducedMotionPreferenceStore.getSnapshot(), false);
    assert.equal(firstNotifications, 2);
    assert.equal(secondNotifications, 2);

    unsubscribeFirst();
    matches = true;
    for (const listener of listeners) listener();
    assert.equal(firstNotifications, 2);
    assert.equal(secondNotifications, 3);
    assert.equal(listeners.size, 1);

    unsubscribeSecond();
    assert.equal(listeners.size, 0);
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});
