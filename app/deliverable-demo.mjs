// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// Local fork only. Public Anvil keys; never load a user's wallet or .env secrets.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createPublicClient,createWalletClient,http,encodeAbiParameters,parseAbiParameters,concatHex,toHex,keccak256,maxUint256,zeroAddress} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
import {foundry} from 'viem/chains';
const root=fileURLToPath(new URL('../',import.meta.url));
const rpc=process.env.DELIVERABLE_RPC||'http://127.0.0.1:8549';
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(rpc).hostname),'Local RPC required');
const transport=http(rpc,{timeout:20000});
const client=createPublicClient({chain:foundry,transport,pollingInterval:100});
assert.equal(await client.getChainId(),31337,'Public demo keys restricted to chain 31337');
const wallets=[0,1,2].map(addressIndex=>createWalletClient({chain:foundry,transport,account:mnemonicToAccount('test test test test test test test test test test test junk',{addressIndex})}));
const [owner,maker,trader]=wallets;
const aqua='0x499943E74FB0cE105688beeE8Ef2ABec5D936d31';
assert((await client.getCode({address:aqua}))?.length>2,'Start the documented mainnet fork; existing Aqua is required');
const info=await client.request({method:'anvil_nodeInfo'});
assert(info.forkConfig?.forkBlockNumber,'An Ethereum fork is required');
const forkBlock=info.forkConfig.forkBlockNumber;
const receipts=[];
async function artifact(file,name){return JSON.parse(await readFile(`${root}out/${file}/${name}.json`,'utf8'));}
async function receipt(hash,label,expected='success'){
 const r=await client.waitForTransactionReceipt({hash});assert.equal(r.status,expected,label);
 receipts.push({label,hash,status:r.status,gasUsed:String(r.gasUsed),blockNumber:String(r.blockNumber)});
 console.log(`${label}: ${r.status} ${hash}`);return r;
}
async function deploy(a,args=[],label='deploy'){
 const r=await receipt(await owner.deployContract({abi:a.abi,bytecode:a.bytecode.object,args}),label);
 assert(r.contractAddress);return r.contractAddress;
}
async function send(w,address,a,fn,args,label,expected='success'){
 return receipt(await w.writeContract({address,abi:a.abi,functionName:fn,args,gas:3000000n}),label,expected);
}
const token=await artifact('Studio.t.sol','Token'), aa=await artifact('Aqua.sol','Aqua');
const ra=await artifact('AquaSwapVMRouter.sol','AquaSwapVMRouter');
const ma=await artifact('DeliverableBalances.sol','DeliverableBalances');
const na=await artifact('DeliverableSwapVMRouter.sol','DeliverableSwapVMRouter');
const stock=await deploy(ra,[aqua,zeroAddress,owner.account.address,'SwapVM','1'],'unmodified official release router');
const module=await deploy(ma,[],'extruction module');
const native=await deploy(na,[aqua,zeroAddress,owner.account.address],'appended native router');
const input=await deploy(token,[],'input token');
const lens=await deploy(await artifact('SolventLens.sol','SolventLens'),[],'public inventory Lens');
await send(owner,input,token,'mint',[trader.account.address,10n**27n],'fund test trader');
for(const router of [stock,native])await send(trader,input,token,'approve',[router,maxUint256],'input approval');
let scenarioId=0;
const R=10n**18n, data='0x00000000000000000000000000000000000000000041',results=[];
function code(path,mode,salt){
 const prefix=concatHex(['0x1401',toHex(salt,{size:1})]);
 const clamp=path==='external'?concatHex(['0x2029',module,toHex(mode,{size:1}),aqua]):path==='native'?concatHex(['0x2115',toHex(mode,{size:1}),aqua]):'0x';
 return concatHex([prefix,clamp,'0x1100']);
}
async function ship(router,output,path,mode,salt){
 const order={maker:maker.account.address,traits:1n<<254n,data:code(path,mode,salt)};
 const bytes=encodeAbiParameters(parseAbiParameters('(address maker,uint256 traits,bytes data)'),[order]);
 await send(maker,aqua,aa,'ship',[router,bytes,[input,output],[1000n*R,1000n*R]],`${path} ship ${salt}`);return order;
}
async function quote(router,order,output){
 const {result}=await client.simulateContract({address:router,abi:ra.abi,functionName:'quote',account:trader.account,args:[order,input,output,1500n*R,data]});return result[1];
}
for(const [path,mode] of [['baseline',0],['external',0],['external',1],['native',0],['native',1]]){
 const router=path==='native'?native:stock,label=`${path} mode ${mode}`;
 const saltBase=10*(++scenarioId);
 const output=await deploy(token,[],`${label} rUTH`);
 await send(owner,output,token,'mint',[maker.account.address,1000n*R],`${label} wallet = 1000`);
 await send(maker,output,token,'approve',[aqua,maxUint256],`${label} output approval`);
 const first=await ship(router,output,'baseline',0,saltBase+1),second=await ship(router,output,path,mode,saltBase+2);
 await send(trader,router,ra,'swap',[first,input,output,1500n*R,data],`${label} first fill`);
 const balance=await client.readContract({address:output,abi:token.abi,functionName:'balanceOf',args:[maker.account.address]});assert.equal(balance,400n*R);
 const quoted=await quote(router,second,output);
 if(path==='baseline')assert.equal(quoted,600n*R);else assert(quoted>0n&&quoted<balance);
 const secondReceipt=await send(trader,router,ra,'swap',[second,input,output,1500n*R,data],`${label} second fill`,path==='baseline'?'reverted':'success');
 const after=await client.readContract({address:output,abi:token.abi,functionName:'balanceOf',args:[maker.account.address]});
 assert.equal(after,path==='baseline'?balance:balance-quoted);
 results.push({path,mode,router,program:second.data,token:output,maker:maker.account.address,strategyHash:keccak256(encodeAbiParameters(parseAbiParameters('(address maker,uint256 traits,bytes data)'),[second])),quoted:String(quoted),walletBefore:String(balance),walletAfter:String(after),secondFill:secondReceipt.transactionHash});
}
// Separate revocation scene keeps all 1000 tokens in the wallet.
const revoked=await deploy(token,[],'revocation rUTH');
await send(owner,revoked,token,'mint',[maker.account.address,1000n*R],'revocation wallet = 1000');
await send(maker,revoked,token,'approve',[aqua,maxUint256],'revocation initial approval');
const order=await ship(stock,revoked,'external',0,9);
assert((await quote(stock,order,revoked))>0n);
await send(maker,revoked,token,'approve',[aqua,0n],'revoke Aqua approval');
await assert.rejects(()=>quote(stock,order,revoked));
assert.equal(await client.readContract({address:revoked,abi:token.abi,functionName:'balanceOf',args:[maker.account.address]}),1000n*R);
console.log('Revoked: wallet still holds 1000 rUTH; canonical quote correctly reverts at zero reserves.');
await mkdir(`${root}artifacts`,{recursive:true});
await writeFile(`${root}artifacts/deliverable-demo.json`,JSON.stringify({chainId:31337,forkBlock,aqua,stock,module,native,lens,input,results,receipts,revocation:'zero deliverable registers; full quote reverts'},null,2));
console.log('Verified demo evidence: artifacts/deliverable-demo.json');
