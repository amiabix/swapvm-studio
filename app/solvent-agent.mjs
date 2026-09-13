// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// Deterministic inventory agent; never signs Ethereum transactions.
import {ExactHederaScheme,createClientHederaSigner,PrivateKey} from '@x402/hedera';
import {config,inventory,assess,json} from './solvent.mjs';
const c=await config();
const query={maker:c.results[0].maker,positions:c.results.map(p=>({app:p.router,strategyHash:p.strategyHash,token:p.token}))};
let snapshot,payment;
if(process.argv.includes('--paid')){
 const endpoint=process.env.SOLVENT_PAID_URL||'http://127.0.0.1:4181/api/paid-inventory';
 if(!process.env.HEDERA_ACCOUNT_ID||!process.env.HEDERA_PRIVATE_KEY)throw new Error('Configure Hedera account/key locally; no paid request attempted');
 const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:json(query)});
 const challenge=await r.json();if(r.status!==402)throw new Error(challenge.error||'Expected x402 challenge');
 const req=challenge.accepts?.find(r=>r.network==='hedera:testnet'&&r.asset==='0.0.0');
 if(!req||BigInt(req.amount)>12800n)throw new Error('Unsupported payment or exceeds 12800 tinybar cap');
 const supported=await(await fetch('https://api.testnet.blocky402.com/supported')).json();
 const payer=supported.kinds?.find(k=>k.network==='hedera:testnet')?.extra?.feePayer;
 if(!payer||req.extra?.feePayer!==payer)throw new Error('Fee payer mismatch');
 const signer=createClientHederaSigner(process.env.HEDERA_ACCOUNT_ID,PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY),{network:'hedera:testnet'});
 const signed=await new ExactHederaScheme(signer).createPaymentPayload(2,req);
 const payload={x402Version:2,scheme:'exact',network:'hedera:testnet',accepted:req,payload:signed.payload};
 const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','PAYMENT-SIGNATURE':Buffer.from(json(payload)).toString('base64')},body:json(query)});
 const body=await response.json();if(!response.ok||!body.settlement?.success)throw new Error(body.error||'Payment failed');
 snapshot=body.response;payment=body.settlement;
}else snapshot=await inventory(query);
console.log(json({mode:payment?'Hedera-paid inventory assessment':'local unpaid inventory assessment',payment,blockNumber:snapshot.blockNumber,decisions:assess(snapshot),notice:'Rule-based agent. Inventory checks are not a quote, reservation, or execution guarantee.'}));
