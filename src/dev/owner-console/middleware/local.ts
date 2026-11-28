import { spawn as nodeSpawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

export type Spawn = typeof nodeSpawn;
export type Query = Record<string, RegExp>;
export type LocalRead = (params: Record<string, string>) => Promise<unknown>;
export type ReadOptions = { root: string; spawn?: Spawn; fetchImpl?: typeof fetch; now?: () => number };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const SHA = /^[0-9a-f]{7,40}$/;

const LOOPBACK_PEERS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const KEY_SHAPED = /sk-[A-Za-z0-9_-]{16,}|lsv2_[A-Za-z0-9_]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[abprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9._-]{16,}/;
const send = (res: ServerResponse, status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(body));

const hostName = (host = ""): string => host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];

/** True when a response body would carry an environment value or something shaped like a key. */
export function leaks(text: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (KEY_SHAPED.test(text)) return true;
  // CI run metadata (GITHUB_SERVER_URL, GITHUB_REPOSITORY, RUNNER_*) is public and appears in every PR link.
  return Object.entries(env).some(([name, value]) => !/^(GITHUB|RUNNER)_/.test(name) && typeof value === "string" && value.length >= 16 && text.includes(value));
}

/**
 * Wraps a local read as Connect middleware. Like the owner token proxy, it answers only a loopback peer that asked for a
 * loopback host from the console's own page (same-origin) or a direct visit (none), and only with GET. `query` maps each
 * allowed parameter to its pattern; any other parameter, a repeat or a mismatch is refused before the read runs.
 */
export function localOnly(read: LocalRead, query: Query = {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const site = req.headers["sec-fetch-site"];
    if (!LOOPBACK_PEERS.has(req.socket?.remoteAddress ?? "") || !LOOPBACK_HOSTS.has(hostName(req.headers.host)) || (site !== "same-origin" && site !== "none"))
      return send(res, 403, { error: "owner-local-loopback-same-origin-only" });
    if (req.method !== "GET") return send(res, 405, { error: "get-only" });
    const params = new URL(req.url ?? "/", "http://127.0.0.1").searchParams;
    const keys = [...params.keys()];
    if (new Set(keys).size !== keys.length || keys.some((key) => !Object.hasOwn(query, key) || !query[key]!.test(params.get(key) ?? "")))
      return send(res, 400, { error: "bad-query" });
    try {
      const text = JSON.stringify(await read(Object.fromEntries(params)));
      if (leaks(text)) return send(res, 500, { error: "withheld" });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(text);
    } catch (error) {
      send(res, 500, { error: isLocalRead(error) ? error.message : "local-read-failed" });
    }
  };
}

/** Runs one fixed argv without a shell and resolves with its stdout, or rejects with a short, value-free reason. */
export const isLocalRead = (error: unknown): error is Error => error instanceof Error && (error as Error & { code?: string }).code === "local-read";

type RunOptions = { cwd?: string; input?: string; timeoutMs?: number; maxBytes?: number };
export function runFixed(spawn: Spawn = nodeSpawn, cmd: string, args: string[], { cwd, input, timeoutMs = 15_000, maxBytes = 2_000_000 }: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const fail = (reason: string) => reject(Object.assign(new Error(reason), { code: "local-read" }));
    let child: ReturnType<Spawn>;
    try { child = spawn(cmd, args, { cwd, shell: false, timeout: timeoutMs, stdio: ["pipe", "pipe", "ignore"] }); }
    catch { return fail(`${cmd}-unavailable`); }
    const chunks: Buffer[] = [];
    let bytes = 0;
    child.stdout!.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > maxBytes) child.kill("SIGKILL"); else chunks.push(chunk); });
    child.on("error", () => fail(`${cmd}-unavailable`));
    child.on("close", (code, signal) => {
      if (signal || bytes > maxBytes) return fail(`${cmd}-timed-out`);
      if (code !== 0) return fail(`${cmd}-failed`);
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    // A child that exits before reading its input raises EPIPE here; the close handler already reports it.
    child.stdin?.on("error", () => {});
    child.stdin?.end(input ?? "");
  });
}

export function parseJson<T>(text: string, cmd: string): T {
  try { return JSON.parse(text) as T; } catch { throw Object.assign(new Error(`${cmd}-unreadable`), { code: "local-read" }); }
}
