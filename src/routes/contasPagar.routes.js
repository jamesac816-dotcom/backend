const express=require('express');
const {supabaseAdmin:s}=require('../supabaseClient');
const {requireAuth}=require('../middleware/auth');
const {hojeMaputo}=require('../services/resumo.service');
const {executarOperacao}=require('../services/operacoes.service');
const router=express.Router();router.use(requireAuth);
router.use((req,res,next)=>s?next():res.status(503).json({erro:'Base de dados indisponível.'}));
router.get('/',async(req,res,next)=>{
 try{
  const {data,error}=await s.from('contas_pagar').select('*, fornecedores(nome)').eq('empresa_id',req.user.empresaId).order('data_vencimento',{ascending:true,nullsFirst:false});
  if(error)throw error;
  res.json((data||[]).map(c=>({...c,fornecedor_nome:c.fornecedores?.nome||'',estado:c.estado==='Pendente'&&c.data_vencimento&&c.data_vencimento<hojeMaputo()?'Vencido':c.estado})));
 }catch(err){next(err);}
});
router.post('/',async(req,res,next)=>{
 try{
  const p=req.body;if(!Number.isFinite(Number(p.valor))||Number(p.valor)<=0)return res.status(400).json({erro:'Valor inválido.'});
  if(p.fornecedorId){const {data,error}=await s.from('fornecedores').select('id').eq('id',p.fornecedorId).eq('empresa_id',req.user.empresaId).maybeSingle();if(error)throw error;if(!data)return res.status(400).json({erro:'Fornecedor não encontrado neste negócio.'});}
  const {data,error}=await s.from('contas_pagar').insert({empresa_id:req.user.empresaId,fornecedor_id:p.fornecedorId||null,descricao:p.descricao||null,valor:Number(p.valor),data_emissao:p.dataEmissao||null,data_vencimento:p.dataVencimento||null}).select('*').single();
  if(error)throw error;res.status(201).json(data);
 }catch(err){next(err);}
});
router.patch('/:id/pagar',async(req,res,next)=>{
 try{res.json(await executarOperacao(req,'conta_pagar',{contaId:req.params.id}));}catch(err){next(err);}
});
router.delete('/:id',async(req,res,next)=>{
 try{
  const {error}=await s.from('contas_pagar').delete().eq('id',req.params.id).eq('empresa_id',req.user.empresaId);
  if(error)throw error;res.status(204).send();
 }catch(err){next(err);}
});
module.exports=router;
