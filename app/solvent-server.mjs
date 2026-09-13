// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createWalletClient,http,concatHex,toHex} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
import {foundry} from 'viem/chains';
import {root,client,config,inventory,assess,json,createPaidInventory} from './solvent.mjs';
import {sceneState,sceneAction} from './solvent-scene.mjs';
const port=Number(process.env.SOLVENT_PORT||4181);
const rpc=process.env.DELIVERABLE_RPC||'http://127.0.0.1:8549';
const origins=new Set([`http://127.0.0.1:${port}`,`http://localhost:${port}`]);
let paymentService;
async function paid(){
 if(!process.env.HEDERA_PAY_TO)throw new Error('Hedera payment recipient unconfigured; no paid request has been demonstrated');
 if(!paymentService)paymentService=(async()=>{
  const r=await fetch('https://api.testnet.blocky402.com/supported',{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('Cannot discover Blocky402 fee payer');
  const supported=await r.json();const feePayer=supported.kinds?.find(k=>k.network==='hedera:testnet')?.extra?.feePayer;
  if(!feePayer)throw new Error('Blocky402 did not advertise a Hedera fee payer');
  return createPaidInventory({payTo:process.env.HEDERA_PAY_TO,feePayer});
 })().catch(error=>{paymentService=undefined;throw error;});
 return paymentService;
}
async function body(req){
 let n=0;const chunks=[];for await(const chunk of req){n+=chunk.length;if(n>65536)throw new Error('Request too large');chunks.push(chunk);}
 return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
}
let filling=false;
async function fill({index,confirm}){
 if(confirm!==true||!Number.isInteger(index))throw new Error('Explicit demo confirmation and position index required');
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(rpc).hostname)||await client.getChainId()!==31337)throw new Error('Demo transactions restricted to loopback chain 31337');
 if(filling)throw new Error('A demo fill is already pending');
 filling=true;
 try{
  const c=await config(),p=c.results[index];if(!p)throw new Error('Unknown demo position');
  const a=JSON.parse(await readFile(new URL('out/AquaSwapVMRouter.sol/AquaSwapVMRouter.json',root),'utf8'));
  const wallet=createWalletClient({chain:foundry,transport:http(rpc),account:mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex:2})});
  const order={maker:p.maker,traits:1n<<254n,data:p.program},amount=10n**19n;
  const args=[order,c.input,p.token,amount,'0x00000000000000000000000000000000000000000041'];
  const quote=await client.simulateContract({address:p.router,abi:a.abi,functionName:'quote',account:wallet.account,args});
  const minimum=quote.result[1]*99n/100n;
  if(minimum===0n)throw new Error('No nonzero deliverable quote');
  args[4]=concatHex(['0x00200020002000200020002000200020002000200041',toHex(minimum,{size:32})]);
  const {request}=await client.simulateContract({address:p.router,abi:a.abi,functionName:'swap',account:wallet.account,args});
  const hash=await wallet.writeContract(request),receipt=await client.waitForTransactionReceipt({hash});
  if(receipt.status!=='success')throw new Error('Fill reverted: '+hash);
  return {hash,amountIn:amount,minOutput:minimum,quotedOutput:quote.result[1],status:receipt.status};
 }finally{filling=false;}
}
export function server(){return createServer(async(req,res)=>{
 const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(json(value));};
 try{
  if(!origins.has('http://'+req.headers.host)||(req.headers.origin&&!origins.has(req.headers.origin)))return send(403,{error:'Local origin required'});
  const path=new URL(req.url,'http://localhost').pathname;
  if(req.method==='GET'&&path==='/'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'",'x-content-type-options':'nosniff'});
   return res.end(await readFile(new URL('app/solvent.html',root)));
  }
  if(req.method==='GET'&&path==='/api/scene')return send(200,await sceneState());
  if(req.method==='GET'&&path==='/api/inventory'){
   const snapshot=await inventory();const c=await config();
   return send(200,{...snapshot,positions:snapshot.positions.map((p,i)=>({...p,label:c.results[i].path,mode:c.results[i].mode})),assessment:assess(snapshot)});
  }
  if(req.method==='GET'&&path==='/.well-known/solvent.json')return send(200,{name:'Solvent inventory service',tool:'solvent_inventory',endpoint:'/api/paid-inventory',network:'hedera:testnet',price:'100 tinybars per position',paymentsConfigured:!!process.env.HEDERA_PAY_TO,localDemo:true});
  if(req.method==='POST'){
   if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'JSON required'});
   const input=await body(req);
   if(path==='/api/scene')return send(200,await sceneAction(input));
   if(path==='/api/fill')return send(200,await fill(input));
   if(path==='/api/inventory')return send(200,await inventory(input));
   if(path==='/api/paid-inventory'){
    const payload=req.headers['payment-signature']?JSON.parse(Buffer.from(req.headers['payment-signature'],'base64').toString('utf8')):undefined;
    const result=await(await paid())(input,payload);return send(result.paymentRequired?402:200,result);
   }
  }
  send(404,{error:'Not found'});
 }catch(e){send(400,{error:e.shortMessage||e.message});}
});}
if(process.argv[1]===new URL(import.meta.url).pathname)server().listen(port,'127.0.0.1',()=>console.log(`Solvent: http://127.0.0.1:${port}`));
