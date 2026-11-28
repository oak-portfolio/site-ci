// Run: node --test tests/quality/owner-console-middleware.test.mjs (part of npm run test:quality).
// Ticket 62: the owner console's local tabs read Steve's machine through dev-server middleware. Nothing here runs a real command.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../..");
const dir = path.join(root, "src/dev/owner-console/middleware");
const { localOnly } = await import(path.join(dir, "local.ts"));
const modules = Object.fromEntries(await Promise.all(["content", "assets", "traces", "quality", "release"].map(async (name) => [name, await import(path.join(dir, `${name}.ts`))])));

const UUID = "1e150573-20a8-4ac6-a75b-6722468adb7a";
const SECRET = "zq-owner-env-secret-value-0123456789";
process.env.OAK_TEST_SECRET_FOR_62 = SECRET;

/** A fake `spawn`: records every call and answers from `reply(cmd, args, input)`. */
function fakeSpawn(reply) {
  const calls = [];
  const spawn = (cmd, args, options) => {
    const call = { cmd, args, options, input: "" };
    calls.push(call);
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.stdin = { on: () => child.stdin, end: (text) => { call.input = text ?? ""; } };
    child.kill = () => {};
    queueMicrotask(() => {
      const out = reply(cmd, args, call.input);
      if (out !== null) child.stdout.emit("data", Buffer.from(typeof out === "string" ? out : JSON.stringify(out)));
      child.emit("close", 0);
    });
    return child;
  };
  return { spawn, calls };
}

const langsmithRuns = { next_cursor: null, items: [
  { id: UUID, name: "Oak turn", status: "SUCCESS", start_time: "2026-11-16T10:00:00Z", end_time: "2026-11-16T10:00:03Z", error: null, total_tokens: 900,
    app_path: `/o/${UUID}/projects/p/${UUID}/r/${UUID}?trace_id=${UUID}`, inputs: { message: "VISITOR SAID THIS PRIVATE THING" }, outputs: { text: "ANSWER TEXT HERE" } },
  { id: "2e150573-20a8-4ac6-a75b-6722468adb7a", name: "Oak turn", status: "ERROR", start_time: "2026-11-16T09:00:00Z", end_time: "2026-11-16T09:00:01Z",
    error: "Error: visitor asked VISITOR SAID THIS PRIVATE THING", app_path: "javascript:alert(1)" },
  { id: "3e150573-20a8-4ac6-a75b-6722468adb7a", name: "Oak turn", status: "PENDING", start_time: "2026-11-16T08:00:00Z", end_time: null, error: null },
  { id: "4e150573-20a8-4ac6-a75b-6722468adb7a", name: "Oak turn", status: "success", start_time: "2026-11-16T07:00:00Z", end_time: "2026-11-16T07:00:02Z", error: null,
    app_path: `/o/${UUID}/projects/p/${UUID}/trace/${UUID}/run/${UUID}?start_time=2026-11-16T07:00:00.000Z` },
] };

const langsmithTraces = { next_cursor: null, items: [
  { root_run: { id: UUID, trace_id: UUID }, trace_aggregates: { total_tokens: 6912 } },
  { root_run: { id: "2e150573-20a8-4ac6-a75b-6722468adb7a", trace_id: "2e150573-20a8-4ac6-a75b-6722468adb7a" }, trace_aggregates: { total_tokens: null } },
  { root_run: { id: "3e150573-20a8-4ac6-a75b-6722468adb7a", trace_id: "3e150573-20a8-4ac6-a75b-6722468adb7a" } },
  { root_run: { id: "4e150573-20a8-4ac6-a75b-6722468adb7a", trace_id: "4e150573-20a8-4ac6-a75b-6722468adb7a" }, trace_aggregates: { total_tokens: 7642 } },
] };

