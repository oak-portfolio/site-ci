import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTsx } from "./load-tsx.mjs";

const { Bubble, BubbleContent } = loadTsx("src/components/ui/bubble.tsx");
const { Message, MessageGroup, MessageContent, MessageHeader, MessageFooter } = loadTsx("src/components/ui/message.tsx");
const { Marker, MarkerIcon, MarkerContent } = loadTsx("src/components/ui/marker.tsx");

test("D04-G4 Bubble renders default, ghost and destructive", () => {
  for (const variant of ["default", "ghost", "destructive"]) {
    const html = renderToStaticMarkup(h(Bubble, { variant, align: "end" }, h(BubbleContent, null, "Hello")));
    assert.match(html, new RegExp(`class="ui-bubble ui-bubble--${variant}"`));
    assert.match(html, /data-slot="bubble" data-align="end"/);
    assert.match(html, /<div data-slot="bubble-content" class="ui-bubble__content">Hello<\/div>/);
  }
});

test("D04-G4 MessageGroup and MessageFooter render", () => {
  const html = renderToStaticMarkup(h(MessageGroup, null,
    h(Message, { align: "start" }, h(MessageContent, null,
      h(MessageHeader, { render: h("h3", null, "Oak AI Agent") }),
      h(Bubble, { variant: "ghost" }, h(BubbleContent, null, "Answer")),
      h(MessageFooter, null, h("button", { type: "button", "aria-label": "Copy answer" }, "Copy")))),
    h(Message, { align: "start" }, h(MessageContent, null, h(Marker, { role: "status" }, h(MarkerIcon, null, "*"), h(MarkerContent, null, "Thinking"))))));
  assert.match(html, /^<div data-slot="message-group" class="ui-message-group">/);
  assert.match(html, /<h3 data-slot="message-header" class="ui-message__header">Oak AI Agent<\/h3>/);
  assert.match(html, /<div data-slot="message-footer" class="ui-message__footer"><button type="button" aria-label="Copy answer">Copy<\/button><\/div>/);
  assert.match(html, /<div data-slot="marker" class="ui-marker ui-marker--default" role="status">/);
  assert.match(html, /<span aria-hidden="true" data-slot="marker-icon" class="ui-marker__icon">\*<\/span>/);
});
