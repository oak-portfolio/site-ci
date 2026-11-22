import { spawnSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export function mobbinRoots(repoRoot) {
  const common = spawnSync("git", ["-C", repoRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" });
  const mainRoot = common.status === 0 ? path.dirname(common.stdout.trim()) : repoRoot;
  return [...new Set([repoRoot, mainRoot, homedir()].map(base => path.join(base, ".premium-ui/cache/mobbin")))]
    .filter(existsSync).map(dir => realpathSync(dir));
}
