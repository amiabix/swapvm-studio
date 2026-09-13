// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
import {readFile} from 'node:fs/promises';
import {inspectHederaTransaction} from '@x402/hedera';
import {createPublicClient,http,isAddress} from 'viem';
import {settlePaidVerification} from './sponsors.mjs';
export const root=new URL('../',import.meta.url);
const rpc=process.env.DELIVERABLE_RPC||'http://127.0.0.1:8549';
export const client=createPublicClient({transport:http(rpc,{timeout:10000})});
export const json=value=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v);
export async function config(){return JSON.parse(await readFile(new URL('artifacts/deliverable-demo.json',root),'utf8'));}
export function validateQuery({maker,positions}={}){
 if(!isAddress(maker||''))throw new Error('Valid maker address required');
 if(!Array.isArray(positions)||positions.length<1||positions.length>128)throw new Error('Supply 1–128 positions');
 for(const p of positions)if(!isAddress(p?.app||'')||!isAddress(p?.token||'')||!/^0x[0-9a-fA-F]{64}$/.test(p?.strategyHash||''))throw new Error('Invalid position');
 return {maker,positions:positions.map(({app,strategyHash,token})=>({app,strategyHash,token}))};
}
export async function inventory(query){
 const c=await config();
 const q=validateQuery(query||{maker:c.results[0].maker,positions:c.results.map(p=>({app:p.router,strategyHash:p.strategyHash,token:p.token}))});
 const artifact=JSON.parse(await readFile(new URL('out/SolventLens.sol/SolventLens.json',root),'utf8'));
 const blockNumber=await client.getBlockNumber({cacheTime:0});
 const rows=await client.readContract({address:c.lens,abi:artifact.abi,functionName:'inventory',args:[c.aqua,q.maker,q.positions],blockNumber});
 return {chainId:await client.getChainId(),blockNumber,maker:q.maker,lens:c.lens,aqua:c.aqua,positions:q.positions.map((p,i)=>({...p,...rows[i]})),notice:'Snapshot only; siblings share backing. Deliverable amounts must not be added as independent liquidity.'};
}
export function assess(snapshot){
 return snapshot.positions.map((p,i)=>({index:i,token:p.token,strategyHash:p.strategyHash,coverageBps:BigInt(p.advertised)>0n?10000n*BigInt(p.deliverable)/BigInt(p.advertised):0n,decision:!p.active||BigInt(p.deliverable)===0n?'do not trade':'request fresh quote and simulate with taker limits'}));
}
export function createPaidInventory({payTo,feePayer,read=inventory,settle=settlePaidVerification}={}){
 // ponytail: single-process receipts; persistent idempotency storage needed before public multi-worker hosting.
 const receipts=new Map();
 return async(query,paymentPayload)=>{
  const q=validateQuery(query);
  if(!/^0\.0\.\d+$/.test(payTo||'')||!/^0\.0\.\d+$/.test(feePayer||''))throw new Error('Hedera payments unconfigured');
  const requirements={scheme:'exact',network:'hedera:testnet',amount:String(q.positions.length*100),payTo,maxTimeoutSeconds:300,asset:'0.0.0',extra:{feePayer}};
  if(!paymentPayload)return {paymentRequired:true,x402Version:2,accepts:[requirements],resource:{description:'Solvent inventory data: 100 tinybars per position',mimeType:'application/json'},meter:{positions:q.positions.length,tinybarsPerPosition:100}};
  const transaction=paymentPayload?.payload?.transaction;
  if(typeof transaction!=='string'||transaction.length===0)throw new Error('Signed Hedera transaction required');
  const key=inspectHederaTransaction(transaction).transactionId,request=json(q);
  const old=receipts.get(key);if(old){if(old.request!==request)throw new Error('Payment already used for another query');return old.result;}
  if(receipts.size>=1000)throw new Error('Receipt capacity reached');
  // Read before charging: a failed RPC must not create a paid, unrecoverable response.
  const result=Promise.resolve().then(()=>read(q)).catch(error=>{receipts.delete(key);throw error;})
   .then(snapshot=>settle({paymentPayload,paymentRequirements:requirements,runVerification:async()=>snapshot}));
  receipts.set(key,{request,result});return result;
 };
}
