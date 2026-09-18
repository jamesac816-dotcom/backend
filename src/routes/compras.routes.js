const express = require('express');
const {supabaseAdmin} = require('../supabaseClient');
const {requireAuth} = require('../middleware/auth');
const {executarOperacao} = require('../services/operacoes.service');
const router = express.Router();
router.use(requireAuth);
router.get('/', async(req,res,next) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({erro:'Base de dados indisponível.'});
    const {data,error} = await supabaseAdmin.from('compras').select('*, fornecedores(nome), itens_compra(*, produtos(nome))').eq('empresa_id',req.user.empresaId).order('data',{ascending:false});
    if(error) throw error;
    res.json((data || []).map(c=>({...c,fornecedor_nome:c.fornecedores?.nome || '',itens:(c.itens_compra || []).map(i=>({produtoId:i.produto_id,produtoNome:i.produtos?.nome || '',quantidade:Number(i.quantidade),custoUnitario:Number(i.custo_unitario),subtotal:Number(i.subtotal)}))})));
  } catch(err){next(err);}
});
router.post('/', async(req,res,next) => {
  try {res.status(201).json(await executarOperacao(req,'compra',req.body));} catch(err){next(err);}
});
module.exports = router;
