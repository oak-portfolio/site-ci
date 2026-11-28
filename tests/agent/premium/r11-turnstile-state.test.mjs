import { test } from "node:test";
import assert from "node:assert/strict";
import { strictLoader } from "../design-rework/load-tsx.mjs";

// R11 review: verification mode must never leave a guest with a disabled Send and nothing to press. The widget renders
// interaction-only, so Cloudflare's own errors are invisible; each failure path has to surface Retry.
const load = () => {
  let options = null;
  const turnstile = { render: (_node, given) => { options = given; return "w1"; }, reset() {}, remove() {} };
  globalThis.window = { turnstile };
  const exports = strictLoader(import.meta.url, { missing: "empty" })("src/lib/oakTurnstile.ts");
  return { lib: exports, fire: (name, ...args) => options[name](...args) };
};

test("R11 a widget error, timeout or unsupported browser shows Retry, and Retry remounts the widget", async () => {
  for (const failure of ["error-callback", "timeout-callback", "unsupported-callback"]) {
    const { lib, fire } = load();
    await lib.mountOakTurnstile({}, "site-key");
    fire("before-interactive-callback");
    assert.equal(lib.getOakTurnstileState().challenge, "interactive", "the view opens when the visitor is needed");
    fire(failure);
    const failed = lib.getOakTurnstileState();
    assert.equal(failed.failed, true, `${failure} surfaces the failure`);
    assert.equal(failed.challenge, "idle", `${failure} closes the view so the Retry note shows`);
    lib.retryOakTurnstile();
    const retried = lib.getOakTurnstileState();
    assert.equal(retried.failed, false);
    assert.equal(retried.attempt, failed.attempt + 1, "Retry remounts the widget");
  }
});

test("R11 the view stays open after the click until the token arrives", async () => {
  const { lib, fire } = load();
  await lib.mountOakTurnstile({}, "site-key");
  fire("before-interactive-callback");
  assert.equal(lib.getOakTurnstileState().challenge, "interactive");
  fire("callback", "token-1");
  assert.deepEqual([lib.getOakTurnstileState().challenge, lib.getOakTurnstileState().token], ["idle", "token-1"]);
});

test("R11 signing out starts a fresh guest with no pass carried over", async () => {
  const { lib, fire } = load();
  await lib.mountOakTurnstile({}, "site-key");
  fire("callback", "token-1");
  lib.markOakTurnstilePassed();
  assert.equal(lib.getOakTurnstileState().passed, true);
  lib.resetOakTurnstileState();
  const fresh = lib.getOakTurnstileState();
  assert.deepEqual([fresh.passed, fresh.token, fresh.refused, fresh.failed, fresh.challenge], [false, null, false, false, "idle"]);
});
