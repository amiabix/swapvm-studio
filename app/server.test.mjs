import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from './server.mjs';
test('rejects cross-origin mutation and unknown execution jobs',async t=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const url=`http://127.0.0.1:${server.address().port}`;
 const denied=await fetch(url+'/api/build',{method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'},body:JSON.stringify({prompt:'curve',mode:'replay'})});
 assert.equal(denied.status,403);
 const missing=await fetch(url+'/api/jobs/missing/execute',{method:'POST',headers:{'content-type':'application/json'},body:'{"confirm":true}'});
 assert.equal(missing.status,404);
 const status=await fetch(url+'/api/status');assert.equal(status.status,200);assert.equal((await status.json()).chain.chainId,31337);
});
