const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
test('pagamentos guardam intenção antes de cobrar e não repetem pedidos incertos',async()=>{
  const paths=['../src/supabaseClient','../src/services/mpesa.service','../src/services/emola.service','../src/routes/pagamentos.routes'].map(require.resolve);
  const anteriores=paths.map(p=>require.cache[p]);
  const registos=new Map();let chamadas=0,falharGravacao=false,falharProvedor=false;
  const cliente={from(){let novo,alteracao,filtros={};const q={
    insert(d){novo=d;return q;},update(d){alteracao=d;return q;},select(){return q;},eq(k,v){filtros[k]=v;return q;},
    async single(){
      if(novo){if(falharGravacao) return {error:new Error('Base indisponível')};if(registos.has(novo.id)) return {error:{code:'23505'}};registos.set(novo.id,{...novo});return {data:{...novo}};}
      const r=registos.get(filtros.id);Object.assign(r,alteracao);return {data:{...r}};
    },async maybeSingle(){return {data:registos.get(filtros.id)};}
  };return q;}};
  const service={estaConfigurado:()=>true,iniciarPagamentoC2B:async()=>{chamadas++;if(falharProvedor) throw Error('Resposta perdida');return {sucesso:true,simulado:false,referencia:'TESTE'};}};
  try{
    [cliente,service,service].forEach((v,i)=>require.cache[paths[i]]={id:paths[i],filename:paths[i],loaded:true,exports:i===0?{supabaseAdmin:v}:v});
    delete require.cache[paths[3]];
    const router=require(paths[3]);const handler=router.stack.find(l=>l.route?.path==='/mpesa/c2b').route.stack[0].handle;
    async function pedido(id){const res={statusCode:200,status(s){this.statusCode=s;return this;},json(d){this.body=d;return this;}};await handler({body:{telefone:'258840000000',valor:20},user:{empresaId:'e'},get:()=>id},res,e=>{throw e;});return res;}
    falharGravacao=true;await assert.rejects(pedido(randomUUID()),/indisponível/);assert.equal(chamadas,0);falharGravacao=false;
    const id=randomUUID();assert.equal((await pedido(id)).statusCode,201);assert.equal((await pedido(id)).statusCode,201);assert.equal(chamadas,1);
    falharProvedor=true;const incerto=randomUUID();assert.equal((await pedido(incerto)).statusCode,503);assert.equal((await pedido(incerto)).statusCode,503);assert.equal(chamadas,2);
  }finally{paths.forEach((p,i)=>{if(anteriores[i])require.cache[p]=anteriores[i];else delete require.cache[p];});}
});
