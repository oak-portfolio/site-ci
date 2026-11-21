import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { base, evidence } from './guest.mjs';

export { evidence };
export const cid = '11111111-1111-4111-8111-111111111111';
export const tid = '22222222-2222-4222-8222-222222222222';
export const key = `pk_test_${Buffer.from('unit.clerk.accounts.dev$').toString('base64')}`;
export const draft = 'Unsent visitor draft survives sign-in round trip.';
export const answer = { schema: 'oak.answer.v1', speaker: 'oak-ai-host', characterVersion: 'one', hardPolicyVersion: 'one', knowledgeRevision: 'one', operations: ['read'], kind: 'sourced', acknowledgment: null, claims: [{ id: 'claim-1', text: 'Steve built EcoSmartLoop.', citations: [{ documentId: 'work:ecosmartloop', passageId: 'ecosmartloop:passage-001', sectionId: 'ecosmartloop:section-001', url: 'https://steveoak.com/work/ecosmartloop' }] }] };
export const messages = [ { id: `${tid}:user`, role: 'user', text: 'What did Steve build?', page: '/', taskKind: 'question', answer: null, cards: [] }, { id: tid, role: 'assistant', text: 'Steve built EcoSmartLoop.', page: '/', taskKind: 'question', answer, cards: [] } ];
export function authStatus(signed = false) { return { configured: true, kind: signed ? 'account' : 'guest', phase: signed ? 'ready' : 'guest', role: 'visitor', publishableKey: key, purpose: signed ? 'exploring' : null, allowance: { answers: { limit: 6, remaining: 6, refillsAt: null }, window: { completed: 0, pending: 0, limit: 100, remaining: 100 } } }; }
function recordOf() { const now = Date.now(); return { conversationId: cid, version: 1, messages, createdAt: now, lastSavedMessageAt: now, updatedAt: now, expiresAt: now + 30 * 86400000, lastNewSavedMessageId: tid }; }
const clerkStub = `
export class Clerk {
 constructor() { this.listeners = new Set(); this.restore(); window.__mockClerk = this; }
 restore() { const signed = document.cookie.includes('mock_auth=yes'); this.session = signed ? {id:'mock-session', status:'active', getToken:async()=> 'mock.header.signature'} : null; this.user = signed ? {id:'mock-user', fullName:'Mock Visitor', firstName:'Mock', primaryEmailAddress:{emailAddress:'visitor@example.com'}} : null; }
 async load() { this.restore(); }
 addListener(fn, options) { this.listeners.add(fn); if (options?.skipInitialEmit === false) fn(); return ()=>this.listeners.delete(fn); }
 mountSignIn(node, options) { window.__mockRedirect = options.forceRedirectUrl; const button=document.createElement('button'); button.textContent='Complete mocked Clerk sign-in'; button.onclick=()=>{document.cookie='mock_auth=yes; path=/'; window.location.assign(options.forceRedirectUrl);}; node.replaceChildren(button); }
 unmountSignIn(node) { node.replaceChildren(); }
 async signOut() { document.cookie='mock_auth=; Max-Age=0; path=/'; this.restore(); for(const fn of this.listeners) fn(); }
}`;
export async function withFixture(run, {signed = false} = {}) {
  mkdirSync(evidence, {recursive:true});
  const browser = await chromium.launch(); const context = await browser.newContext({viewport:{width:1280,height:900}, reducedMotion:'reduce'}); const page = await context.newPage();
  const requests = [], errors = []; let record = recordOf();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === 'unit.clerk.accounts.dev') return route.fulfill({contentType:'application/javascript',body:'window.__internal_ClerkUICtor = class MockUI {};'});
    if (url.pathname.includes('clerk') && url.pathname.endsWith('.js') && !url.pathname.startsWith('/src/')) return route.fulfill({contentType:'application/javascript',body:clerkStub});
    if (url.pathname.startsWith('/api/oak/')) {
      const entry={method:request.method(),path:url.pathname,authorization:request.headers().authorization ?? null,body:request.postDataJSON()}; requests.push(entry);
      const send = body => route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
      const account = (request.headers().cookie ?? '').includes('mock_auth=yes');
      if(url.pathname === '/api/oak/auth/status') return send(authStatus(account));
      if(url.pathname === '/api/oak/auth/sign-in-config') return send({kind:'sign-in-config',configured:true,publishableKey:key});
      if(url.pathname === '/api/oak/funnel') return route.fulfill({status:204,body:''});
      if(url.pathname === '/api/oak/conversations') {
        if(request.method()==='GET') { const {messages:items,...fields}=record ?? {}; return send({conversations:record ? [{...fields,messageCount:items.length,title:items[0].text}] : [],nextCursor:null}); }
        if(request.method()==='POST') { record={...recordOf(),messages:entry.body.messages}; return send(record); }
      }
      if(url.pathname === '/api/oak/conversations/'+cid) {
        if(request.method()==='GET') return record ? send(record) : route.fulfill({status:404,contentType:'application/json',body:'{}'});
        if(request.method()==='DELETE') { const value={conversationId:cid,operationId:entry.body.operationId,removedAt:Date.now(),lastVersion:record.version,reason:'deleted',applicationHistory:'removed',cleanup:'complete',result:'removed'}; record=null; return send(value); }
      }
      return route.fulfill({status:503,contentType:'application/json',body:'{}'});
    }
    if (url.origin !== base) return route.abort();
    return route.continue();
  });
  if(signed) await context.addCookies([{name:'mock_auth',value:'yes',url:base}]);
  try { await run({page,requests,errors,context}); } finally { await browser.close(); }
}
export async function openGallery(page) {
 await page.goto(`${base}/__dev/oak-states?state=account-menu`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>document.documentElement.dataset.oakGallery==='ready',null,{timeout:30000});
 await page.keyboard.press('Escape');
 await page.evaluate(async status=>{const workspace=await import('/src/lib/oakWorkspace.ts'); workspace.setOakWorkspaceFixture({authStatus:status});},authStatus());
}
export async function seed(page, signed = false, transcript = true) {
 await page.evaluate(async ({status,draft,cid,messages})=>{
 const workspace=await import('/src/lib/oakWorkspace.ts');
 workspace.setOakWorkspaceFixture({authStatus:status,conversationId:messages.length?cid:null,messages:messages.map(message=>({...message,state:'complete',usage:null})),draft,historyOpen:false,historyLoaded:false,savedConversations:[],savedRecord:null,authOpen:false,authError:null,authReauthenticate:false});
 const account=await import('/src/lib/oakAccountClient.ts'); account.setOakAccountIdentityFixture(undefined);
 if(status.kind==='account') await account.resumeOakAccount(status.publishableKey);
 },{status:authStatus(signed),draft,cid,messages:transcript?messages:[]});
}
export const state = page => page.evaluate(async()=>{const workspace=await import('/src/lib/oakWorkspace.ts');return workspace.getOakWorkspace();});
export async function savedPanel(page) { await page.locator('[data-oak-account-trigger]').click(); await page.getByRole('menuitem',{name:'Saved chats',exact:true}).click(); }
export async function screenshot(page,name) { await page.screenshot({path:`${evidence}/${name}.png`,fullPage:true}); }