const replies = (cmd, args) => {
  const line = [cmd, ...args].join(" ");
  if (line.includes("lifecycle.mjs owners")) return { owners: [
    { id: "profile-home", status: "approved", channels: ["page", "answer"], path: "src/data/homePage.ts", outputs: ["/"] },
    { id: "work", status: "approved", channels: ["page", "answer", "ai-files"], path: "src/content/work", outputs: ["/work"] },
    { id: "faq", status: "held", channels: [], path: "knowledge/faq.md", outputs: [] },
  ] };
  if (line.includes("lifecycle.mjs status")) return { revision: "oak-abc", contentIdentity: "7d6b", approvedRevisions: ["oak-1"] };
  if (cmd === "langsmith") return args[1] === "/api/v2/traces/query" ? langsmithTraces : langsmithRuns;
  if (cmd === "git" && args[0] === "status") return "# branch.head main\n# branch.ab +2 -0\n1 .M N... 100644 100644 100644 a a src/x.ts\n";
  if (cmd === "git" && args[0] === "log") return "abc1234\tFirst commit\t2026-11-16T10:00:00Z\n";
  if (cmd === "git" && args[0] === "show") return "abc1234\tFirst commit\n src/x.ts | 2 +-\n";
  if (cmd === "gh") return [{ number: 7, title: "A PR", isDraft: true, headRefName: "codex/x", url: "https://github.com/a/b/pull/7" }];
  if (cmd === "npm") return `Premium round: 3 open. ${SECRET}`;
  return null;
};

function request({ url, host = "127.0.0.1:4321", remote = "127.0.0.1", site = "same-origin", method = "GET" }) {
  return { url, method, headers: { host, ...(site ? { "sec-fetch-site": site } : {}) }, socket: { remoteAddress: remote } };
}
function response() {
  const res = { status: 0, headers: {}, body: "", headersSent: false };
  res.writeHead = (status, headers) => { res.status = status; res.headers = headers ?? {}; res.headersSent = true; return res; };
  res.end = (text = "") => { res.body = String(text); res.done(); return res; };
  res.finished = new Promise((resolve) => { res.done = resolve; });
  return res;
}
async function call(name, req, spawn = fakeSpawn(replies).spawn) {
  const mod = modules[name];
  const middleware = localOnly(mod.create({ root, spawn, fetchImpl: async () => ({ ok: true, status: 200 }) }), mod.query);
  const res = response();
  let passed = false;
  await middleware(req, res, () => { passed = true; res.done(); });
  await res.finished;
  return { status: res.status, body: res.body ? JSON.parse(res.body) : null, text: res.body, passed };
}
const pathOf = (name) => `${modules[name].path}`;

test("each middleware mounts under /__owner/local/ with its own path", () => {
  for (const [name, mod] of Object.entries(modules)) assert.equal(mod.path, `/__owner/local/${name}`);
});

test("middleware refuses a non-loopback peer, a non-loopback host and a cross-site or same-site sec-fetch-site", async () => {
  for (const name of Object.keys(modules)) {
    for (const req of [
      request({ url: "/", remote: "192.168.1.20" }),
      request({ url: "/", host: "evil.example:4321" }),
      request({ url: "/", host: "192.168.1.5:4321" }),
      request({ url: "/", site: "cross-site" }),
      request({ url: "/", site: "same-site" }),
      request({ url: "/", site: null }),
    ]) {
      const { spawn, calls } = fakeSpawn(replies);
      const out = await call(name, req, spawn);
      assert.equal(out.status, 403, `${name} ${JSON.stringify(req.headers)} ${req.socket.remoteAddress}`);
      assert.equal(out.body.error, "owner-local-loopback-same-origin-only");
      assert.equal(calls.length, 0, `${name} ran a command for a refused request`);
    }
  }
});

test("middleware answers only GET; Content performs no write", async () => {
  for (const name of Object.keys(modules)) {
    const out = await call(name, request({ url: "/", method: "POST" }));
    assert.equal(out.status, 405, name);
  }
  const content = readFileSync(path.join(dir, "content.ts"), "utf8");
  assert.doesNotMatch(content, /writeFile|appendFile|rename|unlink|rmSync|mkdir|"approve"|'approve'|"preview"|'preview'/);
});

