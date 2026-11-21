import { chromium } from "playwright";

// Ticket 167 moved these views into their own chunks. On CI's slower runners a chunk can land after an answer settles, so
// every page these suites open serves them late: a fast machine can no longer hide a view that moves the answer when it loads.
export const LAZY_167 = /\/src\/(components\/agent\/(OakShowMeAs|OakAnswerOrnament|OakContactCard)|lib\/openui\/components\/(OwnershipView|ProfileView|QuoteCarousel))\.tsx(\?|$)/;
export const LAZY_DELAY_MS = Number(process.env.OAK_LAZY_DELAY_MS ?? 1200);

export async function slowLazy(context, delay = LAZY_DELAY_MS) {
  await context.route(LAZY_167, async route => { await new Promise(resolve => setTimeout(resolve, delay)); await route.fallback(); });
  return context;
}

/** chromium.launch() whose contexts and pages all serve the lazy chunks late. */
export async function launchSlowLazy(options) {
  const browser = await chromium.launch(options);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => slowLazy(await newContext(...args));
  browser.newPage = async (...args) => (await browser.newContext(...args)).newPage();
  return browser;
}
