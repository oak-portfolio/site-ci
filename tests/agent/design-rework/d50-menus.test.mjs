import { ownServer } from "../support/own-server.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const galleryUrl = ownServer(process.env.OAK_GALLERY_URL ?? "http://127.0.0.1:4321");

async function openState(page, state) {
  await page.goto(`${galleryUrl}/__dev/oak-states?state=${state}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.documentElement.dataset.oakGallery === "ready", null, { timeout: 20000 });
  await page.waitForTimeout(400);
}

/** Padding of the popup and the smallest gap between its stacked children and inside its tile grid. */
const spacing = (popup, grid) => popup.evaluate((node, gridSelector) => {
  const style = getComputedStyle(node);
  const tiles = [...node.querySelectorAll(`${gridSelector} > *`)].map(item => item.getBoundingClientRect());
  const gridGaps = [];
  for (let index = 1; index < tiles.length; index++) {
    if (Math.abs(tiles[index].top - tiles[index - 1].top) < 1) gridGaps.push(tiles[index].left - tiles[index - 1].right);
  }
  const children = [...node.children].map(item => item.getBoundingClientRect()).filter(box => box.height > 2);
  const stackGaps = children.slice(1).map((box, index) => box.top - children[index].bottom);
  // R17 (intentional update): a menu ending on a 44px button gives that button's own label inset back from its bottom
  // pad (oakAgent.css), so the bottom is held to the block pad and the other sides to 16px or more.
  return { padding: Math.min(...["Top", "Right", "Left"].map(side => parseFloat(style[`padding${side}`])), parseFloat(style.paddingBottom) >= 12 ? Infinity : 0),
    gap: Math.min(...gridGaps, ...stackGaps), tileCount: tiles.length };
}, grid);

test("D50-G1 contact menu: email card, social tiles, roomy spacing, every behavior kept", async () => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: galleryUrl });
    const page = await context.newPage();

    // Contact menu.
    await openState(page, "contact-menu");
    const contact = page.locator(".oak-contact__popup");
    await contact.waitFor();
    const card = contact.locator(".oak-contact__email");
    const mail = card.locator("a.oak-contact__email-link");
    assert.equal(await mail.getAttribute("href"), "mailto:okkark.pro@gmail.com", "the card is the mailto link");
    assert.equal(await mail.locator(".oak-contact__email-icon svg").count(), 1, "the card leads with a mail icon");
    assert.equal((await mail.locator(".oak-contact__email-label").textContent()).trim(), "Email Steve");
    assert.equal((await mail.locator(".oak-contact__address").textContent()).trim(), "okkark.pro@gmail.com", "the address sits under the label");
    const copy = card.getByRole("button", { name: "Copy email address" });
    assert.equal(await copy.count(), 1, "a trailing copy button lives in the card, outside the link");
    assert.equal(await mail.locator("button").count(), 0);
    const [cardBox, copyBox, mailBox] = await Promise.all([card.boundingBox(), copy.boundingBox(), mail.boundingBox()]);
    assert.ok(copyBox.x >= mailBox.x + mailBox.width - 1 && copyBox.x + copyBox.width <= cardBox.x + cardBox.width, "the copy button trails the card");
    assert.ok(copyBox.width >= 44 && copyBox.height >= 44 && mailBox.height >= 44, "roomy targets");
    assert.equal(await contact.getByRole("button", { name: /Close contact menu/i }).count(), 0, "no text Close button");
    const socials = contact.locator(".oak-contact__socials a");
    assert.equal(await socials.count(), 6);
    for (const name of ["X", "YouTube", "Instagram", "LinkedIn", "Reddit", "Github"]) {
      const tile = contact.getByRole("link", { name: `Steve on ${name} (new tab)` });
      assert.equal(await tile.count(), 1, `${name} tile`);
      assert.equal(await tile.getAttribute("target"), "_blank");
      assert.equal(await tile.locator("svg").count(), 1, `${name} tile has its icon`);
      assert.equal((await tile.innerText()).trim(), name, `${name} tile has a short label`);
    }
    await contact.getByRole("link", { name: "Steve on LinkedIn (new tab)" }).hover();
    await page.getByText("Steve on LinkedIn", { exact: true }).waitFor({ timeout: 3000 });
    const contactSpace = await spacing(contact, ".oak-contact__socials");
    assert.ok(contactSpace.padding >= 16, `contact padding ${contactSpace.padding}`);
    assert.ok(contactSpace.gap >= 8, `contact gaps ${contactSpace.gap}`);
    assert.doesNotMatch(await contact.evaluate(node => [node, ...node.querySelectorAll("*")].map(item => getComputedStyle(item).backgroundImage.replace(/linear-gradient\((?:rgba\(255, 255, 255, [\d.]+\) [\d.]+%(?:, )?)+\)/g, "glass")).join(" ")), /gradient/, "no gradients beyond the glass sheen (R14)");
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/tmp/d50-contact.png" });
    await copy.click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "okkark.pro@gmail.com", "copy still writes the address");
    await card.getByRole("button", { name: "Email address copied" }).waitFor();
    await page.keyboard.press("Escape");
    await contact.waitFor({ state: "hidden" });
    assert.ok(await page.evaluate(() => document.activeElement?.hasAttribute("data-oak-contact-trigger")), "focus returns to Contact Steve");

    await openState(page, "answer-sourced");

    // New conversation, now on the header, still clears the conversation.
    assert.equal(await page.locator('.oak-conversation[data-empty="true"]').count(), 0, "the answer-sourced state starts with a conversation");
    await page.locator(".oak-workspace__header").getByRole("button", { name: "New conversation" }).click();
    await page.locator('.oak-conversation[data-empty="true"]').waitFor({ timeout: 5000 });
    await context.close();
  } finally {
    await browser.close();
  }
});
