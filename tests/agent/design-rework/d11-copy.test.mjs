import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./load-tsx.mjs";

globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {} };
const root = path.resolve(import.meta.dirname, "../../..");
const read = file => readFileSync(path.join(root, file), "utf8");
const vendor = /\b(Deepgram|LlamaCloud|LlamaParse|OpenRouter|Gemini|Google|Clerk|Resend|Exa|Cloudflare|LangSmith|Vectorize)\b/;

test("D11-G2 every status element in the agent panels names no vendor", () => {
  const dir = "src/components/agent";
  let scanned = 0;
  for (const name of readdirSync(path.join(root, dir)).filter(file => file.endsWith(".tsx"))) {
    const source = read(`${dir}/${name}`);
    for (const match of source.matchAll(/role="status"|className="[^"]*(?:__status|-status)\b[^"]*"/g)) {
      const element = source.slice(source.lastIndexOf("<", match.index), source.indexOf("</", match.index));
      // The model-reading line is the required funding disclosure, so it keeps the vendor.
      if (element.includes("oak-model-reading")) continue;
      scanned++;
      assert.doesNotMatch(element, vendor, `${name}: ${element.slice(0, 160)}`);
    }
  }
  assert.ok(scanned >= 15, `scanned ${scanned} status elements`);
});

test("D11-G2 store status and error messages name no vendor", () => {
  let scanned = 0;
  for (const file of ["src/lib/oakWorkspace.ts", "src/lib/oakDocumentsWorkspace.ts", "src/lib/oakFundingSession.ts", "src/lib/oakVoiceCapture.ts"]) {
    for (const [, , text] of read(file).matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
      if (!/^[A-Z][^]*\s[^]*[.?]$/.test(text)) continue;
      scanned++;
      assert.doesNotMatch(text, vendor, `${file}: ${text}`);
    }
  }
  assert.ok(scanned >= 20, `scanned ${scanned} messages`);
});

test("D11-G2 voice status stays vendor-free while its footnote and every consent line still name the vendor", () => {
  const voice = loadTsx("src/lib/oakVoiceCapture.ts");
  const { OakVoiceCapture } = loadTsx("src/components/agent/OakVoiceCapture.tsx");
  const status = { schemaVersion: 1, service: "transcription", enabled: true, admission: "available", failure: "none",
    evidence: { settings: "verified", providerUsage: "verified", localReservations: "verified" },
    allowance: { unit: "micro-usd", limit: 100_000, providerObserved: 0, reserved: 0, conservativeUsed: 0, remainingBound: 100_000, periodStart: null, periodEnd: null, reset: "unknown" },
    health: { lastCheckAt: Date.now(), settingsObservedAt: Date.now(), usageObservedAt: Date.now(), lastAttemptAt: null, lastSuccessAt: null, accepted: 0, failed: 0, timedOut: 0 } };
  const configuration = () => ({ enabled: true, status, fetch: async () => { throw new Error("no network in this test"); } });
  for (const phase of ["idle", "recording", "transcribing", "failed"]) {
    const capture = voice.createVoiceCapture(configuration);
    capture.setFixture({ phase, seconds: 4 });
    const html = renderToStaticMarkup(React.createElement(OakVoiceCapture, { configuration: configuration(), controller: capture, onUseTranscript() {} }));
    const line = html.match(/role="status">([^<]*)</)?.[1];
    assert.ok(line, `${phase} renders a status line`);
    assert.doesNotMatch(line, vendor, `${phase}: ${line}`);
    // Q06 (intentional update): the disclosure is now the Dictate panel's one line, shown wherever this capture renders.
    assert.match(readFileSync(path.join(root, "src/components/agent/OakWorkflowPanels.tsx"), "utf8"), /title="Dictate a message" returns=\{available \? "Oak turns your clip into text; the audio is not kept\. Using the text never sends it\." : "[^"]*"\}/, "the panel says what happens to the audio only while voice is available (R14: no vendor names)");
    capture.dispose();
  }
  for (const [file, disclosure] of [
    ["src/components/agent/OakFundingControl.tsx", "uses your OpenRouter account"],
    ["src/components/agent/OakFundingControl.tsx", "it does not revoke the key at OpenRouter"],
    // v3 review (intentional update): research no longer asks, so it has no consent line to name Exa in.
  ]) assert.ok(read(file).includes(disclosure), `${file} keeps "${disclosure}"`);
});
