import test from 'node:test';
import assert from 'node:assert/strict';
import { anchorHcsReport, buildEnsReleaseRead, buildEnsReleasePin, createReportManifest, sponsorStatus, verifyAndRunPaidCompute } from './sponsors.mjs';

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

test('paid verification requires facilitator verification, settlement, then resource success',async()=>{
 const calls=[];
 const fetch=async(url,init={})=>{
  calls.push([url,init]);
  if(url==='https://facilitator.example/verify') return Response.json({isValid:true,payer:'0.0.42'});
  if(url==='https://facilitator.example/settle') return Response.json({success:true,transaction:'0.0.99@123.000000001',network:'hedera:testnet'});
  return Response.json({report:'paid'}, {headers:{'payment-response':'receipt'}});
 };
 const result=await verifyAndRunPaidCompute({endpoint:'https://compute.example/verify',facilitatorUrl:'https://facilitator.example',paymentPayload:{x402Version:2},paymentRequirements:{network:'hedera:testnet'},fetch});
 assert.equal(result.payer,'0.0.42');
 assert.equal(result.settlement.transaction,'0.0.99@123.000000001');
 assert.equal(result.response.report,'paid');
 assert.match(calls[2][1].headers['X-PAYMENT'],/^[A-Za-z0-9+/=]+$/);
});

test('does not call paid endpoint when settlement fails',async()=>{
 let calls=0;
 const fetch=async url=>{
  calls++;
  return Response.json(url.endsWith('/verify')?{isValid:true,payer:'0.0.42'}:{success:false,errorMessage:'insufficient funds'});
 };
 await assert.rejects(()=>verifyAndRunPaidCompute({endpoint:'https://compute.example',paymentPayload:{},paymentRequirements:{},fetch}),/settlement failed/i);
 assert.equal(calls,2);
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
