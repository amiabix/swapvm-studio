// Testnet-only runner. The password arrives on stdin and is passed to cast on stdin, never argv/env/disk.
import {readFileSync,openSync,closeSync,unlinkSync,writeSync} from 'node:fs';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createPublicClient,createWalletClient,http,custom,keccak256,toHex,encodeAbiParameters,parseAbiParameters,decodeEventLog,formatEther,zeroAddress,namehash} from 'viem';
import {sepolia,foundry} from 'viem/chains';
import {root} from './verify.mjs';
async function main(){
const localCheck=process.argv.includes('--local-check');
const rpc=process.env.SEPOLIA_RPC_URL;
if(!rpc)throw new Error('SEPOLIA_RPC_URL required');
if(localCheck&&!['localhost','127.0.0.1','[::1]'].includes(new URL(rpc).hostname))throw new Error('Local check requires loopback RPC');
const chain=localCheck?foundry:sepolia,client=createPublicClient({chain,transport:http(rpc,{timeout:30000})});
if(await client.getChainId()!==chain.id)throw new Error('Wrong chain');
const password=readFileSync(0);
const cast=join(homedir(),'.foundry/bin/cast'),keystore=process.env.ATOMIC_KEYSTORE||join(homedir(),'.foundry/keystores/cure-issuer');
function command(args){const index=args.indexOf('--create');args=index<0?[...args,'--keystore',keystore]:[...args.slice(0,index),'--keystore',keystore,...args.slice(index)];return new Promise((resolve,reject)=>{const child=execFile('python3',[join(root,'script/cast-unlock.py'),cast,...args],{maxBuffer:200000,timeout:100000},(err,stdout,stderr)=>err?reject(new Error((stderr||err.message).replaceAll(rpc,'[RPC]').slice(-2000))):resolve(stdout.trim()));child.stdin.on('error',()=>{});child.stdin.end(password);});}
const owner=await command(['wallet','address']);
const expected=localCheck?'0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266':'0xea9cd7bef18a5f8b7f26e63710335e640d6c36dd';
if(owner.toLowerCase()!==expected)throw new Error('Unexpected wallet; no transaction sent');
const path=join(root,`artifacts/${localCheck?'atomic-runner-check':'atomic-sepolia-test'}.json`);
const lock=path+'.lock';const lockFd=openSync(lock,'wx',0o600);writeSync(lockFd,String(process.pid));process.on('exit',()=>{closeSync(lockFd);unlinkSync(lock);});
let state;try{state=JSON.parse(await readFile(path,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;state={chainId:chain.id,owner,steps:{},receipts:[]};}
if(state.owner.toLowerCase()!==owner.toLowerCase()||state.chainId!==chain.id)throw new Error('Saved run belongs to another wallet/chain');
const save=async()=>{await mkdir(join(root,'artifacts'),{recursive:true});await writeFile(path+'.tmp',JSON.stringify(state,(_,v)=>typeof v==='bigint'?String(v):v,2));await rename(path+'.tmp',path);};
const artifact=async name=>JSON.parse(await readFile(join(root,'out',name+'.sol',name+'.json'),'utf8'));
const demoArtifact=async name=>JSON.parse(await readFile(join(root,'out/AtomicDemo.sol',name+'.json'),'utf8'));
const E=await artifact('AtomicExecutor'),A=await artifact('Aqua'),T=await demoArtifact('DemoToken'),D=await demoArtifact('DemoAccount'),L=await demoArtifact('DemoLiquidity');
const ENS=JSON.parse(await readFile(join(root,'reference/ens-v2/PermissionedResolver.json'),'utf8'));
const PM=JSON.parse(await readFile(join(root,'node_modules/@uniswap/v4-core/out/PoolManager.sol/PoolManager.json'),'utf8'));
const buildHash=keccak256(E.bytecode.object);
if(state.buildHash&&state.buildHash!==buildHash)throw new Error('Executor build changed; archive the old run before deploying again');state.buildHash=buildHash;
const local=localCheck?JSON.parse(await readFile(join(root,'artifacts/atomic-chain.json'),'utf8')):null;
const resolver=local?.resolver||'0x7a04357971e6fEEc756df2E0d9b8e5D49eB020AB';
const node=local?.node||namehash('cure-settlement.eth');
const manager=local?.manager||'0xE03A1074c86CFeDd5C142C4F04F1a1536e203543';
const read=(address,abi,functionName,args=[])=>client.readContract({address,abi,functionName,args});
// Confirm live ENS authority before spending on deployment.
await client.simulateContract({account:owner,address:resolver,abi:ENS.abi,functionName:'setData',args:[node,'swapvm.release',await read(resolver,ENS.abi,'data',[node,'swapvm.release'])]});
let spent=state.receipts.reduce((sum,r)=>sum+BigInt(r.gasUsed)*BigInt(r.effectiveGasPrice),0n);
const budget=40n*10n**15n,reserve=18n*10n**14n;let restoring=false;
const wallet=createWalletClient({chain,account:owner,transport:custom({request:async({method,params})=>{
 if(method!=='eth_sendTransaction')return client.request({method,params});
 const tx=params[0];if(tx.from.toLowerCase()!==owner.toLowerCase())throw new Error('Unexpected sender');
 const gas=tx.gas?BigInt(tx.gas):(await client.estimateGas({account:owner,to:tx.to,data:tx.data,value:BigInt(tx.value||0)}))*12n/10n;
 const fee=(await client.getGasPrice())*2n;
 if(fee>3n*10n**9n)throw new Error('Gas cap exceeded (3 gwei); resume later');
 const worst=gas*fee+BigInt(tx.value||0);
 if(!localCheck&&(spent+worst>budget-(restoring?0n:reserve)||await client.getBalance({address:owner})<worst))throw new Error('0.04 ETH run budget or wallet balance insufficient; no transaction sent');
 const args=['send','--rpc-url',rpc,'--async','--gas-limit',String(gas),'--gas-price',String(fee),'--value',String(BigInt(tx.value||0))];
 if(tx.to)args.push(tx.to,tx.data||'0x');else args.push('--create',tx.data);
 state.pending={label:restoring?'Restore ENS release':state.inFlight?.label,nonce:await client.getTransactionCount({address:owner,blockTag:'pending'}),broadcastAttempted:true};await save();
 const hash=await command(args);if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw new Error('Unexpected cast transaction response');
 state.pending={...state.pending,hash};await save();console.log('Sent',hash);return hash;
}})});
async function receipt(hash){const r=await client.waitForTransactionReceipt({hash,timeout:180000});if(!state.receipts.some(x=>x.hash===hash)){state.receipts.push({hash,status:r.status,blockNumber:r.blockNumber,gasUsed:r.gasUsed,effectiveGasPrice:r.effectiveGasPrice});spent+=r.gasUsed*r.effectiveGasPrice;}delete state.pending;await save();return r;}
async function restoreRelease(){
 if(!state.restoration)return;
 const target=state.restoration;
 if(state.pending||state.inFlight){state.recoveryRequired={...(state.recoveryRequired||{}),interrupted:{pending:state.pending,inFlight:state.inFlight}};await save();}
 if(state.pending){if(!state.pending.hash)throw new Error('Broadcast outcome unknown; ENS restoration intent retained for recovery');await receipt(state.pending.hash);}
 const restored=()=>{delete state.restoration;if(!state.steps['ENS rejection'])delete state.steps['Revoke ENS release'];};
 if(await read(target.resolver,ENS.abi,'data',[target.node,'swapvm.release'])===target.record){restored();await save();return;}
 restoring=true;
 try{
  console.log('Restoring ENS release');
  const r=await receipt(await wallet.writeContract({address:target.resolver,abi:ENS.abi,functionName:'setData',args:[target.node,'swapvm.release',target.record],gas:150000n}));
  if(r.status!=='success')throw new Error('ENS restore transaction reverted');
  state.steps['Restore ENS release']=r.transactionHash;restored();await save();
 }catch(error){console.error('ENS RESTORATION STILL REQUIRED. Exact resolver/node/record are saved under restoration in '+path);throw error;}
 finally{restoring=false;}
}
// A saved in-flight step is never silently retried. Resolve its receipt/nonce first.
if(state.pending||state.inFlight||state.recoveryRequired){
 state.recoveryRequired={pending:state.pending,inFlight:state.inFlight,...(state.recoveryRequired||{})};await save();
 if(state.pending?.hash)await receipt(state.pending.hash);
 await restoreRelease();
 throw new Error('Interrupted step retained under recoveryRequired. Review its receipt before resuming; nothing was repeated.');
}
await restoreRelease();
async function step(label,fn){if(state.steps[label])return state.steps[label];console.log(label);state.inFlight={label};await save();const value=await fn();state.steps[label]=value;delete state.inFlight;await save();return value;}
async function send(label,address,abi,functionName,args=[]){return step(label,async()=>{const r=await receipt(await wallet.writeContract({address,abi,functionName,args}));if(r.status!=='success')throw new Error(label+' reverted: '+r.transactionHash);return r.transactionHash;});}
async function deploy(label,a,args=[]){return step(label,async()=>{const r=await receipt(await wallet.deployContract({abi:a.abi,bytecode:a.bytecode.object,args}));if(r.status!=='success'||!r.contractAddress)throw new Error(label+' failed');return r.contractAddress;});}
if(state.previousRecord===undefined){state.previousRecord=await read(resolver,ENS.abi,'data',[node,'swapvm.release']);if(!localCheck&&state.previousRecord!=='0x')throw new Error('Existing ENS release is nonempty; refusing to overwrite it');await save();}
const aqua=await deploy('Aqua',A),executor=await deploy('AtomicExecutor',E,[aqua,zeroAddress,owner,manager]);
if(!await client.getCode({address:executor}))throw new Error('Saved deployment missing from chain');
const input=await deploy('Demo USD',T,['Studio Demo USD','sUSD']),output=await deploy('Demo rUTH',T,['Studio Demo rUTH','rUTH']);
const maker=await deploy('Maker account',D),author=await deploy('Author account',D);
const liquidity=await deploy('Demo liquidity seeder',L,[manager]);
await send('Support USD',executor,E.abi,'setSupportedToken',[input,true]);await send('Support rUTH',executor,E.abi,'setSupportedToken',[output,true]);
await send('Pin ENS resolver',executor,E.abi,'setReleaseResolver',[resolver,node]);
await send('Mint demo USD',input,T.abi,'mint',[owner,10n**27n]);await send('Mint LP rUTH',output,T.abi,'mint',[owner,10n**27n]);await send('Mint maker rUTH',output,T.abi,'mint',[maker,10n**27n]);
const max=2n**256n-1n;
await send('Approve executor',input,T.abi,'approve',[executor,max]);await send('Approve LP USD',input,T.abi,'approve',[liquidity,max]);await send('Approve LP rUTH',output,T.abi,'approve',[liquidity,max]);
function sqrt(n){let x=n,y=(x+1n)/2n;while(y<x){x=y;y=(x+n/x)/2n;}return x;}
const outputFirst=output.toLowerCase()<input.toLowerCase(),pool={currency0:outputFirst?output:input,currency1:outputFirst?input:output,fee:3000,tickSpacing:60,hooks:zeroAddress};
await send('Initialize seeded v4 pool',manager,PM.abi,'initialize',[pool,sqrt((1n<<192n)*(outputFirst?104n:100n)/(outputFirst?100n:104n))]);
await send('Seed v4 liquidity',liquidity,L.abi,'add',[pool]);
const currentReport=JSON.parse(await readFile(join(root,'artifacts/good-full-report.json'),'utf8'));
const report=state.report||currentReport;
if(report.bytecode!==currentReport.bytecode||report.runtimeBytecode!==currentReport.runtimeBytecode)throw new Error('Sample changed since saved run');
state.report=report;await save();
if(!report.passed||!report.bytecode||!report.runtimeBytecode)throw new Error('Passing compiled sample report required');
const reportDigest=keccak256(toHex(JSON.stringify(report))),params='0x',U=10n**18n;
const release=await read(executor,E.abi,'releaseKey',[keccak256(report.bytecode),keccak256(report.runtimeBytecode),author,100n]);
await send('Approve verified release',executor,E.abi,'approveEnsRelease',[keccak256(report.bytecode),keccak256(report.runtimeBytecode),author,100n,reportDigest]);
const record=encodeAbiParameters(parseAbiParameters('bytes32,bytes32'),[release,reportDigest]);
if(!state.steps['Publish ENS release']&&await read(resolver,ENS.abi,'data',[node,'swapvm.release'])!==state.previousRecord)throw new Error('ENS record changed since preflight');
await send('Publish ENS release',resolver,ENS.abi,'setData',[node,'swapvm.release',record]);
const router=await read(executor,E.abi,'router');
state.contracts={executor,router,aqua,manager,resolver,node,input,output,maker,author,liquidity,pool};await save();
async function prepare(index){
 const id=`${executor}:${index}`;
 const a={signer:owner,maker,tokenIn:input,tokenOut:output,author,initCodeHash:keccak256(report.bytecode),runtimeCodeHash:keccak256(report.runtimeBytecode),paramsHash:keccak256(params),salt:keccak256(toHex(id)),amount:100n*U,exactIn:true,maxInput:100n*U,minOutput:98n*U,feeBps:100n,feeCap:U,nonce:BigInt(index),deadline:(await client.getBlock({blockTag:'pending'})).timestamp+86400n};
 const h={poolFee:3000,tickSpacing:60,minReturn:100n*U,ensResolver:resolver,ensNode:node,reportDigest};
 const order=await read(executor,E.abi,'order',[a,params]),strategy=encodeAbiParameters(parseAbiParameters('(address maker,uint256 traits,bytes data)'),[order]);
 await send(`Ship strategy ${index}`,maker,D.abi,'ship',[aqua,router,strategy,[input,output],[10n**24n,10n**24n]]);
 return {a,h,module:await read(executor,E.abi,'predict',[a])};
}
async function snapshot(p){const values={};for(const [label,address]of Object.entries({trader:owner,maker,author,executor,pool:manager}))values[label]={USD:String(await read(input,T.abi,'balanceOf',[address])),rUTH:String(await read(output,T.abi,'balanceOf',[address]))};values.moduleExists=!!await client.getCode({address:p.module});values.nonceUsed=await read(executor,E.abi,'usedNonces',[owner,p.a.nonce]);return values;}
async function execute(label,p,minReturn,expectedReason){return step(label,async()=>{
 const h={...p.h,minReturn},signature=await command(['wallet','sign','--no-hash',await read(executor,E.abi,'hedgedDigest',[p.a,h])]);
 const args=[p.a,h,report.bytecode,params,signature],before=await snapshot(p);
 const r=await receipt(await wallet.writeContract({address:executor,abi:E.abi,functionName:'executeHedged',args,gas:3000000n})),after=await snapshot(p);
 let reason=null;if(r.status==='reverted'){try{await client.simulateContract({account:owner,address:executor,abi:E.abi,functionName:'executeHedged',args,blockNumber:r.blockNumber});}catch(e){reason=e.walk?.(x=>x.name==='ContractFunctionRevertedError')?.reason||null;}}
 const events=r.logs.filter(l=>l.address.toLowerCase()===executor.toLowerCase()).flatMap(l=>{try{return[decodeEventLog({abi:E.abi,data:l.data,topics:l.topics})];}catch{return[];}});
 const result={hash:r.transactionHash,status:r.status,blockNumber:r.blockNumber,gasUsed:r.gasUsed,reason,reasonSource:reason?'eth_call at receipt block':null,before,after,module:p.module,events};
 state.lastResult=result;await save();
 if(expectedReason){if(r.status!=='reverted'||reason!==expectedReason||JSON.stringify(before)!==JSON.stringify(after))throw new Error(`${label}: expected verified rollback (${expectedReason}); inspect saved evidence`);}
 else if(r.status!=='success'||!events.some(e=>e.eventName==='AtomicExecuted')||!after.moduleExists||!after.nonceUsed)throw new Error(label+' did not settle');
 console.log(label+': verified '+r.status);return result;
});}
const first=await prepare(0);
await execute('Late rollback',first,1000n*U,'minimum return');
await execute('Atomic success',first,100n*U,null);
const second=await prepare(1);
state.restoration={resolver,node,record};await save();
try{
 await send('Revoke ENS release',resolver,ENS.abi,'setData',[node,'swapvm.release','0x']);
 if(localCheck&&process.env.ATOMIC_TEST_FAIL_AFTER_REVOKE==='1')throw new Error('Injected interruption after ENS revocation');
 await execute('ENS rejection',second,100n*U,'ENS release mismatch');
}finally{await restoreRelease();}
state.complete=true;state.totalPaidETH=formatEther(spent);await save();password.fill(0);
console.log('Verified all three outcomes. Total gas paid:',state.totalPaidETH,'ETH');console.log('Evidence:',path);

}
main().catch(error=>{console.error("Test stopped:",String(error.shortMessage||error.message).replaceAll(process.env.SEPOLIA_RPC_URL||"<no RPC>","[RPC]"));process.exitCode=1;});
