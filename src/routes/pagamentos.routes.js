const express = require('express');
const { randomUUID } = require('node:crypto');
const { supabaseAdmin } = require('../supabaseClient');
const { requireAuth } = require('../middleware/auth');
const mpesaService = require('../services/mpesa.service');
const emolaService = require('../services/emola.service');
const router = express.Router();
router.use(requireAuth);
router.get('/estado',(req,res)=>res.json({mpesa:{configurado:mpesaService.estaConfigurado()},emola:{configurado:emolaService.estaConfigurado()}}));
router.use((req,res,next)=>supabaseAdmin?next():res.status(503).json({erro:'Base de dados indisponível.'}));
router.get('/',async(req,res,next)=>{
  try{
    const {data,error}=await supabaseAdmin.from('pagamentos_moveis').select('*').eq('empresa_id',req.user.empresaId).order('criado_em',{ascending:false}).limit(200);
    if(error) throw error;
    res.json(data);
  }catch(err){next(err);}
});
function responder(res,registo){
  if(registo.estado==='pendente') return res.status(503).json({erro:'Pagamento pendente de confirmação. Consulte o histórico e confirme com o provedor antes de iniciar outro pedido.',registo});
  const sucesso=registo.estado==='concluido';
  return res.status(sucesso?201:502).json({sucesso,simulado:registo.modo_simulacao,registo});
}
function iniciar(provedor,servico){
  return async(req,res,next)=>{
    const {telefone,vendaId}=req.body,valor=Number(req.body.valor);
    const id=req.get('Idempotency-Key') || randomUUID();
    if(typeof telefone!=='string' || !telefone.trim() || telefone.length>20 || !Number.isFinite(valor) || valor<=0 || Math.abs(valor*100-Math.round(valor*100))>0.00001 || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return res.status(400).json({erro:'Telefone, valor ou identificador inválido.'});
    try{
      if(vendaId){
        const {data,error}=await supabaseAdmin.from('vendas').select('id').eq('id',vendaId).eq('empresa_id',req.user.empresaId).maybeSingle();
        if(error) throw error;
        if(!data) return res.status(400).json({erro:'Venda não encontrada neste negócio.'});
      }
      // Grava a intenção ANTES de contactar o provedor. A chave impede dupla cobrança numa repetição.
      const {data:registo,error}=await supabaseAdmin.from('pagamentos_moveis').insert({id,empresa_id:req.user.empresaId,venda_id:vendaId || null,provedor,telefone_cliente:telefone,valor,referencia_transacao:id,estado:'pendente',modo_simulacao:!servico.estaConfigurado()}).select('*').single();
      if(error){
        if(error.code!=='23505') throw error;
        const {data:anterior,error:falha}=await supabaseAdmin.from('pagamentos_moveis').select('*').eq('id',id).eq('empresa_id',req.user.empresaId).maybeSingle();
        if(falha) throw falha;
        if(!anterior || anterior.provedor!==provedor || anterior.telefone_cliente!==telefone || Number(anterior.valor)!==valor || anterior.venda_id!==(vendaId || null)) return res.status(409).json({erro:'Identificador já utilizado noutra operação.'});
        return responder(res,anterior);
      }
      let resultado;
      try{
        resultado=await servico.iniciarPagamentoC2B({telefone,valor,referenciaTransacao:'TXN'+id.replaceAll('-','').slice(0,20),referenciaTerceiro:id});
      }catch{
        // Uma falha de rede não prova que o cliente não foi cobrado.
        return responder(res,registo);
      }
      const {data:final,error:erroFinal}=await supabaseAdmin.from('pagamentos_moveis').update({
        referencia_transacao:resultado.output_TransactionID || resultado.referencia || id,
        id_conversa:resultado.output_ConversationID || null,estado:resultado.sucesso?'concluido':'falhado',
        modo_simulacao:!!resultado.simulado,mensagem:String(resultado.output_ResponseDesc || resultado.mensagem || '').slice(0,255),resposta_bruta:resultado
      }).eq('id',id).eq('empresa_id',req.user.empresaId).select('*').single();
      if(erroFinal) return responder(res,registo);
      return responder(res,final);
    }catch(err){next(err);}
  };
}
router.post('/mpesa/c2b',iniciar('mpesa',mpesaService));
router.post('/emola/c2b',iniciar('emola',emolaService));
module.exports=router;
