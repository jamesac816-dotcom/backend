function hojeMaputo(agora=new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Maputo',year:'numeric',month:'2-digit',day:'2-digit'}).format(agora);
}
function emPeriodo(valor, periodo='mes', hoje=hojeMaputo()) {
  const dia=String(valor || '').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia>hoje) return false;
  if(periodo==='hoje') return dia===hoje;
  if(periodo==='ano') return dia.slice(0,4)===hoje.slice(0,4);
  if(periodo==='semana') {
    const inicio=new Date(hoje+'T00:00:00Z');
    inicio.setUTCDate(inicio.getUTCDate()-((inicio.getUTCDay()+6)%7));
    return dia>=inicio.toISOString().slice(0,10);
  }
  return dia.slice(0,7)===hoje.slice(0,7);
}
function resumir(transacoes,vendas,periodo,hoje=hojeMaputo()) {
  const atuais=transacoes.filter(t=>String(t.data).slice(0,10)<=hoje);
  const rows=atuais.filter(t=>emPeriodo(t.data,periodo,hoje));
  const vendasPeriodo=vendas.filter(v=>emPeriodo(v.data,periodo,hoje));
  const receitas=rows.filter(t=>t.tipo==='receita'), despesas=rows.filter(t=>t.tipo==='despesa');
  const total=xs=>xs.reduce((s,x)=>s+Number(x.valor || 0),0);
  const historico=rows.some(t=>!t.origem || t.origem==='legado');
  const lucroVendas=vendasPeriodo.reduce((s,v)=>s+Number(v.lucro || 0),0);
  const outrasReceitas=receitas.filter(t=>t.origem==='manual');
  const despesasOperacionais=despesas.filter(t=>t.origem!=='compra');
  return {
    saldoAtual:atuais.reduce((s,t)=>s+(t.tipo==='receita'?1:-1)*Number(t.valor || 0),0),
    receitasPeriodo:total(receitas),despesasPeriodo:total(despesas),
    lucroPeriodo:historico?null:lucroVendas+total(outrasReceitas)-total(despesasOperacionais),
    quantidadeReceitas:receitas.length,quantidadeDespesas:despesas.length,
    vendasPeriodo:vendasPeriodo.reduce((s,v)=>s+Number(v.total || 0),0),quantidadeVendas:vendasPeriodo.length,
    historicoPorRever:atuais.some(t=>!t.origem || t.origem==='legado')
  };
}
module.exports={hojeMaputo,emPeriodo,resumir};
