const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');
const { lerTodas } = require('../services/leitura.service');
const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => supabaseAdmin ? next() : res.status(503).json({erro:'Base de dados indisponível.'}));

router.get('/', async (req, res, next) => {
  const ano = Number(req.query.ano || new Date().getFullYear());
  if (!Number.isInteger(ano) || ano < 1900 || ano > 9998) return res.status(400).json({erro:'Ano inválido.'});
  try {
    const [linhas, movimentos] = await Promise.all([
      lerTodas(() => supabaseAdmin.from('orcamento').select('*').eq('empresa_id',req.user.empresaId).eq('ano',ano).order('tipo').order('rubrica').order('id')),
      lerTodas(() => supabaseAdmin.from('transacoes').select('id,tipo,categoria,valor').eq('empresa_id',req.user.empresaId).gte('data',`${ano}-01-01`).lt('data',`${ano+1}-01-01`).order('id'))
    ]);
    res.json(linhas.map(linha => {
      const categorias = (linha.categorias || '').split(',').map(c => c.trim()).filter(Boolean);
      const realizado = movimentos.filter(t => t.tipo === linha.tipo && categorias.includes(t.categoria)).reduce((s,t) => s+Number(t.valor),0);
      const orcado = Number(linha.valor_orcado);
      return {...linha, realizado, desvioValor:Math.round((realizado-orcado)*100)/100,
        desvioPercentual:orcado!==0 ? Math.round((realizado-orcado)/orcado*10000)/100 : null};
    }));
  } catch (err) { next(err); }
});
router.post('/', async (req,res,next) => {
  const {rubrica,tipo,categorias,valorOrcado} = req.body;
  const ano = Number(req.body.ano || new Date().getFullYear()), valor = Number(valorOrcado ?? 0);
  if (typeof rubrica!=='string' || !rubrica.trim() || !['receita','despesa'].includes(tipo) || !Number.isFinite(valor) || valor<0 || !Number.isInteger(ano) || ano<1900 || ano>9998) return res.status(400).json({erro:'Rubrica, tipo, valor ou ano inválido.'});
  try {
    const {data,error}=await supabaseAdmin.from('orcamento').upsert({empresa_id:req.user.empresaId,rubrica:rubrica.trim(),tipo,categorias:categorias || null,valor_orcado:valor,ano},{onConflict:'empresa_id,rubrica,ano'}).select('*').single();
    if(error) throw error;
    res.status(201).json(data);
  } catch(err){next(err);}
});
router.delete('/:id',async(req,res,next)=>{
  try{
    const {data,error}=await supabaseAdmin.from('orcamento').delete().eq('id',req.params.id).eq('empresa_id',req.user.empresaId).select('id');
    if(error) throw error;
    if(!data.length) return res.status(404).json({erro:'Rubrica não encontrada.'});
    res.status(204).send();
  }catch(err){next(err);}
});
module.exports=router;
