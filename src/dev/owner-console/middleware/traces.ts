import { parseJson, runFixed, UUID, type ReadOptions } from "./local.ts";
import { readRunsPage, RUNS_QUERY_PATH, runsQueryBody } from "../../../../scripts/quality/live-health-core.mjs";

type Run = { id?: unknown; name?: unknown; status?: unknown; error?: unknown; start_time?: unknown; end_time?: unknown; app_path?: unknown; child_names?: unknown };
type Trace = { root_run?: { id?: unknown; trace_id?: unknown }; trace_aggregates?: { total_tokens?: unknown } | null };

export const path = "/__owner/local/traces";
export const query = { run: UUID };

export const PROJECT = "1e150573-20a8-4ac6-a75b-6722468adb7a";
export const WINDOW_DAYS = 7;
export const TOKENS_TIMEOUT_MS = 3_000;
const argv = (path: string) => ["api", path, "--format", "json", "-X", "POST", "--input", "-"];
const ARGV = argv(RUNS_QUERY_PATH);
const TRACES_ARGV = argv("/api/v2/traces/query");
const APP_PATH = /^\/o\/[0-9a-f-]{36}\/projects\/p\/[0-9a-f-]{36}\/(r\/[0-9a-f-]{36}(\?trace_id=[0-9a-f-]{36}(&start_time=[0-9T:.Z-]{10,32})?)?|trace\/[0-9a-f-]{36}\/run\/[0-9a-f-]{36}(\?start_time=[0-9T:.Z-]{10,32})?)$/;
const NAME = /^[\w .:/-]{1,60}$/;

const ms = (run: Run) => typeof run.start_time === "string" && typeof run.end_time === "string" ? Math.max(0, Date.parse(run.end_time) - Date.parse(run.start_time)) : null;
const status = (run: Run) => {
  const said = typeof run.status === "string" ? run.status.toUpperCase() : "";
  return said === "ERROR" || run.error ? "error" : said === "SUCCESS" ? "ok" : "pending";
};
const name = (value: unknown) => typeof value === "string" && NAME.test(value) ? value : "run";

/** Summaries only, picked field by field: never inputs, outputs or error text, which can hold a visitor's words. Tokens come later from the traces query, since v2 root runs carry their own usage only. */
function summary(run: Run) {
  return { id: typeof run.id === "string" && UUID.test(run.id) ? run.id : null, name: name(run.name), status: status(run), start: typeof run.start_time === "string" ? run.start_time : null,
    latencyMs: ms(run),
    link: typeof run.app_path === "string" && APP_PATH.test(run.app_path) ? `https://smith.langchain.com${run.app_path}` : null,
    components: Array.isArray(run.child_names) ? run.child_names.map(name) : [] };
}

/** Root "Oak turn" runs of the last WINDOW_DAYS days, or one run's components, through the signed-in `langsmith` CLI so the key stays on this machine. */
export function create({ root, spawn, now = Date.now }: ReadOptions) {
  const ask = (since: string, query: { select: string[]; [field: string]: unknown }) => runFixed(spawn, "langsmith", ARGV, { cwd: root, input: JSON.stringify(runsQueryBody({ project: PROJECT, since, query, cursor: null })), timeoutMs: 20_000 })
    .then((text) => readRunsPage(parseJson<object>(text, "langsmith")) as { runs: Run[] });
  /** Trace-wide totals for the listed traces in one call; a failed read, or one slower than TOKENS_TIMEOUT_MS, leaves every row's tokens null. */
  const totals = async (since: string, ids: string[]) => {
    const tokens = new Map<string, number>();
    if (!ids.length) return tokens;
    const input = JSON.stringify({ project_id: PROJECT, min_start_time: since, page_size: ids.length, trace_ids: ids, selects: ["ID", "TOTAL_TOKENS"] });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const page = await Promise.race([
      runFixed(spawn, "langsmith", TRACES_ARGV, { cwd: root, input, timeoutMs: TOKENS_TIMEOUT_MS }).then((text) => parseJson<{ items?: Trace[] }>(text, "langsmith")),
      new Promise<null>((resolve) => { timer = setTimeout(resolve, TOKENS_TIMEOUT_MS, null); }),
    ]).catch(() => null).finally(() => clearTimeout(timer));
    for (const trace of Array.isArray(page?.items) ? page.items : []) {
      const id = trace.root_run?.trace_id ?? trace.root_run?.id;
      const total = trace.trace_aggregates?.total_tokens;
      if (typeof id === "string" && typeof total === "number" && Number.isFinite(total)) tokens.set(id, total);
    }
    return tokens;
  };
  return async ({ run }: Record<string, string>) => {
    const since = new Date(now() - WINDOW_DAYS * 864e5).toISOString();
    if (run) {
      const page = await ask(since, { trace_id: run, select: ["id", "name", "status", "start_time", "end_time", "error", "run_type"] });
      const steps = page.runs.map(summary);
      return { project: PROJECT, run, components: steps.map(({ name, status, latencyMs }) => ({ name, status, latencyMs })) };
    }
    const page = await ask(since, { page_size: 50, is_root: true, select: ["id", "name", "status", "start_time", "end_time", "error", "app_path"] });
    const listed = page.runs.map(summary).filter((row) => row.id);
    const tokens = await totals(since, listed.map((row) => row.id as string));
    const runs = listed.map((row) => ({ ...row, tokens: tokens.get(row.id as string) ?? null }));
    const count = (state: string) => runs.filter((row) => row.status === state).length;
    return { project: PROJECT, since, counts: { total: runs.length, ok: count("ok"), error: count("error"), pending: count("pending") }, runs };
  };
}
