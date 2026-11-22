// Ticket 161: the dev gallery finds switches by their files, so every switch with a force export names its gallery key.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const dir = new URL("../../../src/lib/oakFlags/", import.meta.url);
const switches = readdirSync(dir).filter(name => name.endsWith(".ts")).map(name => ({ name, source: readFileSync(new URL(name, dir), "utf8") }));
const keyOf = source => source.match(/^export const oakGalleryKey = "([A-Za-z]+)";$/m)?.[1];

test("gallery switches: every switch file with a force export names its gallery key", () => {
  const forced = switches.filter(({ source }) => /^export function force[A-Z]/m.test(source));
  assert.ok(forced.length > 30, "the switch files were found");
  assert.deepEqual(forced.filter(({ source }) => !keyOf(source)).map(({ name }) => name), []);
});

test("gallery switches: no two switch files share a gallery key", () => {
  const seen = new Map();
  for (const { name, source } of switches) {
    const key = keyOf(source);
    if (key) seen.set(key, [...(seen.get(key) ?? []), name]);
  }
  assert.deepEqual([...seen].filter(([, names]) => names.length > 1), []);
});

test("gallery switches: each switch file has exactly one force the gallery loop calls with its key", () => {
  const gallery = readFileSync(new URL("../../../src/dev/OakStatesGallery.tsx", import.meta.url), "utf8");
  const explicit = new Set(gallery.match(/const explicitForces = new Set<unknown>\(\[([^\]]*)\]\)/)[1].split(",").map(name => name.trim()));
  const looped = switches.map(({ name, source }) => ({ name, forces: [...source.matchAll(/^export function (force[A-Z]\w*)/gm)].map(([, force]) => force).filter(force => !explicit.has(force)) }));
  assert.deepEqual(looped.filter(({ forces }) => forces.length > 1), []);
});
