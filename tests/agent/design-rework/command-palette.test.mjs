import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { createLoader, stubSets } from "./load-tsx.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const workspace = { requestOakWorkspace: () => true, setOakDraft: () => {} };
const load = createLoader({ use: [stubSets.icons], stubs: { "@/lib/oakWorkspace": workspace }, interop: true });
const flag = load("src/lib/oakFlags/commandPalette.ts");
const search = load("src/components/OakCommandPaletteSearch.tsx");
const palette = load("src/components/OakCommandPalette.tsx");
const { oakPaletteGroups, oakPaletteStatus, oakPaletteProjects, oakPaletteFieldName, oakPaletteParseRecent } = palette;

test.afterEach(() => flag.forceOakCommandPalette(null));

const keyEvent = (init) => Object.assign(new Event("keydown", { cancelable: true }), init);
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const onPlatform = (platform) => Object.defineProperty(globalThis, "navigator", { value: { platform }, configurable: true });
test.afterEach(() => Object.defineProperty(globalThis, "navigator", navigatorDescriptor));

test("constant off renders no Search button and binds no key", () => {
  assert.equal(flag.oakCommandPaletteOn(), flag.oakCommandPalette);
  flag.forceOakCommandPalette(false);
  assert.equal(flag.oakCommandPaletteOn(), false);
  assert.equal(renderToStaticMarkup(createElement(flag.OakCommandPaletteSearch, {})), "");
  const source = read("src/lib/oakFlags/commandPalette.ts");
  assert.match(source, /if \(!oakCommandPaletteOn\(\)\) return null/, "the off branch returns before any hook binds the key");
});

test("on, the header renders one Search button with its Cmd K hint", () => {
  flag.forceOakCommandPalette(true);
  const html = renderToStaticMarkup(createElement(search.default, {}));
  assert.match(html, /<button[^>]*aria-label="Search pages, sections and projects"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-keyshortcuts="Control\+K"/, "off a Mac the button names Ctrl K only");
  assert.match(html, /data-icon="search"/);
  assert.match(html, /<kbd[^>]*>/);
});

test("Ctrl K opens the newest bound palette off a Mac, other keys do nothing", () => {
  const target = new EventTarget();
  globalThis.window ??= target;
  onPlatform("Win32");
  const opened = [];
  const unbindHeader = flag.bindOakCommandPaletteKey(() => opened.push("header"));
  const unbindWorkspace = flag.bindOakCommandPaletteKey(() => opened.push("workspace"));
  const ctrl = keyEvent({ key: "k", ctrlKey: true });
  window.dispatchEvent(ctrl);
  assert.deepEqual(opened, ["workspace"], "the workspace palette wins while it is open");
  assert.equal(ctrl.defaultPrevented, true);
  unbindWorkspace();
  window.dispatchEvent(keyEvent({ key: "K", ctrlKey: true }));
  window.dispatchEvent(keyEvent({ key: "k" }));
  window.dispatchEvent(keyEvent({ key: "k", ctrlKey: true, altKey: true }));
  window.dispatchEvent(keyEvent({ key: "k", metaKey: true }));
  assert.deepEqual(opened, ["workspace", "header"]);
  unbindHeader();
  window.dispatchEvent(keyEvent({ key: "k", ctrlKey: true }));
  assert.deepEqual(opened, ["workspace", "header"], "nothing is bound once every palette unbinds");
});

test("on a Mac only Cmd K opens the palette, Ctrl K keeps its delete-to-line-end meaning", () => {
  globalThis.window ??= new EventTarget();
  onPlatform("MacIntel");
  const opened = [];
  const unbind = flag.bindOakCommandPaletteKey(() => opened.push("header"));
  const ctrl = keyEvent({ key: "k", ctrlKey: true });
  window.dispatchEvent(ctrl);
  assert.deepEqual(opened, []);
  assert.equal(ctrl.defaultPrevented, false);
  window.dispatchEvent(keyEvent({ key: "k", metaKey: true }));
  assert.deepEqual(opened, ["header"]);
  unbind();
  assert.deepEqual(flag.oakPaletteShortcut(true), { keys: "Meta+K", hint: "\u2318K" });
  assert.deepEqual(flag.oakPaletteShortcut(false), { keys: "Control+K", hint: "Ctrl K" });
});

