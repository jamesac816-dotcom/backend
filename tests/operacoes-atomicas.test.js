const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
const {PGlite} = require('@electric-sql/pglite');
let db;
const sql = name => fs.readFileSync(path.join(__dirname,'../migrations',name),'utf8');
before(async()=>{
  db = new PGlite();
  await db.exec('CREATE ROLE service_role;');
  await db.exec(sql('001_init.sql').replace('CREATE EXTENSION IF NOT EXISTS "pgcrypto";', ''));
  await db.exec(sql('002_modulos_adicionais.sql'));
  await db.exec(sql('004_modulo_empresarial.sql'));
  await db.exec(sql('011_operacoes_atomicas.sql'));
  await db.exec(sql('011_operacoes_atomicas.sql'));
});
after(async()=>{await db?.close();});
async function fixture(){
  const e=randomUUID(),u=randomUUID(),p=randomUUID(),c=randomUUID();
  await db.query('INSERT INTO empresas(id,nome_negocio) VALUES($1,$2)',[e,'Teste']);
  await db.query('INSERT INTO usuarios(id,empresa_id,nome,email,senha_hash) VALUES($1,$2,$3,$4,$5)',[u,e,'Teste',u+'@teste.invalid','hash']);
  await db.query('INSERT INTO produtos(id,empresa_id,nome,preco_compra,preco_venda_unidade,qtd_estoque_unidades) VALUES($1,$2,$3,40,100,10)',[p,e,'Produto']);
  await db.query('INSERT INTO clientes(id,empresa_id,nome) VALUES($1,$2,$3)',[c,e,'Cliente']);
  return {e,u,p,c};
}
async function op(f,tipo,dados,chave=randomUUID()) {
  return (await db.query('SELECT cfm_operacao($1,$2,$3,$4,$5) AS resultado',[f.e,f.u,tipo,JSON.stringify(dados),chave])).rows[0].resultado;
}
const venda = (f,extra={})=>({formaPagamento:'Dinheiro',itens:[{produtoId:f.p,quantidade:2}],...extra});
test('actualização de escalões é atómica e não altera outro negócio',async()=>{
  const f=await fixture(),outro=await fixture();
  const escaloes=[{limiteInferior:0,limiteSuperior:null,taxa:0.1,parcelaAbater:0}];
  await op(f,'irps_escaloes',{escaloes});await op(outro,'irps_escaloes',{escaloes});
  await assert.rejects(op(f,'irps_escaloes',{escaloes:[...escaloes,{limiteInferior:0,limiteSuperior:null,taxa:-1,parcelaAbater:0}]}),/inválidos/);
  assert.equal((await db.query('SELECT * FROM irps_escaloes WHERE empresa_id=$1',[f.e])).rows.length,1);
  assert.equal((await db.query('SELECT * FROM irps_escaloes WHERE empresa_id=$1',[outro.e])).rows.length,1);
});
async function stock(f){return Number((await db.query('SELECT qtd_estoque_unidades AS n FROM produtos WHERE id=$1',[f.p])).rows[0].n);}
test('SQL completo é aplicável e repetível; venda grava margem, stock e dinheiro uma única vez',async()=>{
  const f=await fixture(),key=randomUUID(),dados=venda(f);
  const a=await op(f,'venda',dados,key),b=await op(f,'venda',dados,key);
  assert.equal(a.id,b.id);assert.equal(a.total,200);assert.equal(a.lucro,120);assert.equal(a.valor_recebido,200);assert.equal(await stock(f),8);
  assert.equal((await db.query('SELECT * FROM transacoes WHERE empresa_id=$1',[f.e])).rows.length,1);
  await assert.rejects(op(f,'venda',venda(f,{itens:[{produtoId:f.p,quantidade:3}]}),key),/Chave/);
});
test('venda a crédito não regista dinheiro; pagamento posterior entra uma única vez',async()=>{
  const f=await fixture();
  const v=await op(f,'venda',venda(f,{clienteId:f.c,fazerDivida:true}));
  assert.equal(v.valor_recebido,0);assert.equal(v.valor_divida,200);
  assert.equal((await db.query('SELECT * FROM transacoes WHERE empresa_id=$1',[f.e])).rows.length,0);
  const key=randomUUID();await op(f,'pagamento_cliente',{clienteId:f.c,valor:200},key);await op(f,'pagamento_cliente',{clienteId:f.c,valor:200},key);
  assert.equal(Number((await db.query('SELECT saldo_devedor FROM clientes WHERE id=$1',[f.c])).rows[0].saldo_devedor),0);
  assert.equal(Number((await db.query('SELECT sum(valor) AS n FROM transacoes WHERE empresa_id=$1',[f.e])).rows[0].n),200);
});
test('crédito depositado não volta a contar como entrada na venda',async()=>{
  const f=await fixture();await op(f,'pagamento_cliente',{clienteId:f.c,valor:150});
  const v=await op(f,'venda',venda(f,{clienteId:f.c,appliedBalance:150,formaPagamento:'Saldo do Cliente'}));
  assert.equal(v.valor_recebido,50);assert.equal(v.credito_utilizado,150);
  assert.equal(Number((await db.query('SELECT sum(valor) AS n FROM transacoes WHERE empresa_id=$1',[f.e])).rows[0].n),200);
});
test('artigo inválido, repetido ou de outra empresa não altera nenhum stock',async()=>{
  const f=await fixture(),outro=await fixture();
  for(const itens of [
    [{produtoId:f.p,quantidade:2},{produtoId:outro.p,quantidade:1}],
    [{produtoId:f.p,quantidade:6},{produtoId:f.p,quantidade:6}],
    [{produtoId:f.p,quantidade:-1}], [{produtoId:f.p,quantidade:0.5}]
  ]) { await assert.rejects(op(f,'venda',venda(f,{itens})));assert.equal(await stock(f),10); }
  assert.equal((await db.query('SELECT * FROM vendas WHERE empresa_id=$1',[f.e])).rows.length,0);
});
test('erro após alterar stock reverte venda, itens e histórico integralmente',async()=>{
  const f=await fixture();
  await db.exec("CREATE FUNCTION falhar_movimento() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha simulada'; END $$; CREATE TRIGGER falha BEFORE INSERT ON movimentacoes_estoque FOR EACH ROW EXECUTE FUNCTION falhar_movimento();");
  try{await assert.rejects(op(f,'venda',venda(f)),/Falha simulada/);}finally{await db.exec('DROP TRIGGER falha ON movimentacoes_estoque; DROP FUNCTION falhar_movimento();');}
  assert.equal(await stock(f),10);
  assert.equal((await db.query('SELECT * FROM vendas WHERE empresa_id=$1',[f.e])).rows.length,0);
  assert.equal((await db.query('SELECT * FROM transacoes WHERE empresa_id=$1',[f.e])).rows.length,0);
});
test('compras, quantidades fraccionadas e serviços sem stock',async()=>{
  const f=await fixture();
  await db.query("UPDATE produtos SET unidade_medida='kg' WHERE id=$1",[f.p]);
  await op(f,'compra',{itens:[{produtoId:f.p,quantidade:0.5,custoUnitario:40}]});
  assert.equal(await stock(f),10.5);
  await op(f,'venda',venda(f,{itens:[{produtoId:f.p,quantidade:0.25}]}));assert.equal(await stock(f),10.25);
  await db.query("UPDATE produtos SET tipo_item='servico',unidade_medida='hora',qtd_estoque_unidades=0 WHERE id=$1",[f.p]);
  const v=await op(f,'venda',venda(f,{itens:[{produtoId:f.p,quantidade:1.5}]}));assert.equal(v.total,150);assert.equal(await stock(f),0);
  await assert.rejects(op(f,'stock',{produtoId:f.p,tipo:'entrada',quantidade:1}));
});
test('duas vendas concorrentes não vendem stock inexistente',async()=>{
  const f=await fixture();const dados=venda(f,{itens:[{produtoId:f.p,quantidade:7}]});
  const result=await Promise.allSettled([op(f,'venda',dados),op(f,'venda',dados)]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal(await stock(f),3);
});
test('pagar conta duas vezes não duplica despesa e respeita empresa',async()=>{
 const f=await fixture(),outro=await fixture(),id=randomUUID();
 await db.query('INSERT INTO contas_pagar(id,empresa_id,valor) VALUES($1,$2,100)',[id,f.e]);
 await assert.rejects(op(outro,'conta_pagar',{contaId:id}));
 await op(f,'conta_pagar',{contaId:id});await op(f,'conta_pagar',{contaId:id});
 assert.equal((await db.query('SELECT * FROM transacoes WHERE empresa_id=$1',[f.e])).rows.length,1);
});
test('limite de crédito definido é aplicado na base e não só no navegador',async()=>{
 const f=await fixture();await db.query('UPDATE clientes SET limite_credito=100 WHERE id=$1',[f.c]);
 await assert.rejects(op(f,'venda',venda(f,{clienteId:f.c,fazerDivida:true})),/Limite/);assert.equal(await stock(f),10);
});
