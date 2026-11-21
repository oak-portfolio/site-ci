import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// Ticket 101: the Worker copies OpenUI's error codes by hand, and drops any code not on its list. This keeps the two in step.
const repo = path.resolve(import.meta.dirname, "../../..");
const { openuiFallbackCodes } = loadTsx("packages/oak-agent-contracts/src/telemetry.ts");

function openUIErrorCodes() {
  const dir = path.join(repo, "node_modules/@openuidev/lang-core");
  const types = path.join(dir, JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")).types);
  const program = ts.createProgram([types], { noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker();
  let found;
  ts.forEachChild(program.getSourceFile(types), node => { if (ts.isTypeAliasDeclaration(node) && node.name.text === "OpenUIErrorCode") found = node; });
  assert.ok(found, "the installed @openuidev/lang-core declares OpenUIErrorCode");
  const type = checker.getTypeFromTypeNode(found.type);
  return (type.isUnion() ? type.types : [type]).map(member => member.value);
}

test("101 the Worker's openuiFallbackCodes match OpenUI's OpenUIErrorCode both ways", () => {
  const openui = new Set(openUIErrorCodes()), worker = new Set(openuiFallbackCodes);
  assert.ok(openui.size > 0 && [...openui].every(code => typeof code === "string"), "OpenUIErrorCode reads as string literals");
  assert.deepEqual([...openui].filter(code => !worker.has(code)), [], "OpenUI codes missing from openuiFallbackCodes in packages/oak-agent-contracts/src/telemetry.ts");
  assert.deepEqual([...worker].filter(code => !openui.has(code)), [], "openuiFallbackCodes holds codes OpenUI does not have");
});
