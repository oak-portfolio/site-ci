import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "../design-rework/load-tsx.mjs";
import { galleryStates, stateById } from "./gallery.mjs";

// R21 (Oak, review v18, gallery:research-web@1280): "we should see the favicon (Hugeicon if none exists, or a generic web
// favicon)". The Worker supplies the favicon as a data: URI, so the page never asks another site for one.
globalThis.window ??= { innerWidth: 1440, innerHeight: 900, outerWidth: 1440, outerHeight: 980, screen: {}, location: { search: "" }, addEventListener() {}, removeEventListener() {} };
const states = galleryStates;
const event = stateById("research-web").workspace.messages[0].research;
const { OakPublicResearch } = loadTsx("src/components/agent/OakPublicResearch.tsx");
const { OakWebSourceFace, oakWebSourceFace } = loadTsx("src/components/agent/OakSourceChip.tsx");
const png = "data:image/png;base64,iVBORw0KGgo=";

test("R21 a source with a favicon shows it, and one without shows the web icon", () => {
  assert.deepEqual(oakWebSourceFace(png), { face: "favicon", src: png });
  assert.equal(oakWebSourceFace(undefined).face, "icon");
  assert.equal(oakWebSourceFace(undefined).icon, "globe", 'the existing "source.web" meaning');
  const withFavicon = renderToStaticMarkup(createElement(OakWebSourceFace, { favicon: png }));
  assert.match(withFavicon, /data-face="favicon"/);
  assert.match(withFavicon, new RegExp(`<img src="${png}" alt=""`));
  const without = renderToStaticMarkup(createElement(OakWebSourceFace, {}));
  assert.match(without, /data-face="icon"/);
  assert.doesNotMatch(without, /<img/);
  assert.match(without, /<svg/);
});

test("R21 the face never loads anything from another site: a URL, SVG or script in the field falls back to the icon", () => {
  for (const bad of ["https://evil.example.net/favicon.ico", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "javascript:alert(1)", "data:text/html;base64,PGI+", ""]) {
    assert.equal(oakWebSourceFace(bad).face, "icon", bad);
    assert.doesNotMatch(renderToStaticMarkup(createElement(OakWebSourceFace, { favicon: bad })), /<img/);
  }
});

test("R21 the research-web gallery card: rows lead with a face instead of a number, chips show the same face", () => {
  assert.deepEqual(event.sources.map(source => !!source.favicon), [true, false, true], "two inline favicons and one without");
  const html = renderToStaticMarkup(createElement(OakPublicResearch, { event, state: "complete" }));
  assert.doesNotMatch(html, /oak-research__row-number|oak-research__cite-number/, "the number circle is gone");
  const rows = html.slice(html.indexOf("oak-research__rows"));
  assert.equal(rows.match(/class="oak-research__row"/g)?.length, 3);
  assert.equal(rows.match(/data-face="favicon"/g)?.length, 2);
  assert.equal(rows.match(/data-face="icon"/g)?.length, 1);
  // The row keeps its accessible name (title plus "new tab") and the face stays out of it.
  assert.match(rows, /<span class="oak-research__row-title">Grounded answers: building a reliable eval set<span class="sr-only"> \(new tab\)<\/span>/);
  assert.match(rows, /<span class="oak-web-face"[^>]*aria-hidden="true"/);
  // The cite chips use the same face and keep their screen reader text, which names the source number.
  const synthesis = html.slice(html.indexOf("oak-research__synthesis"), html.indexOf("oak-research__rows"));
  assert.equal(synthesis.match(/class="oak-web-face"/g)?.length, 4, "one face per web chip");
  assert.match(synthesis, /: web source 1, Measuring hallucination rate in LLM applications \(new tab\)/);
  assert.ok(!html.includes("evals-handbook.example.com/favicon"), "no request to the source site is built");
});
