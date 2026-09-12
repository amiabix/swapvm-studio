import test from 'node:test';import assert from 'node:assert/strict';
import {payForVerification,verifyHcsMessage} from './hedera-client.mjs';
test('payment client refuses requests without local signing configuration',async()=>{
 await assert.rejects(()=>payForVerification({source:'source',accountId:'',privateKey:''}),/account/);
});
test('HCS mirror verification checks the committed message, not just receipt fields',async()=>{
 const result=await verifyHcsMessage({topicId:'0.0.123',sequenceNumber:'1',message:'expected',fetch:async()=>new Response(JSON.stringify({message:Buffer.from('wrong').toString('base64'),consensus_timestamp:'1.2'}),{status:200})});
 assert.equal(result.verified,false);
});
