const $=id=>document.getElementById(id),form=$('route-form');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=x=>JSON.stringify(x,null,2);
let config=null,plan=null,moduleId='sample',simulation=null,execution=null,busy=false,account=null,pendingSetup=null,pendingExecution=null;
const storageKey='studio-composer-draft';
function remember(){if(plan)sessionStorage.setItem(storageKey,json({id:plan.id,network:plan.network,pendingSetup,pendingExecution}));else sessionStorage.removeItem(storageKey);}
const chain=()=>$('chain').value;
const short=x=>x.slice(0,8)+'…'+x.slice(-6);
const isLocal=()=>chain()==='local';
function link(kind,value,label=value){return isLocal()?`<span class="mono" title="${esc(value)}">${esc(label)}</span>`:`<a href="https://sepolia.etherscan.io/${kind}/${encodeURIComponent(value)}" target="_blank" rel="noopener noreferrer" title="${esc(value)}">${esc(label)}</a>`;}
function units(value,decimals){const n=BigInt(value),base=10n**BigInt(decimals),fraction=String(n%base).padStart(decimals,'0').replace(/0+$/,'');return String(n/base)+(fraction?'.'+fraction:'');}
function fields(entries){return entries.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v}</dd>`).join('');}
function status(s,error=false){$('composer-status').textContent=s;$('composer-status').className=error?'error':'';}
async function api(path,data){const res=await fetch('/api/composer/'+path,data===undefined?{cache:'no-store'}:{method:'POST',headers:{'content-type':'application/json'},body:json(data)});const result=await res.json();if(!res.ok){const error=new Error(result.error||'Request failed');error.reverted=result.reverted;throw error;}return result;}
function controls(){
 $('review').disabled=busy||!config||!moduleId||!!pendingSetup||!!pendingExecution;$('verify').disabled=busy||!config||!!pendingSetup||!!pendingExecution;$('reset-source').disabled=busy||!config||!!pendingSetup||!!pendingExecution;$('chain').disabled=busy||!!pendingSetup||!!pendingExecution;
 for(const element of form.elements)if(element.id!=='review')element.disabled=busy||!!pendingSetup||!!pendingExecution;
 $('source').disabled=busy||!!pendingSetup||!!pendingExecution;$('connect').disabled=busy||isLocal();
 $('setup').disabled=busy||!plan||(!pendingSetup&&plan.receipts.length>=plan.steps.length);
 $('simulate').disabled=busy||!!pendingSetup||!!pendingExecution||!plan||plan.receipts.length<plan.steps.length||!!execution;
 $('broadcast').disabled=busy||!simulation||!!execution;
}
async function action(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){status(e.shortMessage||e.message,true);}finally{busy=false;controls();}}
function invalidate(keepSaved=false){pendingSetup=null;pendingExecution=null;plan=null;if(!keepSaved)remember();simulation=null;execution=null;for(const id of ['review-panel','setup-panel','execution-panel','new-receipt'])$(id).hidden=true;controls();}
async function loadConfig(restore=false){
 const saved=restore?JSON.parse(sessionStorage.getItem(storageKey)||'null'):null;
 if(saved)$('chain').value=saved.network;
 invalidate(!!saved);config=null;status('Reading the deployed executor and loading its pricing sample…');
 config=await api('config?network='+chain());
 for(const [name,value] of Object.entries(config.defaults))form.elements[name].value=value;
 $('token-in-label').textContent='Pay with · '+config.symbols[0]+' token address';$('token-out-label').textContent='Trade through · '+config.symbols[1]+' token address';
 if(!isLocal()&&account)form.elements.signer.value=account;
 $('source').value=config.source;moduleId='sample';$('module-status').textContent='Verified sample';$('module-report').textContent=json({checks:config.module.report.checks,scope:config.module.report.scope,compiler:config.module.report.compiler});
 $('connect').textContent=isLocal()?'Local test accounts':account?short(account):'Connect wallet';
 if(saved){try{const state=await api('draft?id='+encodeURIComponent(saved.id));plan=state.draft;simulation=state.simulation;execution=state.execution;pendingSetup=saved.pendingSetup;pendingExecution=saved.pendingExecution;if(pendingSetup&&plan.receipts[pendingSetup.index]?.hash===pendingSetup.hash)pendingSetup=null;if(pendingExecution&&execution?.hash===pendingExecution)pendingExecution=null;moduleId=plan.moduleId;$('source').value=plan.module.source;
 const a=plan.authorization,h=plan.hedge,t=plan.tokens;const values={...a,amount:units(a.amount,t.input.decimals),minReturn:units(h.minReturn,t.input.decimals),minOutput:units(a.minOutput,t.output.decimals),feeCap:units(a.feeCap,t.output.decimals),allocationIn:units(plan.aqua.allocationIn,t.input.decimals),allocationOut:units(plan.aqua.allocationOut,t.output.decimals),poolFee:h.poolFee,tickSpacing:h.tickSpacing,params:plan.params};for(const [key,value]of Object.entries(values))if(form.elements[key])form.elements[key].value=value;renderPlan();if(execution)showExecution();remember();status(pendingSetup||pendingExecution?'A transaction was already sent. Check its receipt to continue without broadcasting again.':'Restored your reviewed route. Its setup receipts remain on-chain.');return;}catch(e){status('Could not restore the draft. '+(saved.pendingSetup?.hash||saved.pendingExecution||'')+' Inspect any sent transaction on the explorer before preparing a new route.',true);return;}}
 status(isLocal()?'Local Anvil: setup and execution use the four funded development accounts. Every result comes from real contracts.':'Sepolia: inspect the route first. Setup and execution require the authorized browser wallets; the server holds no signing key.');
}
function provider(){if(!window.ethereum)throw new Error('No browser wallet detected. Open this page in a browser with an Ethereum wallet extension.');return window.ethereum;}
async function connect(){const accounts=await provider().request({method:'eth_requestAccounts'});if(!accounts.length)throw new Error('No wallet account selected');account=accounts[0];$('connect').textContent=short(account);if(!plan){form.elements.signer.value=account;invalidate();}status('Connected '+account+'. The trader, maker and release owner may require different accounts.');}
async function requireWallet(expected){const p=provider();const actualChain=Number(await p.request({method:'eth_chainId'}));if(actualChain!==plan.chainId)await p.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x'+plan.chainId.toString(16)}]});const accounts=await p.request({method:'eth_requestAccounts'});if(!accounts[0]||accounts[0].toLowerCase()!==expected.toLowerCase())throw new Error('Select the required signing account in your wallet: '+expected);if(Number(await p.request({method:'eth_chainId'}))!==plan.chainId)throw new Error('Wallet network does not match this route');return p;}
function renderPlan(){
 $('token-in-label').textContent='Pay with · '+plan.tokens.input.symbol+' token address';$('token-out-label').textContent='Trade through · '+plan.tokens.output.symbol+' token address';
 $('review-panel').hidden=false;$('setup-panel').hidden=false;$('execution-panel').hidden=false;
 $('review-network').textContent=plan.network==='local'?'Local · 31337':'Sepolia · 11155111';$('review-time').textContent='Inspected '+new Date(plan.createdAt).toLocaleTimeString()+'. Amounts and addresses below are read from this network.';
 $('token-inspection').innerHTML=Object.entries(plan.tokens).map(([role,t])=>`<article class="token-info"><strong>${esc(role==='input'?'Pay & receive':'Trade through')}: ${esc(t.name)} (${esc(t.symbol)})</strong>${link('token',t.address)}<div class="token-facts"><span>${esc(t.decimals)} decimals</span><span>Trader: ${esc(units(t.traderBalance,t.decimals))} ${esc(t.symbol)}</span><span>Maker: ${esc(units(t.makerBalance,t.decimals))} ${esc(t.symbol)}</span><span>Executor support: ${t.supported?'enabled':'requires owner approval'}</span><span>Trader allowance: ${BigInt(t.traderAllowance)===(1n<<256n)-1n?'unlimited':esc(units(t.traderAllowance,t.decimals))}</span><span>Maker → Aqua allowance: ${BigInt(t.makerAllowance)===(1n<<256n)-1n?'unlimited':esc(units(t.makerAllowance,t.decimals))}</span></div></article>`).join('');
 $('aqua-inspection').innerHTML=fields([['Aqua',link('address',plan.contracts.aqua)],['SwapVM router',link('address',plan.contracts.router)],['Module',link('address',plan.module.address)],['Deployment',esc(plan.module.deployed?'Already deployed':'Not deployed · CREATE2 in final transaction')],['Strategy hash',esc(plan.aqua.orderHash)],['Maker',link('address',plan.authorization.maker)],['Input allocation',esc(units(plan.aqua.allocationIn,plan.tokens.input.decimals))+' '+esc(plan.tokens.input.symbol)],['Output allocation',esc(units(plan.aqua.allocationOut,plan.tokens.output.decimals))+' '+esc(plan.tokens.output.symbol)]]);
 $('order-data').textContent=json({...plan.aqua,opcode:'0: StudioRouter._price → staticcall module.quote'});
 $('ens-inspection').innerHTML=fields([['Resolver',link('address',plan.contracts.resolver)],['Node',esc(plan.contracts.node)],['Record key','swapvm.release'],['Release',esc(plan.release)],['Pinned report',esc(plan.reportDigest)],['Current record',esc(plan.ensRecord)],['Required record',esc(plan.targetEnsRecord)]]);
 $('pool-inspection').innerHTML=fields([['PoolManager',link('address',plan.contracts.manager)],...Object.entries(plan.pool).map(([k,v])=>[k,esc(v)])]);
 $('authorization').textContent=json({authorization:plan.authorization,hedge:plan.hedge});$('module-code').textContent=json({initCode:plan.module.bytecode,runtimeCode:plan.module.runtimeBytecode});$('typed-data').textContent=json(plan.typedData);
 renderSetup();
}
function renderSetup(){
 $('setup-count').textContent=plan.receipts.length+' / '+plan.steps.length+' confirmed';
 $('setup-list').innerHTML=plan.steps.map((s,i)=>{const r=plan.receipts[i];return `<li class="setup-step"><span class="step-icon">${r?'✓':i+1}</span><div><strong>${esc(s.label)}</strong><p>Required signer: ${link('address',s.from)}<br>Contract: ${link('address',s.to)}</p>${s.note?`<p>${esc(s.note)}</p>`:''}${r?`<p class="receipt-link">${link('tx',r.hash)} · block ${esc(r.blockNumber)}</p>`:''}<details class="raw"><summary>Exact call & arguments</summary><pre>${esc(json(s))}</pre></details></div><span class="step-badge${r?' complete':''}">${r?'Confirmed':i===plan.receipts.length?'Next':'Waiting'}</span></li>`;}).join('');
 $('setup').textContent=pendingSetup?'Check pending setup receipt':plan.receipts.length>=plan.steps.length?'Setup complete':isLocal()?'Run setup step '+(plan.receipts.length+1)+' locally':'Sign setup step '+(plan.receipts.length+1);
}
$('chain').onchange=()=>action(loadConfig);$('connect').onclick=()=>action(connect);
form.addEventListener('input',event=>{if(event.target.name==='tokenIn')$('token-in-label').textContent='Pay with · token address (review to identify)';if(event.target.name==='tokenOut')$('token-out-label').textContent='Trade through · token address (review to identify)';invalidate();status('Settings changed. Review the route again before signing.');});
$('source').oninput=()=>{moduleId=null;invalidate();$('module-status').textContent='Unverified edits';status('Pricing code changed. Compile and verify it before preparing a release.');};
$('reset-source').onclick=()=>{if(busy||!config)return;$('source').value=config.source;moduleId='sample';$('module-status').textContent='Verified sample';$('module-report').textContent=json(config.module.report.checks);invalidate();status('Restored the verified sample. Review the route to continue.');};
$('verify').onclick=()=>action(async()=>{invalidate();status('Compiling the edited module and running the fixed verification campaign…');const result=await api('verify',{source:$('source').value});$('module-report').textContent=json(result.report);if(!result.id){moduleId=null;$('module-status').textContent='Verification failed';throw new Error('The edited module failed verification. Open the checks to inspect the counterexample.');}moduleId=result.id;$('module-status').textContent='Edits verified';status('The edited code passed '+result.report.checks.length+' checks. Review the route to inspect its new bytecode and deployment address.');});
form.onsubmit=event=>{event.preventDefault();const values=Object.fromEntries(new FormData(form));void action(async()=>{invalidate();status('Reading token balances, the ENS release and the selected Uniswap pool…');plan=await api('preview',{...values,network:chain(),moduleId});remember();renderPlan();status('Route reviewed. Inspect the module, strategy bytes and signing requirements, then publish the setup.');});};
$('setup').onclick=()=>action(async()=>{const index=pendingSetup?.index??plan.receipts.length,s=plan.steps[index];if(!s)return;status('Preparing '+s.label+'…');let receipt;
 try{if(isLocal())receipt=await api('local-setup',{id:plan.id,index,confirm:true});else{
  if(!pendingSetup){const wallet=await requireWallet(s.from);const tx=await api('setup-transaction',{id:plan.id,index});const hash=await wallet.request({method:'eth_sendTransaction',params:[tx]});pendingSetup={index,hash};remember();}
  status('Setup transaction sent: '+pendingSetup.hash+'. Waiting for its receipt…');receipt=await api('setup-receipt',{id:plan.id,index,hash:pendingSetup.hash});
 }}catch(e){if(e.reverted)pendingSetup=null;remember();renderSetup();throw e;}
 pendingSetup=null;plan.receipts.push(receipt);remember();renderSetup();status(plan.receipts.length===plan.steps.length?'Setup confirmed. Now sign and simulate the complete atomic route.':'Setup confirmed. Review the next signing requirement.');});
$('simulate').onclick=()=>action(async()=>{simulation=null;status('Signing the route, then simulating deployment and both trades without spending tokens…');if(isLocal())simulation=await api('local-simulate',{id:plan.id,confirm:true});else{const wallet=await requireWallet(plan.authorization.signer);const signature=await wallet.request({method:'eth_signTypedData_v4',params:[plan.authorization.signer,json(plan.typedData)]});simulation=await api('simulate',{id:plan.id,signature});}$('simulation-result').textContent='Simulation returned '+units(simulation.returned,plan.tokens.input.decimals)+' '+plan.tokens.input.symbol+' at block '+simulation.blockNumber+'. Your minimum is '+units(plan.hedge.minReturn,plan.tokens.input.decimals)+'. No transaction has been sent.';remember();status('Simulation passed. Review the returned amount, then send the exact signed transaction.');});
function showExecution(){
 plan.module.deployed=execution.moduleDeployed;renderPlan();
 $('new-receipt').hidden=false;$('execution-title').textContent=execution.status==='success'?'Your route settled in one transaction.':'Your atomic transaction reverted.';
 const final=execution.events.find(e=>e.eventName==='AtomicExecuted');
 $('execution-meta').innerHTML=`<p>${link('tx',execution.hash)}</p><p>Block ${esc(execution.blockNumber)} · ${esc(execution.gasUsed)} gas · ${esc(execution.network)}</p>${final?`<p>${esc(units(final.args.spent,plan.tokens.input.decimals))} ${esc(plan.tokens.input.symbol)} spent → ${esc(units(final.args.returned,plan.tokens.input.decimals))} ${esc(plan.tokens.input.symbol)} returned. Author received ${esc(units(final.args.authorFee,plan.tokens.output.decimals))} ${esc(plan.tokens.output.symbol)}.</p>`:''}<p>Module ${link('address',execution.module)} · ${execution.moduleDeployed?'deployed':'not deployed'}</p>`;
 $('execution-events').innerHTML=execution.events.map(e=>`<li>${esc(e.eventName)}<span>Log ${esc(e.logIndex)} · same transaction</span></li>`).join('');$('execution-raw').textContent=json(execution);
 $('aqua-inspection').innerHTML+=fields([['After execution',esc(json({moduleDeployed:execution.moduleDeployed,remainingAllocation:execution.aquaAllocationAfter}))]]);
 status(execution.status==='success'?'Confirmed. This is your newly configured trade, not the recorded sample.':'The execution reverted. Inspect the receipt; gas was spent. Review a new route to retry.');
 $('new-receipt').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
$('broadcast').onclick=()=>action(async()=>{if(!simulation)throw new Error('Sign and simulate first');status('Broadcasting the reviewed atomic transaction…');if(isLocal())execution=await api('local-execute',{id:plan.id,confirm:true});else{
 if(!pendingExecution){const wallet=await requireWallet(plan.authorization.signer);pendingExecution=await wallet.request({method:'eth_sendTransaction',params:[simulation.transaction]});remember();}
 $('broadcast').textContent='Check pending execution receipt';status('Atomic transaction sent: '+pendingExecution+'. Waiting for confirmation…');execution=await api('execution-receipt',{id:plan.id,hash:pendingExecution});
 }pendingExecution=null;remember();showExecution();});
$('download-route').onclick=()=>{if(!execution)return;const url=URL.createObjectURL(new Blob([json({draft:plan,simulation,execution})],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='studio-route-'+execution.hash.slice(2,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
void action(()=>loadConfig(true));
