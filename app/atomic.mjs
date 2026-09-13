import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {classifyReceipt} from './public/atomic-evidence.js';
import {createPublicClient,createWalletClient,http,keccak256,encodeAbiParameters,parseAbiParameters,encodeFunctionData,zeroAddress,toHex,namehash,decodeEventLog} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
import {foundry} from 'viem/chains';
import {root,verifyCandidate} from './verify.mjs';
const rpc=process.env.ATOMIC_RPC_URL||'http://127.0.0.1:8551';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(rpc).hostname))throw new Error('Atomic demo requires loopback RPC');
const transport=http(rpc,{timeout:15000});
const client=createPublicClient({chain:foundry,transport});
const [owner,maker,trader,author]=[0,1,2,3].map(addressIndex=>createWalletClient({chain:foundry,transport,account:mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex})}));
const configPath=join(root,'artifacts/atomic-chain.json');
const U=10n**18n,MAX=2n**256n-1n;
const prepared=new Map();
let busy=false;
export const serialize=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v,2);
const artifact=async(name,path=join(root,'out',name+'.sol',name+'.json'))=>JSON.parse(await readFile(path,'utf8'));
async function local(){if(await client.getChainId()!==31337)throw new Error('Refusing public development keys outside chain 31337');}
async function receipt(hash){return client.waitForTransactionReceipt({hash});}
async function send(wallet,request){const r=await receipt(await wallet.writeContract(request));if(r.status!=='success')throw new Error('Setup transaction reverted: '+r.transactionHash);return r;}
async function deploy(a,args=[]){const r=await receipt(await owner.deployContract({abi:a.abi,bytecode:a.bytecode.object,args}));if(r.status!=='success'||!r.contractAddress)throw new Error('Deployment failed');return r.contractAddress;}
async function read(address,abi,functionName,args=[]){return client.readContract({address,abi,functionName,args});}
function sqrt(n){if(n<2n)return n;let x=n,y=(x+1n)/2n;while(y<x){x=y;y=(x+n/x)/2n;}return x;}
export async function atomicStatus(){try{await local();const c=JSON.parse(await readFile(configPath,'utf8'));const e=await artifact('AtomicExecutor');return {...c,available:c.tokenMetadataVersion===1&&!!await client.getCode({address:c.executor})&&c.buildHash===keccak256(e.bytecode.object),rpc,chainId:31337};}catch{return {available:false,rpc,chainId:31337};}}
export async function setupAtomic(){
 await local();let c=await atomicStatus();if(c.available)return c;
 const aquaA=await artifact('Aqua'),e=await artifact('AtomicExecutor'),token=await artifact('DemoToken',join(root,'out/AtomicDemo.sol/DemoToken.json'));
 const pm=await artifact('PoolManager',join(root,'node_modules/@uniswap/v4-core/out/PoolManager.sol/PoolManager.json'));
 const lpA=await artifact('PoolModifyLiquidityTest');
 const ens=await artifact('PermissionedResolver',join(root,'reference/ens-v2/PermissionedResolver.json'));
 const proxy=await artifact('ERC1967Proxy',join(root,'reference/ens-v2/ERC1967Proxy.json'));
 const aqua=await deploy(aquaA),manager=await deploy(pm,[owner.account.address]);
 const executor=await deploy(e,[aqua,zeroAddress,owner.account.address,manager]);
 const tokenIn=await deploy(token,['Demo USD','sUSD']),tokenOut=await deploy(token,['Demo rUTH','rUTH']);
 const implementation=await deploy(ens,[owner.account.address]);
 const initialize=encodeFunctionData({abi:ens.abi,functionName:'initialize',args:[owner.account.address,BigInt('0x'+'1'.repeat(64)),[]]});
 const resolver=await deploy(proxy,[implementation,initialize]);
 const node=namehash('strategy.studio.eth');
 for(const address of [tokenIn,tokenOut])await send(owner,{address:executor,abi:e.abi,functionName:'setSupportedToken',args:[address,true]});
 await send(owner,{address:executor,abi:e.abi,functionName:'setReleaseResolver',args:[resolver,node]});
 for(const [address,to] of [[tokenIn,trader.account.address],[tokenOut,maker.account.address],[tokenIn,owner.account.address],[tokenOut,owner.account.address]])await send(owner,{address,abi:token.abi,functionName:'mint',args:[to,10n**27n]});
 await send(trader,{address:tokenIn,abi:token.abi,functionName:'approve',args:[executor,MAX]});
 await send(maker,{address:tokenOut,abi:token.abi,functionName:'approve',args:[aqua,MAX]});
 const outputFirst=tokenOut.toLowerCase()<tokenIn.toLowerCase();
 const pool={currency0:outputFirst?tokenOut:tokenIn,currency1:outputFirst?tokenIn:tokenOut,fee:3000,tickSpacing:60,hooks:zeroAddress};
 const price=sqrt((1n<<192n)*(outputFirst?104n:100n)/(outputFirst?100n:104n));
 await send(owner,{address:manager,abi:pm.abi,functionName:'initialize',args:[pool,price]});
 const lp=await deploy(lpA,[manager]);
 for(const address of [tokenIn,tokenOut])await send(owner,{address,abi:token.abi,functionName:'approve',args:[lp,MAX]});
 await send(owner,{address:lp,abi:lpA.abi,functionName:'modifyLiquidity',args:[pool,{tickLower:-887220,tickUpper:887220,liquidityDelta:10n**24n,salt:toHex(0,{size:32})},'0x',false,false]});
 const router=await read(executor,e.abi,'router');
 c={tokenMetadataVersion:1,buildHash:keccak256(e.bytecode.object),executor,aqua,manager,router,resolver,node,tokenIn,tokenOut,pool,owner:owner.account.address,maker:maker.account.address,trader:trader.account.address,author:author.account.address};
 await mkdir(join(root,'artifacts'),{recursive:true});await writeFile(configPath,serialize(c));return {...c,available:true,chainId:31337,rpc};
}
export async function prepareAtomic(report){
 if(!report?.passed||!report.bytecode||!report.runtimeBytecode)throw new Error('A passing verification artifact is required');
 const c=await setupAtomic(),e=await artifact('AtomicExecutor'),aqua=await artifact('Aqua');
 const ens=await artifact('PermissionedResolver',join(root,'reference/ens-v2/PermissionedResolver.json'));
 const id=randomUUID(),params='0x',reportDigest=keccak256(toHex(serialize(report)));
 const block=await client.getBlock({blockTag:'pending'});
 const a={signer:c.trader,maker:c.maker,tokenIn:c.tokenIn,tokenOut:c.tokenOut,author:c.author,initCodeHash:keccak256(report.bytecode),runtimeCodeHash:keccak256(report.runtimeBytecode),paramsHash:keccak256(params),salt:keccak256(toHex(id)),amount:100n*U,exactIn:true,maxInput:100n*U,minOutput:98n*U,feeBps:100n,feeCap:U,nonce:BigInt(keccak256(toHex(id))),deadline:block.timestamp+3600n};
 const h={poolFee:3000,tickSpacing:60,minReturn:100n*U,ensResolver:c.resolver,ensNode:c.node,reportDigest};
 const release=await read(c.executor,e.abi,'releaseKey',[a.initCodeHash,a.runtimeCodeHash,c.author,100n]);
 await send(owner,{address:c.executor,abi:e.abi,functionName:'approveEnsRelease',args:[a.initCodeHash,a.runtimeCodeHash,c.author,100n,reportDigest]});
 await send(owner,{address:c.resolver,abi:ens.abi,functionName:'setData',args:[c.node,'swapvm.release',encodeAbiParameters(parseAbiParameters('bytes32,bytes32'),[release,reportDigest])]});
 const order=await read(c.executor,e.abi,'order',[a,params]);
 const strategy=encodeAbiParameters(parseAbiParameters('(address maker,uint256 traits,bytes data)'),[order]);
 await send(maker,{address:c.aqua,abi:aqua.abi,functionName:'ship',args:[c.router,strategy,[c.tokenIn,c.tokenOut],[10n**24n,10n**24n]]});
 const module=await read(c.executor,e.abi,'predict',[a]);
 if(prepared.size>=100)prepared.delete(prepared.keys().next().value);
 prepared.set(id,{a,h,report,params,module,c,release});
 return {id,module,release,reportDigest,authorization:a,hedge:h,contracts:c,preparation:'Approvals, ENS publishing, pool liquidity and Aqua shipping are separate setup transactions.',programExists:!!await client.getCode({address:module})};
}
async function balances(c,module,a){
 const token=await artifact('Token',join(root,'out/Studio.t.sol/Token.json')),e=await artifact('AtomicExecutor');
 const addresses={trader:c.trader,maker:c.maker,author:c.author,executor:c.executor,pool:c.manager};
 const result={};
 for(const [role,address] of Object.entries(addresses))result[role]={USD:String(await read(c.tokenIn,token.abi,'balanceOf',[address])),rUTH:String(await read(c.tokenOut,token.abi,'balanceOf',[address]))};
 result.moduleExists=!!await client.getCode({address:module});result.nonceUsed=await read(c.executor,e.abi,'usedNonces',[a.signer,a.nonce]);
 return result;
}
export async function executeAtomic(id,{fail=false}={}){
 await local();const p=prepared.get(id);if(!p)throw new Error('Prepare a strategy first');
 const {a,report,params,module,c}=p,e=await artifact('AtomicExecutor');
 const h={...p.h,minReturn:fail?1000n*U:p.h.minReturn};
 const authorization=await read(c.executor,e.abi,'hedgedDigest',[a,h]);
 const signature=await trader.account.sign({hash:authorization});
 const before=await balances(c,module,a);
 // Explicit gas broadcasts the deliberately failing transaction instead of stopping at estimateGas.
 const r=await receipt(await trader.writeContract({address:c.executor,abi:e.abi,functionName:'executeHedged',args:[a,h,report.bytecode,params,signature],gas:3000000n}));
 const after=await balances(c,module,a);
 const events=r.logs.filter(log=>log.address.toLowerCase()===c.executor.toLowerCase()).flatMap(log=>{try{return [decodeEventLog({abi:e.abi,data:log.data,topics:log.topics})];}catch{return [];}});
 let trace=null;try{trace=await client.request({method:'debug_traceTransaction',params:[r.transactionHash,{tracer:'callTracer'}]});}catch{}
 const touched=new Set();let authorPayment=false;function walk(call){if(call?.to)touched.add(call.to.toLowerCase());if(call?.to?.toLowerCase()===c.tokenOut.toLowerCase()&&call?.from?.toLowerCase()===c.executor.toLowerCase()&&call?.input?.slice(0,10)==='0xa9059cbb'&&call.input.slice(10,74).endsWith(c.author.slice(2).toLowerCase())&&!call.error)authorPayment=true;for(const child of call?.calls||[])walk(child);}walk(trace);
 const output={id,status:r.status,transactionHash:r.transactionHash,blockNumber:String(r.blockNumber),gasUsed:String(r.gasUsed),module,authorization,limits:{minReturn:String(h.minReturn)},events,before,after,balancesAndNonceUnchanged:serialize(before)===serialize(after),traceAvailable:!!trace,traceError:trace?.revertReason||trace?.error||null,called:{authorPayment,ens:touched.has(c.resolver.toLowerCase()),aqua:touched.has(c.aqua.toLowerCase()),uniswap:touched.has(c.manager.toLowerCase())},mode:'Local Anvil, actual contracts, public development wallets; seeded prices'};
 await writeFile(join(root,'artifacts/atomic-last-receipt.json'),serialize(output));
 await writeFile(join(root,'artifacts',`atomic-${r.transactionHash}.json`),serialize({receipt:output,trace}));
 return output;
}
export async function revokeAtomic(){const c=await atomicStatus();if(!c.available)throw new Error('Prepare first');await local();const ens=await artifact('PermissionedResolver',join(root,'reference/ens-v2/PermissionedResolver.json'));const r=await send(owner,{address:c.resolver,abi:ens.abi,functionName:'setData',args:[c.node,'swapvm.release','0x']});return {transactionHash:r.transactionHash};}
export async function atomicAction(fn){if(busy)throw new Error('An atomic demo operation is running');busy=true;try{return await fn();}finally{busy=false;}}
if(process.argv[1]===new URL(import.meta.url).pathname){
 const command=process.argv[2];
 if(command==='verify-sample'){const report=await verifyCandidate(await readFile(join(root,'app/fixtures/Candidate.good.sol'),'utf8'));if(!report.passed)throw new Error(serialize(report));await mkdir(join(root,'artifacts'),{recursive:true});await writeFile(join(root,'artifacts/good-full-report.json'),serialize(report));console.log(`Sample verified: ${report.checks.length} checks`);}
 if(command==='setup')console.log(serialize(await setupAtomic()));
 if(command==='demo'){
  const report=JSON.parse(await readFile(join(root,'artifacts/good-full-report.json'),'utf8'));
  const p=await prepareAtomic(report);
  const failed=await executeAtomic(p.id,{fail:true});
  if(classifyReceipt(failed)!=='rollback')throw new Error('Rollback evidence failed');
  const success=await executeAtomic(p.id);
  if(success.status!=='success'||!success.events.some(x=>x.eventName==='AtomicExecuted'))throw new Error('Execution evidence failed');
  const q=await prepareAtomic(report);await revokeAtomic();const revoked=await executeAtomic(q.id);
  if(classifyReceipt(revoked)!=='revoked')throw new Error('ENS revocation evidence failed');
  await writeFile(join(root,'artifacts/atomic-evidence.json'),serialize({failed,success,revoked}));
  console.log(serialize({failed:failed.transactionHash,success:success.transactionHash,revoked:revoked.transactionHash}));
 }
}
