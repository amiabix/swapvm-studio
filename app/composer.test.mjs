import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRoute} from './composer.mjs';
const address=n=>'0x'+n.toString(16).padStart(40,'0');
const config={signer:address(1),maker:address(2),author:address(3),tokenIn:address(4),tokenOut:address(5),amount:'12.345678',minOutput:'10',minReturn:'12',feeBps:'25',feeCap:'0.1',allocationIn:'20000',allocationOut:'21000',poolFee:'3000',tickSpacing:'60',minutes:'30',params:'0x'};
test('route inputs preserve token precision and reject ambiguous or unsafe settings',()=>{
 const p=parseRoute(config,{input:6,output:18});assert.equal(p.amount,12345678n);assert.equal(p.feeBps,25n);assert.equal(p.allocationOut,21000n*10n**18n);
 for(const patch of [{amount:'1.0000001'},{amount:'1e3'},{amount:'0'},{amount:'-1'},{tokenIn:config.tokenOut},{author:config.signer},{maker:config.signer},{feeBps:'1001'},{poolFee:'8388608'},{tickSpacing:'0'},{minutes:'0'},{params:'0x1'},{params:'0x'+'aa'.repeat(129)}])assert.throws(()=>parseRoute({...config,...patch},{input:6,output:18}));
});
test('nondefault route ships actual Aqua bytecode and settles through both venues',{skip:process.env.COMPOSER_E2E!=='1'},async()=>{
 const {composerConfig,previewRoute,localSetup,localSimulate,localExecute,recordSetup}=await import('./composer.mjs');
 const c=await composerConfig('local');
 assert.deepEqual(c.symbols,['sUSD','rUTH']);
 const p=await previewRoute({...c.defaults,network:'local',moduleId:'sample',amount:'25',minOutput:'20',minReturn:'20',feeBps:'25',feeCap:'0.25',allocationIn:'500000',allocationOut:'510000'});
 assert.equal(p.module.deployed,false);assert.equal(p.aqua.order.data.slice(0,4),'0x00');
 for(let i=0;i<p.steps.length;i++){const r=await localSetup(p.id,i);assert.deepEqual(await recordSetup(p.id,i,r.hash),r);}
 const sim=await localSimulate(p.id);assert.ok(BigInt(sim.returned)>=20n*10n**18n);
 const r=await localExecute(p.id);assert.equal(r.status,'success');assert.equal(r.moduleDeployed,true);
 assert.deepEqual(r.events.map(e=>e.eventName),['ENSChecked','ProgramReady','AquaFilled','UniswapFilled','AuthorPaid','AtomicExecuted']);
 assert.equal(r.events.at(-1).args.spent,'25000000000000000000');
 assert.equal(BigInt(r.aquaAllocationAfter[0]),500000n*10n**18n+25n*10n**18n);
 await assert.rejects(localExecute(p.id));
});

test('guided UI only offers execution after setup and a preview',async()=>{
 const {tradeView}=await import('./public/composer-view.js');
 const fresh=tradeView(null,null,null);assert.equal(fresh.choose,true);assert.equal(fresh.broadcast,false);
 const preparing={steps:[{}],receipts:[]};assert.equal(tradeView(preparing,null,null).setup,true);assert.equal(tradeView(preparing,{returned:'1'},null).broadcast,false);
 const ready={steps:[{}],receipts:[{status:'success'}]};assert.equal(tradeView(ready,null,null).preview,true);assert.equal(tradeView(ready,null,null).broadcast,false);
 const previewed=tradeView(ready,{returned:'1'},null);assert.equal(previewed.preview,false);assert.equal(previewed.broadcast,true);
 const complete=tradeView(ready,{returned:'1'},{status:'success'});assert.equal(complete.receipt,true);assert.equal(complete.execute,false);assert.equal(complete.broadcast,false);
 assert.equal(tradeView(null,{returned:'1'},null).broadcast,false);
});

test('expired unsent drafts reset, but pending transactions and outages require recovery',async()=>{
 const {draftRecovery}=await import('./public/composer-view.js');
 const saved={id:'expired',network:'sepolia'};
 assert.equal(draftRecovery(saved,'DRAFT_EXPIRED').discard,true);
 assert.equal(draftRecovery(saved,undefined).discard,false);
 for(const pending of [{pendingSetup:{hash:'0x123'}},{pendingExecution:'0x123'}]){
  const result=draftRecovery({...saved,...pending},'DRAFT_EXPIRED');
  assert.equal(result.discard,false);assert.equal(result.hash,'0x123');
 }
 const {savedDraft}=await import('./composer.mjs');
 assert.throws(()=>savedDraft('missing'),{code:'DRAFT_EXPIRED'});
});

test('public signing needs a wallet provider; local test signing does not',async()=>{
 const {walletAvailable}=await import('./public/composer-view.js');
 assert.equal(walletAvailable('sepolia',undefined),false);
 assert.equal(walletAvailable('sepolia',{}),false);
 assert.equal(walletAvailable('sepolia',{request:async()=>[]}),true);
 assert.equal(walletAvailable('local',undefined),true);
});
