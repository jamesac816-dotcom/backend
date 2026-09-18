// Aplica todos os ficheiros .sql da pasta /migrations, em ordem alfabética.
// Uso: npm run migrate
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, hasDb } = require('../db');

async function migrate() {
  if(!hasDb) throw new Error('DATABASE_URL não configurada. Execute o ficheiro SQL completo manualmente no Supabase.');
  const dir = path.join(__dirname, '..', '..', 'migrations');
  const nome = process.argv[2];
  if(!nome || !/^\d{3}_[a-zA-Z0-9_-]+\.sql$/.test(nome)) throw new Error('Indique a migração exacta: npm run migrate -- 011_operacoes_atomicas.sql');
  const files = [nome];

  console.log(`A aplicar ${files.length} ficheiro(s) de migração...`);
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`→ ${file}`);
    await pool.query(sql);
  }
  console.log('Migração concluída com sucesso.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Falha na migração:', err);
  process.exit(1);
});
