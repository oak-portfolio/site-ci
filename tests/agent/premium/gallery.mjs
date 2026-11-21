// The dev gallery (/__dev/oak-states) as one module for the premium probes: which states exist, which are answers, how
// to open one and wait until it reports ready. Set OAK_GALLERY_URL to probe another server.
import { ownServer } from "../support/own-server.mjs";
import { readFileSync } from "node:fs";

export const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

const all = JSON.parse(readFileSync(new URL("../../../src/data/dev/oak-states.json", import.meta.url), "utf8"));
// Parsed, never line-matched: a line match drops every state whose id and content sit on different lines.
export const galleryStates = (Array.isArray(all) ? all : all.states);

export const stateById = (id) => {
  const state = galleryStates.find(item => item.id === id);
  if (!state) throw new Error(`no gallery state "${id}" in src/data/dev/oak-states.json`);
  return state;
};

/** Ids of the states `keep` accepts (every state by default), in gallery order. */
export const stateIds = (keep = () => true) => galleryStates.filter(keep).map(state => state.id);

/** Every settled or streaming answer: answer-*, research-* and role-fit-answer. */
export const answerStates = () => stateIds(state => /^(answer-|research-|role-fit-answer)/.test(state.id));

/** Open one state and wait until the gallery says ready, then `settle` ms more for entrance motion. */
export const openState = async (page, id, { settle = 0, timeout = 30000 } = {}) => {
  stateById(id);
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout });
  if (settle) await page.waitForTimeout(settle);
};

/** Open each state in turn on one page and collect `fn(id)`'s results. */
export const eachState = async (page, ids, fn, options) => {
  const results = [];
  for (const id of ids) { await openState(page, id, options); results.push(await fn(id)); }
  return results;
};
