import {readFile,writeFile} from 'node:fs/promises';
import {ExactHederaScheme,createClientHederaSigner,PrivateKey} from '@x402/hedera';
import {Client,TopicMessageSubmitTransaction} from '@hiero-ledger/sdk';
import {createReportManifest} from './sponsors.mjs';
const facilitator='https://api.testnet.blocky402.com';
export async function payForVerification({source,fuzzRuns=128,endpoint='http://127.0.0.1:4180/api/verify',accountId=process.env.HEDERA_ACCOUNT_ID,privateKey=process.env.HEDERA_PRIVATE_KEY,maxTinybars=1000000n}) {
 if(!accountId||!privateKey)throw new Error('Hedera account and private key must be configured locally');
 const request={source,fuzzRuns};
 const challenge=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});
 const body=await challenge.json();if(challenge.status!==402)throw new Error('Expected a 402 payment challenge: '+(body.error||challenge.status));
 const requirements=body.accepts?.find(r=>r.network==='hedera:testnet'&&r.asset==='0.0.0');
 if(!requirements||BigInt(requirements.amount)>BigInt(maxTinybars))throw new Error('Payment exceeds authorized tinybar budget or unsupported network');
 const supported=await (await fetch(facilitator+'/supported')).json();
 const feePayer=supported.kinds?.find(k=>k.network==='hedera:testnet')?.extra?.feePayer;
 if(!feePayer||requirements.extra?.feePayer!==feePayer)throw new Error('Facilitator fee-payer mismatch');
 const signer=createClientHederaSigner(accountId,PrivateKey.fromStringECDSA(privateKey),{network:'hedera:testnet'});
 const signed=await new ExactHederaScheme(signer).createPaymentPayload(2,requirements);
 const paymentPayload={x402Version:2,scheme:'exact',network:'hedera:testnet',accepted:requirements,payload:signed.payload};
 const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','PAYMENT-SIGNATURE':Buffer.from(JSON.stringify(paymentPayload)).toString('base64')},body:JSON.stringify(request)});
 const result=await response.json();if(!response.ok||!result.settlement?.success)throw new Error('Paid verification failed: '+(result.error||response.status));
 return result;
}
export async function verifyHcsMessage({topicId,sequenceNumber,message,fetch=globalThis.fetch}) {
 if(!/^0\.0\.\d+$/.test(topicId)||!/^\d+$/.test(String(sequenceNumber)))throw new Error('Invalid HCS identifiers');
 const response=await fetch(`https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages/${sequenceNumber}`);
 if(!response.ok)return {verified:false,pending:response.status===404};
 const result=await response.json();
 return {verified:Buffer.from(result.message||'','base64').toString('utf8')===message,consensusTimestamp:result.consensus_timestamp};
}
export async function submitHcsReport({report,topicId=process.env.HEDERA_TOPIC_ID,accountId=process.env.HEDERA_ACCOUNT_ID,privateKey=process.env.HEDERA_PRIVATE_KEY}) {
 if(!topicId||!accountId||!privateKey)throw new Error('Configure Hedera topic, account and local signing key');
 if(!/^0\.0\.\d+$/.test(topicId))throw new Error('Invalid Hedera topic');
 const manifest=createReportManifest(report);const message=JSON.stringify(manifest);
 const client=Client.forTestnet().setOperator(accountId,PrivateKey.fromStringECDSA(privateKey));
 try{
  const transaction=await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(message).execute(client);
  const receipt=await transaction.getReceipt(client);
  if(receipt.status.toString()!=='SUCCESS')throw new Error('HCS submission did not succeed');
  const sequenceNumber=receipt.topicSequenceNumber.toString();
  const mirror=await verifyHcsMessage({topicId,sequenceNumber,message});
  return {manifest,transactionId:transaction.transactionId.toString(),topicId,sequenceNumber,...mirror,meaning:'HCS records the report commitment; verification conclusions remain the verifier assertion.'};
 }finally{client.close();}
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 const action=process.argv[2],file=process.argv[3];
 if(action==='pay'&&file){const result=await payForVerification({source:await readFile(file,'utf8')});await writeFile('artifacts/hedera-paid-report.json',JSON.stringify(result,null,2));console.log(JSON.stringify({transaction:result.settlement.transaction,passed:result.response.passed}));}
 else if(action==='anchor'&&file){const result=await submitHcsReport({report:JSON.parse(await readFile(file,'utf8'))});await writeFile('artifacts/hcs-anchor.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
 else throw new Error('Usage: node --env-file=.env app/hedera-client.mjs pay candidate.sol | anchor report.json');
}
