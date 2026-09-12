import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorHcsReport, buildEnsReleaseRead, buildEnsReleasePin, createReportManifest, settlePaidVerification, sponsorStatus } from './sponsors.mjs';

const report={artifactHash:'0xabc',sourceHash:'0xdef',harnessHash:'0x123',passed:true,signature:'0xsigned'};

test('report manifest binds the complete report and ENS calldata pins that digest',()=>{
 const manifest=createReportManifest(report);
 assert.match(manifest.digest,/^0x[0-9a-f]{64}$/);
 const pin=buildEnsReleasePin({name:'swapvm.eth',resolver:'0x0000000000000000000000000000000000000001',report});
 assert.equal(pin.to,'0x0000000000000000000000000000000000000001');
 assert.ok(pin.data.startsWith('0x'));
 assert.equal(pin.manifest.digest,manifest.digest);
 assert.ok(buildEnsReleaseRead({name:'swapvm.eth',resolver:pin.to}).data.startsWith('0x'));
});

test('resource server verifies and settles once before its local verifier runs',async()=>{
 const calls=[];
 let runs=0;
 const fetch=async(url,init={})=>{
  calls.push([url,init]);
  if(url==='https://facilitator.example/verify') return Response.json({isValid:true,payer:'0.0.42'});
  if(url==='https://facilitator.example/settle') return Response.json({success:true,transaction:'0.0.99@123.000000001',network:'hedera:testnet'});
 };
 const result=await settlePaidVerification({facilitatorUrl:'https://facilitator.example',paymentPayload:{x402Version:2},paymentRequirements:{network:'hedera:testnet'},runVerification:async payment=>{runs++;assert.equal(payment.payer,'0.0.42');return {report:'paid'};},fetch});
 assert.equal(result.payer,'0.0.42');
 assert.equal(result.settlement.transaction,'0.0.99@123.000000001');
 assert.equal(result.response.report,'paid');
 assert.equal(calls.length,2);
 assert.equal(runs,1);
});

test('failed facilitator verification or settlement never runs the local verifier',async()=>{
 let calls=0;
 let runs=0;
 const fetch=async url=>{
  calls++;
  return Response.json(url.endsWith('/verify')?{isValid:true,payer:'0.0.42'}:{success:false,errorMessage:'insufficient funds'});
 };
 await assert.rejects(()=>settlePaidVerification({paymentPayload:{},paymentRequirements:{},runVerification:async()=>runs++,fetch}),/settlement failed/i);
 assert.equal(calls,2);
 assert.equal(runs,0);
 await assert.rejects(()=>settlePaidVerification({paymentPayload:{},paymentRequirements:{},runVerification:async()=>runs++,fetch:async()=>Response.json({isValid:false,invalidReason:'bad'})}),/verification rejected/i);
 assert.equal(runs,0);
});

test('HCS anchor rejects a relay response without a consensus receipt',async()=>{
 await assert.rejects(()=>anchorHcsReport({endpoint:'https://anchor.example',topicId:'0.0.7',report,fetch:async()=>Response.json({accepted:true})}),/receipt/i);
 assert.deepEqual(sponsorStatus({}),{blocky402:'unconfigured',hcs:'unconfigured',ens:'unconfigured'});
});

test('HCS anchor returns only a relay-issued consensus receipt',async()=>{
 const result=await anchorHcsReport({endpoint:'https://anchor.example',topicId:'0.0.7',report,fetch:async()=>Response.json({topicId:'0.0.7',transactionId:'0.0.8@123.000000001',consensusTimestamp:'123.000000001'})});
 assert.equal(result.receipt.transactionId,'0.0.8@123.000000001');
 assert.match(result.manifest.reportDigest,/^0x[0-9a-f]{64}$/);
});

test('ENS execution pin uses the exact 64-byte release/report tuple',async()=>{
 const {buildEnsGatePin}=await import('./sponsors.mjs');
 const result=buildEnsGatePin({name:'module.eth',resolver:'0x1111111111111111111111111111111111111111',initCodeHash:'0x'+'11'.repeat(32),runtimeCodeHash:'0x'+'22'.repeat(32),author:'0x2222222222222222222222222222222222222222',feeBps:100,reportDigest:'0x'+'33'.repeat(32)});
 assert.equal(result.value.length,130);assert.equal(result.value.slice(2,66),result.releaseKey.slice(2));assert.equal(result.value.slice(66),'33'.repeat(32));
});
