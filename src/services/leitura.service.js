// Os cálculos financeiros precisam de todas as páginas, não só das primeiras 1000 linhas.
async function lerTodas(criarConsulta) {
  const linhas = [];
  const tamanho = 500;
  for (let inicio = 0; ; inicio += tamanho) {
    const { data, error } = await criarConsulta().range(inicio, inicio + tamanho - 1);
    if (error) throw error;
    linhas.push(...(data || []));
    if (!data || data.length < tamanho) return linhas;
  }
}
module.exports = { lerTodas };
