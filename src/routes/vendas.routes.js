const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// GET /api/vendas
router.get('/', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json([]);

    const { dataInicio, dataFim, limit } = req.query;
    let query = supabaseAdmin
      .from('vendas')
      .select('*')
      .eq('empresa_id', req.user.empresaId);

    if (dataInicio) query = query.gte('data', dataInicio);
    if (dataFim) query = query.lte('data', dataFim);

    const maxLimit = Number(limit || 50);
    const { data: vendasData, error: vendasError } = await query
      .order('data', { ascending: false })
      .order('hora', { ascending: false })
      .limit(Number.isFinite(maxLimit) && maxLimit > 0 ? Math.min(maxLimit, 200) : 50);

    if (vendasError) throw vendasError;

    const vendaIds = (vendasData || []).map(v => v.id);
    let itensPorVenda = new Map();

    if (vendaIds.length) {
      const { data: itensData, error: itensError } = await supabaseAdmin
        .from('itens_venda')
        .select('*')
        .in('venda_id', vendaIds);

      if (itensError) throw itensError;

      const produtoIds = [...new Set((itensData || []).map(i => i.produto_id).filter(Boolean))];
      let produtosMap = new Map();

      if (produtoIds.length) {
        const { data: produtosData, error: produtosError } = await supabaseAdmin
          .from('produtos')
          .select('id, nome')
          .in('id', produtoIds)
          .eq('empresa_id', req.user.empresaId);

        if (produtosError) throw produtosError;
        (produtosData || []).forEach(p => produtosMap.set(p.id, p.nome));
      }

      (itensData || []).forEach(item => {
        const vendaId = item.venda_id;
        const row = {
          produtoId: item.produto_id,
          produtoNome: produtosMap.get(item.produto_id) || 'Produto',
          quantidade: Number(item.quantidade || 0),
          precoUnitario: Number(item.preco_unitario || 0),
          subtotal: Number(item.subtotal || 0)
        };

        if (!itensPorVenda.has(vendaId)) itensPorVenda.set(vendaId, []);
        itensPorVenda.get(vendaId).push(row);
      });
    }

    const rows = (vendasData || []).map(venda => {
      const clienteNome = venda.cliente_id ? (venda.cliente_nome || 'Cliente') : 'Cliente não identificado';
      return {
        ...venda,
        cliente_nome: clienteNome,
        forma_pagamento: venda.forma_pagamento,
        total: Number(venda.total || 0),
        lucro: Number(venda.lucro || 0),
        itens: itensPorVenda.get(venda.id) || []
      };
    });

    res.json(rows);
  } catch (err) { next(err); }
});

// Venda, stock e recebimento confirmados numa única transacção SQL.
router.post('/', async (req,res,next) => {
 try { res.status(201).json(await require('../services/operacoes.service').executarOperacao(req,'venda',req.body)); }
 catch(err){next(err);}
});

module.exports = router;
