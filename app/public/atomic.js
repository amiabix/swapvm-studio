import {classifyReceipt} from '/atomic-evidence.js';
const $=id=>document.getElementById(id);
let job=null,prepared=null,lastReceipt=null,busy=false,used=false;
const amount=v=>(Number(v)/1e18).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:6});
async function api(path,data){const r=await fetch(path,data===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw new Error(result.error||`HTTP ${r.status}`);return result;}
function status(text,error=false){$('status').textContent=text;$('status').className=error?'error':'';}
function buttons(){for(const id of ['sample','build'])$(id).disabled=busy;for(const id of ['execute','fail','revoke'])$(id).disabled=busy||!prepared||used;$('prepare').disabled=busy||!job;}
async function action(fn){if(busy)return;busy=true;buttons();try{await fn();}catch(e){status(e.message,true);}finally{busy=false;buttons();}}
function resetRoute(){document.querySelectorAll('[data-stage]').forEach(el=>{el.className='';el.querySelector('.stage-state').textContent='Pending';});$('route-label').textContent='Ready for one authorization';}
async function prepare(sample=false){status('Publishing the ENS release and shipping the strategy. These are setup transactions…');prepared=await api('/api/atomic/prepare',sample?{sample:true}:{jobId:job.id});used=false;resetRoute();$('receipt-panel').hidden=true;$('program').textContent=`Program: ${prepared.module} · not deployed yet`;$('network').textContent='Local chain · 31337';$('network').className='pill good';status('Ready. The signed transaction binds this release, both trades and the minimum final return.');}
$('sample').onclick=()=>action(async()=>{await prepare(true);$('verification-summary').textContent='Previously verified constant-product sample';$('verification').textContent=`Loaded existing verification report ${prepared.reportDigest}. Use Build & verify to run a new campaign. This sample is predetermined.`;});
$('prepare').onclick=()=>action(()=>prepare());
$('build').onclick=()=>action(async()=>{
 const prompt=$('prompt').value.trim();if(prompt.length<3)throw new Error('Describe a strategy first.');
 status('Generating and testing the pricing instruction…');prepared=null;used=false;buttons();
 const created=await api('/api/build',{prompt,mode:$('mode').value});
 while(true){job=await api(`/api/jobs/${created.id}`);$('verification').textContent=(job.events||[]).map(e=>e.message).join('\n')+'\n\n'+(job.attempts||[]).map((a,i)=>`Attempt ${i+1}: ${a.report?.passed?'PASSED':'FAILED'}\n${(a.report?.checks||[]).map(c=>`${c.passed?'PASS':'FAIL'} ${c.name}${c.output?' — '+c.output:''}`).join('\n')}`).join('\n\n');if(job.status!=='running')break;await new Promise(resolve=>setTimeout(resolve,1000));}
 if(job.status!=='passed')throw new Error(job.error||'Verification failed. See the evidence.');
 $('verification-summary').textContent=`${job.attempts.length} attempts · pricing campaign passed`;
 $('prepare').hidden=false;status('Verification passed. Publish the release to prepare execution.');
});
function cell(parent,tag,text){const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;}
function showReceipt(r){
 lastReceipt=r;const classification=classifyReceipt(r),ok=classification==='success',rollback=classification==='rollback',revoked=classification==='revoked';used=r.after.nonceUsed;
 $('receipt-panel').hidden=false;$('result-title').textContent=ok?'Everything settled.':rollback?'Both trades ran. Nothing survived.':revoked?'ENS stopped the route.':'Transaction reverted.';
 $('result-status').textContent=ok?'SUCCESS':'REVERTED';$('result-status').className=`pill ${ok?'good':'bad'}`;
 const event=r.events.find(e=>e.eventName==='AtomicExecuted');
 $('result-copy').textContent=ok?`${amount(event.args.spent)} USD spent → ${amount(event.args.returned)} USD returned. ${amount(event.args.authorFee)} rUTH paid to the program author. Seeded local prices.`:rollback?'Both venue trades and the author payment ran before the minimum-return check reverted. Token balances, the authorization nonce and deployment match their pre-transaction state. Gas was still spent.':revoked?'The live ENS record no longer authorizes this release. No Aqua or Uniswap call occurred.':`Execution reverted. ${r.traceAvailable?(r.traceError||'Inspect the raw trace for the cause.'):'Call trace unavailable; the failing step is not established.'}`;
 $('route-label').textContent=`ONE TRANSACTION · BLOCK ${r.blockNumber}`;
 const stages={ens:r.called.ens,program:r.called.aqua,aqua:r.called.aqua,uniswap:r.called.uniswap,wallet:r.called.uniswap};
 document.querySelectorAll('[data-stage]').forEach(el=>{const stage=el.dataset.stage,called=stages[stage];el.className=ok?'done':called?'rolled':'';el.querySelector('.stage-state').textContent=ok?'Confirmed':called?(stage==='ens'&&revoked?'Release rejected':rollback?'Reverted':'Call observed'):'Not reached';});
 $('receipt-meta').replaceChildren();for(const [key,value] of Object.entries({'Transaction':r.transactionHash,'Block':r.blockNumber,'Gas used':Number(r.gasUsed).toLocaleString(),'Program deployed':`${r.before.moduleExists} → ${r.after.moduleExists}`,'Nonce consumed':`${r.before.nonceUsed} → ${r.after.nonceUsed}`,'State unchanged':String(r.balancesAndNonceUnchanged)})){const div=document.createElement('div');cell(div,'dt',key);cell(div,'dd',value);$('receipt-meta').append(div);}
 $('balances').replaceChildren();for(const role of ['trader','maker','author','executor','pool']){const row=document.createElement('tr');cell(row,'td',role==='pool'?'Uniswap PoolManager':role);for(const [state,token] of [[r.before,'USD'],[r.after,'USD'],[r.before,'rUTH'],[r.after,'rUTH']])cell(row,'td',amount(state[role][token]));$('balances').append(row);}
 $('raw').textContent=JSON.stringify(r,null,2);$('program').textContent=`Program: ${r.module} · ${r.after.moduleExists?'deployed':'still absent'}`;
 status(ok?'Settled in one transaction. Load another demo to repeat.':r.balancesAndNonceUnchanged?'Reverted on-chain. All measured token balances, deployment and nonce are unchanged.':'Transaction reverted; inspect the receipt.');
 $('receipt-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
async function execute(fail=false){status(fail?'Signing the deliberately impossible 1,000 USD minimum and broadcasting…':'Signing the complete route and broadcasting one transaction…');showReceipt(await api('/api/atomic/execute',{id:prepared.id,confirm:true,fail}));}
$('execute').onclick=()=>action(()=>execute());$('fail').onclick=()=>action(()=>execute(true));
$('revoke').onclick=()=>action(async()=>{status('Revoking the ENS release in a separate setup transaction…');await api('/api/atomic/revoke',{});await execute();});
$('download').onclick=()=>{if(!lastReceipt)return;const url=URL.createObjectURL(new Blob([JSON.stringify(lastReceipt,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`atomic-${lastReceipt.transactionHash}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
api('/api/atomic/status').then(c=>{$('network').textContent=c.available?'Local chain · 31337':'Local setup needed';$('network').className=`pill ${c.available?'good':''}`;}).catch(()=>{$('network').textContent='Local node unavailable';});
api('/api/status').then(s=>{if(s.model?.available){const option=$('mode').querySelector('[value="live"]');option.disabled=false;option.textContent='Live model + verification';}}).catch(()=>{});
