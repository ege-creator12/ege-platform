'use strict';

const { readdirSync } = require('node:fs');
const { join, relative } = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'data']);
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(full);
  }
}

walk(ROOT);
files.sort();

const failed = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed.push({
      file: relative(ROOT, file),
      output: String(result.stderr || result.stdout || '').trim(),
    });
  }
}

if (failed.length) {
  console.error(`JavaScript syntax check failed for ${failed.length} file(s):`);
  for (const item of failed) {
    console.error(`\n--- ${item.file} ---\n${item.output}`);
  }
  process.exit(1);
}

console.log(`JavaScript syntax OK: ${files.length} files checked.`);
