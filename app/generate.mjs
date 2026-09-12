import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {root} from './verify.mjs';
export async function repair(prompt,{generate,verify,onEvent=()=>{},maxAttempts=3}={}) {
 const attempts=[];
 for(let attempt=0;attempt<maxAttempts;attempt++) {
  onEvent({type:'generation',message:attempt?'Repairing candidate using the failed campaign':'Generating pricing candidate',attempt:attempt+1});
  try {
   const source=await generate({prompt,attempt,previousSource:attempts.at(-1)?.source,previousReport:attempts.at(-1)?.report});
   const report=await verify(source);
   attempts.push({source,report});
   onEvent({type:report.passed?'verified':'counterexample',message:report.passed?'Candidate passed the configured pricing campaign':'Candidate rejected; counterexample retained',attempt:attempt+1,report});
   if(report.passed) return {status:'passed',attempts,artifact:report};
  } catch(error) {onEvent({type:'error',message:error.message});return {status:'failed',attempts,error:error.message};}
 }
 return {status:'failed',attempts,error:'Repair limit reached; no executable artifact released'};
}
export async function replayGenerate({attempt}) {
 return readFile(join(root,'app/fixtures',attempt===0?'Candidate.bad.sol':'Candidate.good.sol'),'utf8');
}
export async function liveGenerate(context) {
 const prompt=`Return ONLY Solidity source for contract Candidate, pragma solidity 0.8.30. No markdown. Implement function quote(uint256 amount,bool exactIn,uint256 balanceIn,uint256 balanceOut,bytes calldata params) external pure returns(uint256 amountIn,uint256 amountOut). No imports, constructors, assembly, storage writes, external calls or environment reads. Use bounded arithmetic. Preserve exact amount side. Return positive prices, favor maker rounding (exact-in output floor, exact-out input ceil), monotonic price, liquidity sufficiency, inverse symmetry within 2 wei, sequential additive behavior within 3 wei. Supported reserves 1e24, ordinary amounts 1e12..1e21, large exact-in liquidity probes through 1e27 must also quote safely. Constant product is an acceptable base. If user asks for behavior incompatible with these constraints, explain via revert string rather than pretend it was implemented. User request: ${context.prompt}\nPrior source: ${context.previousSource||'none'}\nCounterexample report: ${JSON.stringify(context.previousReport?.counterexamples||[])}`;
 const command=process.env.STUDIO_MODEL_COMMAND;
 if(!command) throw new Error('Live model is not configured. Set STUDIO_MODEL_COMMAND to a JSON executable/argument array; the prompt is supplied on stdin.');
 let args=JSON.parse(command);
 if(!Array.isArray(args)||!args.length||args.some(a=>typeof a!=='string')) throw new Error('STUDIO_MODEL_COMMAND must be a JSON string array');
 const output=await new Promise((resolve,reject)=>{
  const child=execFile(args[0],args.slice(1),{cwd:root,timeout:120000,maxBuffer:100000},(error,stdout,stderr)=>error?reject(new Error('Model command failed: '+(stderr||error.message).slice(0,1000))):resolve(stdout));
  child.stdin.end(prompt);
 });
 return output.trim().replace(/^```(?:solidity)?\s*/,'').replace(/\s*```$/,'');
}
