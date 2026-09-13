import {readFileSync,createReadStream,createWriteStream} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import {execFile} from 'node:child_process';
import {createFoundryWallet} from './foundry-wallet.mjs';
import {createServer} from './server.mjs';
const password=readFileSync(0);
const terminal=createInterface({input:createReadStream('/dev/tty'),output:createWriteStream('/dev/tty'),terminal:true});
try{
 const signer=await createFoundryWallet({password,approve:async details=>{
  console.log('\n'+JSON.stringify(details,null,2));
  return (await terminal.question('\nType YES in this Terminal to approve, or press Enter to reject: ')).trim()==='YES';
 }});
 const server=createServer({signer});server.on('error',error=>{console.error(error.message);password.fill(0);process.exit(1);});
 server.listen(4183,'127.0.0.1',()=>{console.log('\nConnected '+signer.address+' through Foundry.\nStudio: http://127.0.0.1:4183/compose?network=sepolia\nKeep this Terminal open. Each signature and transaction needs YES here. Ctrl+C disconnects.');execFile('open',['http://127.0.0.1:4183/compose?network=sepolia']);});
 process.on('SIGINT',()=>{password.fill(0);process.exit(0);});
}catch(error){password.fill(0);console.error(error.message);terminal.close();process.exit(1);}
