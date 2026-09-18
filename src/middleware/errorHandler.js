// Middleware central de erros — mantém as respostas da API consistentes
// e evita expor detalhes internos (stack traces, SQL) ao cliente.
function errorHandler(err, req, res, next) {
  console.error(err);
  if(err.message?.includes('fetch failed') || ['ECONNREFUSED','ETIMEDOUT','ENOTFOUND'].includes(err.code)) return res.status(503).json({erro:'Não foi possível contactar a base de dados. Tente novamente dentro de instantes.'});
  if(['42703','42P01','42883','PGRST202','PGRST204'].includes(err.code)) {
    return res.status(503).json({erro:'A base de dados ainda não corresponde a esta versão da aplicação. Aplique a migração SQL completa e reinicie o backend.'});
  }

  // Violação de restrição única do Postgres (ex: e-mail já registado)
  if (err.code === '23505') {
    return res.status(409).json({ erro: 'Já existe um registo com esse valor único (ex: e-mail).' });
  }
  // Violação de chave estrangeira
  if (err.code === '23503') {
    return res.status(409).json({ erro: 'Operação inválida: existe um registo relacionado que impede esta ação.' });
  }
  // Violação de CHECK constraint
  if (err.code === '23514') {
    return res.status(400).json({ erro: 'Um dos valores enviados não é válido.' });
  }

  const status = err.status || 500;
  let mensagem = status === 500 ? 'Erro interno do servidor.' : err.message;
  if(status===500){
    const codigo=require('node:crypto').randomUUID().slice(0,8);
    const fs=require('node:fs'),path=require('node:path');
    const dir=path.resolve(__dirname,'../../logs');
    try{
      fs.mkdirSync(dir,{recursive:true});
      const file=path.join(dir,'erros-servidor.log');
      if(fs.existsSync(file)&&fs.statSync(file).size>1024*1024)fs.renameSync(file,path.join(dir,'erros-servidor-anteriores.log'));
      fs.appendFileSync(file,JSON.stringify({data:new Date().toISOString(),codigo,rota:req.path,tipo:err.name,codigoDB:err.code,mensagem:String(err.message||'').slice(0,300)})+'\n');
    }catch{}
    mensagem+=' Código: '+codigo+'.';
  }
  res.status(status).json({ erro: mensagem });
}

function notFoundHandler(req, res) {
  res.status(404).json({ erro: 'Rota não encontrada.' });
}

module.exports = { errorHandler, notFoundHandler };
