import test from "node:test";
import assert from "node:assert/strict";
import { classifyPageErrors } from "../../scripts/quality/browser-proof.mjs";

const knownYouTubeError = {
  name: "TypeError",
  message: "this.api.isExternalMethodAvailable is not a function",
  stack: "TypeError: this.api.isExternalMethodAvailable is not a function\n    at https://www.youtube-nocookie.com/s/_/ytembeds/iframe.js",
};

test("classifies the exact YouTube embed TypeError as known third-party", () => {
  const result = classifyPageErrors([knownYouTubeError]);
  assert.deepEqual(result.knownThirdPartyErrors, [knownYouTubeError]);
  assert.deepEqual(result.firstPartyErrors, []);
});

test("keeps same-message errors without a YouTube stack in first-party errors", () => {
  for (const stack of [null, "at https://steveoak.com/assets/app.js", "at https://youtube.com/embed.js"]) {
    const detail = { ...knownYouTubeError, stack };
    const result = classifyPageErrors([detail]);
    assert.deepEqual(result.knownThirdPartyErrors, []);
    assert.deepEqual(result.firstPartyErrors, [detail]);
  }
});

test("keeps different messages from YouTube in first-party errors", () => {
  const detail = { ...knownYouTubeError, message: "Unexpected token", stack: "at https://www.youtube-nocookie.com/embed.js" };
  const result = classifyPageErrors([detail]);
  assert.deepEqual(result.knownThirdPartyErrors, []);
  assert.deepEqual(result.firstPartyErrors, [detail]);
});
