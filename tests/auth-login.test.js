const {test}=require('node:test');
const assert=require('node:assert/strict');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
test('login válido devolve sessão e credenciais inválidas são rejeitadas',async()=>{
 const secretAntes=process.env.JWT_SECRET;process.env.JWT_SECRET='segredo-apenas-para-teste-local';
 const supabasePath=require.resolve('../src/supabaseClient');const authPath=require.resolve('../src/routes/auth.routes');
 const anterior=require.cache[supabasePath];
 const hash=await bcrypt.hash('Senha-de-teste-local',4);
 const user={id:'u',empresa_id:'e',nome:'Teste',email:'teste@invalid',senha_hash:hash,papel:'admin'};
 require.cache[supabasePath]={id:supabasePath,filename:supabasePath,loaded:true,exports:{supabaseAdmin:{from(table){
  return {select(){return this;},eq(){return this;},order(){return this;},limit(){return this;},
    maybeSingle:async()=>({data:table==='usuarios'?user:table==='empresas'?{id:'e',nome_negocio:'Teste'}:null,error:null}),
    upsert:async()=>({error:null})};
 }}}};delete require.cache[authPath];
 try{
  const router=require('../src/routes/auth.routes');const handler=router.stack.find(l=>l.route?.path==='/login').route.stack[0].handle;
  function resposta(){return{statusCode:200,status(n){this.statusCode=n;return this;},json(d){this.body=d;return this;}};}
  const ok=resposta();await handler({body:{email:'teste@invalid',senha:'Senha-de-teste-local'}},ok,e=>{throw e;});
  assert.equal(ok.statusCode,200);assert.equal(jwt.verify(ok.body.token,process.env.JWT_SECRET).sub,'u');assert.equal(ok.body.usuario.empresa.id,'e');assert.equal(ok.body.usuario.senha_hash,undefined);
  const err=resposta();await handler({body:{email:'teste@invalid',senha:'errada'}},err,e=>{throw e;});assert.equal(err.statusCode,401);
  const invalid=resposta();await handler({body:{email:'teste@invalid',senha:{}}},invalid,e=>{throw e;});assert.equal(invalid.statusCode,400);
 }finally{delete require.cache[authPath];if(anterior)require.cache[supabasePath]=anterior;else delete require.cache[supabasePath];if(secretAntes===undefined)delete process.env.JWT_SECRET;else process.env.JWT_SECRET=secretAntes;}
});
