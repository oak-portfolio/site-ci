#!/usr/bin/env node
// Q18 review page server: serves a folder (static files) and stores Oak's per-screenshot feedback beside it.
//   GET  /api/feedback            -> { [cellId]: { comment, flagged, images: [file], updatedAt } }
//   PUT  /api/feedback/:cellId    <- { comment, flagged, images }  (empty entry deletes it)
//   POST /api/feedback-image?cell=<id>&ext=png  <- raw image bytes; returns { file }
//   GET  /api/feedback.md         -> the same feedback as Markdown with absolute image paths
// Two cell-id prefixes carry the sitting page's marks and need no schema: `verdict:<cell>` holds Match, Close or Gap in `comment`,
// and `seen:<cell>` holds the capture revision Oak saw. The Markdown lists them after the flags and comments, and a page with
// marks but no flags still reads "signed off".
// Feedback lives in <root>/feedback/feedback.json and <root>/feedback/images/. Local only: binds 127.0.0.1.
// Usage: node review-server.mjs <root> [port]
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mobbinRoots } from "./review-mobbin-roots.mjs";

const root = path.resolve(process.argv[2] ?? ".");
const realRoot = realpathSync(root);
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.argv[3] ?? 4399);
const fbDir = path.join(root, "feedback"), imgDir = path.join(fbDir, "images"), fbFile = path.join(fbDir, "feedback.json");
mkdirSync(imgDir, { recursive: true });
const load = () => existsSync(fbFile) ? JSON.parse(readFileSync(fbFile, "utf8")) : {};
const save = data => { writeFileSync(fbFile + ".tmp", JSON.stringify(data, null, 2)); renameSync(fbFile + ".tmp", fbFile); };
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".md": "text/markdown; charset=utf-8" };
const send = (res, code, body, type = "application/json") => { res.writeHead(code, { "content-type": type, "cache-control": "no-store" }); res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const body = (req, limit) => new Promise((resolve, reject) => {
  const parts = []; let size = 0;
  req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("too-large")); req.destroy(); } else parts.push(c); });
  req.on("end", () => resolve(Buffer.concat(parts))); req.on("error", reject);
});
const safeId = id => typeof id === "string" && id.length < 200 && /^[\w:@/.-]+$/.test(id);
const VERDICTS = new Set(["Match", "Close", "Gap"]);
const markOf = id => id.startsWith("verdict:") ? "verdict" : id.startsWith("seen:") ? "seen" : "";

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/feedback" && req.method === "GET") return send(res, 200, load());
    if (url.pathname === "/api/feedback.md" && req.method === "GET") {
      const data = load(), all = Object.entries(data).sort(([a], [b]) => a.localeCompare(b));
      const rows = all.filter(([id]) => !markOf(id)), marks = all.filter(([id]) => markOf(id));
      const md = rows.length ? rows.map(([id, f]) => `- \`${id}\`${f.flagged ? " (flagged)" : ""}\n` + (f.comment ? `  ${f.comment.replace(/\n/g, "\n  ")}\n` : "") +
        (f.images ?? []).map(i => `  - image: ${path.join(imgDir, i)}\n`).join("")).join("") : "signed off\n";
      const tail = marks.length ? "\n## Verdicts and seen marks\n" + marks.map(([id, f]) => {
        const kind = markOf(id), cell = id.slice(kind.length + 1);
        return kind === "verdict" ? `- verdict \`${cell}\`: ${f.comment}\n` : `- seen \`${cell}\`\n`;
      }).join("") : "";
      return send(res, 200, md + tail, "text/markdown; charset=utf-8");
    }
    if (url.pathname.startsWith("/api/feedback/") && req.method === "PUT") {
      const id = decodeURIComponent(url.pathname.slice("/api/feedback/".length));
      if (!safeId(id)) return send(res, 400, { error: "bad-id" });
      const entry = JSON.parse((await body(req, 64_000)).toString("utf8") || "{}");
      // A verdict is Match, Close or Gap; the only other thing it accepts is an empty entry, which clears it.
      if (markOf(id) === "verdict" && (entry.comment ? !VERDICTS.has(entry.comment) : entry.flagged || entry.images?.length)) return send(res, 400, { error: "bad-verdict" });
      const data = load(), images = Array.isArray(entry.images) ? entry.images.filter(i => /^[\w.-]+$/.test(i)) : [];
      const comment = typeof entry.comment === "string" ? entry.comment.slice(0, 8000) : "";
      if (!comment.trim() && !entry.flagged && !images.length) delete data[id];
      else data[id] = { comment, flagged: !!entry.flagged, images, updatedAt: new Date().toISOString() };
      save(data); return send(res, 200, data[id] ?? {});
    }
    if (url.pathname === "/api/feedback-image" && req.method === "POST") {
      const id = url.searchParams.get("cell"), ext = (url.searchParams.get("ext") || "png").toLowerCase();
      if (!safeId(id) || !/^(png|jpe?g|webp|gif)$/.test(ext)) return send(res, 400, { error: "bad-input" });
      const bytes = await body(req, 15_000_000);
      const file = `${id.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "")}-${Date.now()}.${ext}`;
      writeFileSync(path.join(imgDir, file), bytes);
      return send(res, 200, { file });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method" });
    const requested = path.resolve(path.join(root, decodeURIComponent(url.pathname)));
    if (!requested.startsWith(root + path.sep)) return send(res, 404, "not found", "text/plain");
    if (!existsSync(requested) || !statSync(requested).isFile()) return send(res, 404, "not found", "text/plain");
    const file = realpathSync(requested);
    if (!file.startsWith(realRoot + path.sep) && !mobbinRoots(repoRoot).some(parent => file.startsWith(parent + path.sep)))
      return send(res, 404, "not found", "text/plain");
    res.writeHead(200, { "content-type": types[path.extname(file).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store" });
    createReadStream(file).pipe(res);
  } catch (error) { send(res, 500, { error: String(error.message ?? error) }); }
}).listen(port, "127.0.0.1", () => console.log(`review server on http://127.0.0.1:${port} serving ${root}`));
