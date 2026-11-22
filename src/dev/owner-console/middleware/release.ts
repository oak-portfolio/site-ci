import { isLocalRead, parseJson, runFixed, SHA, type ReadOptions } from "./local.ts";

type Pull = { number: number; title: string; isDraft: boolean; headRefName: string; url: string };
type Settled<T> = { ok: true; value: T } | { ok: false; error: string };

export const path = "/__owner/local/release";
export const query = { sha: SHA };

export const REVIEW_SERVER = "http://127.0.0.1:4399/";
const PR = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/;

function branchState(porcelain: string) {
  const lines = porcelain.split("\n").filter(Boolean);
  const head = lines.find((line) => line.startsWith("# branch.head "))?.slice(14) ?? null;
  const ab = lines.find((line) => line.startsWith("# branch.ab "))?.match(/\+(\d+) -(\d+)/);
  return { branch: head, ahead: ab ? Number(ab[1]) : null, behind: ab ? Number(ab[2]) : null, changed: lines.filter((line) => !line.startsWith("#")).length };
}

/** Local `git` and `gh` state, the review server's reachability and the premium brief. Read-only commands with fixed argv. */
export function create({ root, spawn, fetchImpl = fetch }: ReadOptions) {
  const run = (cmd: string, args: string[], timeoutMs = 15_000) => runFixed(spawn, cmd, args, { cwd: root, timeoutMs });
  const settle = <T,>(promise: Promise<T>): Promise<Settled<T>> => promise.then((value) => ({ ok: true as const, value }), (error: unknown) => ({ ok: false as const, error: isLocalRead(error) ? error.message : "failed" }));
  return async ({ sha }: Record<string, string>) => {
    if (sha) {
      const [line = "", ...stat] = (await run("git", ["show", "--stat", "--format=%h%x09%s", `${sha}^{commit}`, "--"])).split("\n");
      const [short, subject] = line.split("\t");
      return { commit: { sha: short, subject: subject ?? "", stat: stat.filter(Boolean).slice(0, 40) } };
    }
    const [status, log, pulls, premium, review] = await Promise.all([
      run("git", ["status", "--porcelain=v2", "--branch"]),
      run("git", ["log", "-5", "--format=%h%x09%s%x09%cI"]),
      settle(run("gh", ["pr", "list", "--author", "@me", "--limit", "10", "--json", "number,title,isDraft,headRefName,url"], 20_000).then((text) => parseJson<Pull[]>(text, "gh"))),
      settle(run("npm", ["run", "-s", "premium", "--", "--brief"], 30_000)),
      fetchImpl(REVIEW_SERVER, { signal: AbortSignal.timeout(1500) }).then((response) => response.status < 500, () => false),
    ]);
    const commits = log.split("\n").filter(Boolean).map((line) => { const [sha, subject, at] = line.split("\t"); return { sha, subject, at }; });
    return { ...branchState(status), commits,
      pulls: pulls.ok ? pulls.value.filter((pr) => PR.test(pr.url)).map(({ number, title, isDraft, headRefName, url }) => ({ number, title, draft: isDraft, branch: headRefName, url })) : null,
      pullsError: pulls.ok ? null : pulls.error,
      premium: premium.ok ? premium.value.trim().slice(0, 4000) : null, premiumError: premium.ok ? null : premium.error,
      reviewServer: { url: REVIEW_SERVER, up: review, command: "node scripts/quality/review-server.mjs" } };
  };
}
