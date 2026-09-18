const { randomUUID } = require('node:crypto');
const { supabaseAdmin } = require('../supabaseClient');

async function executarOperacao(req, tipo, dados) {
  if (!supabaseAdmin) throw Object.assign(new Error('Base de dados indisponível.'), {status:503});
  const chave = req.get('Idempotency-Key') || randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chave)) {
    throw Object.assign(new Error('Identificador de operação inválido.'), {status:400});
  }
  const {data, error} = await supabaseAdmin.rpc('cfm_operacao', {
    p_empresa:req.user.empresaId, p_usuario:req.user.id, p_tipo:tipo, p_dados:dados, p_chave:chave
  });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') throw Object.assign(new Error('A actualização da base de dados ainda não foi aplicada. Contacte o administrador.'), {status:503});
    if (error.code === 'P0001') throw Object.assign(new Error(error.message), {status:400});
    if (['22P02','22003','22007','22008','22023'].includes(error.code)) throw Object.assign(new Error('Dados inválidos para esta operação.'), {status:400});
    throw error;
  }
  return data;
}
module.exports = {executarOperacao};
