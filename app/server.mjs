import http from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createPaidVerifier} from './paid.mjs';
import {root,verifyCandidate} from './verify.mjs';
import {repair,replayGenerate,liveGenerate} from './generate.mjs';
import {chainStatus,executeArtifact} from './chain.mjs';
import {atomicStatus,prepareAtomic,executeAtomic,revokeAtomic,atomicAction} from './atomic.mjs';
import {transactionStatus} from './transaction.mjs';
import * as composer from './composer.mjs';
const jobs=new Map();let building=false;
const paidVerifier=createPaidVerifier({config:{payTo:process.env.HEDERA_PAY_TO,feePayer:process.env.HEDERA_FEE_PAYER}});
const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));};
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>32000)throw new Error('Request too large');}return JSON.parse(data||'{}');}
export function createServer({signer=null}={}){return http.createServer(async(req,res)=>{
 try{
  const host=req.headers.host;
  if(!host||!/^((localhost|127\.0\.0\.1)(:\d+)?|\[::1\](:\d+)?)$/.test(host))return json(res,403,{error:'Loopback host required'});
  const url=new URL(req.url,`http://${host}`);
  if(req.method==='POST'){
   if(req.headers.origin&&req.headers.origin!==`http://${host}`)return json(res,403,{error:'Cross-origin requests refused'});
   if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'JSON required'});
  }
  if(req.method==='GET'&&url.pathname==='/api/composer/draft')return json(res,200,composer.savedDraft(url.searchParams.get('id')));
  if(req.method==='GET'&&url.pathname==='/api/composer/config')return json(res,200,{...await composer.composerConfig(url.searchParams.get('network')||'sepolia'),wallet:signer?{address:signer.address,name:signer.name}:null});
  if(req.method==='POST'&&url.pathname.startsWith('/api/composer/')){
   const data=await body(req),name=url.pathname.slice('/api/composer/'.length);
   if(name==='verify')return json(res,200,await composer.verifyModule(data.source));
   const actions={'wallet-setup-send':()=>composer.foundrySetup(data.id,data.index,signer),'wallet-simulate':()=>composer.foundrySimulate(data.id,signer),'wallet-execute-send':()=>composer.foundryExecute(data.id,signer),preview:()=>composer.previewRoute(data),'setup-transaction':()=>composer.setupTransaction(data.id,data.index),'setup-receipt':()=>composer.recordSetup(data.id,data.index,data.hash),simulate:()=>composer.signAndSimulate(data.id,data.signature),'execution-receipt':()=>composer.recordExecution(data.id,data.hash),'local-setup':()=>composer.localSetup(data.id,data.index),'local-simulate':()=>composer.localSimulate(data.id),'local-execute':()=>composer.localExecute(data.id)};
   if(!Object.hasOwn(actions,name))return json(res,404,{error:'Unknown composer action'});
   if((name.startsWith('local-')||name.startsWith('wallet-'))&&data.confirm!==true)return json(res,400,{error:'Confirm use of local development accounts'});
   return json(res,200,await atomicAction(actions[name]));
  }
  if(req.method==='GET'&&url.pathname==='/api/transaction')return json(res,200,await transactionStatus());
  if(req.method==='GET'&&url.pathname==='/api/atomic/status')return json(res,200,await atomicStatus());
  if(req.method==='POST'&&url.pathname.startsWith('/api/atomic/')){
   const data=await body(req);
   if(url.pathname==='/api/atomic/prepare'){
    const job=data.jobId?jobs.get(data.jobId):null;
    const report=data.sample===true?JSON.parse(await readFile(join(root,'artifacts/good-full-report.json'),'utf8')):job?.status==='passed'?job.artifact:null;
    return json(res,200,await atomicAction(()=>prepareAtomic(report)));
   }
   if(url.pathname==='/api/atomic/execute'){
    if(data.confirm!==true||typeof data.id!=='string'||(data.fail!==undefined&&typeof data.fail!=='boolean'))return json(res,400,{error:'Explicit local wallet confirmation and prepared ID required'});
    return json(res,200,await atomicAction(()=>executeAtomic(data.id,{fail:data.fail===true})));
   }
   if(url.pathname==='/api/atomic/revoke')return json(res,200,await atomicAction(revokeAtomic));
  }
  if(req.method==='GET'&&url.pathname==='/api/status')return json(res,200,{model:{available:!!process.env.STUDIO_MODEL_COMMAND,mode:process.env.STUDIO_MODEL_COMMAND?'live':'replay'},chain:await chainStatus(),integrations:{ens:process.env.ENS_RELEASE_RESOLVER?'Configured; deployment verification pending':'Not connected',hedera:process.env.HEDERA_PAY_TO?'Paid verification endpoint configured; paid request pending':'Not connected'}});
  if(req.method==='POST'&&url.pathname==='/api/verify'){
   const data=await body(req);const signed=req.headers['payment-signature']||req.headers['x-payment'];if(signed){if(signed.length>16000)return json(res,400,{error:'Payment header too large'});data.paymentPayload=JSON.parse(Buffer.from(signed,'base64').toString('utf8'));}const result=await paidVerifier(data);
   if(result.paymentRequired){res.setHeader('PAYMENT-REQUIRED',Buffer.from(JSON.stringify(result)).toString('base64'));return json(res,402,result);}
   res.setHeader('PAYMENT-RESPONSE',Buffer.from(JSON.stringify(result.settlement)).toString('base64'));return json(res,200,result);
  }
  if(req.method==='POST'&&url.pathname==='/api/build'){
   const data=await body(req);
   if(typeof data.prompt!=='string'||data.prompt.trim().length<3||data.prompt.length>4000)return json(res,400,{error:'Enter a strategy of 3–4000 characters'});
   if(!['replay','live'].includes(data.mode))return json(res,400,{error:'Choose live or replay'});
   if(data.mode==='live'&&!process.env.STUDIO_MODEL_COMMAND)return json(res,400,{error:'Live model is not configured'});
   if(building)return json(res,409,{error:'One verification campaign is already running'});
   if(jobs.size>=100)return json(res,429,{error:'Session job limit reached; restart the local server'});
   const id=randomUUID();const job={id,status:'running',mode:data.mode,prompt:data.prompt,events:[],attempts:[]};jobs.set(id,job);building=true;
   json(res,202,{id});
   const event=e=>{job.events.push({...e,at:new Date().toISOString()});if(e.report)job.attempts.push({report:e.report});};
   event({type:'mode',message:data.mode==='replay'?'Replay fixture: predetermined buggy and corrected sources; all verification is executed now.':'Live model: generating a candidate from your request.'});
   void repair(data.prompt,{generate:data.mode==='replay'?replayGenerate:liveGenerate,verify:source=>verifyCandidate(source,{onEvent:event}),onEvent:event}).then(async result=>{Object.assign(job,result);if(job.artifact)Object.assign(job.artifact,{source:job.attempts.at(-1).source,chainId:31337,maximumInput:'1 token (1000000000000000000 base units)',minimumOutput:'0.98 token (980000000000000000 base units)',feeCap:'0.01 token (10000000000000000 base units)',preparation:'Release registration, liquidity shipping and approvals are setup; module deployment, swap and author payment are atomic.'});await mkdir(join(root,'artifacts/jobs'),{recursive:true});await writeFile(join(root,'artifacts/jobs',id+'.json'),JSON.stringify(job,null,2));}).catch(error=>{job.status='failed';job.error=error.message;}).finally(()=>{building=false;});return;
  }
  const match=url.pathname.match(/^\/api\/jobs\/([a-zA-Z0-9-]+)(\/execute)?$/);
  if(match){
   const job=jobs.get(match[1]);if(!job)return json(res,404,{error:'Job not found'});
   if(req.method==='GET'&&!match[2])return json(res,200,job);
   if(req.method==='POST'&&match[2]){
    const data=await body(req);if(data.confirm!==true)return json(res,400,{error:'Confirm use of the local development wallet'});
    if(job.status!=='passed')return json(res,409,{error:'Only a passed candidate can execute'});
    if(job.executing||job.transaction)return json(res,409,{error:'Execution already submitted'});
    job.executing=true;
    try{job.transaction=await executeArtifact(job.artifact,{id:job.id,confirm:true});return json(res,200,job.transaction);}finally{job.executing=false;}
   }
  }
  const files={'/compose':'composer.html','/composer.css':'composer.css','/composer.js':'composer.js','/composer-view.js':'composer-view.js','/transaction':'transaction.html','/transaction.css':'transaction.css','/transaction.js':'transaction.js','/atomic-evidence.js':'atomic-evidence.js','/atomic':'atomic.html','/atomic.css':'atomic.css','/atomic.js':'atomic.js','/':process.env.STUDIO_ATOMIC==='1'?'composer.html':'index.html','/index.html':'index.html','/styles.css':'styles.css','/app.js':'app.js'};
  if(req.method==='GET'&&files[url.pathname]){const path=files[url.pathname];res.writeHead(200,{'content-type':path.endsWith('.css')?'text/css':path.endsWith('.js')?'text/javascript':'text/html','x-content-type-options':'nosniff'});res.end(await readFile(join(root,'app/public',path)));return;}
  json(res,404,{error:'Not found'});
 }catch(error){json(res,500,{error:error.shortMessage||error.message,code:error.code==='DRAFT_EXPIRED'?'DRAFT_EXPIRED':undefined,reverted:error.transactionReverted===true});}
 });}
if(process.argv[1]===new URL(import.meta.url).pathname){const port=Number(process.env.PORT||4180);createServer().listen(port,'127.0.0.1',()=>console.log(`SwapVM Studio http://127.0.0.1:${port}`));}
