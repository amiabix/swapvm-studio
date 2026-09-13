// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
// MCP stdio: newline-delimited JSON-RPC; stdout is protocol-only.
import {createInterface} from 'node:readline';
import {inventory,json} from './solvent.mjs';
const position={type:'object',properties:{app:{type:'string'},strategyHash:{type:'string'},token:{type:'string'}},required:['app','strategyHash','token'],additionalProperties:false};
const tool={name:'solvent_inventory',description:'Read advertised and deliverable Aqua inventory at a pinned block. Omit arguments for local demo positions. Does not reserve inventory or authorize trades.',inputSchema:{type:'object',properties:{maker:{type:'string'},positions:{type:'array',items:position,minItems:1,maxItems:128}},additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:true}};
export async function dispatch(message,read=inventory){
 const id=message?.id;
 if(!message||message.jsonrpc!=='2.0'||typeof message.method!=='string')return {jsonrpc:'2.0',id:id??null,error:{code:-32600,message:'Invalid request'}};
 if(id===undefined)return null;
 let result;
 switch(message.method){
  case 'initialize':result={protocolVersion:['2025-11-25','2025-06-18','2024-11-05'].includes(message.params?.protocolVersion)?message.params.protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'solvent',version:'0.1.0'}};break;
  case 'ping':result={};break;
  case 'tools/list':result={tools:[tool]};break;
  case 'tools/call':
   if(message.params?.name!==tool.name)return {jsonrpc:'2.0',id,error:{code:-32602,message:'Unknown tool'}};
   try{const args=message.params.arguments;const data=await read(args&&Object.keys(args).length?args:undefined);result={content:[{type:'text',text:json(data)}],structuredContent:JSON.parse(json(data)),isError:false};}
   catch(e){result={content:[{type:'text',text:e.message}],isError:true};}break;
  default:return {jsonrpc:'2.0',id,error:{code:-32601,message:'Method not found'}};
 }
 return {jsonrpc:'2.0',id,result};
}
if(process.argv[1]===new URL(import.meta.url).pathname){
 for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
  let response;try{if(Buffer.byteLength(line)>65536)throw new Error('Message too large');response=await dispatch(JSON.parse(line));}
  catch{response={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON message'}};}
  if(response)process.stdout.write(json(response)+'\n');
 }
}
