const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const explorer='https://sepolia.etherscan.io';
const short=s=>s.slice(0,8)+'…'+s.slice(-6);
const link=(kind,value,label=value)=>`<a href="${explorer}/${kind}/${encodeURIComponent(value)}" target="_blank" rel="noopener noreferrer" title="${esc(value)}">${esc(label)}</a>`;
const stringify=x=>JSON.stringify(x,null,2);
const amount=(s,digits=6)=>{const [whole,fraction='']=String(s).split('.');return BigInt(whole).toLocaleString('en-US')+(fraction.slice(0,digits).replace(/0+$/,'')?'.'+fraction.slice(0,digits).replace(/0+$/,''):'');};
const units=s=>{const n=BigInt(s);const whole=n/10n**18n;const fraction=String(n%10n**18n).padStart(18,'0').replace(/0+$/,'');return String(whole)+(fraction?'.'+fraction:'');};
const integer=s=>BigInt(s).toLocaleString('en-US');
const date=s=>new Date(Number(s)*1000).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'UTC'})+' UTC';
const rows=entries=>entries.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${v}</dd>`).join('');
let data,busy=false,renderedBlock=null;
function label(address){
 const names={executor:'Atomic executor',router:'SwapVM router',aqua:'Aqua',manager:'Uniswap PoolManager',resolver:'ENS resolver',input:'Demo USD · sUSD',output:'Demo rUTH',maker:'Maker account',author:'Module author',liquidity:'Liquidity seeder'};
 if(address.toLowerCase()===data.tx.from.toLowerCase())return 'User wallet';
 if(address.toLowerCase()===data.stages[1].args.module.toLowerCase())return 'Strategy module';
 for(const [key,value] of Object.entries(data.contracts))if(typeof value==='string'&&value.toLowerCase()===address.toLowerCase())return names[key]||key;
 return short(address);
}
const party=address=>`<div class="transfer-party">${link('address',address,label(address))}<small>${esc(short(address))}</small></div>`;
const raw=value=>`<pre>${esc(stringify(value))}</pre>`;
function eventDetails(l){return `<p class="muted">Emitted by ${link('address',l.address,label(l.address))} · log ${esc(l.logIndex)}</p>${raw(l.args)}<details class="raw"><summary>Raw log & transaction binding</summary>${raw(l)}</details>`;}
function stages(){
 const descriptions=[
  ['ENS release checked','The pinned resolver record matched the signed release digest.'],
  ['Strategy module deployed','CREATE2 deployed the authorized code during this transaction.'],
  ['SwapVM → Aqua',`${amount(units(data.stages[2].args.amountIn))} sUSD traded for ${amount(units(data.stages[2].args.grossOutput))} rUTH.`],
  ['Uniswap v4 swap',`${amount(units(data.stages[3].args.amountIn))} rUTH traded for ${amount(units(data.stages[3].args.amountOut))} sUSD.`],
  ['Module author paid',`${amount(units(data.stages[4].args.amount))} rUTH paid for the executed module.`],
  ['Wallet settled',`${amount(data.outcome.returned)} sUSD returned. The final minimum-return check passed.`]
 ];
 return data.stages.map((l,i)=>`<li class="stage"><span class="stage-number" aria-hidden="true">${String(i+1).padStart(2,'0')}</span><details><summary><div class="stage-summary"><h3>${esc(descriptions[i][0])}</h3><p>${esc(descriptions[i][1])}</p></div><span class="stage-label">Log ${esc(l.logIndex)}</span></summary><div class="event-data">${eventDetails(l)}</div></details></li>`).join('');
}
function renderReceipt(){
 $('hash').textContent=data.hash;$('hash').href=explorer+'/tx/'+data.hash;
 $('returned').textContent=amount(data.outcome.returned);
 $('returned-exact').textContent=data.outcome.returned+' sUSD · exact';
 $('spent').textContent=amount(data.outcome.spent)+' sUSD';
 $('fee').textContent=amount(data.outcome.fee)+' rUTH';$('fee').title=data.outcome.fee+' rUTH';
 $('stages').innerHTML=stages();
 $('block-label').textContent='Block '+integer(data.block.number);
 $('receipt-counts').textContent=`1 transaction · ${data.logs.length} logs · ${data.transfers.length} token transfers`;
 $('transfers').innerHTML=data.transfers.map(l=>`<tr><td class="log-number">${esc(l.logIndex)}</td><td>${party(l.args.from)}</td><td>${party(l.args.to)}</td><td class="numeric transfer-value">${esc(l.amount??l.args.value)}<span>${esc(l.token??'raw units')}</span></td></tr>`).join('');
 $('transfer-count').textContent=data.transfers.length;$('event-count').textContent=data.logs.length;
 $('network-details').innerHTML=rows([
  ['Network','Ethereum Sepolia · chain ID 11155111'],['Status','Successful receipt'],['Transaction hash',link('tx',data.hash)],
  ['Block',link('block',data.block.number,integer(data.block.number))],['Block hash',`<span class="mono">${esc(data.block.hash)}</span>`],['Timestamp',esc(date(data.block.timestamp))],
  ['Block position',esc(data.tx.transactionIndex)+' (zero-based)'],['From',link('address',data.tx.from)],['To',link('address',data.tx.to)],
  ['ETH transferred',esc(units(data.tx.value))+' ETH'],['Transaction fee',esc(data.gas.fee)+' ETH'],['Gas used / limit',integer(data.receipt.gasUsed)+' / '+integer(data.tx.gas)+' ('+esc(data.gas.usedPercent)+'%)'],
  ['Effective gas price',esc(data.gas.price)+' Gwei'],['Base fee',esc(data.gas.baseFee)+' Gwei'],['Max fee',esc(data.gas.maxFee)+' Gwei'],['Priority fee cap',esc(data.gas.priorityCap)+' Gwei'],['Fee burnt',esc(data.gas.burnt)+' ETH'],
  ['Transaction type',esc(data.tx.type)+' (type 2)'],['Nonce',esc(data.tx.nonce)],['Method selector',`<span class="mono">${esc(data.tx.input.slice(0,10))}</span>`],['Input size',integer((data.tx.input.length-2)/2)+' bytes'],
  ['Raw transaction',`<details class="raw"><summary>Show complete transaction</summary>${raw(data.tx)}</details>`],['Raw receipt',`<details class="raw"><summary>Show complete receipt</summary>${raw(data.receipt)}</details>`]
 ]);
 $('method').textContent=data.input.functionName+'(…)';
 const inputNames=['Trade authorization','Hedge & ENS binding','Module init code','Strategy parameters','Wallet signature'];
 $('input-args').innerHTML=data.input.args.map((a,i)=>`<details${i===0?' open':''}><summary>${esc(inputNames[i])}</summary>${raw(a)}</details>`).join('');
 $('calldata').textContent=data.tx.input;
 $('events').innerHTML=data.logs.map(l=>`<details><summary><span class="log-number">${esc(l.logIndex)}</span>${esc(l.eventName)} <span class="muted">· ${esc(label(l.address))}</span></summary>${eventDetails(l)}</details>`).join('');
 const relevant={...data.contracts,module:data.stages[1].args.module};
 $('contracts').innerHTML=rows(Object.entries(relevant).filter(([,v])=>typeof v==='string').map(([k,v])=>[k==='node'?'ENS node':label(v),v.length===42?link('address',v):`<span class="mono">${esc(v)}</span>`]));
 $('loading').hidden=true;$('content').hidden=false;
}
function renderLive(){
 const c=data.connection;
 $('receipt-status').textContent=c.live?'Successful receipt':'Saved successful receipt';
 const time=c.checkedAt?new Date(c.checkedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):null;
 $('connection').innerHTML=`<span class="status-dot${c.live?'':' pending'}"></span>`+(c.live?`Live RPC · Checked ${esc(time)} · Head ${integer(c.head)}`:`Saved evidence · ${time?'Last RPC check '+esc(time):'Live status unavailable'}`);
 $('notice').hidden=c.live;$('notice').textContent=c.live?'':c.message;
 $('facts').innerHTML=rows([
  ['Network','Ethereum Sepolia'],['Block',link('block',data.block.number,integer(data.block.number))],
  ['Finality',c.live?(c.finalized===null?'Unavailable':c.finalized?'Finalized':'Confirming'):'Unverified'],
  ['Confirmations',c.live?integer(c.confirmations):'Unverified'],['Included at',esc(new Date(Number(data.block.timestamp)*1000).toLocaleTimeString('en-GB',{timeZone:'UTC'}))+' UTC'],
  ['Gas used',integer(data.receipt.gasUsed)],['Fee paid',`<span title="${esc(data.gas.fee)} ETH">${esc(amount(data.gas.fee,9))} ETH</span>`],
  ['Sender',link('address',data.tx.from,short(data.tx.from))],['Executor',link('address',data.tx.to,short(data.tx.to))]
 ]);
}
async function refresh(){
 if(busy)return;busy=true;$('refresh').disabled=true;
 try{
  const response=await fetch('/api/transaction',{cache:'no-store',signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error('Receipt request failed');
  const next=await response.json();if(!next.hash||!next.connection||!Array.isArray(next.stages))throw new Error('Invalid receipt response');
  data=next;
  if(renderedBlock!==data.block.hash){renderReceipt();renderedBlock=data.block.hash;}
  renderLive();
 }catch{
  $('connection').innerHTML='<span class="status-dot pending"></span>Connection interrupted · Live status unavailable';
  $('notice').textContent='The server could not be reached. Any transaction data below is saved evidence, not a current RPC verification.';$('notice').hidden=false;
  if(data){data.connection={live:false,checkedAt:data.connection.checkedAt,message:$('notice').textContent};renderLive();}
  else $('loading').textContent='Unable to load the transaction. Use Refresh to retry, or open the receipt on Etherscan.';
 }finally{busy=false;$('refresh').disabled=false;}
}
$('refresh').addEventListener('click',refresh);
$('copy').addEventListener('click',async()=>{if(!data)return;try{await navigator.clipboard.writeText(data.hash);$('copy').textContent='✓';$('copy').ariaLabel='Transaction hash copied';setTimeout(()=>{$('copy').textContent='⧉';$('copy').ariaLabel='Copy transaction hash';},2000);}catch{$('copy').textContent='Select hash';}});
$('download').addEventListener('click',()=>{if(!data)return;const url=URL.createObjectURL(new Blob([stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='studio-sepolia-'+data.hash.slice(2,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
void refresh();setInterval(()=>{if(!document.hidden)void refresh();},12000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});
