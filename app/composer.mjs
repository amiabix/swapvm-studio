import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createPublicClient,createWalletClient,http,isAddress,getAddress,zeroAddress,parseUnits,formatUnits,encodeAbiParameters,encodeFunctionData,decodeEventLog,parseAbi,keccak256,toHex,hashTypedData,recoverTypedDataAddress,erc20Abi} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
import {sepolia,foundry} from 'viem/chains';
import {root,verifyCandidate} from './verify.mjs';
import {atomicStatus} from './atomic.mjs';
const drafts=new Map(),modules=new Map();let verifying=false;
const plain=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v));
const file=async p=>JSON.parse(await readFile(join(root,p),'utf8'));
const artifact=async n=>file(`out/${n}.sol/${n}.json`);
const same=(a,b)=>a.toLowerCase()===b.toLowerCase();
const address=(v,name)=>{if(typeof v!=='string'||!isAddress(v,{strict:false})||same(v,zeroAddress))throw new Error(`Enter a valid ${name} address`);return getAddress(v);};
function number(v,name,max,min=0){if(!/^\d+$/.test(String(v)))throw new Error(`${name} must be a whole number`);const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`${name} must be ${min}–${max}`);return n;}
function units(v,decimals,name,positive=false){if(typeof v!=='string'||!/^\d+(\.\d+)?$/.test(v)||(v.split('.')[1]?.length||0)>decimals)throw new Error(`${name} must be a decimal with at most ${decimals} decimal places`);const n=parseUnits(v,decimals);if(n>(10n**27n)||n<(positive?1n:0n))throw new Error(`${name} is outside the supported amount range`);return n;}
export function parseRoute(input,decimals){
 const p={};for(const k of ['signer','maker','author','tokenIn','tokenOut'])p[k]=address(input[k],k);
 if(same(p.tokenIn,p.tokenOut))throw new Error('Choose two different tokens');
 if(same(p.signer,p.maker)||same(p.signer,p.author)||same(p.maker,p.author))throw new Error('Trader, maker and author must be distinct accounts');
 for(const [key,d,positive] of [['amount',decimals.input,true],['minReturn',decimals.input,false],['minOutput',decimals.output,false],['feeCap',decimals.output,false],['allocationIn',decimals.input,true],['allocationOut',decimals.output,true]])p[key]=units(input[key],d,key,positive);
 p.feeBps=BigInt(number(input.feeBps,'Author fee',1000));p.poolFee=number(input.poolFee,'Pool fee',999999);p.tickSpacing=number(input.tickSpacing,'Tick spacing',32767,1);p.minutes=number(input.minutes,'Expiry minutes',1440,1);
 if(typeof input.params!=='string'||!/^0x(?:[a-fA-F0-9]{2}){0,128}$/.test(input.params))throw new Error('Parameters must be 0–128 bytes of even-length hex');p.params=input.params;
 return p;
}
async function context(network){
 if(!['sepolia','local'].includes(network))throw new Error('Choose Sepolia or local Anvil');
 let c,url,chain;
 if(network==='local'){c=await atomicStatus();if(!c.available)throw new Error('Start local Anvil and run npm run atomic:setup');url=c.rpc;chain=foundry;}
 else{const evidence=await file('docs/evidence/atomic-sepolia-verified.json');c={...evidence.contracts,tokenIn:evidence.contracts.input,tokenOut:evidence.contracts.output};url=process.env.SEPOLIA_RPC_URL||'https://ethereum-sepolia-rpc.publicnode.com';chain=sepolia;}
 const client=createPublicClient({chain,transport:http(url,{timeout:15000,retryCount:0})});
 if(await client.getChainId()!==chain.id)throw new Error('RPC chain mismatch');
 const e=await artifact('AtomicExecutor');
 const read=(address,abi,functionName,args=[])=>client.readContract({address,abi,functionName,args});
 const [owner,router,resolver,node,manager]=await Promise.all(['owner','router','releaseResolver','releaseNode','poolManager'].map(n=>read(c.executor,e.abi,n)));
 if(!same(router,c.router)||!same(manager,c.manager))throw new Error('Executor deployment differs from recorded infrastructure');
 return {network,c:{...c,owner,router,resolver,node,manager},chain,client,read,e};
}
export async function composerConfig(network){
 const x=await context(network),report=await file('artifacts/good-full-report.json');
 const source=await readFile(join(root,'app/fixtures/Candidate.good.sol'),'utf8');
 const symbols=await Promise.all([x.c.tokenIn,x.c.tokenOut].map(token=>x.read(token,erc20Abi,'symbol')));
 return plain({symbols,network,chainId:x.chain.id,contracts:x.c,source,module:{id:'sample',report},defaults:{signer:x.c.trader||x.c.owner,maker:x.c.maker,author:x.c.author,tokenIn:x.c.tokenIn,tokenOut:x.c.tokenOut,amount:'100',minOutput:'98',minReturn:'100',feeBps:'100',feeCap:'1',allocationIn:'1000000',allocationOut:'1000000',poolFee:'3000',tickSpacing:'60',minutes:'60',params:'0x'}});
}
export async function verifyModule(source){
 if(verifying)throw new Error('A source verification is already running');verifying=true;
 try{const report=await verifyCandidate(source);if(!report.passed)return {report};if(modules.size>=50)throw new Error('Module limit reached; restart the server');const id=randomUUID();modules.set(id,{...report,source});return {id,report};}finally{verifying=false;}
}
async function tokenInfo(x,token,signer,maker){
 const [name,symbol,decimals,traderBalance,makerBalance,traderAllowance,makerAllowance,supported]=await Promise.all([
  x.read(token,erc20Abi,'name'),x.read(token,erc20Abi,'symbol'),x.read(token,erc20Abi,'decimals'),x.read(token,erc20Abi,'balanceOf',[signer]),x.read(token,erc20Abi,'balanceOf',[maker]),x.read(token,erc20Abi,'allowance',[signer,x.c.executor]),x.read(token,erc20Abi,'allowance',[maker,x.c.aqua]),x.read(x.c.executor,x.e.abi,'supportedTokens',[token])]);
 if(decimals>36)throw new Error('Token decimals above 36 are unsupported');
 return {address:token,name,symbol,decimals,traderBalance,makerBalance,traderAllowance,makerAllowance,supported};
}
export async function previewRoute(data){
 const x=await context(data.network),{c,read,client,e}=x;
 const signer=address(data.signer,'signer'),maker=address(data.maker,'maker');
 const tokenIn=address(data.tokenIn,'input token'),tokenOut=address(data.tokenOut,'output token');
 const [input,output]=await Promise.all([tokenInfo(x,tokenIn,signer,maker),tokenInfo(x,tokenOut,signer,maker)]);
 const p=parseRoute(data,{input:input.decimals,output:output.decimals});
 if(same(p.author,c.executor))throw new Error('Author cannot be the executor');
 const report=data.moduleId==='sample'?await file('artifacts/good-full-report.json'):modules.get(data.moduleId);
 if(!report?.passed||!report.bytecode||!report.runtimeBytecode)throw new Error('Select a verified pricing module');
 const source=report.source||await readFile(join(root,'app/fixtures/Candidate.good.sol'),'utf8');
 const id=randomUUID(),block=await client.getBlock({blockTag:'pending'});
 const a={signer,maker,tokenIn,tokenOut,author:p.author,initCodeHash:keccak256(report.bytecode),runtimeCodeHash:keccak256(report.runtimeBytecode),paramsHash:keccak256(p.params),salt:keccak256(toHex(id)),amount:p.amount,exactIn:true,maxInput:p.amount,minOutput:p.minOutput,feeBps:p.feeBps,feeCap:p.feeCap,nonce:BigInt(keccak256(toHex(id))),deadline:block.timestamp+BigInt(p.minutes*60)};
 const release=await read(c.executor,e.abi,'releaseKey',[a.initCodeHash,a.runtimeCodeHash,a.author,a.feeBps]);
 // The same compiled sample may already have an approved report digest. Preserve that existing release.
 const approved=await read(c.executor,e.abi,'releases',[release]);
 const storedDigest=await read(c.executor,e.abi,'releaseReportDigests',[release]);
 const reportDigest=approved&&storedDigest!==toHex(0,{size:32})?storedDigest:keccak256(toHex(JSON.stringify(report)));
 const h={poolFee:p.poolFee,tickSpacing:p.tickSpacing,minReturn:p.minReturn,ensResolver:c.resolver,ensNode:c.node,reportDigest};
 const [module,order,ensRecord]=await Promise.all([read(c.executor,e.abi,'predict',[a]),read(c.executor,e.abi,'order',[a,p.params]),read(c.resolver,parseAbi(['function data(bytes32,string) view returns(bytes)']),'data',[c.node,'swapvm.release'])]);
 const strategy=encodeAbiParameters([{type:'tuple',components:[{name:'maker',type:'address'},{name:'traits',type:'uint256'},{name:'data',type:'bytes'}]}],[order]);
 const orderHash=keccak256(strategy),pool={currency0:tokenIn.toLowerCase()<tokenOut.toLowerCase()?tokenIn:tokenOut,currency1:tokenIn.toLowerCase()<tokenOut.toLowerCase()?tokenOut:tokenIn,fee:p.poolFee,tickSpacing:p.tickSpacing,hooks:zeroAddress};
 const poolId=keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint24'},{type:'int24'},{type:'address'}],Object.values(pool)));
 // Uniswap v4 StateLibrary: pools mapping is slot 6; active liquidity is Pool.State offset 3.
 const poolSlot=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'uint256'}],[poolId,6n]));
 const loadAbi=parseAbi(['function extsload(bytes32) view returns(bytes32)']);
 const [slot0,liquidityWord]=await Promise.all([read(c.manager,loadAbi,'extsload',[poolSlot]),read(c.manager,loadAbi,'extsload',[toHex(BigInt(poolSlot)+3n,{size:32})])]);
 const sqrtPriceX96=BigInt(slot0)&((1n<<160n)-1n),liquidity=BigInt(liquidityWord)&((1n<<128n)-1n);
 if(sqrtPriceX96===0n||liquidity===0n)throw new Error('The selected Uniswap pool is uninitialized or has no active liquidity. Choose a funded pool.');
 if(input.traderBalance<p.amount)throw new Error(`Trader has only ${formatUnits(input.traderBalance,input.decimals)} ${input.symbol}`);
 const steps=[];
 const add=(label,from,to,abi,functionName,args,note='')=>steps.push({label,from,to,data:encodeFunctionData({abi,functionName,args}),value:'0x0',functionName,args,note});
 for(const t of [input,output])if(!t.supported)add(`Allow ${t.symbol} on executor`,c.owner,c.executor,e.abi,'setSupportedToken',[t.address,true],'Executor owner must review this standard ERC-20 before allowing it.');
 if(!approved||storedDigest===toHex(0,{size:32}))add('Approve verified module release',c.owner,c.executor,e.abi,'approveEnsRelease',[a.initCodeHash,a.runtimeCodeHash,a.author,a.feeBps,reportDigest]);
 const record=encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[release,reportDigest]);
 if(ensRecord!==record)add('Publish release to ENS resolver',c.owner,c.resolver,parseAbi(['function setData(bytes32,string,bytes)']),'setData',[c.node,'swapvm.release',record],'Replaces the current swapvm.release record. Other releases using this record will no longer match. The signing account needs resolver write permission.');
 if(input.traderAllowance<p.amount)add(`Approve ${formatUnits(p.amount,input.decimals)} ${input.symbol}`,signer,tokenIn,erc20Abi,'approve',[c.executor,p.amount]);
 const aqua=await artifact('Aqua');
 const makerCode=await client.getCode({address:maker});
 if(makerCode&&makerCode!=='0x'){
  const d=await file('out/AtomicDemo.sol/DemoAccount.json'),makerOwner=await read(maker,d.abi,'owner');
  add('Maker authorizes Aqua and ships position',makerOwner,maker,d.abi,'ship',[c.aqua,c.router,strategy,[tokenIn,tokenOut],[p.allocationIn,p.allocationOut]],'DemoAccount grants Aqua unlimited allowance for these tokens. The allocation is virtual; tokens stay in the maker account.');
 }else{
  if(output.makerAllowance<p.allocationOut)add(`Maker approves ${output.symbol} to Aqua`,maker,tokenOut,erc20Abi,'approve',[c.aqua,p.allocationOut]);
  add('Ship position to Aqua',maker,c.aqua,aqua.abi,'ship',[c.router,strategy,[tokenIn,tokenOut],[p.allocationIn,p.allocationOut]],'Registers the strategy and virtual allocation. This does not deploy the pricing module or transfer inventory.');
 }
 const authInput=e.abi.find(v=>v.name==='executeHedged').inputs[0];
 const typeHash=await read(c.executor,e.abi,'AUTHORIZATION_TYPEHASH');
 const tradeHash=keccak256(encodeAbiParameters([{type:'bytes32'},authInput],[typeHash,a]));
 const typedData={domain:{name:'SwapVM Studio',version:'1',chainId:x.chain.id,verifyingContract:c.executor},primaryType:'HedgedAuthorization',types:{EIP712Domain:[{name:'name',type:'string'},{name:'version',type:'string'},{name:'chainId',type:'uint256'},{name:'verifyingContract',type:'address'}],HedgedAuthorization:[{name:'tradeHash',type:'bytes32'},{name:'poolFee',type:'uint24'},{name:'tickSpacing',type:'int24'},{name:'minReturn',type:'uint256'},{name:'ensResolver',type:'address'},{name:'ensNode',type:'bytes32'},{name:'reportDigest',type:'bytes32'}]},message:{tradeHash,...h}};
 if(hashTypedData(typedData)!==await read(c.executor,e.abi,'hedgedDigest',[a,h]))throw new Error('Typed-data digest mismatch');
 const result={id,moduleId:data.moduleId,network:data.network,chainId:x.chain.id,createdAt:new Date().toISOString(),contracts:c,tokens:{input,output},authorization:a,hedge:h,release,reportDigest,ensRecord,targetEnsRecord:record,module:{address:module,deployed:!!await client.getCode({address:module}),source,bytecode:report.bytecode,runtimeBytecode:report.runtimeBytecode,checks:report.checks,scope:report.scope},aqua:{order,strategy,orderHash,allocationIn:p.allocationIn,allocationOut:p.allocationOut},pool:{...pool,id:poolId,sqrtPriceX96,liquidity},steps,typedData,receipts:[],params:p.params};
 if(drafts.size>=50)throw new Error('Draft limit reached; restart the server');
 drafts.set(id,{...x,result,a,h,report,p});return plain(result);
}
const draft=id=>{const p=drafts.get(id);if(!p)throw new Error('Draft expired; review the route again');return p;};
export async function setupTransaction(id,index){
 const p=draft(id),s=p.result.steps[index];if(!Number.isInteger(index)||!s||index!==p.result.receipts.length)throw new Error('Complete the setup steps in order');
 const gas=await p.client.estimateGas({account:s.from,to:s.to,data:s.data});
 return {from:s.from,to:s.to,data:s.data,value:'0x0',chainId:toHex(p.chain.id),gas:toHex(gas*12n/10n),...(p.network==='sepolia'?{maxFeePerGas:toHex(3_000_000_000n),maxPriorityFeePerGas:toHex(1_000_000n)}:{})};
}
export async function recordSetup(id,index,hash){
 const p=draft(id),s=p.result.steps[index];if(p.result.receipts[index]?.hash===hash)return p.result.receipts[index];if(!s||index!==p.result.receipts.length)throw new Error('Unexpected setup step');
 const [tx,r]=await Promise.all([p.client.getTransaction({hash}),p.client.waitForTransactionReceipt({hash,timeout:120000})]);
 if(!same(tx.from,s.from)||!same(tx.to,s.to)||tx.input!==s.data||tx.value!==0n)throw new Error('Setup receipt does not match this step');
 if(r.status!=='success'){const error=new Error('Setup transaction reverted: '+hash);error.transactionReverted=true;throw error;}
 const result={label:s.label,hash,blockNumber:String(r.blockNumber),gasUsed:String(r.gasUsed),status:r.status};p.result.receipts.push(result);return result;
}
export async function signAndSimulate(id,signature){
 const p=draft(id);if(p.completed)throw new Error('This route has already settled');if(p.result.receipts.length!==p.result.steps.length)throw new Error('Complete setup before signing');
 if(!signature||!same(await recoverTypedDataAddress({...p.result.typedData,signature}),p.a.signer))throw new Error('Signature is not from the selected trader');
 const args=[p.a,p.h,p.report.bytecode,p.p.params,signature];
 const simulation=await p.client.simulateContract({address:p.c.executor,abi:p.e.abi,functionName:'executeHedged',args,account:p.a.signer});
 const data=encodeFunctionData({abi:p.e.abi,functionName:'executeHedged',args});
 const gas=await p.client.estimateGas({account:p.a.signer,to:p.c.executor,data});
 const tx={from:p.a.signer,to:p.c.executor,data,value:'0x0',chainId:toHex(p.chain.id),gas:toHex(gas*12n/10n),...(p.network==='sepolia'?{maxFeePerGas:toHex(3_000_000_000n),maxPriorityFeePerGas:toHex(1_000_000n)}:{})};
 p.finalTx=tx;p.simulation=plain({transaction:tx,returned:simulation.result,blockNumber:await p.client.getBlockNumber({cacheTime:0}),simulationOnly:true});return p.simulation;
}
export async function recordExecution(id,hash){
 const p=draft(id);if(!p.finalTx)throw new Error('Sign and simulate first');
 const [tx,r]=await Promise.all([p.client.getTransaction({hash}),p.client.waitForTransactionReceipt({hash,timeout:120000})]);
 if(!same(tx.from,p.a.signer)||!same(tx.to,p.c.executor)||tx.input!==p.finalTx.data||tx.value!==0n)throw new Error('Execution receipt does not match the reviewed route');
 const events=r.logs.filter(l=>same(l.address,p.c.executor)).flatMap(l=>{try{return [{...decodeEventLog({abi:p.e.abi,data:l.data,topics:l.topics}),logIndex:l.logIndex}];}catch{return [];}});
 const transfers=r.logs.filter(l=>same(l.address,p.a.tokenIn)||same(l.address,p.a.tokenOut)).flatMap(l=>{try{const d=decodeEventLog({abi:erc20Abi,data:l.data,topics:l.topics});return d.eventName==='Transfer'?[{...d,address:l.address,logIndex:l.logIndex}]:[];}catch{return [];}});
 const aqua=await artifact('Aqua'),allocation=await p.read(p.c.aqua,aqua.abi,'safeBalances',[p.a.maker,p.c.router,p.result.aqua.orderHash,p.a.tokenIn,p.a.tokenOut]);
 const result=plain({hash,status:r.status,blockNumber:r.blockNumber,gasUsed:r.gasUsed,events,transfers,receipt:r,network:p.network,chainId:p.chain.id,module:p.result.module.address,moduleDeployed:!!await p.client.getCode({address:p.result.module.address}),aquaAllocationAfter:allocation,tokens:p.result.tokens});
 p.completed=r.status==='success';p.execution=result;
 await mkdir(join(root,'artifacts/composer'),{recursive:true});await writeFile(join(root,'artifacts/composer',hash+'.json'),JSON.stringify({draft:plain(p.result),execution:result},null,2));return result;
}
async function localWallet(p,from){
 if(p.network!=='local'||await p.client.getChainId()!==31337||!['127.0.0.1','localhost','[::1]'].includes(new URL(p.client.transport.url).hostname))throw new Error('Development signing is local-only');
 for(let addressIndex=0;addressIndex<4;addressIndex++){const account=mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex});if(same(account.address,from))return createWalletClient({account,chain:foundry,transport:http(p.client.transport.url)});}
 throw new Error('Local signing is restricted to the four demo accounts');
}
export async function localSetup(id,index){const p=draft(id),tx=await setupTransaction(id,index),wallet=await localWallet(p,tx.from);const hash=await wallet.sendTransaction({to:tx.to,data:tx.data,value:0n,gas:BigInt(tx.gas)});return recordSetup(id,index,hash);}
export async function localSimulate(id){const p=draft(id),wallet=await localWallet(p,p.a.signer);return signAndSimulate(id,await wallet.signTypedData(p.result.typedData));}
export async function localExecute(id){const p=draft(id);if(p.completed)throw new Error('This route has already settled');if(!p.finalTx)throw new Error('Simulate first');const wallet=await localWallet(p,p.a.signer),tx=p.finalTx;return recordExecution(id,await wallet.sendTransaction({to:tx.to,data:tx.data,value:0n,gas:BigInt(tx.gas)}));}

export function savedDraft(id){const p=draft(id);return plain({draft:p.result,simulation:p.simulation||null,execution:p.execution||null});}
