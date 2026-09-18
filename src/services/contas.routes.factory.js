const express=require('express');
const {supabaseAdmin:s}=require('../supabaseClient');
const {requireAuth}=require('../middleware/auth');
const {lerTodas}=require('./leitura.service');
module.exports=function contasRouter(tipo){
 const banco=tipo==='bancos',tabela=banco?'contas_bancarias':'cartoes';
 const router=express.Router();router.use(requireAuth);
 router.use((req,res,next)=>s?next():res.status(503).json({erro:'Base de dados indisponível.'}));
 router.get('/',async(req,res,next)=>{
  try{
   const {data,error}=await s.from(tabela).select(banco?'*':'*, contas_bancarias(nome_banco)').eq('empresa_id',req.user.empresaId).order('ativo',{ascending:false}).order(banco?'nome_banco':'nome');if(error)throw error;
   if(!banco)return res.json((data||[]).map(c=>({...c,conta_bancaria_nome:c.contas_bancarias?.nome_banco || ''})));
   const movs=await lerTodas(()=>s.from('transacoes').select('id,conta_bancaria_id,tipo,valor').eq('empresa_id',req.user.empresaId).not('conta_bancaria_id','is',null).order('id'));
   res.json((data||[]).map(c=>({...c,saldo_atual:Number(c.saldo_inicial || 0)+(movs||[]).filter(t=>t.conta_bancaria_id===c.id).reduce((a,t)=>a+(t.tipo==='receita'?1:-1)*Number(t.valor),0)})));
  }catch(err){next(err);}
 });
 async function guardar(req,res,next){
  try{
   const p=req.body,novo=req.method==='POST';
   if(!(banco?p.nomeBanco:p.nome))return res.status(400).json({erro:'Nome obrigatório.'});
   for(const campo of ['saldoInicial','limite'])if(p[campo]!=null&&!Number.isFinite(Number(p[campo])))return res.status(400).json({erro:'Valor inválido.'});
   if(!banco&&p.contaBancariaId){const {data,error}=await s.from('contas_bancarias').select('id').eq('id',p.contaBancariaId).eq('empresa_id',req.user.empresaId).maybeSingle();if(error)throw error;if(!data)return res.status(400).json({erro:'Conta bancária não encontrada neste negócio.'});}
   const dados=banco?{nome_banco:p.nomeBanco,numero_conta:p.numeroConta||null,titular:p.titular||null,tipo_conta:p.tipoConta||'Conta à Ordem',ativo:p.ativo,...(novo?{saldo_inicial:Number(p.saldoInicial||0)}:{})}:{nome:p.nome,banco_emissor:p.bancoEmissor||null,tipo:p.tipo||'Débito',ultimos_digitos:p.ultimosDigitos||null,limite:p.limite==null?null:Number(p.limite),conta_bancaria_id:p.contaBancariaId||null,ativo:p.ativo};
   const q=novo?s.from(tabela).insert({...dados,empresa_id:req.user.empresaId}):s.from(tabela).update(dados).eq('id',req.params.id).eq('empresa_id',req.user.empresaId);
   const {data,error}=await q.select('*').maybeSingle();if(error)throw error;if(!data)return res.status(404).json({erro:'Registo não encontrado.'});
   res.status(novo?201:200).json({...data,...(banco&&novo?{saldo_atual:data.saldo_inicial}:{})});
  }catch(err){next(err);}
 }
 router.post('/',guardar);router.put('/:id',guardar);
 router.delete('/:id',async(req,res,next)=>{try{const {data,error}=await s.from(tabela).delete().eq('id',req.params.id).eq('empresa_id',req.user.empresaId).select('id');if(error)throw error;if(!data?.length)return res.status(404).json({erro:'Registo não encontrado.'});res.status(204).send();}catch(err){next(err);}});
 return router;
};
