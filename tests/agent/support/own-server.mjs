import { before } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const own = fileURLToPath(new URL("../../../src/components/ui/tooltip.tsx", import.meta.url));

/**
 * Fails the suite when `base` is a dev server from another checkout: Vite serves this tree's file through `/@fs`
 * only when it is that tree's server (ticket 136's red was a pre-120 server from another worktree on 4321).
 * Nothing listening is left to the suite's own connection error, so data-only importers of a shared module still run.
 */
export function ownServer(base) {
  before(async () => {
    const response = await fetch(`${base}/@fs${encodeURI(own)}`).catch(() => null);
    if (response) assert.equal(response.status, 200, `${base} is not serving this checkout (${own}); start this worktree's dev server and set OAK_GALLERY_URL`);
  });
  return base;
}
