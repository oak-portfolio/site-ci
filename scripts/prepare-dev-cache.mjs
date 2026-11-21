import { rm } from "node:fs/promises";
import { join } from "node:path";

const viteDepsCache = join(process.cwd(), "node_modules", ".vite", "deps");

try {
  await rm(viteDepsCache, { force: true, recursive: true });
  console.log("[dev] Cleared Vite optimized dependency cache.");
} catch (error) {
  console.warn(`[dev] Could not clear Vite optimized dependency cache: ${error.message}`);
}
