const {test}=require('node:test');
const assert=require('node:assert/strict');
const {lerTodas}=require('../src/services/leitura.service');
test('leitura financeira inclui mais de mil registos e rejeita páginas incompletas por erro',async()=>{
  const dados=Array.from({length:1201},(_,i)=>({id:i,valor:1}));
  const linhas=await lerTodas(()=>({range:async(a,b)=>({data:dados.slice(a,b+1)})}));
  assert.equal(linhas.reduce((s,r)=>s+r.valor,0),1201);
  await assert.rejects(lerTodas(()=>({range:async(a,b)=>a?{error:new Error('Falha na segunda página')}:{data:dados.slice(a,b+1)}})),/segunda página/);
});
