import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const live = process.env.OAK_E2E_LIVE_CONTRACTS === '1';
const paths = ['/api/oak/owner/usage', '/api/oak/owner/usage/daily', '/api/oak/owner/services', '/api/oak/owner/alerts/history', '/api/oak/owner/evaluation', '/api/oak/owner/grants', '/api/oak/owner/keys',
  '/llms.txt', '/llms-full.txt', '/api/md', '/profile.json', '/skill.md', '/robots.txt', '/api/oak/health'];
for (const pathname of paths) test(`J12 GET ${pathname} signed out`, { skip: !live }, () => {
  const raw = execFileSync('curl', ['-sS', '--max-time', '30', '-L', '-w', '\n%{http_code}', `https://steveoak.com${pathname}`], { encoding: 'utf8' });
  const split = raw.lastIndexOf('\n'), body = raw.slice(0, split), status = Number(raw.slice(split + 1));
  assert.equal(status, pathname.startsWith('/api/oak/owner/') ? 403 : 200);
  const privatePattern = /\/Users\/|\/home\/oak\/|\.scratch\/|\.dev\.vars|sk-or-v1-[a-zA-Z0-9]{16,}|Bearer\s+[a-zA-Z0-9._-]{16,}|BEGIN PRIVATE KEY|internal notes|PRIVATE_.*CANARY/i;
  assert.ok(!privatePattern.test(body), `${pathname}: private-content pattern detected, body withheld`);
  if (pathname === '/api/oak/health') assert.equal(JSON.parse(body).ok, true);
  console.log(JSON.stringify({ pathname, status, bytes: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') }));
});

test('J12 owner console stays off the public visitor surface', { skip: !live }, () => {
  for (const pathname of ['/__dev/owner-keys', '/__dev/oak-states']) {
    const status = execFileSync('curl', ['-sS', '--max-time', '30', '-o', '/dev/null', '-w', '%{http_code}', `https://steveoak.com${pathname}`], { encoding: 'utf8' });
    assert.equal(status, '404');
  }
  for (const pathname of ['/owner/services', '/owner/console']) {
    const headers = execFileSync('curl', ['-sS', '--max-time', '30', '-D', '-', '-o', '/dev/null', `https://steveoak.com${pathname}`], { encoding: 'utf8' });
    assert.match(headers, /^HTTP\/2 302/m, pathname);
    assert.match(headers, /^location: (?:https:\/\/steveoak\.com)?\/\r?$/mi, pathname);
  }
});
