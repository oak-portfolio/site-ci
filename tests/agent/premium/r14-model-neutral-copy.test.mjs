import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// R14 (Oak, review v11 on ocr-consent): visitor copy names no model or tool vendor, since the model can change. D11 only
// scanned status elements, so "Gemini 3.8 Flash can read 1M tokens" and "Gemini turns them into text" passed it. This scans
// every JSX text run and string literal that reads as a sentence in the agent components and stores. The funding line keeps
// "OpenRouter" because the visitor pastes an OpenRouter key there; no model name rides with it.
const root = path.resolve(import.meta.dirname, "../../..");
const model = /\b(Gemini|Flash|Vertex|Claude|GPT|Llama|Mistral|AI Studio|Deepgram|Exa|LlamaParse|LlamaCloud|LangSmith|Vectorize|Voyage)\b/;
const files = [
  ...readdirSync(path.join(root, "src/components/agent")).filter(name => name.endsWith(".tsx")).map(name => `src/components/agent/${name}`),
  "src/lib/oakWorkspace.ts", "src/lib/oakDocumentsWorkspace.ts", "src/lib/oakDocumentsClient.ts", "src/lib/oakFundingSession.ts",
];

test("R14 visitor copy in the agent names no model", () => {
  const hits = [];
  let scanned = 0;
  for (const file of files) {
    const source = readFileSync(path.join(root, file), "utf8").replace(/\/\*[^]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const texts = [...source.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)].map(match => match[1]);
    for (const [, , text] of source.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) texts.push(text);
    for (const text of texts) {
      if (!/\s/.test(text) || !/[A-Za-z]{3}/.test(text)) continue;
      scanned++;
      if (model.test(text)) hits.push(`${file}: ${text.trim().slice(0, 120)}`);
    }
  }
  assert.ok(scanned > 300, `scanned ${scanned} strings`);
  assert.deepEqual(hits, []);
});
