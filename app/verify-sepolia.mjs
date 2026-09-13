// Read-only verification of the public test against chain receipts and historical state.
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createPublicClient,http,formatEther,decodeEventLog,encodeDeployData,encodeAbiParameters,parseAbiParameters,zeroAddress,keccak256,toHex} from 'viem';
const s=JSON.parse(await readFile('artifacts/atomic-sepolia-test.json','utf8'));
assert.equal(s.complete,true,'Runner has not completed');
const c=createPublicClient({transport:http(process.env.SEPOLIA_RPC_URL)});
assert.equal(await c.getChainId(),11155111);
const e=JSON.parse(await readFile('out/AtomicExecutor.sol/AtomicExecutor.json'));
const token=JSON.parse(await readFile('out/AtomicDemo.sol/DemoToken.json'));
const ens=JSON.parse(await readFile('reference/ens-v2/PermissionedResolver.json'));
const d=s.contracts,receipts=new Map();let paid=0n;
for(let i=0;i<s.receipts.length;i+=4){
 const batch=await Promise.all(s.receipts.slice(i,i+4).map(x=>c.getTransactionReceipt({hash:x.hash})));
 for(const r of batch){assert.equal(r.status,s.receipts.find(x=>x.hash===r.transactionHash).status);assert.equal(r.from.toLowerCase(),s.owner.toLowerCase());paid+=r.gasUsed*r.effectiveGasPrice;receipts.set(r.transactionHash,r);}
}
assert.equal(formatEther(paid),s.totalPaidETH);
const deployment=await c.getTransaction({hash:s.receipts[1].hash});
assert.equal(deployment.input,encodeDeployData({abi:e.abi,bytecode:e.bytecode.object,args:[d.aqua,zeroAddress,s.owner,d.manager]}));
assert.equal(d.manager.toLowerCase(),'0xe03a1074c86cfedd5c142c4f04f1a1536e203543');
const results={};
for(const [label,nonce,status] of [['Late rollback',0n,'reverted'],['Atomic success',0n,'success'],['ENS rejection',1n,'reverted']]){
 const r=s.steps[label],chainReceipt=receipts.get(r.hash),blockNumber=chainReceipt.blockNumber;
 assert.equal(chainReceipt.status,status);
 assert.equal(blockNumber,BigInt(r.blockNumber));
 const [code,used]=await Promise.all([c.getCode({address:r.module,blockNumber}),c.readContract({address:d.executor,abi:e.abi,functionName:'usedNonces',args:[s.owner,nonce],blockNumber})]);
 assert.equal(!!code,status==='success');assert.equal(used,status==='success');
 if(status==='reverted')assert.deepEqual(r.before,r.after);
 for(const [role,address]of Object.entries({trader:s.owner,maker:d.maker,author:d.author,executor:d.executor,pool:d.manager})){
  const requests=[];
  for(const [asset,field]of [[d.input,'USD'],[d.output,'rUTH']]){
   requests.push(c.readContract({address:asset,abi:token.abi,functionName:'balanceOf',args:[address],blockNumber}).then(v=>assert.equal(String(v),r.after[role][field])));
   requests.push(c.readContract({address:asset,abi:token.abi,functionName:'balanceOf',args:[address],blockNumber:blockNumber-1n}).then(v=>assert.equal(String(v),r.before[role][field])));
  }
  await Promise.all(requests);
 }
 const events=chainReceipt.logs.filter(x=>x.address.toLowerCase()===d.executor.toLowerCase()).map(x=>decodeEventLog({abi:e.abi,data:x.data,topics:x.topics}));
 if(status==='success')for(const name of ['ENSChecked','ProgramReady','AquaFilled','UniswapFilled','AuthorPaid','AtomicExecuted'])assert.ok(events.some(x=>x.eventName===name),name+' missing');
 else assert.equal(events.length,0);
 results[label]={hash:r.hash,blockNumber:String(blockNumber),gasUsed:String(chainReceipt.gasUsed),status,events};
}
assert.equal(s.steps['Late rollback'].module,s.steps['Atomic success'].module);
const release=await c.readContract({address:d.executor,abi:e.abi,functionName:'releaseKey',args:[keccak256(s.report.bytecode),keccak256(s.report.runtimeBytecode),d.author,100n]});
const expected=encodeAbiParameters(parseAbiParameters('bytes32,bytes32'),[release,keccak256(toHex(JSON.stringify(s.report)))]);
assert.equal(await c.readContract({address:d.resolver,abi:ens.abi,functionName:'data',args:[d.node,'swapvm.release']}),expected);
const verified={chainId:11155111,verifiedAt:new Date().toISOString(),receiptCount:receipts.size,totalPaidETH:formatEther(paid),executor:d.executor,contracts:d,ensRestored:true,results};
await writeFile('artifacts/atomic-sepolia-verified.json',JSON.stringify(verified,(_,v)=>typeof v==='bigint'?String(v):v,2));
console.log(JSON.stringify({receiptCount:receipts.size,totalPaidETH:verified.totalPaidETH,ensRestored:true,transactions:Object.fromEntries(Object.entries(results).map(([k,v])=>[k,v.hash]))},null,2));
