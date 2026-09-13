import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {homedir,tmpdir} from 'node:os';
const run=promisify(execFile),cast=join(homedir(),'.foundry/bin/cast');
test('explicit keystore ignores inherited wallet selectors for address and signing',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-keystore-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const password='regression-test-only',env={...process.env};
 for(const key of ['ETH_KEYSTORE_ACCOUNT','ETH_KEYSTORE','ETH_FROM','CAST_PASSWORD','ETH_PASSWORD','ETH_PASSWORD_FILE'])delete env[key];
 await run(cast,['wallet','import','fixture','--keystore-dir',dir,'--mnemonic','test test test test test test test test test test test junk','--unsafe-password',password],{env});
 const polluted={...env,ETH_KEYSTORE_ACCOUNT:'inherited-account-must-not-be-used',ETH_KEYSTORE:'/nonexistent/inherited-keystore',ETH_FROM:'0x0000000000000000000000000000000000000123'};
 const invoke=args=>new Promise((resolve,reject)=>{
  const p=execFile('python3',['script/cast-unlock.py',cast,...args,'--keystore',join(dir,'fixture')],{env:polluted,timeout:15000},(error,stdout,stderr)=>error?reject(new Error(stderr)):resolve(stdout.trim()));
  p.stdin.on('error',()=>{});p.stdin.end(password);
 });
 assert.equal((await invoke(['wallet','address'])).toLowerCase(),'0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
 assert.match(await invoke(['wallet','sign','--no-hash','0x'+'12'.repeat(32)]),/^0x[0-9a-f]{130}$/i);
});
