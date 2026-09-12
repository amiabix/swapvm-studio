import { createHash } from 'node:crypto';
import { encodeFunctionData, encodeAbiParameters, keccak256, namehash, stringToHex } from 'viem';

const resolverAbi=[
 {type:'function',name:'data',stateMutability:'view',inputs:[{name:'node',type:'bytes32'},{name:'key',type:'string'}],outputs:[{type:'bytes'}]},
 {type:'function',name:'setData',stateMutability:'nonpayable',inputs:[{name:'node',type:'bytes32'},{name:'key',type:'string'},{name:'value',type:'bytes'}],outputs:[]},
];
const sha256=value=>'0x'+createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const requireValue=(value,name)=>{if(!value) throw new Error(`${name} is required`);return value;};
const responseJson=async(response,label)=>{
 let body;try {body=await response.json();} catch {throw new Error(`${label} returned non-JSON`);}
 if(!response.ok) throw new Error(`${label} failed with HTTP ${response.status}: ${body?.errorMessage||body?.error||''}`.trim());
 return body;
};

export function sponsorStatus({facilitatorUrl,hcsEndpoint,ensResolver}={}) {
 return {blocky402:facilitatorUrl?'configured':'unconfigured',hcs:hcsEndpoint?'configured':'unconfigured',ens:ensResolver?'configured':'unconfigured'};
}

export function createReportManifest(report) {
 if(!report||typeof report!=='object') throw new Error('report is required');
 const reportDigest=sha256(canonical(report));
 const manifest={schema:'swapvm-verifier-report/v1',reportDigest,artifactHash:report.artifactHash||null,runtimeCodeHash:report.runtimeCodeHash||null,sourceHash:report.sourceHash||null,harnessHash:report.harnessHash||null,verifierSignatureDigest:report.signature?sha256(report.signature):null};
 return {...manifest,digest:sha256(canonical(manifest))};
}

export function buildEnsReleaseRead({name,resolver,key='swapvm.release.manifest'}) {
 return {to:requireValue(resolver,'resolver'),data:encodeFunctionData({abi:resolverAbi,functionName:'data',args:[namehash(requireValue(name,'name')),key]})};
}

export function buildEnsReleasePin({name,resolver,report,key='swapvm.release.manifest'}) {
 const manifest=createReportManifest(report);
 return {to:requireValue(resolver,'resolver'),data:encodeFunctionData({abi:resolverAbi,functionName:'setData',args:[namehash(requireValue(name,'name')),key,stringToHex(canonical(manifest))]}),manifest};
}

export async function settlePaidVerification({facilitatorUrl='https://api.testnet.blocky402.com',paymentPayload,paymentRequirements,runVerification,apiKey,fetch=globalThis.fetch}) {
 requireValue(paymentPayload,'paymentPayload');requireValue(paymentRequirements,'paymentRequirements');
 if(typeof runVerification!=='function') throw new Error('runVerification is required');
 if(typeof fetch!=='function') throw new Error('fetch is unavailable');
 const headers={'content-type':'application/json',...(apiKey?{'x-api-key':apiKey}:{})};
 const body=JSON.stringify({x402Version:2,paymentPayload,paymentRequirements});
 const verify=await responseJson(await fetch(`${facilitatorUrl.replace(/\/$/,'')}/verify`,{method:'POST',headers,body}),'Blocky402 verification');
 if(verify.isValid!==true||!verify.payer) throw new Error(`Blocky402 verification rejected payment: ${verify.invalidMessage||verify.invalidReason||'unknown reason'}`);
 const settlement=await responseJson(await fetch(`${facilitatorUrl.replace(/\/$/,'')}/settle`,{method:'POST',headers,body}),'Blocky402 settlement');
 if(settlement.success!==true||!settlement.transaction) throw new Error(`Blocky402 settlement failed: ${settlement.errorMessage||settlement.errorReason||'missing transaction receipt'}`);
 return {payer:verify.payer,settlement,response:await runVerification({payer:verify.payer,paymentPayload,paymentRequirements,settlement})};
}

export async function anchorHcsReport({endpoint,topicId,report,headers={},fetch=globalThis.fetch}) {
 requireValue(endpoint,'HCS anchor endpoint');
 if(!/^\d+\.\d+\.\d+$/.test(requireValue(topicId,'topicId'))) throw new Error('topicId must be a Hedera topic ID');
 if(typeof fetch!=='function') throw new Error('fetch is unavailable');
 const manifest=createReportManifest(report);
 const message=Buffer.from(canonical(manifest)).toString('base64');
 const receipt=await responseJson(await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({topicId,message,encoding:'base64'})}),'HCS anchor relay');
 if(receipt.topicId!==topicId||!receipt.transactionId||!receipt.consensusTimestamp) throw new Error('HCS anchor relay returned no consensus receipt');
 return {manifest,receipt};
}

export function buildEnsGatePin({name,resolver,initCodeHash,runtimeCodeHash,author,feeBps,reportDigest}) {
 const releaseKey=keccak256(encodeAbiParameters([{type:'bytes32'},{type:'bytes32'},{type:'address'},{type:'uint256'}],[initCodeHash,runtimeCodeHash,author,BigInt(feeBps)]));
 const value=encodeAbiParameters([{type:'bytes32'},{type:'bytes32'}],[releaseKey,reportDigest]);
 return {to:requireValue(resolver,'resolver'),data:encodeFunctionData({abi:resolverAbi,functionName:'setData',args:[namehash(requireValue(name,'name')),'swapvm.release',value]}),releaseKey,reportDigest,value};
}
