const express = require('express');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');
const { executarOperacao } = require('../services/operacoes.service');
const router = express.Router();
router.use(requireAuth);
router.use((req,res,next)=>supabaseAdmin?next():res.status(503).json({erro:'Base de dados indisponível.'}));
async function lerEscaloes(empresaId){
  const {data,error}=await supabaseAdmin.from('irps_escaloes').select('*').eq('empresa_id',empresaId).order('ordem');
  if(error) throw error;
  return data || [];
}
router.get('/escaloes',async(req,res,next)=>{
  try{res.json(await lerEscaloes(req.user.empresaId));}catch(err){next(err);}
});
// Mantém os escalões configurados pelo contabilista; não introduz taxas legais.
router.put('/escaloes',async(req,res,next)=>{
  if(!Array.isArray(req.body.escaloes)) return res.status(400).json({erro:'Lista de escalões inválida.'});
  const escaloes=req.body.escaloes.map(e=>({limiteInferior:Number(e?.limiteInferior ?? 0),limiteSuperior:e?.limiteSuperior==null || e.limiteSuperior===''?null:Number(e.limiteSuperior),taxa:Number(e?.taxa ?? 0),parcelaAbater:Number(e?.parcelaAbater ?? 0)}));
  if(escaloes.some(e=>![e.limiteInferior,e.taxa,e.parcelaAbater].every(Number.isFinite) || e.limiteInferior<0 || e.taxa<0 || e.taxa>1 || e.parcelaAbater<0 || (e.limiteSuperior!==null && (!Number.isFinite(e.limiteSuperior)||e.limiteSuperior<e.limiteInferior)))) return res.status(400).json({erro:'Valores de escalão inválidos.'});
  try{res.json(await executarOperacao(req,'irps_escaloes',{escaloes}));}catch(err){next(err);}
});
router.post('/calcular',async(req,res,next)=>{
  const base=Number(req.body.baseIrps);
  if(!Number.isFinite(base)||base<0) return res.status(400).json({erro:'Base tributável inválida.'});
  try{
    const escaloes=await lerEscaloes(req.user.empresaId);
    if(!escaloes.length) return res.json({irps:0,aviso:'Nenhum escalão de IRPS configurado. Configure em Módulo Empresarial > Folha de Salários.'});
    const escalao=escaloes.find(e=>base>=Number(e.limite_inferior)&&(e.limite_superior===null||base<=Number(e.limite_superior)));
    if(!escalao) return res.json({irps:0,aviso:'Base tributável fora de todos os escalões configurados.'});
    res.json({irps:Math.round(Math.max(0,base*Number(escalao.taxa)-Number(escalao.parcela_abater))*100)/100,escalaoAplicado:escalao});
  }catch(err){next(err);}
});
module.exports=router;
