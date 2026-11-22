import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTsx } from "../design-rework/load-tsx.mjs";

// ARCH@25: one answer to "who is here" for the header, the account menu, the greeting and saved chats.
const { oakAccountView, oakAccountInitials, oakAccountTone } = loadTsx("src/lib/oakAccountView.ts");
const maya = { name: "Maya Chen", firstName: "Maya", email: "maya@example.com", imageUrl: "https://img.example/maya.jpg" };
const ready = { kind: "account", phase: "ready", configured: true, purpose: "recruiting" };

test("ARCH@25 a ready account is a member with a first name, email line and purpose label", () => {
  const view = oakAccountView({ status: ready, identity: maya });
  assert.equal(view.state, "member");
  assert.equal(view.account, true);
  assert.equal(view.ready, true);
  assert.equal(view.firstName, "Maya");
  assert.equal(view.title, "Maya Chen");
  assert.equal(view.subtitle, "maya@example.com");
  assert.equal(view.purposeLabel, "Hiring or recruiting");
  assert.equal(view.initials, "MC");
});

test("ARCH@25 an account that must sign in again is never shown as signed in, on any surface", () => {
  const view = oakAccountView({ status: ready, reauthenticate: true, identity: maya });
  assert.equal(view.state, "returning");
  assert.equal(view.account, false);
  assert.equal(view.ready, false, "the greeting used to ignore sign-in-again (OakEmptyState.tsx:84 before ARCH@25)");
  assert.equal(view.identity, null, "no photo or name leaks onto a guest surface");
  assert.equal(view.firstName, null);
});

test("ARCH@25 a guest reads what signing in gives, or that it is unavailable", () => {
  assert.equal(oakAccountView({ status: { kind: "guest", phase: "guest", configured: true }, identity: null }).subtitle, "Sign in to keep chats for 30 days");
  assert.equal(oakAccountView({ status: { kind: "guest", phase: "guest" }, signInConfiguration: { configured: false }, identity: null }).subtitle, "Sign-in is unavailable right now");
  assert.equal(oakAccountView({ status: null, identity: null }).state, "guest");
});

test("ARCH@25 names fall back the way the menu and greeting need", () => {
  assert.equal(oakAccountView({ status: ready, identity: { name: "Jordan Ellis", firstName: null, email: null, imageUrl: null } }).firstName, "Jordan");
  assert.equal(oakAccountView({ status: ready, identity: { name: null, firstName: null, email: "j@x.dev", imageUrl: null } }).title, "j@x.dev");
  assert.equal(oakAccountView({ status: { ...ready, purpose: null }, identity: { name: "Jo", firstName: "Jo", email: null, imageUrl: null } }).subtitle, "Your account");
  assert.equal(oakAccountInitials({ name: null, email: "zed@x.dev" }), "Z");
  assert.equal(oakAccountTone("maya@example.com"), oakAccountTone("maya@example.com"), "a person keeps one tint");
});
