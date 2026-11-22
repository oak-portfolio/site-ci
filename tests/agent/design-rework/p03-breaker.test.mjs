import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadTsx } from "./load-tsx.mjs";

const { chatRejection } = loadTsx("src/lib/oakWorkspaceTransport.ts");

test("P03-G7 the edge spend breaker's HTML 403 reads as the paused sponsor budget, never as an ended session", async () => {
  const blocked = new Response("<html><body>Sorry, you have been blocked</body></html>", { status: 403, headers: { "content-type": "text/html" } });
  assert.equal(await chatRejection(blocked, "sponsored"), "sponsor-budget-paused");
  // The Worker's own 403s are JSON and keep their meaning.
  const identity = new Response(JSON.stringify({ error: "invalid-identity" }), { status: 403, headers: { "content-type": "application/json" } });
  assert.equal(await chatRejection(identity, "sponsored"), "sign-in-required");
  for (const error of ["sign-in-required", "conversation-owner"]) assert.equal(await chatRejection(new Response(JSON.stringify({ error }), { status: 403, headers: { "content-type": "application/json" } }), "sponsored"), "sign-in-required");
  // The auth status read only treats a JSON 401/403 as a lost session.
  const account = readFileSync("src/lib/oakAccountClient.ts", "utf8");
  assert.ok(account.includes('response.status === 401 || (json && response.status === 403) ? "sign-in-required" : "unavailable"'));
});

test("P03-G7 saved history and the owner page read the breaker's HTML 403 as unavailable, not as signed out or not the owner", () => {
  const saved = readFileSync("src/lib/oakSavedHistoryClient.ts", "utf8"), owner = readFileSync("src/lib/oakOwnerServicesClient.ts", "utf8");
  assert.ok(saved.includes('response.status === 401 || (json && response.status === 403) ? "sign-in-required"'));
  assert.ok(owner.includes("response.status === 403 && json ? 'owner-required' : 'unavailable'"));
});
