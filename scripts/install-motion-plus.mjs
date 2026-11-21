import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const declaration = manifest.dependencies["@motionplus/core"];
const packagePath = path.join(root, "node_modules/@motionplus/core/package.json");

try {
  const installed = JSON.parse(readFileSync(packagePath, "utf8"));
  const expected = installed.version;
  const reactEntry = path.join(root, "node_modules/@motionplus/core/dist/es/react-entry.mjs");

  if (declaration !== expected || installed.name !== "@motionplus/core" || !existsSync(reactEntry)) {
    throw new Error("Motion Plus installation does not match its exact dependency pin.");
  }
} catch {
  console.error("Motion Plus is missing or does not match package.json. Run npm ci with the private registry credentials before building.");
  process.exit(1);
}
