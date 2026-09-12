import { mkdtemp, readFile, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
export const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const run=promisify(execFile);
export const forge=process.env.FORGE_BIN || join(homedir(),'.foundry/bin/forge');
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function validateSource(source) {
 if(typeof source!=='string'||source.length>24000) throw new Error('Candidate source must be at most 24000 characters');
 const stripped=source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'');
 for(const word of ['import','assembly','constructor','fallback','receive','selfdestruct','delegatecall','staticcall','call','address','new','this','abi','block','msg','tx','gasleft','type'])
  if(new RegExp('\\b'+word+'\\b').test(stripped)) throw new Error('Forbidden candidate capability: '+word);
 if((stripped.match(/\bcontract\s+/g)||[]).length!==1 || !/\bcontract\s+Candidate\s*\{/.test(stripped)) throw new Error('Exactly one contract named Candidate is required');
 if(/\b(interface|library|isStaticContext)\b/.test(stripped)) throw new Error('Only the restricted Candidate pricing interface is allowed');
 if(!/function\s+quote\s*\(/.test(stripped)) throw new Error('Candidate must implement quote');
}
export async function verifyCandidate(source,{fuzzRuns=128,onEvent=()=>{}}={}) {
 const started=Date.now();
 try {validateSource(source);} catch(error) {return {passed:false,checks:[{name:'Restricted source',passed:false,output:error.message}],counterexamples:[error.message],durationMs:Date.now()-started};}
 const dir=await mkdtemp(join(tmpdir(),'studio-candidate-'));
 try {
  await mkdir(join(dir,'src'));await mkdir(join(dir,'test'));
  await writeFile(join(dir,'src/Candidate.sol'),source);
  const harness=await readFile(join(root,'test/Candidate.template.txt'),'utf8');
  await writeFile(join(dir,'test/Candidate.t.sol'),harness);
  await symlink(join(root,'node_modules'),join(dir,'node_modules'),'dir');
  await writeFile(join(dir,'foundry.toml'),'[profile.default]\nsolc_version="0.8.30"\nevm_version="cancun"\noptimizer=true\noptimizer_runs=700\nvia_ir=true\nffi=false\nremappings=["forge-std/=node_modules/forge-std/src/"]\n');
  onEvent({type:'verification',message:'Compiling isolated candidate and running fixed Foundry campaign'});
  let output,exitCode=0;
  try {({stdout:output}=await run(forge,['test','--root',dir,'--json','--fuzz-runs',String(fuzzRuns),'--fuzz-seed','0x53545544494f'],{cwd:dir,timeout:120000,maxBuffer:4_000_000,env:{...process.env,FOUNDRY_FFI:'false'}}));}
  catch(error){output=(error.stdout||'')+'\n'+(error.stderr||'');exitCode=error.code;}
  let suites;
  try {suites=JSON.parse(output.slice(output.indexOf('{')));} catch {}
  const checks=[];
  for(const suite of Object.values(suites||{})) for(const [name,result] of Object.entries(suite.test_results||{})) {
   checks.push({name,passed:result.status==='Success',output:result.reason||'',counterexample:result.counterexample||null,runs:result.kind?.Fuzz?.runs??null});
  }
  if(!checks.length) checks.push({name:'Compilation / campaign',passed:false,output:output.slice(-10000)});
  const passed=exitCode===0 && checks.length>=9 && checks.every(c=>c.passed);
  const report={passed,checks,counterexamples:checks.filter(c=>!c.passed).map(c=>({name:c.name,reason:c.output,inputs:c.counterexample})),sourceHash:digest(source),harnessHash:digest(harness),compiler:'solc 0.8.30, optimizer 700, viaIR, Cancun',fuzzRuns,seed:'0x53545544494f',scope:'Pricing properties on reserves 1e24/1e24 and amounts 1e12..1e21; balance checks extend to 1e27. This campaign is testing, not a proof.',skipped:['Full router quote/swap consistency is validated separately by integration tests, not this pricing campaign.'],durationMs:Date.now()-started};
  if(passed){
   const compiled=JSON.parse(await readFile(join(dir,'out/Candidate.sol/Candidate.json'),'utf8'));
   report.artifactHash=digest(JSON.stringify({sourceHash:report.sourceHash,harnessHash:report.harnessHash,compiler:report.compiler,bytecode:compiled.bytecode.object}));
   report.bytecode=compiled.bytecode.object;
   report.runtimeBytecode=compiled.deployedBytecode.object;
   report.abi=compiled.abi;
  }
  return report;
 } finally {await rm(dir,{recursive:true,force:true});}
}
