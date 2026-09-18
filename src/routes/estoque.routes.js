const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function ensureSupabase(req, res, next) {
  if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });
  next();
}

router.use(ensureSupabase);

// GET /api/estoque/movimentacoes — histórico completo (com nome do produto)
router.get('/movimentacoes', async (req, res, next) => {
  try {
    const { data: rows = [], error } = await supabaseAdmin
      .from('movimentacoes_estoque')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .order('data', { ascending: false });

    if (error) return next(error);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/estoque/alertas — produtos com estoque igual ou abaixo do mínimo
router.get('/alertas', async (req, res, next) => {
  try {
    const { data: produtos = [], error } = await supabaseAdmin
      .from('produtos')
      .select('id, nome, tipo_item, status, unidade_medida, qtd_por_caixa, qtd_estoque_unidades, qtd_minima_caixas')
      .eq('empresa_id', req.user.empresaId)
      .order('nome', { ascending: true });
    if (error) return next(error);
    const alertas = (produtos || []).filter(p => {
      return p.tipo_item!=='servico' && p.status==='Ativo' && Number(p.qtd_estoque_unidades || 0) <= Number(p.qtd_minima_caixas || 0) * Number(p.qtd_por_caixa || 1);
    });
    res.json(alertas);
  } catch (err) { next(err); }
});

router.post('/movimentacoes', async (req,res,next) => {
 try { res.status(201).json(await require('../services/operacoes.service').executarOperacao(req,'stock',req.body)); }
 catch(err){next(err);}
});

module.exports = router;
