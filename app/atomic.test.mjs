import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyReceipt} from './public/atomic-evidence.js';
test('receipt explanations require the exact cause and observed rollback evidence',()=>{
 const r={status:'reverted',traceAvailable:true,balancesAndNonceUnchanged:true,traceError:'minimum return',called:{ens:true,aqua:true,uniswap:true,authorPayment:true}};
 assert.equal(classifyReceipt(r),'rollback');
 for(const patch of [{traceError:'partial hedge'},{traceError:'expired or zero'},{traceError:'signature or nonce'},{traceAvailable:false},{balancesAndNonceUnchanged:false},{called:{ens:true,aqua:true,uniswap:true}}])assert.equal(classifyReceipt({...r,...patch}),'unknown');
 assert.equal(classifyReceipt({...r,traceError:'ENS release mismatch',called:{ens:true,aqua:false,uniswap:false}}),'revoked');
 assert.equal(classifyReceipt({...r,status:'success'}),'success');
});
