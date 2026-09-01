const test = require('node:test');
const assert = require('node:assert/strict');

function requireWithSupabase(routePath, fakeSupabase, fakeAuth) {
  const supabasePath = require.resolve('../src/supabaseClient.js');
  const authPath = require.resolve('../src/middleware/auth.js');
  const routeResolved = require.resolve(routePath);

  const previousSupabase = require.cache[supabasePath];
  const previousAuth = require.cache[authPath];
  const previousRoute = require.cache[routeResolved];

  delete require.cache[supabasePath];
  delete require.cache[authPath];
  delete require.cache[routeResolved];

  require.cache[supabasePath] = {
    id: supabasePath,
    filename: supabasePath,
    loaded: true,
    exports: fakeSupabase,
  };

  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: fakeAuth,
  };

  const route = require(routePath);

  if (previousSupabase) require.cache[supabasePath] = previousSupabase; else delete require.cache[supabasePath];
  if (previousAuth) require.cache[authPath] = previousAuth; else delete require.cache[authPath];
  if (previousRoute) require.cache[routeResolved] = previousRoute; else delete require.cache[routeResolved];

  return route;
}

test('GET /api/categorias usa Supabase e devolve categorias da empresa', async () => {
  let fromCalled = false;

  const fakeSupabase = {
    supabaseAdmin: {
      from(table) {
        fromCalled = true;
        assert.equal(table, 'categorias_financeiras');

        return {
          select() {
            return {
              eq() {
                return {
                  eq() {
                    return {
                      order() {
                        return Promise.resolve({ data: [{ id: 'c1', nome: 'Vendas', tipo: 'receita', ativo: true }], error: null });
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

  const router = requireWithSupabase('../src/routes/categorias.routes.js', fakeSupabase, fakeAuth);
  const layer = router.stack.find((entry) => entry.route && entry.route.path === '/');
  const handler = layer.route.stack[0].handle;

  const req = { query: { tipo: 'receita' }, user: { empresaId: 'emp-1' } };
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await handler(req, res, () => {});

  assert.equal(fromCalled, true);
  assert.equal(Array.isArray(res.body), true);
  assert.equal(res.body[0].nome, 'Vendas');
});
