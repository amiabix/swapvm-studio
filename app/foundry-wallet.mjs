// Local, opt-in Sepolia signer. Passwords travel only over stdin to the existing cast helper.
import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {mkdir,appendFile} from 'node:fs/promises';
import {createPublicClient,http,isAddress,hashTypedData} from 'viem';
import {sepolia} from 'viem/chains';
import {root} from './verify.mjs';
const MAX_FEE=3_000_000_000n,BUDGET=40_000_000_000_000_000n;
export function validateWalletTransaction(tx,address){
 const allowed=['from','to','chainId','value','data','gas','maxFeePerGas','maxPriorityFeePerGas'];
 if(Object.keys(tx).some(k=>!allowed.includes(k))||tx.from?.toLowerCase()!==address.toLowerCase()||Number(tx.chainId)!==11155111||!isAddress(tx.to||'',{strict:false})||BigInt(tx.value||0)!==0n||!/^0x(?:[0-9a-fA-F]{2})*$/.test(tx.data||'')||(tx.data.length>64000))throw new Error('Signer accepts only reviewed zero-value Sepolia contract calls');
 const gas=BigInt(tx.gas||0);if(gas<1n||gas>3_000_000n||BigInt(tx.maxFeePerGas||0)>MAX_FEE||BigInt(tx.maxPriorityFeePerGas||0)>MAX_FEE)throw new Error('Signer gas limit exceeded');
 return gas*MAX_FEE;
}
export async function createFoundryWallet({password,keystore=join(homedir(),'.foundry/keystores/cure-issuer'),expected='0xEa9cD7BEf18a5F8B7f26e63710335e640D6C36dd',approve,rpc=process.env.SEPOLIA_RPC_URL||'https://ethereum-sepolia-rpc.publicnode.com'}){
 if(typeof approve!=='function')throw new Error('Terminal confirmation is required');
 const command=args=>new Promise((resolve,reject)=>{
  const child=execFile('python3',[join(root,'script/cast-unlock.py'),join(homedir(),'.foundry/bin/cast'),...args,'--keystore',keystore],{maxBuffer:200000,timeout:100000},(error,stdout)=>error?reject(new Error('Foundry signing failed. Check the keystore password or RPC; no retry was sent automatically.')):resolve(stdout.trim()));
  child.stdin.on('error',()=>{});child.stdin.end(password);
 });
 const address=await command(['wallet','address']);if(address.toLowerCase()!==expected.toLowerCase())throw new Error('Keystore is not the expected Studio wallet');
 const client=createPublicClient({chain:sepolia,transport:http(rpc,{retryCount:0,timeout:15000})});
 const checkChain=async()=>{if(await client.getChainId()!==11155111)throw new Error('Foundry signer is Sepolia-only');};
 await checkChain();let reserved=0n;const attempts=new Map();
 const auditPath=join(root,'artifacts/foundry-wallet-audit.jsonl');await mkdir(join(root,'artifacts'),{recursive:true});
 const audit=value=>appendFile(auditPath,JSON.stringify({at:new Date().toISOString(),...value})+'\n',{mode:0o600});
 return {
  address,name:'cure-issuer',
  async sign(typedData,summary){
   if(Number(typedData.domain.chainId)!==11155111||typedData.primaryType!=='HedgedAuthorization')throw new Error('Unexpected authorization');
   await checkChain();const digest=hashTypedData(typedData);
   if(!await approve({action:'Sign trade authorization (no transaction)',wallet:address,...summary,typedData,digest}))throw new Error('Signing declined in Terminal');
   return command(['wallet','sign','--no-hash',digest]);
  },
  async send(id,tx,summary){
   if(attempts.has(id)){const hash=attempts.get(id);if(hash)return hash;throw new Error('Broadcast outcome needs review. Check the Terminal audit log; this request will not be resent.');}
   const worst=validateWalletTransaction(tx,address);await checkChain();
   if(reserved+worst>BUDGET)throw new Error('Session gas budget exceeded (0.04 test ETH)');
   if(!await approve({action:'Send Sepolia transaction',wallet:address,...summary,transaction:tx,maximumGasCostETH:String(Number(worst)/1e18),sessionGasBudgetETH:'0.04'}))throw new Error('Transaction declined in Terminal');
   await checkChain();if(await client.getBalance({address})<worst)throw new Error('Insufficient test ETH for the gas allowance');
   const nonce=await client.getTransactionCount({address,blockTag:'pending'});
   await audit({id,nonce,from:address,to:tx.to,data:tx.data,status:'broadcast-attempt'});attempts.set(id,null);reserved+=worst;
   const hash=await command(['send','--rpc-url',rpc,'--chain','11155111','--async','--nonce',String(nonce),'--gas-limit',String(BigInt(tx.gas)),'--gas-price',String(MAX_FEE),'--priority-gas-price','1000000','--value','0',tx.to,tx.data]);
   if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw new Error('Unexpected transaction result; inspect the audit log');
   attempts.set(id,hash);await audit({id,nonce,hash,status:'sent'});console.log('Sent: https://sepolia.etherscan.io/tx/'+hash);return hash;
  }
 };
}
