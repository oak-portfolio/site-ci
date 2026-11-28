const loadStore = page => page.evaluate(async () => {
  const url = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/src\/lib\/oakWorkspace\.ts(\?|$)/.test(name)) ?? '/src/lib/oakWorkspace.ts';
  window.__oakWorkspaceWait = await import(url);
});

export async function waitForWorkspace(page, predicate, { timeout = 30000, arg } = {}) {
  if (predicate.constructor.name === 'AsyncFunction') throw new TypeError('waitForWorkspace needs a synchronous predicate');
  await loadStore(page);
  await page.waitForFunction(([source, arg]) => {
    const api = window.__oakWorkspaceWait;
    if (!api) return false;
    const held = new Function('api', 'arg', `return (${source})(api, arg);`)(api, arg);
    if (typeof held?.then === 'function') throw new TypeError('waitForWorkspace needs a synchronous predicate');
    return Boolean(held);
  }, [predicate.toString(), arg], { timeout });
}
