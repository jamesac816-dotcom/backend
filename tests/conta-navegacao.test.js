const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const source = name => fs.readFileSync(path.join(__dirname, '../..', name), 'utf8');

test('um toque abre o menu; fechar e reabrir mantém estado e scroll coerentes', () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},setAttribute(){},addEventListener(){},remove(){}});
    }
    return elements.get(id);
  };
  const context = vm.createContext({state:{user:{}},window:{innerWidth:375,addEventListener(){},navigator:{},matchMedia:()=>({matches:false})},document:{readyState:'loading',body:{style:{}},addEventListener(){},querySelector:element,getElementById:element,querySelectorAll:()=>[]}});
  vm.runInContext(source('mobile-nav.js'),context);
  vm.runInContext('MobileNav = new MobileNavManager(); toggleSidebar();',context);
  assert.equal(element('.sidebar').classList.contains('open'),true);
  assert.equal(context.document.body.style.overflow,'hidden');
  vm.runInContext('toggleSidebar(false);',context);
  assert.equal(element('.sidebar').classList.contains('open'),false);
  assert.equal(context.document.body.style.overflow,'');
  vm.runInContext('toggleSidebar();',context);
  assert.equal(element('.sidebar').classList.contains('open'),true);
  // A regressão vinha de um segundo listener no mesmo botão inline.
  assert.doesNotMatch(source('mobile-nav.js'), /hamburger\.addEventListener\('click'/);
});

test('cancelar saída conserva sessão; confirmar limpa token e dados', () => {
  let confirm = false;
  const removed = [];
  const context = vm.createContext({state:{user:{id:'u'}},authToken:'token',pendingRegisterData:{},pendingLogoDataUrl:'logo',pdvCart:[{}],window:{confirm:()=>confirm},document:{readyState:'loading',addEventListener(){},querySelectorAll:()=>[],body:{style:{}}},localStorage:{removeItem:key=>removed.push(key)},toggleSidebar(){},toggleAdminSidebar(){},showScreen:name=>{context.screen=name;}});
  vm.runInContext(source('auth.js'),context);
  context.handleLogout();
  assert.equal(context.authToken,'token');assert.equal(context.state.user.id,'u');
  confirm = true;context.handleLogout();
  assert.equal(context.authToken,null);assert.equal(context.state.user,null);
  assert.deepEqual(removed,['contafacil_token']);assert.equal(context.screen,'landing');
});

test('datas ausentes não são inventadas e renovação abre o pedido correcto', () => {
  let purchase;
  const els = {};
  const context = vm.createContext({state:{user:{inscritoEm:'2026-09-01T10:00:00Z',planoAtual:{id:'essencial',nome:'Essencial',renovarEm:'2020-10-01T10:00:00Z'}}},document:{getElementById:id=>els[id] ||= {}},openWhatsAppPurchase:(...args)=>{purchase=args;}});
  vm.runInContext(source('perfil-config.js'),context);
  assert.equal(context.formatarDataAssinatura(null),'Não disponível');
  context.renderResumoAssinatura();assert.match(els['assinatura-datas'].textContent,/Renovação em atraso/);
  context.renovarPlanoAtual();assert.deepEqual(purchase,['essencial','Essencial','renovar']);
});
