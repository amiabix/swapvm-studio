import test from 'node:test';
import assert from 'node:assert/strict';
import {validateWalletTransaction} from './foundry-wallet.mjs';
const owner='0xEa9cD7BEf18a5F8B7f26e63710335e640D6C36dd';
const tx={from:owner,to:'0x916da5514e87ccc49696a88bba5aa8db2b529a93',chainId:'0xaa36a7',value:'0x0',data:'0x1234',gas:'0x186a0',maxFeePerGas:'0xb2d05e00',maxPriorityFeePerGas:'0xf4240'};
test('Foundry signer only accepts bounded Sepolia calls from the selected wallet',()=>{
 assert.equal(validateWalletTransaction(tx,owner),300000000000000n);
 for(const patch of [{chainId:'0x1'},{from:tx.to},{to:null},{value:'0x1'},{gas:'0x0'},{gas:'0x400000'},{data:'0x1'},{maxFeePerGas:'0xffffffff'},{nonce:'0x1'}])assert.throws(()=>validateWalletTransaction({...tx,...patch},owner));
});

test('real keystore signatures require approval and recover to the expected address',async t=>{
 const {createFoundryWallet}=await import('./foundry-wallet.mjs');
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const {mkdtemp,rm}=await import('node:fs/promises');const {join}=await import('node:path');const {homedir,tmpdir}=await import('node:os');
 const {createServer}=await import('node:http');const {recoverTypedDataAddress}=await import('viem');
 const dir=await mkdtemp(join(tmpdir(),'studio-wallet-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const password=Buffer.from('signer-regression-only'),expected='0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
 await promisify(execFile)(join(homedir(),'.foundry/bin/cast'),['wallet','import','fixture','--keystore-dir',dir,'--mnemonic','test test test test test test test test test test test junk','--unsafe-password',password.toString()]);
 const rpcServer=createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const q=JSON.parse(raw);assert.equal(q.method,'eth_chainId');res.setHeader('content-type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:q.id,result:'0xaa36a7'}));});
 await new Promise(r=>rpcServer.listen(0,'127.0.0.1',r));t.after(()=>rpcServer.close());
 let approved=false,confirmations=0;
 const wallet=await createFoundryWallet({password,keystore:join(dir,'fixture'),expected,rpc:`http://127.0.0.1:${rpcServer.address().port}`,approve:async()=>{confirmations++;return approved;}});
 const data={domain:{name:'SwapVM Studio',version:'1',chainId:11155111,verifyingContract:tx.to},primaryType:'HedgedAuthorization',types:{HedgedAuthorization:[{name:'tradeHash',type:'bytes32'}]},message:{tradeHash:'0x'+'12'.repeat(32)}};
 await assert.rejects(wallet.sign(data,{}),/declined/);
 await assert.rejects(wallet.send('declined',{...tx,from:expected},{}),/declined/);
 assert.equal(confirmations,2);approved=true;
 const signature=await wallet.sign(data,{});assert.equal((await recoverTypedDataAddress({...data,signature})).toLowerCase(),expected);
 await assert.rejects(wallet.sign({...data,domain:{...data.domain,chainId:1}},{}),/Unexpected authorization/);
 assert.equal(confirmations,3);
});
