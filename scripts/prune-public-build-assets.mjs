import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const distRoot = path.join(process.cwd(), "dist");
const pruned = [];

async function removePath(relativePath) {
  const target = path.join(distRoot, relativePath);
  await rm(target, { recursive: true, force: true });
  pruned.push(relativePath);
}

// Dev-only design drafts (served at /__dev/* locally) never ship to production.
await removePath("assets/dev");

const mascotDir = path.join(distRoot, "assets/mascot");

try {
  const mascotFiles = await readdir(mascotDir);
  await Promise.all(
    mascotFiles
      .filter((file) => file.includes("contact-sheet") || file.endsWith("validation.json"))
      .map(async (file) => {
        await rm(path.join(mascotDir, file), { force: true });
        pruned.push(`assets/mascot/${file}`);
      }),
  );
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

if (pruned.length) {
  console.log(`Pruned ${pruned.length} non-runtime public build artifact${pruned.length === 1 ? "" : "s"}.`);
}
