import {settlePaidVerification} from './sponsors.mjs';
import {verifyCandidate,validateSource,digest} from './verify.mjs';
export function paymentRequirements(fuzzRuns,{payTo,feePayer}={}) {
 if(!/^0\.0\.\d+$/.test(payTo||'')||!/^0\.0\.\d+$/.test(feePayer||''))throw new Error('Hedera service is not configured: configure payTo and discovered feePayer');
 if(!Number.isInteger(fuzzRuns)||fuzzRuns<32||fuzzRuns>1024)throw new Error('fuzzRuns must be an integer from 32 to 1024');
 // Seven fuzz properties: charge 100 tinybars per sampled property execution.
 return {scheme:'exact',network:'hedera:testnet',amount:String(BigInt(fuzzRuns)*700n),payTo,maxTimeoutSeconds:300,asset:'0.0.0',extra:{feePayer}};
}
export function createPaidVerifier({config={},settle=settlePaidVerification,verify=verifyCandidate}={}) {
 // ponytail: in-memory receipt cache supports one process; use durable receipts before public multi-process hosting.
 const receipts=new Map();
 return async ({source,fuzzRuns=128,paymentPayload})=>{
  validateSource(source);
  const requirements=paymentRequirements(fuzzRuns,config);
  if(!paymentPayload)return {paymentRequired:true,x402Version:2,accepts:[requirements],resource:{description:'SwapVM pricing verification: 7 fuzz properties, 2 boundary checks',mimeType:'application/json'},meter:{fuzzRuns,properties:7,tinybarsPerPropertySample:100}};
  const paymentId=digest(JSON.stringify(paymentPayload));const requestId=digest(JSON.stringify({source,fuzzRuns}));
  const old=receipts.get(paymentId);if(old){if(old.requestId!==requestId)throw new Error('Payment already bound to a different request');return old.result;}
  if(receipts.size>=1000)throw new Error('Payment receipt capacity reached');
  const result=settle({paymentPayload,paymentRequirements:requirements,runVerification:()=>verify(source,{fuzzRuns})});
  receipts.set(paymentId,{requestId,result});return result;
 };
}
