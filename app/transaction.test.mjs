import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeTransaction,TRANSACTION_HASH} from './transaction.mjs';
const source=JSON.parse(readFileSync(new URL('./data/sepolia-transaction.json',import.meta.url)));
test('single transaction evidence decodes exact money and rejects mixed receipts',()=>{
 const t=normalizeTransaction(source);
 assert.equal(t.hash,TRANSACTION_HASH);
 assert.deepEqual(t.stages.map(x=>x.eventName),['ENSChecked','ProgramReady','AquaFilled','UniswapFilled','AuthorPaid','AtomicExecuted']);
 assert.equal(t.logs.length,21);assert.equal(t.transfers.length,8);
 assert.equal(t.outcome.spent,'100');assert.equal(t.outcome.returned,'102.630526394150830622');
 assert.equal(t.outcome.fee,'0.9999000099990001');
 assert.equal(t.input.functionName,'executeHedged');assert.equal(t.input.args[0].signer.toLowerCase(),source.tx.from);
 assert.equal(t.logs.filter(x=>x.eventName==='Unknown event').length,0);
 for (const mutate of [x=>x.receipt.transactionHash='0x00',x=>x.block.hash='0x00',x=>x.receipt.logs[3].transactionHash='0x00',x=>x.receipt.logs[0].address=x.tx.from,x=>x.tx.to=x.tx.from]) {
  const x=structuredClone(source);mutate(x);assert.throws(()=>normalizeTransaction(x));
 }
});
test('RPC failure exposes saved evidence without confirmations or a live claim',async()=>{
 const {execFile}=await import('node:child_process');
 const {promisify}=await import('node:util');
 const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',"import {transactionStatus} from './app/transaction.mjs'; console.log(JSON.stringify((await transactionStatus()).connection))"],{cwd:new URL('../',import.meta.url),env:{...process.env,SEPOLIA_RPC_URL:'http://127.0.0.1:1'}});
 const c=JSON.parse(stdout);assert.equal(c.live,false);assert.equal(c.confirmations,null);assert.equal(c.finalized,null);assert.equal(c.checkedAt,null);assert.match(c.message,/saved transaction evidence/);
});
