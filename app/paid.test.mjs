import test from 'node:test';import assert from 'node:assert/strict';
import {paymentRequirements,createPaidVerifier} from './paid.mjs';
test('verification price scales with campaign size and rejects unbounded compute',()=>{
 const config={payTo:'0.0.123',feePayer:'0.0.456'};
 assert.equal(BigInt(paymentRequirements(256,config).amount),2n*BigInt(paymentRequirements(128,config).amount));
 assert.throws(()=>paymentRequirements(1000000,config),/fuzz/);
 assert.throws(()=>paymentRequirements(128,{}),/configure/);
});
test('retries of the same signed payment reuse the same verification result',async()=>{
 let settled=0,computed=0;
 const service=createPaidVerifier({config:{payTo:'0.0.123',feePayer:'0.0.456'},settle:async({runVerification})=>{settled++;return {response:await runVerification()};},verify:async()=>{computed++;return {passed:true};}});
 const request={source:'contract Candidate { function quote() external {} }',paymentPayload:{payload:{transaction:'unique-payment'}},fuzzRuns:128};
 const [a,b]=await Promise.all([service(request),service(request)]);
 assert.equal(settled,1);assert.equal(computed,1);assert.deepEqual(a,b);
 await assert.rejects(()=>service({...request,source:request.source+' '}),/different/);
});
