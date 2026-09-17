'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const fail = [];
const ok = [];
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const exists = file => fs.existsSync(path.join(root, file));
const check = (condition, message) => (condition ? ok : fail).push(message);

const index = read('public/index.html');
const entry = read('server-entry.js');
const security = read('server-release-security-preload.js');
const releaseNavUrl = '/release-navigation-lock.js?v=20260916-release3';

check(index.includes(releaseNavUrl), 'release navigation lock is loaded');
check(index.indexOf(releaseNavUrl) > index.indexOf('/app.js?v=20260916-release2'), 'release navigation lock loads after app.js');
check(index.indexOf(releaseNavUrl) < index.indexOf('/route-race-guard.js'), 'release navigation lock loads before later UI modules');
check(index.includes('/teacher-privacy-ui.js?v=20260916-release1'), 'teacher privacy UI guard is loaded');
check(!index.includes('/sidebar-hard-freeze.js'), 'obsolete hard-freeze sidebar is not loaded');
check(!index.includes('/sidebar-order-lock.js'), 'obsolete sidebar order lock is not loaded');
check(!index.includes('/sidebar-stability-final.js'), 'obsolete sidebar mutation stabilizer is not loaded');
check(!index.includes('/owner-identity-fix.js'), 'global owner identity DOM observer is not loaded');

const srcs = [...index.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m => m[1]);
const duplicateScripts = srcs.filter((src, i) => srcs.indexOf(src) !== i);
check(duplicateScripts.length === 0, `no duplicate script URLs${duplicateScripts.length ? ': ' + duplicateScripts.join(', ') : ''}`);

const localRefs = [
  ...[...index.matchAll(/<script\b[^>]*\bsrc="(\/[^"]+)"/g)].map(m => m[1]),
  ...[...index.matchAll(/<link\b[^>]*\bhref="(\/[^"]+)"/g)].map(m => m[1]),
].map(x => x.split('?')[0]).filter(x => !x.startsWith('//'));
const missing = [...new Set(localRefs)].filter(ref => !exists('public' + ref));
check(missing.length === 0, `all local index assets exist${missing.length ? ': ' + missing.join(', ') : ''}`);

check(entry.includes("require.resolve('./server-release-security-preload')"), 'release security preload is configured in server-entry');
check(entry.includes('NODE_OPTIONS'), 'release security propagates to child Node processes');
check(entry.includes('release-role-audit'), 'production startup logs role counts for release verification');
check(/owner-claim/.test(security) && /blockedPrivilegedPath/.test(security), 'legacy owner-claim path is denied before routing');
check(/student_email/.test(security) && /studentEmail/.test(security), 'teacher response sanitizer covers legacy email field names');

for (const migration of [
  'migrations/007_admin_owner.sql',
  'migrations/008_owner_account.sql',
  'migrations/postgres/006_admin_owner.sql',
  'migrations/postgres/007_owner_account.sql',
  'migrations/postgres/008_secure_owner.sql',
]) {
  const sql = read(migration);
  check(!/SET\s+role\s*=\s*['"]admin['"]/i.test(sql), `${migration} does not auto-promote a registered user to admin`);
}

const publicFiles = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else publicFiles.push(full);
  }
}
walk(path.join(root, 'public'));
const secretPatterns = [
  /AIza[0-9A-Za-z_-]{30,}/g,
  /sk-[0-9A-Za-z_-]{24,}/g,
  /gh[opsu]_[0-9A-Za-z]{30,}/g,
];
const secretHits = [];
for (const file of publicFiles) {
  if (!/\.(?:js|html|css|json|txt)$/i.test(file)) continue;
  const body = fs.readFileSync(file, 'utf8');
  for (const pattern of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(body)) secretHits.push(path.relative(root, file));
  }
}
check(secretHits.length === 0, `no obvious API secrets in public assets${secretHits.length ? ': ' + [...new Set(secretHits)].join(', ') : ''}`);

const admin = read('server-admin.js');
const subscriptions = read('server-subscriptions.js');
const moderator = read('server-moderator.js');
const teacher = read('server-teacher.js');
const teacherV2 = read('server-teacher-v2.js');
const teacherV3 = read('server-teacher-v3.js');
check(/user\.role\s*!==\s*'admin'/.test(admin), 'admin console has server-side admin role check');
check(/user\.role\s*!==\s*'admin'/.test(subscriptions), 'subscription admin endpoints have server-side admin role check');
check(/moderator-admin[\s\S]*user\.role\s*!==\s*'admin'/.test(moderator), 'moderator assignment endpoints require admin role');
check(/teacher-admin[\s\S]*user\.role\s*!==\s*'admin'/.test(teacher), 'teacher assignment endpoints require admin role');
check(/WHERE id=\? AND teacher_id=\?/.test(teacher) && /WHERE id=\? AND teacher_id=\?/.test(teacherV2) && /WHERE id=\? AND teacher_id=\?/.test(teacherV3), 'teacher class access is ownership-scoped in every teacher API layer');
check(/WHERE a\.id=\? AND a\.teacher_id=\? AND tas\.user_id=\?/.test(teacherV3), 'teacher result detail is scoped by teacher and student');

const nav = read('public/release-navigation-lock.js');
check(/height:44px/.test(nav) && /data-release-slot/.test(nav), 'sidebar rows are fixed-height canonical slots');
check(/order:100/.test(nav) && /order:150/.test(nav), 'sidebar visual order is CSS-locked against legacy DOM moves');
check(!/insertBefore\(/.test(nav), 'release navigation does not continuously reorder with insertBefore');

console.log(`Release readiness checks passed: ${ok.length}`);
for (const item of ok) console.log(`  OK  ${item}`);
if (fail.length) {
  console.error(`Release readiness checks failed: ${fail.length}`);
  for (const item of fail) console.error(`  FAIL  ${item}`);
  process.exit(1);
}