test("hostile queries are refused before any command runs (ARCH-REVIEW A30)", async () => {
  const hostile = ["?sha=;rm%20-rf%20/", "?sha=abc1234%20--output=/tmp/x", "?run=../../etc/passwd", "?run=$(whoami)", "?run=" + UUID + "&run=" + UUID,
    "?x=1", "?sha=--help", "?run=" + UUID.toUpperCase() + "'", "?sha=" + "a".repeat(41)];
  for (const name of Object.keys(modules)) {
    for (const query of hostile) {
      const { spawn, calls } = fakeSpawn(replies);
      const out = await call(name, request({ url: `/${query}` }), spawn);
      assert.equal(out.status, 400, `${name} ${query}`);
      assert.equal(out.body.error, "bad-query");
      assert.equal(calls.length, 0, `${name} ran a command for ${query}`);
    }
  }
});

test("each middleware runs a fixed argv through spawn, never a shell, with a timeout", async () => {
  const seen = [];
  for (const name of Object.keys(modules)) {
    const { spawn, calls } = fakeSpawn(replies);
    const url = name === "traces" ? `/?run=${UUID}` : name === "release" ? "/?sha=abc1234" : "/";
    const out = await call(name, request({ url }), spawn);
    assert.ok(out.status === 200 || out.status === 500, `${name} answered ${out.status}`);
    for (const c of calls) {
      assert.ok(Array.isArray(c.args), `${name} passes an argv array`);
      assert.notEqual(c.options?.shell, true, `${name} must not use a shell`);
      assert.ok(c.options?.timeout > 0 || c.options?.signal, `${name} sets a timeout`);
      assert.ok(["node", "git", "gh", "npm", "langsmith"].includes(c.cmd), `${name} ran ${c.cmd}`);
      seen.push([c.cmd, ...c.args].join(" "));
    }
  }
  assert.ok(seen.some((line) => line.endsWith("git show --stat --format=%h%x09%s abc1234^{commit} --")), seen.join("\n"));
  for (const source of Object.keys(modules).map((name) => readFileSync(path.join(dir, `${name}.ts`), "utf8")))
    assert.doesNotMatch(source, /\bexec\(|execSync|shell:\s*true/);
});

test("no response holds an environment value or a key-shaped string", async () => {
  const keyish = (cmd, args, input) => cmd === "gh" ? [{ number: 1, title: "sk-proj-AAAAAAAAAAAAAAAAAAAAAAAAAAAA", isDraft: false, headRefName: "x", url: "https://github.com/a/b/pull/1" }] : replies(cmd, args, input);
  for (const reply of [replies, keyish]) {
    for (const name of Object.keys(modules)) {
      const out = await call(name, request({ url: "/" }), fakeSpawn(reply).spawn);
      assert.ok(!out.text.includes(SECRET), `${name} leaked an environment value`);
      assert.doesNotMatch(out.text, /sk-[A-Za-z0-9_-]{16,}|lsv2_[A-Za-z0-9_]{16,}|gh[pousr]_[A-Za-z0-9]{20,}/, name);
    }
  }
  const release = await call("release", request({ url: "/" }));
  assert.equal(release.status, 500);
  assert.equal(release.body.error, "withheld");
});

test("Traces holds metadata only: no message text, no error text, and only LangSmith links", async () => {
  const list = await call("traces", request({ url: "/" }));
  assert.equal(list.status, 200);
  assert.doesNotMatch(list.text, /VISITOR SAID|ANSWER TEXT|visitor asked/);
  assert.equal(list.body.runs.length, 4);
  assert.deepEqual(Object.keys(list.body.runs[0]).sort(), ["components", "id", "latencyMs", "link", "name", "start", "status", "tokens"]);
  assert.equal(list.body.runs[0].link, `https://smith.langchain.com/o/${UUID}/projects/p/${UUID}/r/${UUID}?trace_id=${UUID}`);
  assert.equal(list.body.runs[1].link, null);
  assert.equal(list.body.runs[1].status, "error");
  const one = await call("traces", request({ url: `/?run=${UUID}` }));
  assert.equal(one.status, 200);
  assert.doesNotMatch(one.text, /VISITOR SAID|ANSWER TEXT/);
});

test("Traces asks LangSmith's v2 runs query and maps its uppercase status (ticket 319)", async () => {
  const NOW = Date.parse("2026-11-27T12:00:00.000Z");
  const SINCE = "2026-11-20T12:00:00.000Z";
  const ask = async (url, expected) => {
    const { spawn, calls } = fakeSpawn(replies);
    const middleware = localOnly(modules.traces.create({ root, spawn, now: () => NOW }), modules.traces.query);
    const res = response();
    await middleware(request({ url }), res, () => res.done());
    await res.finished;
    assert.equal(calls.length, expected);
    assert.deepEqual(calls[0].args, ["api", "/api/v2/runs/query", "--format", "json", "-X", "POST", "--input", "-"]);
    return { body: JSON.parse(res.body), sent: JSON.parse(calls[0].input) };
  };
  const list = await ask("/", 2);
  assert.deepEqual(list.sent, { project_ids: [UUID], min_start_time: SINCE, page_size: 50, is_root: true,
    selects: ["ID", "NAME", "STATUS", "START_TIME", "END_TIME", "ERROR", "APP_PATH"] });
  assert.deepEqual(list.body.runs.map((run) => run.status), ["ok", "error", "pending", "ok"], "the live v2 reply has been seen lowercase too");
  assert.deepEqual(list.body.counts, { total: 4, ok: 2, error: 1, pending: 1 });
  assert.equal(list.body.runs[3].link, `https://smith.langchain.com/o/${UUID}/projects/p/${UUID}/trace/${UUID}/run/${UUID}?start_time=2026-11-16T07:00:00.000Z`, "v2 app_path shape");
  const one = await ask(`/?run=${UUID}`, 1);
  assert.deepEqual(one.sent, { project_ids: [UUID], min_start_time: SINCE, page_size: 100, trace_id: UUID,
    selects: ["ID", "NAME", "STATUS", "START_TIME", "END_TIME", "ERROR", "RUN_TYPE"] });
  assert.deepEqual(one.body.components.map((step) => step.status), ["ok", "error", "pending", "ok"]);
});

test("Traces fills each row's tokens from one v2 traces query for the listed trace ids (ticket 322)", async () => {
  const NOW = Date.parse("2026-11-27T12:00:00.000Z");
  const ids = langsmithRuns.items.map((run) => run.id);
  const run = async (reply) => {
    const { spawn, calls } = fakeSpawn(reply);
    const middleware = localOnly(modules.traces.create({ root, spawn, now: () => NOW }), modules.traces.query);
    const res = response();
    await middleware(request({ url: "/" }), res, () => res.done());
    await res.finished;
    return { calls, res, body: JSON.parse(res.body) };
  };
  const { calls, body } = await run(replies);
  const traces = calls.filter((call) => call.cmd === "langsmith" && call.args[1] === "/api/v2/traces/query");
  assert.equal(traces.length, 1, "one traces-query call per page");
  assert.equal(calls.length, 2, "at most one extra request per page");
  assert.deepEqual(traces[0].args, ["api", "/api/v2/traces/query", "--format", "json", "-X", "POST", "--input", "-"]);
  assert.deepEqual(JSON.parse(traces[0].input), { project_id: UUID, min_start_time: "2026-11-20T12:00:00.000Z", page_size: ids.length, trace_ids: ids, selects: ["ID", "TOTAL_TOKENS"] });
  assert.deepEqual(body.runs.map((row) => row.tokens), [6912, null, null, 7642], "a null or missing aggregate stays null, which the tab shows as n/a");
  const failing = await run((cmd, args, input) => cmd === "langsmith" && args[1] === "/api/v2/traces/query" ? "not json" : replies(cmd, args, input));
  assert.equal(failing.res.status, 200, "a failed tokens read keeps the list");
  assert.deepEqual(failing.body.runs.map((row) => row.tokens), [null, null, null, null]);
  const empty = await run((cmd, args, input) => cmd === "langsmith" ? { next_cursor: null, items: [] } : replies(cmd, args, input));
  assert.equal(empty.calls.length, 1, "no traces call when the page lists no runs");
});

test("Traces returns the list with tokens blank when the tokens read stalls past its limit (ticket 322, review r1 M1)", async () => {
  const LIMIT = 3_000;
  const { spawn: answering, calls } = fakeSpawn(replies);
  const spawn = (cmd, args, options) => {
    if (cmd !== "langsmith" || args[1] !== "/api/v2/traces/query") return answering(cmd, args, options);
    calls.push({ cmd, args, options, input: "" });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdin = { on: () => child.stdin, end: () => {} };
    child.kill = () => {};
    return child;
  };
  const middleware = localOnly(modules.traces.create({ root, spawn, now: () => Date.parse("2026-11-27T12:00:00.000Z") }), modules.traces.query);
  const res = response();
  const started = Date.now();
  middleware(request({ url: "/" }), res, () => res.done());
  let timer;
  const out = await Promise.race([res.finished.then(() => "list"), new Promise((resolve) => { timer = setTimeout(resolve, LIMIT + 500, "still waiting"); })]);
  clearTimeout(timer);
  assert.equal(out, "list", "the list comes back within the tokens limit");
  assert.ok(Date.now() - started < LIMIT + 500);
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body).runs.map((row) => row.tokens), [null, null, null, null], "tokens stay blank, shown as n/a");
  const traces = calls.find((call) => call.args[1] === "/api/v2/traces/query");
  assert.ok(traces.options.timeout > 0 && traces.options.timeout <= LIMIT, "the tokens child is killed at the limit too");
});

