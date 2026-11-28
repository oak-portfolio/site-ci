import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import { rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { siteVisibility } from "./src/data/siteVisibility.ts";
import knowledgeReleaseGuard from "./scripts/knowledge/integration.mjs";

// Owner token from the macOS Keychain (service oak-owner-api-token); read only when the dev server starts, never bundled.
function ownerApiToken() {
  // Never on a LAN-exposed dev server: the proxy would hand owner control to the network.
  if (!process.argv.includes("dev") || process.argv.some((arg, i) => (arg === "--host" && process.argv[i + 1] !== "127.0.0.1") || (arg.startsWith("--host=") && arg !== "--host=127.0.0.1"))) return "";
  try { return execFileSync("security", ["find-generic-password", "-s", "oak-owner-api-token", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).trim(); }
  catch { return ""; }
}
const ownerToken = ownerApiToken();

// The owner console's local tabs read this machine (repo files, git, gh, the signed-in langsmith CLI), never the Worker.
// configureServer runs only under `astro dev`; each read answers loopback, same-origin GETs only.
const ownerLocalReads = {
  name: "owner-console-local-reads",
  configureServer(server) {
    const files = ["/src/dev/owner-console/middleware/content.ts", "/src/dev/owner-console/middleware/assets.ts", "/src/dev/owner-console/middleware/traces.ts",
      "/src/dev/owner-console/middleware/quality.ts", "/src/dev/owner-console/middleware/release.ts"];
    for (const file of files) server.middlewares.use((req, res, next) => (async () => {
      const read = await server.ssrLoadModule(file);
      if (req.url !== read.path && !req.url?.startsWith(`${read.path}?`)) return next();
      const { localOnly } = await server.ssrLoadModule("/src/dev/owner-console/middleware/local.ts");
      req.url = req.url.slice(read.path.length) || "/";
      await localOnly(read.create({ root: process.cwd() }), read.query)(req, res);
    })().catch(next));
  },
};

const viteCacheDir = process.env.STEVE_OAK_VITE_CACHE_DIR ?? "node_modules/.vite";

function clearViteOptimizedDeps() {
  const viteDepsCache = join(process.cwd(), viteCacheDir, "deps");

  try {
    rmSync(viteDepsCache, { force: true, recursive: true });
    console.log("[dev] Cleared Vite optimized dependency cache.");
  } catch (error) {
    console.warn(`[dev] Could not clear Vite optimized dependency cache: ${error.message}`);
  }
}

const devViteDependencyCacheGuard = {
  name: "dev-vite-dependency-cache-guard",
  hooks: {
    "astro:config:setup": ({ command }) => {
      if (command !== "dev") {
        return;
      }

      clearViteOptimizedDeps();
    },
  },
};

const devRoutes = {
  name: "dev-routes",
  hooks: {
    "astro:config:setup": ({ command, injectRoute }) => {
      if (command !== "dev") {
        return;
      }

      injectRoute({
        pattern: "/__dev/hero-variants",
        entrypoint: "./src/dev/hero-variants.astro",
      });
      injectRoute({
        pattern: "/__dev/oak-states",
        entrypoint: "./src/dev/oak-states.astro",
      });
      // The owner page lives only on Oak's machine; the proxy below sends its requests to production with the owner token.
      injectRoute({
        pattern: "/owner/services",
        entrypoint: "./src/dev/owner-services.astro",
      });
      injectRoute({
        pattern: "/owner/console",
        entrypoint: "./src/dev/owner-console.astro",
      });
      injectRoute({
        pattern: "/__dev/owner-keys",
        entrypoint: "./src/dev/owner-keys.astro",
      });
    },
  },
};

function isPublicSitemapPathname(pathname) {
  return pathname === "/" ||
    pathname === "/work" ||
    /^\/work\/[a-z0-9-]+$/.test(pathname) ||
    /^\/apps\/kusala-daily(?:\/(?:privacy|support))?$/.test(pathname);
}

function normalizeSitemapPathname(page) {
  const pathname = new URL(page).pathname;

  if (pathname === "/") {
    return pathname;
  }

  return pathname.replace(/\/$/, "");
}

export default defineConfig({
  site: "https://steveoak.com",
  output: "static",
  compressHTML: true,
  devToolbar: {
    enabled: false,
  },
  integrations: [
    knowledgeReleaseGuard(),
    devViteDependencyCacheGuard,
    devRoutes,
    mdx(),
    react(),
    sitemap({
      filter: (page) => siteVisibility.stage === "launch" && isPublicSitemapPathname(normalizeSitemapPathname(page)),
    }),
  ],
  vite: {
    cacheDir: viteCacheDir,
    plugins: [ownerLocalReads],
    server: {
      watch: {
        ignored: ["**/artifacts/**", "**/.local-setup/**"],
      },
      proxy: {
        // Local owner page -> production owner API. Visitor cookies are dropped; only the owner token travels.
        "/api/oak/owner": {
          target: "https://steveoak.com", changeOrigin: true, secure: true,
          configure: (proxy) => proxy.on("proxyReq", (request, incoming, response) => {
            // Only the local owner page itself (same-origin) or a direct visit (none) may use the owner token;
            // another localhost app is "same-site" and must not drive the owner API.
            const site = incoming.headers["sec-fetch-site"];
            if (site !== "same-origin" && site !== "none") {
              request.destroy();
              if (!response.headersSent) response.writeHead(403, { "content-type": "application/json" }).end('{"error":"owner-proxy-same-origin-only"}');
              return;
            }
            request.removeHeader("cookie");
            request.setHeader("origin", "https://steveoak.com");
            if (ownerToken) request.setHeader("authorization", `Bearer ${ownerToken}`);
          }),
        },
        "/api/oak": "http://127.0.0.1:8787",
      },
    },
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    optimizeDeps: {
      force: true,
      ignoreOutdatedRequests: true,
      include: [
        "@astrojs/react/client.js",
        // Imported lazily by the agent client; prebundling keeps their hash stable so a first chat turn never 404s.
        "ai",
        "@clerk/clerk-js",
        "astro/virtual-modules/transitions-events.js",
        "astro/virtual-modules/transitions-router.js",
        "astro/virtual-modules/transitions-swap-functions.js",
        "astro/virtual-modules/transitions-types.js",
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-dev-runtime",
        "react/jsx-runtime",
        "recharts",
      ],
    },
  },
});
