import { mkdir, writeFile, readFile, rename, open, rm, lstat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const jsonBytes = value => `${JSON.stringify(value, null, 2)}\n`;
export async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const file = await open(temporary, 'wx');
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
  await rename(temporary, path);
  const directory = await open(dirname(path), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
export async function withOwnerLock(root, action) {
  const lock = join(root, 'knowledge/.owner-lock');
  try { await mkdir(lock); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('Owner transaction locked. Read knowledge/.owner-lock/owner.json; do not remove a live lock.'); throw error; }
  try {
    await writeFile(join(lock, 'owner.json'), jsonBytes({ pid: process.pid, started: new Date().toISOString() }), { flag:'wx' });
    return await action();
  } finally { await rm(lock, { recursive:true, force:true }); }
}
export async function assertNoOwnerTransaction(root) {
  try { await lstat(join(root,'knowledge/.owner-lock')); throw new Error('Owner transaction in progress; public builds must wait'); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  try { await readFile(join(root,'knowledge/transaction.json')); throw new Error('Incomplete owner transaction; run lifecycle recover before publication'); }
  catch(error) { if(error.code!=='ENOENT') throw error; }
}

export async function clearAbandonedLock(root) {
  const path=join(root,'knowledge/.owner-lock');
  let bytes;try {bytes=await readFile(join(path,'owner.json'),'utf8');}catch(error){if(error.code==='ENOENT') {try{await lstat(path);throw new Error('Incomplete lock has no owner receipt; retain it for inspection');}catch(check){if(check.code==='ENOENT')return;throw check;}}throw error;}
  const owner=JSON.parse(bytes);
  if(!Number.isInteger(owner.pid)||owner.pid<1)throw new Error('Invalid owner lock; retain for inspection');
  try {process.kill(owner.pid,0);throw new Error('A live owner holds the transaction lock');}catch(error){if(error.code!=='ESRCH')throw error;}
  if(await readFile(join(path,'owner.json'),'utf8')!==bytes)throw new Error('Lock owner changed during recovery');
  const abandoned=`${path}.abandoned-${randomUUID()}`;await rename(path,abandoned);await rm(abandoned,{recursive:true});
}
