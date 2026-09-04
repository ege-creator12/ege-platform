const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, readFileSync, readdirSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

const postgres = Boolean(process.env.DATABASE_URL);
let sqlite;
let pool;

if (postgres) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
  });
} else {
  const path = resolve(process.env.DATABASE_PATH || './data/ege.sqlite');
  mkdirSync(dirname(path), { recursive: true });
  sqlite = new DatabaseSync(path);
  sqlite.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
}

function pgSql(sql) {
  let index = 0;
  return sql.replace(/\b(active|published|correct)\s*=\s*1\b/gi, '$1=TRUE').replace(/\b(active|published|correct)\s*=\s*0\b/gi, '$1=FALSE').replace(/AVG\(((?:\w+\.)?)correct\)/gi, 'AVG($1correct::int)').replace(/SUM\(((?:\w+\.)?)correct\)/gi, 'SUM($1correct::int)').replace(/\?/g, () => `$${++index}`);
}

async function rows(sql, ...params) {
  if (postgres) return (await pool.query(pgSql(sql), params)).rows;
  return sqlite.prepare(sql).all(...params.map(value => typeof value === 'boolean' ? Number(value) : value));
}
async function row(sql, ...params) {
  if (postgres) return (await pool.query(pgSql(sql), params)).rows[0];
  return sqlite.prepare(sql).get(...params.map(value => typeof value === 'boolean' ? Number(value) : value));
}
async function run(sql, ...params) {
  if (postgres) {
    const returnsId = /^\s*INSERT\s+INTO\s+(users|subjects|topics|questions|question_options|attempts|skills|training_sessions|mock_exams|mock_exam_attempts)\b/i.test(sql);
    const result = await pool.query(`${pgSql(sql)}${returnsId && !/\bRETURNING\b/i.test(sql) ? ' RETURNING id' : ''}`, params);
    return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
  }
  return sqlite.prepare(sql).run(...params.map(value => typeof value === 'boolean' ? Number(value) : value));
}

async function migrate() {
  const base = resolve(__dirname, postgres ? '../migrations/postgres' : '../migrations');
  if (postgres) {
    const client = await pool.connect();
    try {
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
      for (const name of readdirSync(base).filter(name => name.endsWith('.sql')).sort()) {
        if ((await client.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) continue;
        await client.query('BEGIN');
        try {
          await client.query(readFileSync(resolve(base, name), 'utf8'));
          await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
      }
    } finally { client.release(); }
  } else {
    sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    for (const name of readdirSync(base).filter(name => name.endsWith('.sql')).sort()) {
      if (await row('SELECT name FROM schema_migrations WHERE name=?', name)) continue;
      sqlite.exec('BEGIN');
      try { sqlite.exec(readFileSync(resolve(base, name), 'utf8')); await run('INSERT INTO schema_migrations(name) VALUES(?)', name); sqlite.exec('COMMIT'); }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    }
  }
  await require('./bootstrap').bootstrapCourse({ row, run });
}

async function healthcheck() {
  await row('SELECT 1 AS ok');
  return { ok: true, database: postgres ? 'postgresql' : 'sqlite' };
}
async function close() { if (pool) await pool.end(); else sqlite?.close(); }

module.exports = { migrate, rows, row, run, healthcheck, close, dialect: postgres ? 'postgresql' : 'sqlite' };
