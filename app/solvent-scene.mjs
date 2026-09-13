// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// Interactive local demo. All actors use public Anvil accounts and newly deployed test assets.
import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {createPublicClient,createWalletClient,http,parseEventLogs,encodeAbiParameters,parseAbiParameters,concatHex,toHex,keccak256,maxUint256,zeroAddress} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
import {foundry} from 'viem/chains';
import {root,json} from './solvent.mjs';
const rpc=process.env.SOLVENT_SCENE_RPC||'http://127.0.0.1:8550';
const client=createPublicClient({transport:http(rpc,{timeout:10000}),pollingInterval:100});
const file=new URL('artifacts/solvent-scene.json',root);
const R=10n**18n,amount=1500n*R,data='0x00000000000000000000000000000000000000000041';
const actions=['consume','stock','solvent','revoke'];
const artifact=async(file,name)=>JSON.parse(await readFile(new URL(`out/${file}/${name}.json`,root),'utf8'));
const actors=[0,1,2].map(addressIndex=>createWalletClient({chain:foundry,transport:http(rpc),account:mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex})}));
const [owner,maker,trader]=actors;
// ponytail: one demo sequence per process; use per-session scenes for a hosted multi-user demo.
let busy=false;
async function localOnly(){
 if(!['127.0.0.1','localhost','[::1]'].includes(new URL(rpc).hostname)||await client.getChainId()!==31337)throw Error('Demo writes require loopback chain 31337');
}
async function save(scene){await mkdir(new URL('artifacts/',root),{recursive:true});await writeFile(new URL('artifacts/solvent-scene.tmp',root),json(scene));await rename(new URL('artifacts/solvent-scene.tmp',root),file);}
async function read(){try{return JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}
async function receipt(hash){return client.waitForTransactionReceipt({hash,pollingInterval:100,timeout:60000});}
async function deploy(a,args=[]){const r=await receipt(await owner.deployContract({abi:a.abi,bytecode:a.bytecode.object,args}));if(r.status!=='success')throw Error('Demo deployment reverted');return r.contractAddress;}
async function send(w,address,a,functionName,args){const r=await receipt(await w.writeContract({address,abi:a.abi,functionName,args,gas:8000000n}));if(r.status!=='success')throw Error('Demo setup transaction reverted');return r;}
function order(s,i){return {maker:s.maker,traits:1n<<254n,data:s.positions[i].program};}
async function prepare(){
 const [aa,ra,na,ta,la]=await Promise.all([artifact('Aqua.sol','Aqua'),artifact('AquaSwapVMRouter.sol','AquaSwapVMRouter'),artifact('DeliverableSwapVMRouter.sol','DeliverableSwapVMRouter'),artifact('Studio.t.sol','Token'),artifact('SolventLens.sol','SolventLens')]);
 const aqua=await deploy(aa),stock=await deploy(ra,[aqua,zeroAddress,owner.account.address,'SwapVM','1']);
 const native=await deploy(na,[aqua,zeroAddress,owner.account.address]);
 const input=await deploy(ta),token=await deploy(ta),lens=await deploy(la);
 await send(owner,input,ta,'mint',[trader.account.address,10000n*R]);
 await send(owner,token,ta,'mint',[maker.account.address,1000n*R]);
 await send(trader,input,ta,'approve',[stock,maxUint256]);await send(trader,input,ta,'approve',[native,maxUint256]);
 await send(maker,token,ta,'approve',[aqua,maxUint256]);
 const info=await client.request({method:'anvil_nodeInfo'});
 const s={id:token,stage:0,maker:maker.account.address,trader:trader.account.address,aqua,stock,native,input,token,lens,forkBlock:info.forkConfig?.forkBlockNumber||null,positions:[],events:[],pending:null};
 for(let i=0;i<3;i++){
  const program=concatHex(['0x1401',toHex(i,{size:1}),i===2?concatHex(['0x211501',aqua]):'0x','0x1100']);
  const router=i===2?native:stock;
  s.positions.push({app:router,token,program});
  const bytes=encodeAbiParameters(parseAbiParameters('(address maker,uint256 traits,bytes data)'),[order(s,i)]);
  s.positions[i].strategyHash=keccak256(bytes);
  await send(maker,aqua,aa,'ship',[router,bytes,[input,token],[1000n*R,1000n*R]]);
 }
 await save(s);return s;
}
export async function sceneState(){
 const s=await read();if(!s)return {stage:-1,busy};
 const [la,ra]=await Promise.all([artifact('SolventLens.sol','SolventLens'),artifact('AquaSwapVMRouter.sol','AquaSwapVMRouter')]);
 const blockNumber=await client.getBlockNumber({cacheTime:0});
 const inventory=await client.readContract({address:s.lens,abi:la.abi,functionName:'inventory',args:[s.aqua,s.maker,s.positions],blockNumber});
 const quotes={};
 for(const [name,i] of [['stock',1],['solvent',2]]){
  try{
   const q=await client.simulateContract({address:s.positions[i].app,abi:ra.abi,functionName:'quote',args:[order(s,i),s.input,s.token,amount,data],account:trader.account,blockNumber});
   quotes[name]={available:true,amount:q.result[1]};
  }catch(e){
   // Only an EVM revert is an unavailable quote. RPC failures invalidate the snapshot.
   if(!e.walk?.(cause=>cause.name==='ContractFunctionRevertedError'))throw e;
   quotes[name]={available:false,amount:null};
  }
 }
 return {...s,busy,blockNumber,chainId:await client.getChainId(),wallet:inventory[0].onHand,approved:inventory[0].approved,positions:s.positions.map((p,i)=>({...p,...inventory[i]})),quotes};
}
export async function sceneAction({action,confirm,id,expectedStage}={}){
 if(confirm!==true||!['reset',...actions].includes(action))throw Error('Confirm a known demo action');
 await localOnly();if(busy)throw Error('A demo event is already pending');busy=true;
 try{
  if(action==='reset')await prepare();
  else{
   const s=await read();
   if(!s||s.id!==id||s.stage!==expectedStage||actions[s.stage]!==action)throw Error('Scene changed; refresh before continuing');
   if(s.pending)throw Error('An earlier transaction is unresolved. Start a fresh demo before retrying.');
   const ra=await artifact('AquaSwapVMRouter.sol','AquaSwapVMRouter');
   const i=actions.indexOf(action);
   let request,out=null;
   if(action==='revoke')request={address:s.token,abi:(await artifact('Studio.t.sol','Token')).abi,functionName:'approve',args:[s.aqua,0n]};
   else{
    const quote=await client.simulateContract({address:s.positions[i].app,abi:ra.abi,functionName:'quote',args:[order(s,i),s.input,s.token,amount,data],account:trader.account});
    out=quote.result[1];
    if(out===0n)throw Error('No deliverable quote');
    // Stock is deliberately submitted despite insufficient inventory to show the actual reverted receipt.
    // Successful paths retain a 99% fresh-quote minimum output.
    const limits=action==='stock'?data:concatHex(['0x00200020002000200020002000200020002000200041',toHex(out*99n/100n,{size:32})]);
    request={address:s.positions[i].app,abi:ra.abi,functionName:'swap',args:[order(s,i),s.input,s.token,amount,limits]};
   }
   s.pending={action,hash:null};await save(s);
   const hash=await(action==='revoke'?maker:trader).writeContract({...request,gas:3000000n});
   s.pending.hash=hash;await save(s);
   const r=await receipt(hash),expected=action==='stock'?'reverted':'success';
   let settledOut=null;
   if(r.status==='success'&&action!=='revoke'){
    const event=parseEventLogs({abi:ra.abi,eventName:'Swapped',logs:r.logs.filter(log=>log.address.toLowerCase()===s.positions[i].app.toLowerCase())})
     .find(event=>event.args.orderHash===s.positions[i].strategyHash);
    if(!event)throw Error('Successful receipt has no matching swap event; inspect it before restarting.');
    settledOut=event.args.amountOut;
   }
   s.events.push({action,hash,status:r.status,blockNumber:r.blockNumber,gasUsed:r.gasUsed,amountOut:settledOut,requestedOut:out});
   if(r.status!==expected){await save(s);throw Error('Unexpected transaction result. Inspect the receipt and start a fresh demo.');}
   s.stage++;s.pending=null;await save(s);
  }
 }finally{busy=false;}
 return sceneState();
}
