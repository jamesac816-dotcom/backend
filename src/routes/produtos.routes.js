const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
function validarProduto(p) {
  if (p.tipoItem != null && !['produto','servico'].includes(p.tipoItem)) return 'Tipo de artigo inválido.';
  if (p.unidadeMedida != null && !['un','kg','g','l','ml','m','m2','hora','servico'].includes(p.unidadeMedida)) return 'Unidade de medida inválida.';
  for (const campo of ['precoCompra','precoVendaUnidade','precoVendaCaixa','qtdEstoqueUnidades','qtdMinimaCaixas']) {
    if (p[campo] != null && (!Number.isFinite(Number(p[campo])) || Number(p[campo])<0)) return 'Preços e quantidades devem ser números não negativos.';
  }
  if (p.qtdPorCaixa != null && (!Number.isInteger(Number(p.qtdPorCaixa)) || Number(p.qtdPorCaixa)<1)) return 'Quantidade por embalagem deve ser um inteiro positivo.';
  if ((p.unidadeMedida || 'un')==='un' && p.qtdEstoqueUnidades != null && !Number.isInteger(Number(p.qtdEstoqueUnidades))) return 'Artigos por unidade exigem stock inteiro.';
  if (p.tipoItem==='servico' && Number(p.qtdEstoqueUnidades || 0)!==0) return 'Serviços não têm stock.';
  return null;
}

router.get('/', async (req, res, next) => {
  const { busca } = req.query;
  try {
    if (!supabaseAdmin) return res.json([]);

    let query = supabaseAdmin
      .from('produtos')
      .select('*')
      .eq('empresa_id', req.user.empresaId);

    if (busca) {
      const termo = String(busca).trim();
      if (termo) {
        query = query.or(`nome.ilike.%${termo}%,marca.ilike.%${termo}%,codigo_interno.ilike.%${termo}%,codigo_barras.ilike.%${termo}%`);
      }
    }

    const { data, error } = await query.order('nome', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    const { data, error } = await supabaseAdmin
      .from('produtos')
      .select('*')
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ erro: 'Produto não encontrado.' });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const p = req.body;
  const invalido = validarProduto(p);
  if(invalido) return res.status(400).json({erro:invalido});
  if (!p.nome || p.precoVendaUnidade == null || !p.qtdPorCaixa) {
    return res.status(400).json({ erro: 'Nome, preço de venda por unidade e quantidade por caixa são obrigatórios.' });
  }
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    const { data, error } = await supabaseAdmin
      .from('produtos')
      .insert({
        empresa_id: req.user.empresaId,
        tipo_item: p.tipoItem || 'produto',
        unidade_medida: p.unidadeMedida || 'un',
        nome: p.nome,
        categoria: p.categoria || null,
        marca: p.marca || null,
        codigo_interno: p.codigoInterno || null,
        codigo_barras: p.codigoBarras || null,
        fornecedor_id: p.fornecedorId || null,
        descricao: p.descricao || null,
        preco_compra: Number(p.precoCompra || 0),
        preco_venda_unidade: Number(p.precoVendaUnidade),
        preco_venda_caixa: Number(p.precoVendaCaixa || 0),
        qtd_por_caixa: Number(p.qtdPorCaixa),
        qtd_estoque_unidades: Number(p.qtdEstoqueUnidades || 0),
        qtd_minima_caixas: Number(p.qtdMinimaCaixas || 0),
        imagem_url: p.imagemUrl || null,
        status: p.status || 'Ativo',
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
  const p = req.body;
  const invalido = validarProduto(p);
  if(invalido) return res.status(400).json({erro:invalido});
  try {
    if (!supabaseAdmin) return res.status(503).json({ erro: 'Supabase não configurado.' });

    const {data:actual,error:erroActual} = await supabaseAdmin.from('produtos').select('*').eq('id',req.params.id).eq('empresa_id',req.user.empresaId).maybeSingle();
    if(erroActual) throw erroActual;
    if(!actual) return res.status(404).json({erro:'Produto não encontrado.'});
    if(Number(actual.qtd_estoque_unidades)>0 && ((p.tipoItem && p.tipoItem!==actual.tipo_item) || (p.unidadeMedida && p.unidadeMedida!==actual.unidade_medida))) return res.status(400).json({erro:'Esgote ou ajuste o stock antes de alterar o tipo ou a unidade de medida.'});
    const payload = {
      tipo_item: p.tipoItem,
      unidade_medida: p.unidadeMedida,
      nome: p.nome,
      categoria: p.categoria ?? null,
      marca: p.marca ?? null,
      codigo_interno: p.codigoInterno ?? null,
      codigo_barras: p.codigoBarras ?? null,
      fornecedor_id: p.fornecedorId ?? null,
      descricao: p.descricao ?? null,
      preco_compra: p.precoCompra != null ? Number(p.precoCompra) : undefined,
      preco_venda_unidade: p.precoVendaUnidade != null ? Number(p.precoVendaUnidade) : undefined,
      preco_venda_caixa: p.precoVendaCaixa != null ? Number(p.precoVendaCaixa) : undefined,
      qtd_por_caixa: p.qtdPorCaixa != null ? Number(p.qtdPorCaixa) : undefined,
      qtd_minima_caixas: p.qtdMinimaCaixas != null ? Number(p.qtdMinimaCaixas) : undefined,
      imagem_url: p.imagemUrl ?? undefined,
      status: p.status ?? 'Ativo',
    };

    const { data, error } = await supabaseAdmin
      .from('produtos')
      .update(payload)
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
      .from('produtos')
      .delete()
      .eq('id', req.params.id)
      .eq('empresa_id', req.user.empresaId);

    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
