import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx, strictLoader } from "./load-tsx.mjs";

// A desktop window lets the real viewport guard admit every panel.
globalThis.window ??= { innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, screen: {}, addEventListener() {}, removeEventListener() {} };
const workspace = loadTsx("src/lib/oakWorkspace.ts");
const documents = loadTsx("src/lib/oakDocumentsWorkspace.ts");
const surfaces = ["role", "question", "advice", "funding", "conversation", "brief", "documents", "voice"];

function reset() {
  for (let i = 0; workspace.getOakSurface() !== "chat"; i++) {
    assert.ok(i < 10, "surface closes");
    workspace.closeOakSurface();
  }
  workspace.setOakWorkspaceFixture({ presentation: "human-agent", viewportSupported: true, authOpen: false, pending: false });
}

const panel = name => Object.assign(() => null, { panel: name });
const element = (type, props) => ({ type, props: props ?? {} });
const requires = {
  react: { useId: () => "composer", useRef: current => ({ current }), useLayoutEffect() {}, useEffect() {}, useState: value => [value, () => {}] },
  "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
  "@base-ui/react/field": { Field: { Root: "div", Label: "label", Control: "textarea" } },
  "@/components/ui/button": { Button: "button" },
  "@/components/ui/Icon": { Icon: "svg" },
  "@/components/ui/input-group": { InputGroup: "div", InputGroupAddon: "div" },
  "@/lib/oakMeaningIcons": loadTsx("src/lib/oakMeaningIcons.ts"),
  "@/lib/oakWorkspace": workspace,
  "@/lib/oakDocumentsWorkspace": { useOakDocumentsWorkspace: () => documents.getOakDocumentsController().snapshot() },
  "@/lib/oakAccountClient": { getOakAccountContext: () => ({ epoch: 0 }) },
  "@/lib/oakAllowance": { oakAllowanceSummary: () => null },
  "../../../packages/oak-agent-contracts/src/transport": { roleDescriptionMaxBytes: 8000 },
  "./OakWorkflowPanels": { OakAdvicePanel: panel("advice"), OakConversationPanel: panel("conversation"), OakFundingPanel: panel("funding"),
    OakQuestionDraftPanel: panel("question"), OakVoicePanel: panel("voice") },
  "./WorkflowPanel": { WorkflowPanel: panel("role") },
  "./OakDocumentsPanel": { OakDocumentsPanel: panel("documents") },
  "./OakContactBriefEditor": { OakContactBriefEditor: panel("brief") },
  "./OakEmptyState": { OakEmptyState: "div", oakStarters: [] },
  // R11 (intentional update): verification mode lives in OakTurnstile; a surface test never needs the visitor to pass a check.
  "./OakTurnstile": { OakVerification: "div", useOakVerification: () => ({ verifying: false, mounted: false, dismiss() {} }) },
};
const host = strictLoader(import.meta.url, { missing: "empty" })("src/components/agent/OakConversation.tsx", requires);

function render() {
  const nodes = [];
  const visit = node => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    visit(node.props.children);
  };
  visit(host.OakConversation({ state: workspace.getOakWorkspace(), onContact() {}, geometryKey: "1280:800" }));
  return nodes;
}

test("D05-G2 each surface renders exactly its own panel", () => {
  for (const surface of surfaces) {
    reset();
    workspace.openOakSurface(surface);
    assert.equal(workspace.getOakSurface(), surface);
    const shown = render().flatMap(node => node.type?.panel ? [node.type.panel] : []);
    assert.deepEqual(shown, [surface], `${surface} shows one panel`);
  }
  reset();
  assert.deepEqual(render().flatMap(node => node.type?.panel ? [node.type.panel] : []), [], "chat shows no panel");
});

test("D05-G2 opening a panel closes the previous one", () => {
  for (const first of surfaces) for (const next of surfaces) {
    if (first === next) continue;
    reset();
    workspace.openOakSurface(first);
    workspace.openOakSurface(next);
    assert.equal(workspace.getOakSurface(), next, `${first} then ${next}`);
    workspace.closeOakSurface();
    assert.equal(workspace.getOakSurface(), "chat", `${first} stays closed under ${next}`);
  }
});

test("D05-G2 Escape from any panel returns to chat, unless an open list inside it takes Escape", () => {
  const escape = (inList = false) => {
    const event = { key: "Escape", target: { closest: () => (inList ? {} : null) }, preventDefault() {}, stopPropagation() {} };
    render().find(node => node.props.className === "oak-workspace__reading").props.onKeyDownCapture(event);
  };
  for (const surface of surfaces) {
    reset();
    workspace.openOakSurface(surface);
    escape(true);
    assert.equal(workspace.getOakSurface(), surface, `${surface} keeps Escape for its open list`);
    escape();
    assert.equal(workspace.getOakSurface(), "chat", `${surface} returns to chat`);
  }
});
