import test from 'node:test';import assert from 'node:assert/strict';
import {TransferTransaction,TransactionId,Hbar,AccountId} from '@x402/hedera';
import {dispatch} from './solvent-mcp.mjs';import {createPaidInventory,assess,validateQuery} from './solvent.mjs';
const maker='0x0000000000000000000000000000000000001234';
// Offline unsigned transaction fixtures; settlement is explicitly mocked.
const paymentFixture=(memo='')=>({payload:{transaction:Buffer.from(new TransferTransaction().setTransactionId(TransactionId.fromString('0.0.1@1.000000002')).setNodeAccountIds([AccountId.fromString('0.0.3')]).setTransactionMemo(memo).addHbarTransfer('0.0.1',Hbar.fromTinybars(-100)).addHbarTransfer('0.0.2',Hbar.fromTinybars(100)).freeze().toBytes()).toString('base64')}});
const position={app:maker,token:maker,strategyHash:'0x'+'ab'.repeat(32)};
test('MCP handshake, tools, and read errors produce protocol responses',async()=>{
 const call=(method,params)=>dispatch({jsonrpc:'2.0',id:1,method,params},async()=>({blockNumber:10n,positions:[]}));
 assert.equal((await call('initialize',{protocolVersion:'2025-11-25'})).result.protocolVersion,'2025-11-25');
 assert.equal((await call('tools/list')).result.tools[0].annotations.readOnlyHint,true);
 assert.equal((await call('tools/call',{name:'solvent_inventory'})).result.structuredContent.blockNumber,'10');
 assert.equal((await call('tools/call',{name:'unknown'})).error.code,-32602);
 assert.equal(await dispatch({jsonrpc:'2.0',method:'notifications/initialized'}),null);
});
test('inventory validation rejects malformed input before RPC/payment',()=>{
 assert.throws(()=>validateQuery({maker,positions:[{...position,token:'bad'}]}));
 assert.throws(()=>validateQuery({maker,positions:Array(129).fill(position)}));
});
test('paid inventory meters positions and prevents cross-query payment reuse',async()=>{
 let charges=0;const service=createPaidInventory({payTo:'0.0.1',feePayer:'0.0.2',read:async()=>({positions:[]}),settle:async({runVerification})=>{charges++;return {settlement:{success:true},response:await runVerification()}}});
 const q={maker,positions:[position]};assert.equal((await service(q)).accepts[0].amount,'100');
 const payment=paymentFixture();
 await Promise.all([service(q,payment),service(q,payment)]);assert.equal(charges,1);
 await assert.rejects(()=>service({...q,positions:[position,position]},{unused:true,...payment}),/another query/);
 await assert.rejects(()=>service({...q,positions:[position,position]},paymentFixture('different bytes; same transaction ID')),/another query/);
});
test('agent declines zero inventory without treating positive inventory as a fill guarantee',()=>{
 const decisions=assess({positions:[{...position,active:true,advertised:'100',deliverable:'0'},{...position,active:true,advertised:'100',deliverable:'40'}]});
 assert.equal(decisions[0].decision,'do not trade');assert.equal(decisions[1].coverageBps,4000n);
 assert.match(decisions[1].decision,/simulate/);
});

test('failed inventory read does not charge and the same payload can retry',async()=>{
 let fail=true,charges=0;
 const service=createPaidInventory({payTo:'0.0.1',feePayer:'0.0.2',read:async()=>{if(fail)throw Error('RPC unavailable');return {positions:[]}},settle:async({runVerification})=>{charges++;return {settlement:{success:true},response:await runVerification()}}});
 const q={maker,positions:[position]},payment=paymentFixture();
 await assert.rejects(()=>service(q,payment),/RPC unavailable/);assert.equal(charges,0);
 fail=false;await service(q,payment);assert.equal(charges,1);
});
