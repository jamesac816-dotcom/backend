const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resumir,emPeriodo,hojeMaputo}=require('../src/services/resumo.service');
const dia='2026-09-16';
test('margem usa custo vendido; compras de stock e pagamentos de clientes não duplicam custos/receitas',()=>{
 const transacoes=[
  {data:dia,tipo:'despesa',valor:1000,origem:'compra'},
  {data:dia,tipo:'receita',valor:200,origem:'venda'},
  {data:dia,tipo:'receita',valor:50,origem:'pagamento_cliente'},
  {data:dia,tipo:'despesa',valor:20,origem:'manual'},
  {data:dia,tipo:'receita',valor:30,origem:'manual'}
 ];
 const r=resumir(transacoes,[{data:dia,total:300,lucro:120}], 'hoje',dia);
 assert.equal(r.saldoAtual,-740);assert.equal(r.receitasPeriodo,280);assert.equal(r.lucroPeriodo,130);assert.equal(r.vendasPeriodo,300);
});
test('venda a crédito contribui para margem mas não para dinheiro recebido',()=>{
 const r=resumir([],[{data:dia,total:200,lucro:120}],'hoje',dia);
 assert.equal(r.receitasPeriodo,0);assert.equal(r.saldoAtual,0);assert.equal(r.lucroPeriodo,120);
});
test('histórico sem identificação não é apresentado como lucro confirmado',()=>{
 const r=resumir([{data:dia,tipo:'receita',valor:200,origem:'legado'}],[],'hoje',dia);
 assert.equal(r.lucroPeriodo,null);assert.equal(r.historicoPorRever,true);
});
test('dia em Maputo, semana com início na segunda e sem movimentos futuros',()=>{
 assert.equal(hojeMaputo(new Date('2026-09-15T23:00:00Z')),dia);
 assert.equal(emPeriodo('2026-09-13','semana',dia),false);
 assert.equal(emPeriodo('2026-09-14','semana',dia),true);
 assert.equal(emPeriodo('2026-09-17','mes',dia),false);
});
