const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use((req,res,next)=>{
  const limite=req.body?.limiteCredito;
  if(limite!=null && (!Number.isFinite(Number(limite)) || Number(limite)<0)) return res.status(400).json({erro:'Limite de crédito inválido.'});
  next();
});

router.get('/', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json([]);
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .order('nome', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { nome, telefone, email, endereco, nif, saldoDevedor } = req.body;
  if (!nome) return res.status(400).json({ erro: 'O nome do cliente é obrigatório.' });
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .insert({
        empresa_id: req.user.empresaId,
        nome,
        telefone: telefone || null,
        email: email || null,
        endereco: endereco || null,
        nif: nif || null,
        saldo_devedor: Number(saldoDevedor || 0),
        ...(req.body.limiteCredito==null?{}:{limite_credito:Number(req.body.limiteCredito)}),
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  const { nome, telefone, email, endereco, nif } = req.body;
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .update({ nome, telefone: telefone ?? null, email: email ?? null, endereco: endereco ?? null, nif: nif ?? null, ...(Object.hasOwn(req.body,'limiteCredito')?{limite_credito:req.body.limiteCredito}: {}) })
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId)
      .select('*')
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
    const { error } = await supabaseAdmin
      .from('clientes')
      .delete()
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/:id/pagamentos', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json([]);
    const { data, error } = await supabaseAdmin
      .from('pagamentos_clientes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .eq('cliente_id', req.params.id)
      .order('data', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/pagamentos', async (req,res,next) => {
 try { res.status(201).json(await require('../services/operacoes.service').executarOperacao(req,'pagamento_cliente',{...req.body,clienteId:req.params.id})); }
 catch(err){next(err);}
});

module.exports = router;
