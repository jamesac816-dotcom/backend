const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const CATEGORIAS_PADRAO = [
  ['Vendas', 'receita', '#10B981'],
  ['Serviços', 'receita', '#34D399'],
  ['Recebimento de Cliente', 'receita', '#3B82F6'],
  ['Outras Receitas', 'receita', '#2563EB'],
  ['Fornecedores', 'despesa', '#2563EB'],
  ['Renda/Aluguer', 'despesa', '#3B82F6'],
  ['Salários', 'despesa', '#10B981'],
  ['Transporte', 'despesa', '#34D399'],
  ['Energia/Água', 'despesa', '#C98A1A'],
  ['Outras Despesas', 'despesa', '#8598AB'],
];

async function garantirCategoriasPadrao(empresaId, tipoFiltrado = null) {
  if (!supabaseAdmin) return;

  const tiposParaGarantir = tipoFiltrado ? [tipoFiltrado] : ['receita', 'despesa'];

  for (const tipo of tiposParaGarantir) {
    const { data: existentes = [], error: selectError } = await supabaseAdmin
      .from('categorias_financeiras')
      .select('id, nome, tipo')
      .eq('empresa_id', empresaId)
      .eq('tipo', tipo);

    if (selectError) throw selectError;
    const nomesExistentes = new Set((existentes || []).map((categoria) => categoria.nome));
    const faltantes = CATEGORIAS_PADRAO.filter(([nome, categoriaTipo]) => categoriaTipo === tipo && !nomesExistentes.has(nome));

    if (!faltantes.length) continue;

    const rows = faltantes.map(([nome, categoriaTipo, cor]) => ({
      empresa_id: empresaId,
      nome,
      tipo: categoriaTipo,
      cor,
      ativo: true,
    }));

    const { error: insertError } = await supabaseAdmin.from('categorias_financeiras').insert(rows);
    if (insertError) throw insertError;
  }
}

// GET /api/categorias?tipo=receita|despesa — só as activas, a não ser que incluirInativas=1
router.get('/', async (req, res, next) => {
  const { tipo, incluirInativas } = req.query;
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    let query = supabaseAdmin
      .from('categorias_financeiras')
      .select('*')
      .eq('empresa_id', req.user.empresaId);

    if (tipo) query = query.eq('tipo', tipo);
    if (!incluirInativas) query = query.eq('ativo', true);

    const { data, error } = await query.order('tipo', { ascending: true }).order('nome', { ascending: true });
    if (error) throw error;

    const rows = data || [];
    if (!rows.length) {
      await garantirCategoriasPadrao(req.user.empresaId, tipo || null);
      const { data: refill, error: refillError } = await supabaseAdmin
        .from('categorias_financeiras')
        .select('*')
        .eq('empresa_id', req.user.empresaId)
        .order('tipo', { ascending: true })
        .order('nome', { ascending: true });
      if (refillError) throw refillError;
      return res.json(refill || []);
    }

    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const { nome, tipo, cor } = req.body;
  if (!nome || !['receita', 'despesa'].includes(tipo)) {
    return res.status(400).json({ erro: 'Nome e tipo (receita/despesa) são obrigatórios.' });
  }
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    const { data, error } = await supabaseAdmin
      .from('categorias_financeiras')
      .insert({
        empresa_id: req.user.empresaId,
        nome: String(nome).trim(),
        tipo,
        cor: cor || '#8598AB',
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return res.status(409).json({ erro: 'Já existe uma categoria com esse nome para esse tipo.' });
      }
      throw error;
    }

    res.status(201).json(data);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  const { nome, cor, ativo } = req.body;
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    const updatePayload = {};
    if (nome !== undefined) updatePayload.nome = String(nome).trim();
    if (cor !== undefined) updatePayload.cor = cor;
    if (ativo !== undefined) updatePayload.ativo = !!ativo;

    const { data, error } = await supabaseAdmin
      .from('categorias_financeiras')
      .update(updatePayload)
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116' || error.message?.includes('No rows')) {
        return res.status(404).json({ erro: 'Categoria não encontrada.' });
      }
      throw error;
    }

    res.json(data);
  } catch (err) { next(err); }
});

// DELETE só é permitido se a categoria nunca foi usada em nenhuma transação
// (senão, sugerimos desactivar em vez de a remover, para não perder o histórico)
router.delete('/:id', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    const { data: categoria, error: categoriaError } = await supabaseAdmin
      .from('categorias_financeiras')
      .select('*')
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId)
      .maybeSingle();

    if (categoriaError) throw categoriaError;
    if (!categoria) return res.status(404).json({ erro: 'Categoria não encontrada.' });

    const { count, error: usoError } = await supabaseAdmin
      .from('transacoes')
      .select('id', { count: 'exact', head: true })
      .eq('empresa_id', req.user.empresaId)
      .eq('categoria', categoria.nome)
      .eq('tipo', categoria.tipo);

    if (usoError) throw usoError;
    if ((count || 0) > 0) {
      return res.status(409).json({ erro: 'Esta categoria já foi usada em lançamentos. Desactive-a em vez de a remover.' });
    }

    const { error } = await supabaseAdmin
      .from('categorias_financeiras')
      .delete()
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId);

    if (error) throw error;
    res.status(204).send();
  } catch (err) { next(err); }
});

module.exports = router;
