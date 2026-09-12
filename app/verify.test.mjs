import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSource, verifyCandidate } from './verify.mjs';
import { repair } from './generate.mjs';

test('rejects candidates trying to replace harness or import code', () => {
  assert.throws(() => validateSource('import "forge-std/Test.sol"; contract Candidate {}'), /import/i);
  assert.throws(() => validateSource('contract Other {}'), /Candidate/);
});
test('repair receives failed report, preserves attempts, and fails closed', async () => {
  const seen=[];
  const result=await repair('make a curve', {maxAttempts:2, generate:async context=>{seen.push(context);return 'candidate '+seen.length;}, verify:async source=>({passed:false,counterexamples:['amount=17'],source}), onEvent:()=>{}});
  assert.equal(result.status,'failed');
  assert.equal(result.attempts.length,2);
  assert.deepEqual(seen[1].previousReport.counterexamples,['amount=17']);
  assert.equal(result.artifact,undefined);
});
test('repair only releases a candidate that passed the fixed verifier', async () => {
  const result=await repair('curve',{generate:async()=> 'candidate',verify:async()=>({passed:true,artifactHash:'0xabc'}),onEvent:()=>{}});
  assert.equal(result.status,'passed');
  assert.equal(result.artifact.artifactHash,'0xabc');
});
test('invalid source is a failed report rather than a released artifact', async()=>{
 const report=await verifyCandidate('import "bad.sol"; contract Candidate {}');
 assert.equal(report.passed,false);
 assert.equal(report.artifactHash,undefined);
});
