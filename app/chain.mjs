import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createPublicClient,createWalletClient,http,keccak256,encodeAbiParameters,parseAbiParameters,zeroAddress,toHex,decodeEventLog} from 'viem';
import {mnemonicToAccount} from 'viem/accounts';
import {foundry} from 'viem/chains';
import {root} from './verify.mjs';
const rpc=process.env.STUDIO_RPC_URL||'http://127.0.0.1:8547';
const url=new URL(rpc);
if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)) throw new Error('Local demo supports loopback RPC only');
const transport=http(rpc,{timeout:10000});
const publicClient=createPublicClient({chain:foundry,transport});
const mnemonic='test test test test test test test test test test test junk';
const wallets=[0,1,2,3].map(addressIndex=>createWalletClient({account:mnemonicToAccount(mnemonic,{addressIndex}),chain:foundry,transport}));
const [owner,maker,trader,author]=wallets;
const configPath=join(root,'artifacts',process.env.STUDIO_CHAIN_FILE||'local-chain.json');
async function artifact(file,name){return JSON.parse(await readFile(join(root,'out',file,name+'.json'),'utf8'));}
async function ensureLocal(){if(await publicClient.getChainId()!==31337)throw new Error('Refusing demo keys outside local chain 31337');}
async function send(wallet,request){const hash=await wallet.writeContract(request);const receipt=await publicClient.waitForTransactionReceipt({hash});if(receipt.status!=='success')throw new Error('Transaction reverted: '+hash);return receipt;}
async function deploy(name,args=[]){const a=await artifact(name+'.sol',name);const hash=await owner.deployContract({abi:a.abi,bytecode:a.bytecode.object,args});const r=await publicClient.waitForTransactionReceipt({hash});if(r.status!=='success'||!r.contractAddress)throw new Error('Deployment failed');return r.contractAddress;}
export async function chainStatus(){try{await ensureLocal();const c=JSON.parse(await readFile(configPath,'utf8'));const code=await publicClient.getCode({address:c.executor});const current=await artifact('StudioExecutor.sol','StudioExecutor');return {available:!!code&&c.buildHash===keccak256(current.bytecode.object),chainId:31337,rpc,...c};}catch{return {available:false,chainId:31337,rpc};}}
export async function setupChain(){
 await ensureLocal();const previous=await chainStatus();if(previous.available)return previous;
 const aqua=await deploy('Aqua');const executor=await deploy('StudioExecutor',[aqua,zeroAddress,owner.account.address]);
 const token=await artifact('Studio.t.sol','Token');
 async function deployToken(){const hash=await owner.deployContract({abi:token.abi,bytecode:token.bytecode.object});return (await publicClient.waitForTransactionReceipt({hash})).contractAddress;}
 const tokenIn=await deployToken(),tokenOut=await deployToken();
 const e=await artifact('StudioExecutor.sol','StudioExecutor');
 for(const address of [tokenIn,tokenOut])await send(owner,{address:executor,abi:e.abi,functionName:'setSupportedToken',args:[address,true]});
 for(const [address,to] of [[tokenIn,trader.account.address],[tokenOut,maker.account.address]])await send(owner,{address,abi:token.abi,functionName:'mint',args:[to,10n**30n]});
 await send(trader,{address:tokenIn,abi:token.abi,functionName:'approve',args:[executor,2n**256n-1n]});
 await send(maker,{address:tokenOut,abi:token.abi,functionName:'approve',args:[aqua,2n**256n-1n]});
 const router=await publicClient.readContract({address:executor,abi:e.abi,functionName:'router'});
 const config={buildHash:keccak256(e.bytecode.object),executor,aqua,router,tokenIn,tokenOut,owner:owner.account.address,maker:maker.account.address,trader:trader.account.address,author:author.account.address};
 await mkdir(join(root,'artifacts'),{recursive:true});await writeFile(configPath,JSON.stringify(config,null,2));return config;
}
export async function executeArtifact(report,{id,confirm}={}) {
 if(confirm!==true)throw new Error('Explicit local-demo confirmation required');
 if(!report.passed||!report.bytecode||!report.runtimeBytecode)throw new Error('Only a passed candidate can execute');
 await ensureLocal();const c=await chainStatus();if(!c.available)throw new Error('Run node app/chain.mjs setup first');
 const e=await artifact('StudioExecutor.sol','StudioExecutor');const a=await artifact('Aqua.sol','Aqua');
 const params='0x',initCodeHash=keccak256(report.bytecode),runtimeCodeHash=keccak256(report.runtimeBytecode);
 await send(owner,{address:c.executor,abi:e.abi,functionName:'approveRelease',args:[initCodeHash,runtimeCodeHash,c.author,100n]});
 const block=await publicClient.getBlock();
 const auth={signer:c.trader,maker:c.maker,tokenIn:c.tokenIn,tokenOut:c.tokenOut,author:c.author,initCodeHash,runtimeCodeHash,paramsHash:keccak256(params),salt:keccak256(toHex(id)),amount:10n**18n,exactIn:true,maxInput:10n**18n,minOutput:98n*10n**16n,feeBps:100n,feeCap:10n**16n,nonce:BigInt(keccak256(toHex(id))),deadline:block.timestamp+600n};
 const order=await publicClient.readContract({address:c.executor,abi:e.abi,functionName:'order',args:[auth,params]});
 const strategy=encodeAbiParameters(parseAbiParameters('(address maker,uint256 traits,bytes data)'),[order]);
 await send(maker,{address:c.aqua,abi:a.abi,functionName:'ship',args:[c.router,strategy,[c.tokenIn,c.tokenOut],[10n**24n,10n**24n]]});
 const authorization=await publicClient.readContract({address:c.executor,abi:e.abi,functionName:'digest',args:[auth]});
 const signature=await trader.account.sign({hash:authorization});
 const predicted=await publicClient.readContract({address:c.executor,abi:e.abi,functionName:'predict',args:[auth]});
 const before=await publicClient.getCode({address:predicted});
 const {request,result}=await publicClient.simulateContract({account:trader.account,address:c.executor,abi:e.abi,functionName:'execute',args:[auth,report.bytecode,params,signature]});
 const receipt=await send(trader,request);
 const payment=receipt.logs.map(log=>{try{return decodeEventLog({abi:e.abi,data:log.data,topics:log.topics});}catch{return null;}}).find(log=>log?.eventName==='AuthorPaid');
 return {transactionHash:receipt.transactionHash,blockNumber:String(receipt.blockNumber),chainId:31337,module:predicted,deployedInTransaction:!before,amountIn:String(result[0]),amountOut:String(result[1]),authorFee:String(result[2]),author:c.author,authorPaymentVerified:!!payment,gasUsed:String(receipt.gasUsed),mode:'Local Anvil; public development keys',preparation:'Token approvals, reviewed release registration and Aqua strategy shipping are setup transactions. Module deployment, swap and author payment share the displayed transaction.'};
}
if(process.argv[1]===new URL(import.meta.url).pathname&&process.argv[2]==='setup')console.log(JSON.stringify(await setupChain(),null,2));
