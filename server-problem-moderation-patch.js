'use strict';

const database = require('./src/db');
const problemReports = require('./server-problem-reports');

const originalHandle = problemReports.handle;

const json = (res, status, data) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
};

async function currentUser(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return database.row(
    'SELECT u.id,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

problemReports.handle = async function patchedProblemReportsHandle(req, res, url) {
  const match = url.pathname.match(/^\/api\/problem-reports\/(\d+)\/revoke-subscription$/);
  if (!match) return originalHandle(req, res, url);

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Недоступное действие' });
    return true;
  }

  const actor = await currentUser(req);
  if (!actor) {
    json(res, 401, { error: 'Войдите в аккаунт' });
    return true;
  }
  if (actor.role !== 'admin') {
    json(res, 403, { error: 'Это действие доступно только администратору' });
    return true;
  }

  const reportId = Number(match[1]);
  const report = await database.row(
    'SELECT reporter_user_id FROM problem_reports WHERE id=?',
    reportId,
  );
  if (!report) {
    json(res, 404, { error: 'Сообщение не найдено' });
    return true;
  }

  const existing = await database.row(
    'SELECT user_id FROM user_subscriptions WHERE user_id=?',
    Number(report.reporter_user_id),
  );
  await database.run(
    'DELETE FROM user_subscriptions WHERE user_id=?',
    Number(report.reporter_user_id),
  );

  json(res, 200, {
    ok: true,
    subscriptionRemoved: Boolean(existing),
  });
  return true;
};

module.exports = problemReports;