test("a second Cmd K while the palette is open changes nothing, so Escape still returns to the opener", () => {
  assert.match(read("src/components/OakCommandPaletteSearch.tsx"), /const show = React\.useCallback\(\(from\?: HTMLElement \| null\) => \{\s*if \(shown\.current\) return;/);
});

test("Recent reads only a list of at most 3 same-site paths, anything else reads as empty", () => {
  const ok = [{ href: "/work", label: "Work", group: "Pages" }, { href: "/#home.proof", label: "Proof", group: "Sections" }];
  assert.deepEqual(oakPaletteParseRecent(JSON.stringify(ok)), ok);
  for (const raw of [null, "", "not json", "{}", "\"/work\"", "42", JSON.stringify({ href: "/work", label: "Work", group: "Pages" }),
    JSON.stringify([...ok, ok[0], ok[1]]), JSON.stringify([{ href: "//evil.example/", label: "x", group: "Pages" }]),
    JSON.stringify([{ href: "https://evil.example/", label: "x", group: "Pages" }]), JSON.stringify([{ href: "/\\evil.example", label: "x", group: "Pages" }]),
    JSON.stringify([{ href: "javascript:alert(1)", label: "x", group: "Pages" }]), JSON.stringify([ok[0], { href: "/work", label: 1, group: "Pages" }]), "[null]"]) {
    assert.deepEqual(oakPaletteParseRecent(raw), [], String(raw));
  }
});

test("the palette is a Base UI Autocomplete in a Dialog, Escape returns focus to the opener", () => {
  const source = read("src/components/OakCommandPalette.tsx");
  assert.match(source, /from "@base-ui\/react\/autocomplete"/);
  assert.match(source, /from "@\/components\/ui\/dialog"/);
  assert.match(source, /<Autocomplete\.List/);
  assert.match(source, /<Autocomplete\.Status/);
  assert.match(source, /finalFocus=\{opener/);
  assert.match(read("src/components/OakCommandPaletteSearch.tsx"), /active !== document\.body \? active : button\.current/);
  assert.equal(oakPaletteFieldName, "Search without asking");
});

test("the first row is Ask Oak AI, every row but the Ask rows is a real link, and Ask about this page is last", () => {
  const groups = oakPaletteGroups("", "/", [{ href: "/work", label: "Work", group: "Pages" }]);
  const rows = groups.flatMap((group) => group.items);
  assert.equal(rows[0].label, "Ask Oak AI");
  assert.equal(groups[1].label, "Recent");
  assert.deepEqual(groups.map((group) => group.label), ["Ask", "Recent", "Pages", "Sections", "Projects", "This page"],
    "Gallery replays is dropped: the gallery lives only at the dev route /__dev/oak-states, so it has no public URL");
  assert.equal(rows.at(-1).label, "Ask about this page");
  for (const row of rows) {
    if (row.kind === "ask") assert.equal(row.href, undefined, row.label);
    else assert.match(row.href, /^\/(work(\/[a-z0-9-]+\/)?)?(#[a-z.]+)?$/, row.label);
  }
  assert.ok(rows.some((row) => row.href === "/#home.proof" && row.label === "Proof"));
});

test("filtering keeps group headers, drops empty groups, keeps the Ask rows and announces the count", () => {
  const groups = oakPaletteGroups("eco", "/", []);
  assert.deepEqual(groups.map((group) => group.label), ["Ask", "Projects", "This page"]);
  assert.equal(groups[0].items[0].label, "Ask Oak AI about \u201ceco\u201d");
  assert.equal(groups[1].items[0].href, "/work/ecosmartloop/");
  assert.equal(oakPaletteStatus(groups), "1 result");
  assert.equal(oakPaletteStatus(oakPaletteGroups("", "/", [])), `${oakPaletteGroups("", "/", []).flatMap((g) => g.items).filter((r) => r.kind !== "ask").length} results`);
  const empty = oakPaletteGroups("zzz", "/", []);
  assert.deepEqual(empty.map((group) => group.label), ["Ask", "This page"]);
  assert.equal(oakPaletteStatus(empty), "No results");
});

test("project rows match every Work case study", () => {
  const names = readdirSync(path.join(root, "src/content/work")).filter((file) => file.endsWith(".mdx")).map((file) => ({
    slug: file.replace(/\.mdx$/, ""), name: read(`src/content/work/${file}`).match(/^projectName: "(.+)"$/m)[1] }));
  assert.deepEqual([...oakPaletteProjects].map(({ slug, name }) => ({ slug, name })).sort((a, b) => a.slug.localeCompare(b.slug)), names);
});

test("opening makes no model call and the palette code is not in the first page chunk", () => {
  const source = read("src/components/OakCommandPalette.tsx");
  assert.doesNotMatch(source, /fetch\(|\/api\/oak|sendOak|startOak|submitOak/);
  const flagSource = read("src/components/OakCommandPaletteSearch.tsx");
  assert.match(flagSource, /import\("@\/components\/OakCommandPalette"\)/);
  for (const file of ["src/lib/oakFlags/commandPalette.ts", "src/components/OakCommandPaletteSearch.tsx", "src/components/SiteHeader.tsx", "src/components/agent/OakWorkspace.tsx"]) {
    assert.doesNotMatch(read(file), /from "@\/components\/OakCommandPalette"/, file);
  }
  assert.match(read("src/components/SiteHeader.tsx"), /<OakCommandPaletteSearch/);
  assert.match(read("src/components/agent/OakWorkspace.tsx"), /<OakCommandPaletteSearch[^>]*container=\{popup\}/);
});

test("reduced motion has no scale-in and the panel is overlay glass only", () => {
  const css = read("src/styles/palette.css");
  assert.doesNotMatch(css, /scale\(/);
  assert.match(css, /--glass-fill-overlay/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /prefers-reduced-transparency: reduce[\s\S]*--glass-fill-solid/);
});
