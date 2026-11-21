import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { auditAgentIsland } from "../../scripts/quality/performance-budget.mjs";

const dist = path.resolve(import.meta.dirname, "../../dist");

// Ticket 167: switched-off blocks load only when their constant is on, so none of them rides in the eager agent chunks.
const MOVED = {
  OakContactCard: "oak-contact-card__ring",
  OakShowMeAs: "oak-show-me-as__capsule",
  // The eager OrnamentGhost in OakTurn reuses the capsule's class names, so the marker is a label only the real capsule writes.
  OakAnswerOrnament: "Open page: ",
  OwnershipView: "oak-ownership__tree",
  ProfileView: "oak-profile__about",
  QuoteCarousel: "oak-quote__controls",
  OakCommandPaletteSearch: "oak-palette-trigger__key",
};

test("switched-off blocks stay out of the eager agent chunks", { skip: !existsSync(dist) && "no dist build" }, () => {
  const report = auditAgentIsland(dist);
  assert.ok(report.eager?.length, report.findings?.join("\n"));
  const text = ({ file }) => readFileSync(path.join(dist, file), "latin1");
  const eager = report.eager.map(text).join("\n");
  const lazy = report.lazy.map(text).join("\n");
  for (const [name, marker] of Object.entries(MOVED)) {
    assert.ok(!eager.includes(marker), `${name} (${marker}) is in the eager agent chunks`);
    assert.ok(lazy.includes(marker), `${name} (${marker}) is in no lazy chunk`);
  }
});
