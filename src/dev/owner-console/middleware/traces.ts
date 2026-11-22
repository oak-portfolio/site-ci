import { parseJson, runFixed, UUID, type ReadOptions } from "./local.ts";

type Run = { id?: unknown; name?: unknown; status?: unknown; error?: unknown; start_time?: unknown; end_time?: unknown; total_tokens?: unknown; app_path?: unknown; child_names?: unknown };

export const path = "/__owner/local/traces";
export const query = { run: UUID };

export const PROJECT = "1e150573-20a8-4ac6-a75b-6722468adb7a";
export const WINDOW_DAYS = 7;
const ARGV = ["api", "runs/query", "--format", "json", "-X", "POST", "--input", "-"];
const APP_PATH = /^\/o\/[0-9a-f-]{36}\/projects\/p\/[0-9a-f-]{36}\/r\/[0-9a-f-]{36}(\?trace_id=[0-9a-f-]{36}(&start_time=[0-9T:.Z-]{10,32})?)?$/;
const NAME = /^[\w .:/-]{1,60}$/;

const ms = (run: Run) => typeof run.start_time === "string" && typeof run.end_time === "string" ? Math.max(0, Date.parse(run.end_time) - Date.parse(run.start_time)) : null;
const status = (run: Run) => run.status === "error" || run.error ? "error" : run.status === "success" ? "ok" : "pending";
const name = (value: unknown) => typeof value === "string" && NAME.test(value) ? value : "run";

/** Summaries only, picked field by field: never inputs, outputs or error text, which can hold a visitor's words. */
function summary(run: Run) {
  return { id: typeof run.id === "string" && UUID.test(run.id) ? run.id : null, name: name(run.name), status: status(run), start: typeof run.start_time === "string" ? run.start_time : null,
    latencyMs: ms(run), tokens: typeof run.total_tokens === "number" && Number.isFinite(run.total_tokens) ? run.total_tokens : null,
    link: typeof run.app_path === "string" && APP_PATH.test(run.app_path) ? `https://smith.langchain.com${run.app_path}` : null,
    components: Array.isArray(run.child_names) ? run.child_names.map(name) : [] };
}

/** Root "Oak turn" runs of the last WINDOW_DAYS days, or one run's components, through the signed-in `langsmith` CLI so the key stays on this machine. */
export function create({ root, spawn, now = Date.now }: ReadOptions) {
  const ask = (body: object) => runFixed(spawn, "langsmith", ARGV, { cwd: root, input: JSON.stringify(body), timeoutMs: 20_000 }).then((text) => parseJson<{ runs?: Run[] }>(text, "langsmith"));
  return async ({ run }: Record<string, string>) => {
    const since = new Date(now() - WINDOW_DAYS * 864e5).toISOString();
    if (run) {
      const page = await ask({ session: [PROJECT], trace: run, limit: 100, select: ["id", "name", "status", "start_time", "end_time", "error", "run_type"] });
      const steps = (page.runs ?? []).map(summary);
      return { project: PROJECT, run, components: steps.map(({ name, status, latencyMs }) => ({ name, status, latencyMs })) };
    }
    const page = await ask({ session: [PROJECT], is_root: true, start_time: since, limit: 50,
      select: ["id", "name", "status", "start_time", "end_time", "error", "total_tokens", "app_path"] });
    const runs = (page.runs ?? []).map(summary).filter((row) => row.id);
    const count = (state: string) => runs.filter((row) => row.status === state).length;
    return { project: PROJECT, since, counts: { total: runs.length, ok: count("ok"), error: count("error"), pending: count("pending") }, runs };
  };
}
