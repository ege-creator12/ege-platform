const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, readFileSync, readdirSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

const path = resolve(process.env.DATABASE_PATH || './data/ege.sqlite');
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

function migrate() {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  const directory = resolve(__dirname, '../migrations');
  for (const name of readdirSync(directory).filter(x => x.endsWith('.sql')).sort()) {
    if (row('SELECT name FROM schema_migrations WHERE name=?', name)) continue;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(resolve(directory, name), 'utf8'));
      run('INSERT INTO schema_migrations(name) VALUES(?)', name);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

function rows(sql, ...params) { return db.prepare(sql).all(...params); }
function row(sql, ...params) { return db.prepare(sql).get(...params); }
function run(sql, ...params) { return db.prepare(sql).run(...params); }

module.exports = { db, migrate, rows, row, run };
