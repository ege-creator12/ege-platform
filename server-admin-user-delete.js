'use strict';

const database = require('./src/db');
const { row, transaction } = database;

const json = (res, status, data) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
};

const idOf = value => {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

async function currentUser(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row(
    'SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

async function tableExists(tx, name) {
  if (database.dialect === 'postgresql') {
    const found = await tx.row('SELECT to_regclass(?) reg', name);
    return Boolean(found?.reg);
  }
  return Boolean(await tx.row("SELECT name FROM sqlite_master WHERE type='table' AND name=?", name));
}

async function deleteFromIfExists(tx, table, column, userId) {
  if (!(await tableExists(tx, table))) return;
  const allowed = new Set([
    'mock_exam_attempts:user_id',
    'ai_daily_usage:user_id',
    'ai_coach_memory:user_id',
    'moderator_ai_usage:user_id',
    'problem_reports:reporter_user_id',
    'moderator_users:user_id',
  ]);
  if (!allowed.has(`${table}:${column}`)) throw new Error('Недопустимая таблица очистки');
  await tx.run(`DELETE FROM ${table} WHERE ${column}=?`, userId);
}

async function deleteAccount(admin, targetId) {
  return transaction(async tx => {
    const target = await tx.row('SELECT id,name,email,role FROM users WHERE id=?', targetId);
    if (!target) throw Object.assign(new Error('Пользователь уже удалён или не найден'), { status: 404 });
    if (Number(target.id) === Number(admin.id)) {
      throw Object.assign(new Error('Нельзя удалить аккаунт, под которым ты сейчас работаешь'), { status: 400 });
    }

    // Tables from the original schema mostly use ON DELETE CASCADE. These are
    // legacy/runtime tables that either have no FK cascade or may exist without one.
    await deleteFromIfExists(tx, 'mock_exam_attempts', 'user_id', targetId);
    await deleteFromIfExists(tx, 'ai_daily_usage', 'user_id', targetId);
    await deleteFromIfExists(tx, 'ai_coach_memory', 'user_id', targetId);
    await deleteFromIfExists(tx, 'moderator_ai_usage', 'user_id', targetId);
    await deleteFromIfExists(tx, 'problem_reports', 'reporter_user_id', targetId);

    if (await tableExists(tx, 'moderator_users')) {
      await tx.run('UPDATE moderator_users SET assigned_by=NULL WHERE assigned_by=?', targetId);
      await deleteFromIfExists(tx, 'moderator_users', 'user_id', targetId);
    }

    // The users row is deleted last. Core sessions, attempts, progress,
    // training sessions, study plans and product data are removed by FK cascades.
    const removed = await tx.run('DELETE FROM users WHERE id=?', targetId);
    if (!Number(removed?.changes || 0)) {
      throw Object.assign(new Error('Не удалось удалить аккаунт'), { status: 409 });
    }

    return {
      id: Number(target.id),
      name: target.name,
      email: target.email,
      role: target.role,
    };
  });
}

async function handle(req, res, url) {
  const match = url.pathname.match(/^\/api\/admin-console\/users\/(\d+)$/);
  if (!match || req.method !== 'DELETE') return false;

  const admin = await currentUser(req);
  if (!admin) {
    json(res, 401, { error: 'Войди в аккаунт' });
    return true;
  }
  if (admin.role !== 'admin') {
    json(res, 403, { error: 'Удалять аккаунты может только администратор' });
    return true;
  }

  const targetId = idOf(match[1]);
  if (!targetId) {
    json(res, 400, { error: 'Некорректный ID пользователя' });
    return true;
  }

  const deleted = await deleteAccount(admin, targetId);
  json(res, 200, { ok: true, deleted });
  return true;
}

module.exports = { handle, deleteAccount };
