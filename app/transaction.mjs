import {readFileSync} from 'node:fs';
import {createPublicClient,http,decodeEventLog,decodeFunctionData,formatUnits,parseAbi} from 'viem';
import {sepolia} from 'viem/chains';

export const TRANSACTION_HASH='0xa18c378e881f3abe9074e746ade151df89cce0e10e471b649eaaccd00906dd07';
const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url)));
const snapshot=read('./data/sepolia-transaction.json');
const contracts=read('../docs/evidence/atomic-sepolia-verified.json').contracts;
const abi=[...read('./data/transaction-abi.json'),...parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)','event Approval(address indexed owner, address indexed spender, uint256 value)'])];
const names=['ENSChecked','ProgramReady','AquaFilled','UniswapFilled','AuthorPaid','AtomicExecuted'];
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const units=n=>formatUnits(BigInt(n),18);
const serial=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));

export function normalizeTransaction(source){
 const {tx,receipt,block}=source;
 if(!same(tx.hash,TRANSACTION_HASH)||!same(receipt.transactionHash,tx.hash)||!same(receipt.blockHash,block.hash)||!same(tx.blockHash,block.hash)||String(receipt.blockNumber)!==String(block.number)||String(tx.blockNumber)!==String(block.number)||!same(tx.to,contracts.executor)||!same(receipt.to,tx.to)||Number(tx.chainId)!==11155111||receipt.status!=='success')throw new Error('Transaction identity or receipt status mismatch');
 const logs=receipt.logs.map(log=>{
  if(!same(log.transactionHash,tx.hash)||!same(log.blockHash,block.hash)||String(log.blockNumber)!==String(block.number)||log.removed)throw new Error('Log does not belong to the confirmed transaction');
  let decoded={eventName:'Unknown event',args:{}};
  try{decoded=decodeEventLog({abi,data:log.data,topics:log.topics,strict:true});}catch{}
  return serial({...log,...decoded});
 });
 const stages=logs.filter(l=>same(l.address,contracts.executor)&&names.includes(l.eventName));
 if(stages.map(l=>l.eventName).join(',')!==names.join(','))throw new Error('Incomplete atomic execution evidence');
 const transfers=logs.filter(l=>l.eventName==='Transfer').map(l=>({...l,token:same(l.address,contracts.input)?'sUSD':same(l.address,contracts.output)?'rUTH':null,amount:(same(l.address,contracts.input)||same(l.address,contracts.output))?units(l.args.value):null}));
 const final=stages.at(-1).args;
 return serial({hash:tx.hash,chainId:11155111,tx,receipt,block,contracts,logs,stages,transfers,input:decodeFunctionData({abi,data:tx.input}),
  outcome:{spent:units(final.spent),returned:units(final.returned),fee:units(final.authorFee),difference:units(BigInt(final.returned)-BigInt(final.spent))},
  gas:{fee:units(BigInt(receipt.gasUsed)*BigInt(receipt.effectiveGasPrice)),price:formatUnits(BigInt(receipt.effectiveGasPrice),9),maxFee:formatUnits(BigInt(tx.maxFeePerGas),9),priorityCap:formatUnits(BigInt(tx.maxPriorityFeePerGas),9),baseFee:formatUnits(BigInt(block.baseFeePerGas),9),burnt:units(BigInt(receipt.gasUsed)*BigInt(block.baseFeePerGas)),usedPercent:(Number(receipt.gasUsed)*100/Number(tx.gas)).toFixed(2)},
  traceAvailable:false});
}
const client=createPublicClient({chain:sepolia,transport:http(process.env.SEPOLIA_RPC_URL||'https://ethereum-sepolia-rpc.publicnode.com',{timeout:10000,retryCount:0})});
let last=normalizeTransaction(snapshot),lastVerifiedAt=null,pending=null,cached=null,cachedAt=0;
export async function transactionStatus(){
 // ponytail: one fixed transaction, one shared 10-second cache; no general explorer indexing.
 if(cached&&Date.now()-cachedAt<10000)return cached;
 if(pending)return pending;
 pending=(async()=>{
  try{
   const [tx,receipt,head,finalized]=await Promise.all([client.getTransaction({hash:TRANSACTION_HASH}),client.getTransactionReceipt({hash:TRANSACTION_HASH}),client.getBlockNumber({cacheTime:0}),client.getBlock({blockTag:'finalized'}).catch(()=>null)]);
   const block=await client.getBlock({blockNumber:receipt.blockNumber});
   if(head<receipt.blockNumber)throw new Error('RPC head is behind receipt');
   last=normalizeTransaction({tx,receipt,block:{number:block.number,hash:block.hash,timestamp:block.timestamp,baseFeePerGas:block.baseFeePerGas}});
   lastVerifiedAt=new Date().toISOString();
   cached={...last,connection:{live:true,checkedAt:lastVerifiedAt,head:String(head),confirmations:String(head-receipt.blockNumber+1n),finalized:finalized?finalized.number>=receipt.blockNumber:null}};
  }catch{
   cached={...last,connection:{live:false,checkedAt:lastVerifiedAt,savedAt:snapshot.savedAt,head:null,confirmations:null,finalized:null,message:'Live RPC verification unavailable. Showing saved transaction evidence; current chain status is unverified.'}};
  }
  cachedAt=Date.now();return cached;
 })();
 try{return await pending;}finally{pending=null;}
}
