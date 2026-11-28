import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "playwright";
import { createLoader } from "./load-tsx.mjs";

// Real modules with `motion/react` replaced by recorders, so each test controls the reduced-motion preference.
globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const root = path.resolve(import.meta.dirname, "../../..");
let reduced = false;
const seen = [];
const motionProps = ["initial", "animate", "exit", "transition", "whileTap"];
const recorder = (type, name) => React.forwardRef((props, ref) => {
  const rest = { ...props };
  seen.push({ name, ...Object.fromEntries(motionProps.map((key) => [key, props[key]])) });
  motionProps.forEach((key) => delete rest[key]);
  return createElement(type, typeof type === "string" ? { ...rest, ref } : rest);
});
const motionValue = (value) => ({ get: () => value, set() {}, on: () => () => {} });
const motionStub = {
  motion: { div: recorder("div", "div"), button: recorder("button", "button"), span: recorder("span", "span"), section: recorder("section", "section"),
    p: recorder("p", "p"), li: recorder("li", "li"), create: (component) => recorder(component, component.name) },
  useReducedMotion: () => reduced,
  useMotionValue: motionValue,
  useSpring: (source) => motionValue(typeof source === "object" ? source.get() : source),
  AnimatePresence: ({ children }) => children,
};
const stubs = { "motion/react": motionStub, "@/components/ui/Icon": { Icon: ({ name }) => createElement("svg", { "data-icon": name }) } };
const load = createLoader({ stubs, interop: true });

const { oakMotion, oakPress, oakMotionTokens } = load("src/lib/oakMotion.ts");
const { Suggestion } = load("src/components/ui/suggestion.tsx");
const { DialogContent } = load("src/components/ui/dialog.tsx");
const { OakTurn } = load("src/components/agent/OakTurn.tsx");
const { OakChainOfThought } = load("src/components/agent/OakChainOfThought.tsx");
const { WorkflowPanel } = load("src/components/agent/WorkflowPanel.tsx");
const presetNames = ["panel", "dialog", "backdrop", "turn", "expand", "reveal", "pop"];

/** Motion props each component hands to Motion, with the preference set first. */
function capture(preference, render) {
  reduced = preference;
  seen.length = 0;
  render();
  return [...seen];
}
// A live turn's trail: it opens, and its running tool row grows in on the rail.
const trail = () => renderToStaticMarkup(createElement(OakChainOfThought, { question: "q", progress: "Searching Steve's public work",
  message: { id: "a1", role: "assistant", state: "pending", text: "", cards: [], answer: null, steps: [{ id: "search-0", operation: "search", state: "running" }] } }));
const chip = () => renderToStaticMarkup(createElement(Suggestion, { suggestion: "What did Steve build?", onSelect() {} }));
const turn = () => renderToStaticMarkup(createElement(OakTurn, { message: { id: "a1", role: "assistant", state: "complete", text: "Hi", cards: [] },
  question: "", progress: "", contactPreference: "open", retry: null, copied: null, onCopy() {}, onContact() {} }));
/** DialogContent's motion elements, found in its returned tree without mounting a portal. */
const dialog = (variant) => {
  const found = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (node.props?.render?.props) found.push(node.props.render.props);
    visit(node.props?.children);
  };
  visit(DialogContent.render({ open: true, variant }, null));
  seen.push(...found.map((props) => ({ name: "dialog", ...props })));
};
const still = (entry) => {
  // Q10 (intentional update): reduced motion keeps fades only. Nothing moves, scales or grows; opacity may fade on the quick token.
  assert.ok([0, oakMotionTokens.quick].includes(entry.transition.duration), `${entry.name} changes instantly or fades quickly`);
  // R3 review: the quick timing is allowed only for a preset that really fades.
  const fades = ["initial", "exit"].some((key) => entry[key] && typeof entry[key] === "object" && "opacity" in entry[key] && entry[key].opacity !== entry.animate?.opacity);
  if (entry.transition.duration === oakMotionTokens.quick) assert.ok(fades, `${entry.name} takes time only to fade`);
  const withoutFade = (state) => state && typeof state === "object" ? Object.fromEntries(Object.entries(state).filter(([key]) => key !== "opacity")) : state;
  for (const key of ["initial", "animate", "exit"].filter((key) => entry[key])) assert.deepEqual(withoutFade(entry[key]), withoutFade(entry.animate), `${entry.name} ${key} stays at rest apart from a fade`);
  assert.equal(entry.whileTap, undefined, `${entry.name} has no press transform`);
};

