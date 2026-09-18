const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function ambiente(tipo) {
  class Element {
    constructor() { this.children = []; this.value = ''; this.dataset = {}; }
    replaceChildren(...items) { this.children = items; }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.children = this.children.filter(c => c !== item); this.children.push(item); }
    add(item) { this.append(item); }
    closest() { return this; }
    focus() {}
  }
  const elements = {};
  const calls = [];
  const context = vm.createContext({
    state: { user: { businessType: tipo, modulosAtivos: ['financeiro'] } },
    document: { getElementById: id => elements[id] ||= new Element(), createElement: () => new Element() },
    Option: class extends Element { constructor(label, value) { super(); this.textContent = label; this.value = value; } },
    carregarFornecedores: async () => calls.push('fornecedores'),
    carregarProdutos: async () => calls.push('produtos'),
    openProdutoModal: () => calls.push('modal-produto'), openMovimentoModal: () => calls.push('modal-stock'),
    openCompraModal: () => calls.push('modal-compra'), openReceitaModal: () => calls.push('modal-receita'),
    openDespesaModal: () => calls.push('modal-despesa'),
    podeAcessarView: () => true, mostrarMensagemPlanoBloqueado: () => calls.push('bloqueado'),
    showView: view => calls.push(view), alert: message => { throw new Error(message); }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../personalizacao-negocio.js'), 'utf8'), context);
  return { context, elements, calls, run: code => vm.runInContext(code, context) };
}

test('os 13 tipos reorganizam os mesmos quatro cartões sem mudar módulos', () => {
  const env = ambiente();
  const tipos = env.run('TIPOS_NEGOCIO');
  assert.equal(tipos.length, 13);
  for (const tipo of tipos) {
    env.context.state.user.businessType = tipo;
    env.run('renderPersonalizacaoDashboard()');
    assert.equal(env.elements['dashboard-principal'].children.length, 4);
    assert.equal(new Set(env.elements['dashboard-principal'].children).size, 4);
    assert.equal(env.elements['dashboard-atalhos'].children.length, 5);
    assert.deepEqual(env.context.state.user.modulosAtivos, ['financeiro']);
  }
});
test('sugestões são exclusivas de Mercearia e Supermercado, mesmo após troca', () => {
  const env = ambiente('Mercearia');
  for (const tipo of [...env.run('TIPOS_NEGOCIO'), 'Loja', 'Barraca', 'Padaria', 'Outro', null]) {
    env.context.state.user.businessType = tipo;
    env.run('renderSugestoesProdutos()');
    const permitido = ['Mercearia', 'Supermercado'].includes(tipo);
    assert.equal(env.elements['produtos-sugestoes'].hidden, !permitido);
    if (!permitido) assert.equal(env.elements['produtos-sugestoes'].children.length, 0);
  }
  assert.deepEqual(env.calls, []);
});
test('Adicionar apenas preenche o formulário existente e não grava produtos', async () => {
  const env = ambiente('Mercearia');
  env.run('renderSugestoesProdutos()');
  await env.elements['produtos-sugestoes'].children[2].children[0].onclick();
  assert.equal(env.elements['produto-nome'].value, 'Arroz');
  assert.deepEqual(env.calls, ['fornecedores', 'modal-produto']);
});
test('atalhos do supermercado abrem os fluxos existentes', async () => {
  const env = ambiente('Supermercado');
  env.run('renderPersonalizacaoDashboard()');
  for (const button of env.elements['dashboard-atalhos'].children) await button.onclick();
  assert.deepEqual(env.calls, ['vendas', 'fornecedores', 'modal-produto', 'produtos', 'modal-stock', 'produtos', 'fornecedores', 'modal-compra', 'modal-despesa']);
  assert.equal(env.elements['movimento-tipo'].value, 'entrada');
});
test('alertas vazios desaparecem e atalhos respeitam permissões existentes', async () => {
  const env = ambiente('Empresa');
  env.run("renderAlertasNegocio([{valor:0, view:'estoque', texto:'Stock'}])");
  assert.equal(env.elements['dashboard-alertas'].hidden, true);
  env.run("renderAlertasNegocio([{valor:10, view:'clientes', texto:'Dívidas'}])");
  assert.equal(env.elements['dashboard-alertas'].hidden, false);
  env.context.podeAcessarView = () => false;
  await env.run("executarAtalhoNegocio('compras')");
  assert.deepEqual(env.calls, ['bloqueado']);
  env.run('renderAlertasNegocio([])');
  assert.equal(env.elements['dashboard-alertas'].hidden, true);
});
test('tipo antigo é preservado no Perfil e criação não limita módulos por actividade', () => {
  const env = ambiente('Barraca');
  env.run("preencherTiposNegocio(document.getElementById('perfil-tipo'), 'Barraca')");
  assert.equal(env.elements['perfil-tipo'].value, 'Barraca');
  assert.equal(env.run('tipoNegocioActual()'), 'Quiosque/Banca/Barraca');
  const { TODOS_OS_MODULOS, modulosPorOmissao } = require('../src/config/modulos');
  for (const tipo of env.run('TIPOS_NEGOCIO')) assert.deepEqual(modulosPorOmissao(tipo), TODOS_OS_MODULOS);
});
test('exemplos de Farmácia substituem os de mercearia sem alterar valores preenchidos', () => {
  const env = ambiente('Mercearia');
  env.run('personalizarCamposNegocio()');
  assert.match(env.elements['produto-nome'].placeholder, /Arroz/);
  env.elements['produto-nome'].value = 'Produto já preenchido';
  env.context.state.user.businessType = 'Farmácia';
  env.run('personalizarCamposNegocio(); renderSugestoesProdutos()');
  assert.match(env.elements['produto-nome'].placeholder, /Gaze esterilizada/);
  assert.match(env.elements['funcionario-cargo'].placeholder, /Farmacêutico/);
  assert.equal(env.elements['produto-nome'].value, 'Produto já preenchido');
  assert.equal(env.elements['produtos-sugestoes'].hidden, true);
  for (const element of Object.values(env.elements)) {
    assert.doesNotMatch(element.placeholder || '', /arroz|massas|malta|milaneza|esparguete/i);
  }
});
test('cada actividade tem exemplos próprios e tipos desconhecidos usam texto neutro', () => {
  const env = ambiente();
  for (const tipo of env.run('TIPOS_NEGOCIO')) {
    env.context.state.user.businessType = tipo;
    env.run('personalizarCamposNegocio()');
    assert.equal(env.run('Object.hasOwn(EXEMPLOS_NEGOCIO, tipoNegocioActual())'), true);
    assert.ok(env.elements['produto-nome'].placeholder.length > 4);
  }
  env.context.state.user.businessType = 'Negócio antigo';
  env.run('personalizarCamposNegocio()');
  assert.match(env.elements['produto-nome'].placeholder, /escritório/);
});
test('tipos sem acentos, com maiúsculas ou espaços usam os exemplos correctos', () => {
  const env = ambiente();
  for (const tipo of env.run('TIPOS_NEGOCIO')) {
    env.context.state.user.businessType = '  ' + tipo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replaceAll('/', ' / ') + '  ';
    assert.equal(env.run('tipoNegocioActual()'), tipo);
    env.run('personalizarCamposNegocio(); renderSugestoesProdutos()');
    assert.equal(env.elements['produtos-sugestoes'].hidden, !['Mercearia', 'Supermercado'].includes(tipo));
  }
  env.context.state.user.businessType = 'Farmacia';
  env.run('personalizarCamposNegocio()');
  assert.match(env.elements['produto-nome'].placeholder, /Gaze esterilizada/);
});
test('formulário real aplica exemplos em cada abertura, mesmo sem passar pelo Dashboard', () => {
  const env = ambiente('Farmacia');
  env.context.state.suppliers = [];
  env.context.pendingProdutoImagemUrl = null;
  env.context.document.querySelector = () => ({ reset() {} });
  env.context.openModal = () => {};
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../produtos-estoque.js'), 'utf8'), env.context);
  env.run('openProdutoModal()');
  assert.match(env.elements['produto-nome'].placeholder, /Gaze esterilizada/);
  env.context.state.user.businessType = 'Construção/Empreiteiro';
  env.run('openProdutoModal()');
  assert.match(env.elements['produto-nome'].placeholder, /Cimento/);
  env.context.state.user.businessType = 'Farmácia';
  env.context.state.products = [{id:'p1', nome:'Produto do utilizador', categoria:'Categoria própria', marca:'Marca própria'}];
  env.run("openProdutoModal('p1')");
  assert.equal(env.elements['produto-nome'].value, 'Produto do utilizador');
  assert.equal(env.elements['produto-categoria'].value, 'Categoria própria');
  assert.match(env.elements['produto-nome'].placeholder, /Gaze esterilizada/);
});
test('HTML inicial não contém exemplos fixos de mercearia nos campos', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const placeholders = html.match(/placeholder="[^"]*"/g) || [];
  assert.doesNotMatch(placeholders.join('\n'), /Esparguete|Milaneza|Massas|Arroz|Mercearia/i);
});
