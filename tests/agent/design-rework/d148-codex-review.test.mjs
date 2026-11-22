import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx } from "./load-tsx.mjs";

// D148: Codex review on PR #119 (d87b5971). The answer's quote block used the broad attribution parser, so a claim in the
// model's own words that ended in a quote lost its lead-in.
test("D148-G1 only the resolver's exact quote form becomes a quote block", () => {
  const { resolverQuote } = loadTsx("src/lib/oakQuote.ts");
  assert.equal(resolverQuote("Steve wrote the UI and noted: \u201cthe team shipped it\u201d"), null, "a claim in its own words keeps every word");
  assert.equal(resolverQuote("Steve shipped it. He wrote: \u201cthe team shipped it\u201d"), null, "a sentence before the quote stays");
  assert.equal(resolverQuote("Steve Oak wrote: \u201cI design and build useful AI products.\u201d"), "I design and build useful AI products.");
  assert.equal(resolverQuote("Steve Oak and Frank Baah wrote: \u201cScanner | Shipped | Mobile shell\u201d"), "Scanner \u00b7 Shipped \u00b7 Mobile shell");
});
