import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {server} from '../src/server.js';

test('HTTP gateway exposes safe config, closes unauthorized live calls and traversal',async()=>{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const origin=`http://127.0.0.1:${server.address().port}`;
  try{
    const response=await fetch(`${origin}/jevwrapper/api/config`);const config=await response.json();
    assert.equal(response.status,200);assert.equal(config.authRequired,true);assert.equal('apiKey' in config,false);
    const privateCall=await fetch(`${origin}/jevwrapper/api/interpret`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'test'})});
    assert.ok([401,503].includes(privateCall.status));
    assert.equal((await fetch(`${origin}/jevwrapper/.env`)).status,404);
    assert.equal((await fetch(`${origin}/jevwrapper/%2e%2e/src/index.js`)).status,404);
    assert.equal((await fetch(`${origin}/jevwrapper`,{redirect:'manual'})).status,308);
    assert.equal(response.headers.get('cache-control'),'no-store');
  }finally{server.close();server.closeAllConnections();}
});
