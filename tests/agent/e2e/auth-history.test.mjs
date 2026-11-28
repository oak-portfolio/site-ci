import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { withFixture, openGallery, seed, state, savedPanel, screenshot, evidence, draft, cid } from './fixtures/auth-history.mjs';
import { waitForWorkspace } from './fixtures/wait-workspace.mjs';

test('J4 sign in from the agent retains exact draft through Clerk redirect, then sign out clears account content', async () => withFixture(async ({page,requests,errors})=>{
 try {
  await openGallery(page); await seed(page);
  await page.evaluate(()=>history.replaceState(null,'','/?e2e=auth'));
  await page.locator('[data-oak-account-trigger]').click(); await page.getByRole('menuitem',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Complete mocked Clerk sign-in'}).waitFor();
  const retained=await page.evaluate(()=>Object.entries(sessionStorage).find(([key])=>key.includes('auth')));
  assert.ok(retained,'explicit sign-in writes handoff'); assert.ok(retained[1].includes(draft));
  await screenshot(page,'J4-before-redirect');
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.getByRole('button',{name:'Complete mocked Clerk sign-in'}).click()]);
  await waitForWorkspace(page,(w,draft)=>w.getOakWorkspace().authStatus?.kind==='account' && !w.getOakWorkspace().authOpen && w.getOakWorkspace().draft===draft,{arg:draft,timeout:20000});
  await page.waitForTimeout(500);
  assert.equal((await state(page)).draft,draft);
  assert.equal((await state(page)).conversationId,cid);
  assert.equal((await state(page)).messages.length,2);
  assert.equal(requests.filter(r=>r.method==='POST'&&r.path==='/api/oak/conversations').length,0,'sign-in never saves automatically');
  await screenshot(page,'J4-signed-in');
  await page.locator('[data-oak-account-trigger]').click(); await page.getByRole('menuitem',{name:'Sign out',exact:true}).click();
  await waitForWorkspace(page,w=>w.getOakWorkspace().authStatus?.kind==='guest');
  const final=await state(page); assert.equal(final.draft,''); assert.equal(final.messages.length,0); assert.equal(final.conversationId,null);
  assert.equal(errors.length,0,JSON.stringify(errors)); await screenshot(page,'J4-signed-out');
 } catch(error) {await screenshot(page,'J4-failure');writeFileSync(`${evidence}/J4-failure-state.json`,JSON.stringify(await state(page),null,2));throw error;} finally {writeFileSync(`${evidence}/J4-requests.json`,JSON.stringify({requests,errors},null,2));}
}));

test('J5 signed-in saved list, reopen, reload, delete and account panel preserve draft without generating answers',async()=>withFixture(async({page,requests,errors})=>{
 try {
  await openGallery(page); await seed(page,true,false); await savedPanel(page);
  await page.getByRole('button',{name:'Saved conversations',exact:true}).click();
  const open=page.getByRole('button',{name:/Open conversation from .*What did Steve build/}); await open.waitFor();
  await screenshot(page,'J5-list'); await open.click();
  await waitForWorkspace(page,w=>w.getOakWorkspace().historyRestored);
  let current=await state(page); assert.equal(current.messages.length,2); assert.equal(current.draft,draft); assert.equal(current.conversationId,cid);
  await screenshot(page,'J5-reopened');
  await page.reload({waitUntil:'domcontentloaded'}); await page.waitForFunction(()=>document.documentElement.dataset.oakGallery==='ready');
  await page.evaluate(async()=>{const a=await import('/src/lib/oakAccountClient.ts');a.setOakAccountIdentityFixture(undefined);const w=await import('/src/lib/oakWorkspace.ts');await w.refreshOakAuthStatus();});
  await page.keyboard.press('Escape'); await savedPanel(page); await page.getByRole('button',{name:'Saved conversations',exact:true}).click();
  await page.getByRole('button',{name:/Open conversation from .*What did Steve build/}).waitFor();
  await screenshot(page,'J5-after-reload');
  await page.locator('#oak-saved-conversations').getByRole('button',{name:'Conversation actions',exact:true}).click();
  await page.getByRole('menuitem',{name:'Delete saved conversation',exact:true}).click();
  await page.getByRole('button',{name:'Delete',exact:true}).click();
  await waitForWorkspace(page,w=>w.getOakWorkspace().historyLifecycle.phase==='idle');
  const toggle=page.getByRole('button',{name:'Saved conversations',exact:true});
  if(await toggle.getAttribute('aria-expanded')==='true') await toggle.click();
  await toggle.click();
  await page.getByText('No saved conversations yet',{exact:true}).waitFor();
  assert.equal(requests.filter(r=>r.method==='DELETE').length,1);
  await screenshot(page,'J5-deleted');
  await page.locator('[data-oak-account-trigger]').click();
  await page.getByRole('menuitem',{name:'Sign out',exact:true}).waitFor();
  assert.match(await page.locator('.oak-account-menu__name').innerText(),/Mock Visitor/);
  assert.equal(requests.some(r=>/\/turns|\/answers/.test(r.path)),false,'history interactions never dispatch a model answer');
  assert.ok(requests.filter(r=>r.path.startsWith('/api/oak/conversations')).every(r=>r.authorization==='Bearer mock.header.signature'));
  assert.equal(errors.length,0,JSON.stringify(errors)); await screenshot(page,'J5-account');
 } catch(error){await screenshot(page,'J5-failure');writeFileSync(`${evidence}/J5-failure-state.json`,JSON.stringify(await state(page),null,2));throw error;}finally{writeFileSync(`${evidence}/J5-requests.json`,JSON.stringify({requests,errors},null,2));}
},{signed:true}));
