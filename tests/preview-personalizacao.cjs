// Pré-visualização local com dados fictícios, sem chamadas à API nem gravações.
// node backend/tests/preview-personalizacao.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const bootstrap = `<script>
state.user = {businessType: new URLSearchParams(location.search).get('tipo') || 'Farmácia', ownerName:'Demonstração', businessName:'Negócio de teste', papel:'admin', inscritoEm:'2026-09-01T10:00:00Z', planoAtual:{id:'essencial',nome:'Essencial',preco:12900,renovarEm:'2026-10-01T10:00:00Z'}, modulosAtivos:Object.keys(MODULOS)};
apiFetch = async () => { throw new Error('Pré-visualização: API desactivada'); };
showScreen('app');
renderResumoAssinatura();
renderPersonalizacaoDashboard();
renderSugestoesProdutos();
if (new URLSearchParams(location.search).get('vista') === 'produto') openProdutoModal();
if (new URLSearchParams(location.search).get('vista') === 'onboarding') startOnboarding();
</script>`;
http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/') {
    let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    html = html.replace(/<script src="init\.js(?:\?v=[^"]+)?"><\/script>/, bootstrap)
      .replace(/<script src="pwa-init\.js(?:\?v=[^"]+)?"><\/script>/, '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end(html);
  }
  // Apenas ficheiros públicos da interface; nunca configuração ou dados do backend.
  if (!/^\/[\w-]+\.(js|css)$/.test(pathname) && !/^\/img\/[^/]+\.(png|jpeg|jpg)$/.test(pathname)) {
    res.writeHead(404); return res.end();
  }
  try {
    let file = fs.readFileSync(path.join(root, pathname.slice(1)));
    if (pathname === '/auth.js') {
      file = file.toString().replace(/if\(document.readyState === 'loading'\)\{[\s\S]*?async function enterApp/, 'async function enterApp');
    }
    res.setHeader('Content-Type', pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : pathname.endsWith('.css') ? 'text/css; charset=utf-8' : 'image/jpeg');
    res.end(file);
  } catch { res.writeHead(404); res.end(); }
}).listen(4178, '127.0.0.1', () => console.log('Pré-visualização: http://127.0.0.1:4178'));
