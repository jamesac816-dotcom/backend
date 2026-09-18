const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function dataParaDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const {emPeriodo,resumir} = require('../services/resumo.service');
const {lerTodas} = require('../services/leitura.service');

function agruparPorCategoria(rows) {
  const mapa = new Map();
  rows.forEach((row) => {
    const key = row.categoria || 'Sem categoria';
    const total = Number(row.valor || 0);
    mapa.set(key, (mapa.get(key) || 0) + total);
  });
  return Array.from(mapa.entries()).map(([categoria, total]) => ({ categoria, total }));
}

router.get('/resumo', async(req,res,next)=>{
 try {
  if(!supabaseAdmin) return res.status(503).json({erro:'Base de dados indisponível.'});
  const [transacoes,vendas] = await Promise.all([
   lerTodas(() => supabaseAdmin.from('transacoes').select('*').eq('empresa_id',req.user.empresaId).order('id')),
   lerTodas(() => supabaseAdmin.from('vendas').select('id,data,total,lucro').eq('empresa_id',req.user.empresaId).order('id'))
  ]);
  res.json(resumir(transacoes,vendas,req.query.periodo || 'mes'));
 }catch(err){next(err);}
});

router.get('/mensal', async (req, res, next) => {
  try {
    if (!supabaseAdmin) return res.json([]);
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 5, 1);

    const data = await lerTodas(() => supabaseAdmin
      .from('transacoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .gte('data', inicio.toISOString().slice(0, 10)).order('id'));

    const agrupado = new Map();
    (data || []).forEach((row) => {
      const d = dataParaDate(row.data);
      if (!d) return;
      const chave = `${d.getFullYear()}-${d.getMonth()}`;
      const key = `${chave}:${row.tipo}`;
      agrupado.set(key, (agrupado.get(key) || 0) + Number(row.valor || 0));
    });

    const saida = Array.from(agrupado.entries()).map(([key, total]) => {
      const [mesKey, tipo] = key.split(':');
      const [ano, mes] = mesKey.split('-').map(Number);
      return { mes: new Date(ano, mes, 1).toISOString(), tipo, total };
    });

    res.json(saida);
  } catch (err) {
    next(err);
  }
});

router.get('/categorias', async (req, res, next) => {
  const { tipo, periodo } = req.query;
  if (!['receita', 'despesa'].includes(tipo)) return res.status(400).json({ erro: 'Parâmetro "tipo" inválido.' });
  try {
    if (!supabaseAdmin) return res.json([]);

    const data = await lerTodas(() => supabaseAdmin
      .from('transacoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId)
      .eq('tipo', tipo).order('id'));

    const filtrado = (data || []).filter((row) => emPeriodo(row.data, periodo || 'mes'));
    res.json(agruparPorCategoria(filtrado).sort((a, b) => Number(b.total) - Number(a.total)));
  } catch (err) {
    next(err);
  }
});

router.get('/dre', async (req, res, next) => {
  const ano = parseInt(req.query.ano) || new Date().getFullYear();
  try {
    if (!supabaseAdmin) return res.json([]);

    const data = await lerTodas(() => supabaseAdmin
      .from('transacoes')
      .select('*')
      .eq('empresa_id', req.user.empresaId).order('id'));

    const rows = (data || []).filter((row) => {
      const d = dataParaDate(row.data);
      return d && d.getFullYear() === ano;
    });

    const mapa = new Map();
    rows.forEach((row) => {
      const d = dataParaDate(row.data);
      if (!d) return;
      const chave = `${row.tipo}|${row.categoria || 'Sem categoria'}|${d.getMonth() + 1}`;
      const valor = Number(row.valor || 0);
      const atual = mapa.get(chave) || 0;
      mapa.set(chave, atual + valor);
    });

    const saida = Array.from(mapa.entries()).map(([key, total]) => {
      const [tipo, categoria, mes] = key.split('|');
      return { tipo, categoria, mes: Number(mes), total };
    });

    res.json(saida.sort((a, b) => a.categoria.localeCompare(b.categoria) || a.mes - b.mes));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
