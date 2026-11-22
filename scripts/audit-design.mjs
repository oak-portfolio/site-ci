import { spawnSync } from "node:child_process";

// Fixtures exercise the same real ESLint and Stylelint configuration as npm run lint.
const result = spawnSync(process.execPath, ["--test", "tests/design-policy/contracts.test.mjs"], { stdio: "inherit" });
if (result.error) {
  console.error(`Design fixture setup failed: ${result.error.message}`);
  process.exitCode = 2;
} else process.exitCode = result.status ?? 2;
