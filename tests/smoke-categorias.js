const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const supabasePath = path.resolve(__dirname, '../src/supabaseClient.js');
  const authPath = path.resolve(__dirname, '../src/middleware/auth.js');
  const routePath = path.resolve(__dirname, '../src/routes/categorias.routes.js');

  const fakeSupabase = {
    supabaseAdmin: {
      from(table) {
        assert.equal(table, 'categorias_financeiras');
        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      order() {
                        return Promise.resolve({
                          data: [{ id: 'c1', nome: 'Vendas', tipo: 'receita', ativo: true }],
                          error: null,
                        });
                      },
                    };
                  },
                };
              },
            };
          },
        };
      },
    },
  };

  const fakeAuth = {
    requireAuth(req, res, next) {
      req.user = { empresaId: 'emp-1' };
      next();
    },
  };

  const prevSupabase = require.cache[supabasePath];
  const prevAuth = require.cache[authPath];
  const prevRoute = require.cache[routePath];

  delete require.cache[supabasePath];
  delete require.cache[authPath];
  delete require.cache[routePath];

  require.cache[supabasePath] = { id: supabasePath, filename: supabasePath, loaded: true, exports: fakeSupabase };
  require.cache[authPath] = { id: authPath, filename: authPath, loaded: true, exports: fakeAuth };

  try {
    const route = require(routePath);
    const layer = route.stack.find((entry) => entry.route && entry.route.path === '/');
    const handler = layer.route.stack[0].handle;

    const req = { query: { tipo: 'receita' }, user: { empresaId: 'emp-1' } };
    const res = {
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };

    await handler(req, res, () => {});
    assert.equal(Array.isArray(res.body), true);
    assert.equal(res.body[0].nome, 'Vendas');
    console.log('OK category route smoke test');
  } finally {
    if (prevSupabase) require.cache[supabasePath] = prevSupabase; else delete require.cache[supabasePath];
    if (prevAuth) require.cache[authPath] = prevAuth; else delete require.cache[authPath];
    if (prevRoute) require.cache[routePath] = prevRoute; else delete require.cache[routePath];
  }
})();
