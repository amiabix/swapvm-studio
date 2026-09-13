import test from 'node:test';
import assert from 'node:assert/strict';

test('live demo shows shared backing, failed stock fill, Solvent settlement and revocation', {skip:process.env.SOLVENT_SCENE_TEST!=='1'}, async()=>{
 const base=process.env.SOLVENT_TEST_URL||'http://127.0.0.1:4181';
 const call=async body=>{
  const r=await fetch(base+'/api/scene',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return {status:r.status,data:await r.json()};
 };
 assert.equal((await call({action:'reset'})).status,400);
 let r=await call({action:'reset',confirm:true});assert.equal(r.status,200,JSON.stringify(r.data));let s=r.data;
 assert.equal(s.wallet,'1000000000000000000000');assert.equal(s.positions.length,3);
 assert.equal((await call({action:'consume',confirm:true,id:'stale-scene',expectedStage:0})).status,400);
 const step=async action=>{const r=await call({action,confirm:true,id:s.id,expectedStage:s.stage});assert.equal(r.status,200,JSON.stringify(r.data));s=r.data;};
 assert.equal((await call({action:'solvent',confirm:true,id:s.id,expectedStage:0})).status,400);
 await step('consume');assert.equal(s.wallet,'400000000000000000000');
 assert.equal(s.quotes.stock.amount,'600000000000000000000');assert.equal(s.quotes.solvent.amount,'240000000000000000000');
 await step('stock');assert.equal(s.events.at(-1).status,'reverted');assert.equal(s.wallet,'400000000000000000000');
 await step('solvent');assert.equal(s.events.at(-1).status,'success');assert.equal(s.events.at(-1).amountOut,'240000000000000000000');assert.equal(s.wallet,'160000000000000000000');
 await step('revoke');assert.equal(s.wallet,'160000000000000000000');assert.equal(s.approved,'0');assert.equal(s.quotes.solvent.available,false);
 assert(s.events.every(e=>/^0x[0-9a-f]{64}$/i.test(e.hash)));
 assert.equal((await call({action:'consume',confirm:true,id:s.id,expectedStage:0})).status,400);
});