test("D10-G2 motion presets use the DESIGN.md tokens and rest instantly under reduced motion", () => {
  const css = readFileSync(path.join(root, "src/styles/global.css"), "utf8");
  const token = (name) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  assert.equal(`${oakMotionTokens.quick * 1000}ms`, token("--motion-quick"));
  assert.equal(`${oakMotionTokens.mode * 1000}ms`, token("--motion-mode"));
  assert.equal(`${oakMotionTokens.page * 1000}ms`, token("--motion-page"));
  assert.equal(`cubic-bezier(${oakMotionTokens.ease.join(", ")})`, token("--motion-standard"));
  for (const name of presetNames) {
    const normal = oakMotion(name, false);
    assert.notDeepEqual(normal.initial, normal.animate, `${name} moves at normal motion`);
    assert.deepEqual(normal.exit, normal.initial, `${name} leaves the way it came`);
    assert.ok([oakMotionTokens.quick, oakMotionTokens.mode].includes(normal.transition.duration), name);
    assert.deepEqual(normal.transition.ease, oakMotionTokens.ease, name);
    still({ name, ...oakMotion(name, true) });
  }
  assert.deepEqual(oakPress(false).whileTap, { scale: 0.97 });
  still({ name: "press", ...oakPress(true) });
});

test("D10-G2 workspace open, turn entry, the reasoning trail's tool rows and chip press animate normally and hold still under reduced motion", () => {
  const surfaces = { "workspace open/close": () => dialog("panel"), "turn entry": turn, "trail tool rows": trail, "chip press": chip };
  for (const [label, render] of Object.entries(surfaces)) {
    const normal = capture(false, render);
    assert.ok(normal.length > 0, `${label} renders through Motion`);
    assert.ok(normal.some((entry) => entry.transition?.duration > 0 && (entry.whileTap || JSON.stringify(entry.initial) !== JSON.stringify(entry.animate))), `${label} moves at normal motion`);
    const calm = capture(true, render);
    assert.equal(calm.length, normal.length, label);
    calm.forEach(still);
  }
});

test("D10-G2 a turn already on screen when the transcript mounts renders at rest instead of replaying its entry", () => {
  const props = { message: { id: "a1", role: "assistant", state: "complete", text: "Hi", cards: [] },
    question: "", progress: "", contactPreference: "open", retry: null, copied: null, onCopy() {}, onContact() {} };
  const [present] = capture(false, () => renderToStaticMarkup(createElement(OakTurn, { ...props, enter: false })));
  assert.equal(present.initial, false, "a reopened turn skips its entry");
  const transcript = readFileSync(path.join(root, "src/components/agent/OakTranscript.tsx"), "utf8");
  assert.match(transcript, /enter=\{!mountedTurns\.has\(message\.id\)\}/, "the transcript marks only turns added after mount as entering");
});


test("D26-G1 panels and follow-up chips rise in, the progress sprite and tool status pop when they change, and all hold still under reduced motion", () => {
  const pending = () => renderToStaticMarkup(createElement(OakTurn, { message: { id: "a2", role: "assistant", state: "pending", text: "", cards: [],
    steps: [{ id: "search-0", operation: "search", state: "running" }] }, question: "q", progress: "Searching", contactPreference: "open", retry: null, copied: null, onCopy() {}, onContact() {} }));
  const panel = () => renderToStaticMarkup(createElement(WorkflowPanel, { title: "Model funding", onReturn() {} }, "body"));
  // v3 review (intentional update): the Related rows rise in with the answer's actions, on the same arrival clock.
  const turnSource = readFileSync(path.join(root, "src/components/agent/OakTurn.tsx"), "utf8");
  assert.match(turnSource, /<motion\.div initial=\{footerIn\.initial\} animate=\{footerIn\.animate\} transition=\{footerIn\.transition\}>\s+<OakRelated /,
    "follow-up rows rise in once per answer with its actions");
  const cases = { "workflow panel": [panel, "section", "reveal"], "progress sprite": [pending, "span", "pop"], "tool status": [trail, "span", "pop"] };
  for (const [label, [render, name, preset]] of Object.entries(cases)) {
    const moving = capture(false, render).filter(entry => entry.name === name);
    assert.ok(moving.some(entry => JSON.stringify(entry.initial) === JSON.stringify(oakMotion(preset, false).initial)), `${label} uses the ${preset} preset`);
    capture(true, render).filter(entry => entry.name === name).forEach(still);
  }
});