test("Content lists Site library items with status, channels, board column and visibility chip", async () => {
  const out = await call("content", request({ url: "/" }));
  assert.equal(out.status, 200);
  const byId = Object.fromEntries(out.body.items.map((item) => [item.id, item]));
  assert.equal(byId["profile-home"].column, "live");
  assert.equal(byId["profile-home"].visibility, "Public");
  assert.equal(byId.faq.column, "review");
  assert.equal(byId.faq.visibility, "Draft");
  assert.ok(out.body.items.some((item) => item.id.startsWith("work:")), "Work case studies are items");
  assert.equal(out.body.revision, "oak-abc");
});

test("Quality says not built when there is no report, and never makes up readings", async () => {
  const out = await call("quality", request({ url: "/" }));
  assert.equal(out.status, 200);
  assert.ok(out.body.state === "not-built" || out.body.state === "ready");
  if (out.body.state === "not-built") assert.equal(out.body.report, null);
});

test("Release reads git, gh, the review server and the premium brief", async () => {
  const clean = (cmd, args, input) => cmd === "npm" ? "Premium round: 3 open." : replies(cmd, args, input);
  const out = await call("release", request({ url: "/" }), fakeSpawn(clean).spawn);
  assert.equal(out.status, 200);
  assert.equal(out.body.branch, "main");
  assert.equal(out.body.ahead, 2);
  assert.equal(out.body.changed, 1);
  assert.equal(out.body.pulls[0].number, 7);
  assert.equal(out.body.reviewServer.url, "http://127.0.0.1:4399/");
  assert.match(out.body.premium, /Premium round/);
});

test("astro.config.mjs registers every local middleware on the dev server only", () => {
  const config = readFileSync(path.join(root, "astro.config.mjs"), "utf8");
  for (const name of Object.keys(modules)) assert.match(config, new RegExp(`owner-console/middleware/${name}\\.ts`));
  assert.match(config, /configureServer/);
  assert.ok(statSync(path.join(dir, "local.ts")).isFile());
});
