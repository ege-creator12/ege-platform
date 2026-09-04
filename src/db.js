const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');

const path = resolve(process.env.DATABASE_PATH || './data/ege.sqlite');
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

function migrate() {
  db.exec(readFileSync(resolve(__dirname, '../migrations/001_initial.sql'), 'utf8'));
}

function rows(sql, ...params) { return db.prepare(sql).all(...params); }
function row(sql, ...params) { return db.prepare(sql).get(...params); }
function run(sql, ...params) { return db.prepare(sql).run(...params); }

module.exports = { db, migrate, rows, row, run };
