import { readFileSync } from "node:fs";
import { join } from "node:path";

export const path = "/__owner/local/assets";
export const query = {};

/** The asset record `scripts/assets/build-asset-record.mjs` writes; read fresh so a rebuild shows without a restart. */
export function create({ root }: { root: string }) {
  return async () => JSON.parse(readFileSync(join(root, "src/data/assetRecord.generated.json"), "utf8"));
}
