require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth.routes');
const produtosRoutes = require('./routes/produtos.routes');
const estoqueRoutes = require('./routes/estoque.routes');
const clientesRoutes = require('./routes/clientes.routes');
const transacoesRoutes = require('./routes/transacoes.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const fornecedoresRoutes = require('./routes/fornecedores.routes');
const comprasRoutes = require('./routes/compras.routes');
const vendasRoutes = require('./routes/vendas.routes');
const caixaRoutes = require('./routes/caixa.routes');
const funcionariosRoutes = require('./routes/funcionarios.routes');
const notificacoesRoutes = require('./routes/notificacoes.routes');
const contasPagarRoutes = require('./routes/contasPagar.routes');
const imobilizadoRoutes = require('./routes/imobilizado.routes');
const orcamentoRoutes = require('./routes/orcamento.routes');
const irpsRoutes = require('./routes/irps.routes');
const ivaRoutes = require('./routes/iva.routes');
const adminRoutes = require('./routes/admin.routes');
const bancosRoutes = require('./routes/bancos.routes');
const cartoesRoutes = require('./routes/cartoes.routes');
const categoriasRoutes = require('./routes/categorias.routes');
const pagamentosRoutes = require('./routes/pagamentos.routes');
const planosRoutes = require('./routes/planos.routes');
const userPlansRoutes = require('./routes/user_plans.routes');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origem não autorizada pelo CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  credentials: true
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));


app.use(helmet());
app.use(express.json({ limit: '5mb' }));

// ========== CORS MANUAL (MÁXIMA COMPATIBILIDADE) ==========
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Compatibilidade adicional para desenvolvimento local e produção
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin || allowedOrigins[0] || '*');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Limite de pedidos para as rotas de autenticação
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Rotas
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/produtos', produtosRoutes);
app.use('/api/estoque', estoqueRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/transacoes', transacoesRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/fornecedores', fornecedoresRoutes);
app.use('/api/compras', comprasRoutes);
app.use('/api/vendas', vendasRoutes);
app.use('/api/caixa', caixaRoutes);
app.use('/api/funcionarios', funcionariosRoutes);
app.use('/api/notificacoes', notificacoesRoutes);
app.use('/api/contas-pagar', contasPagarRoutes);
app.use('/api/imobilizado', imobilizadoRoutes);
app.use('/api/orcamento', orcamentoRoutes);
app.use('/api/irps', irpsRoutes);
app.use('/api/iva', ivaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bancos', bancosRoutes);
app.use('/api/cartoes', cartoesRoutes);
app.use('/api/categorias', categoriasRoutes);
app.use('/api/pagamentos', pagamentosRoutes);
app.use('/api/planos', planosRoutes);
app.use('/api/user_plans', userPlansRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`ContaFácil MZ backend a correr na porta ${PORT} (${process.env.NODE_ENV || 'development'})`);
});