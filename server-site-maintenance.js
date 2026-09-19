'use strict';

const database = require('./src/db');
const { row, run } = database;

const json = (res, status, data) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(data));
};

async function ensureSchema() {
  await run(`CREATE TABLE IF NOT EXISTS site_maintenance (
    id INTEGER PRIMARY KEY,
    active INTEGER NOT NULL DEFAULT 0,
    activated_by BIGINT,
    activated_at TIMESTAMP,
    deactivated_by BIGINT,
    deactivated_at TIMESTAMP
  )`);
  await run('INSERT INTO site_maintenance(id,active) VALUES(1,0) ON CONFLICT(id) DO NOTHING');
}

async function userFor(req) {
  const token = (req.headers.cookie || '').match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!token) return null;
  return row(
    'SELECT u.id,u.name,u.email,u.role,u.xp FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires_at>CURRENT_TIMESTAMP',
    token,
  );
}

async function currentState() {
  const state = await row('SELECT active,activated_by,activated_at,deactivated_by,deactivated_at FROM site_maintenance WHERE id=1');
  return {
    active: Boolean(Number(state?.active || 0)),
    activatedBy: state?.activated_by == null ? null : Number(state.activated_by),
    activatedAt: state?.activated_at || null,
    deactivatedBy: state?.deactivated_by == null ? null : Number(state.deactivated_by),
    deactivatedAt: state?.deactivated_at || null,
  };
}

async function moderatorRecord(userId) {
  if (!userId) return null;
  return row('SELECT user_id FROM moderator_users WHERE user_id=?', userId);
}

function maintenancePage() {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#091411">
<title>ОСНОВА — технические работы</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07110e;color:#eefbf5;font-family:Manrope,Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px}
  .card{width:min(560px,100%);padding:34px;border:1px solid rgba(142,255,199,.16);border-radius:28px;background:linear-gradient(145deg,rgba(16,36,29,.96),rgba(7,17,14,.98));box-shadow:0 24px 80px rgba(0,0,0,.35)}
  .brand{font-size:13px;font-weight:800;letter-spacing:.18em;color:#7cf0b6;margin-bottom:28px}
  h1{font-size:clamp(28px,7vw,46px);line-height:1.05;margin:0 0 16px}
  p{margin:0;color:#a9bbb3;font-size:16px;line-height:1.6}
  .dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#ffbe55;margin-right:8px;box-shadow:0 0 22px rgba(255,190,85,.5)}
  .owner{display:inline-block;margin-top:28px;color:#6f857c;font-size:12px;text-decoration:none}
  .owner:hover{color:#9db2a9}
</style>
</head>
<body>
  <main class="card">
    <div class="brand">ОСНОВА</div>
    <h1><span class="dot"></span>Сервис временно недоступен</h1>
    <p>Сейчас проводятся технические работы. Доступ будет восстановлен позже.</p>
    <a class="owner" href="/owner-login">Вход владельца</a>
  </main>
</body>
</html>`;
}

function ownerLoginPage() {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>ОСНОВА — вход владельца</title>
<style>
  *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07110e;color:#eefbf5;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
  form{width:min(420px,100%);padding:28px;border:1px solid #1b4033;border-radius:24px;background:#0d1c17}
  h1{margin:0 0 20px;font-size:25px}label{display:block;margin:14px 0 6px;color:#9db2a9;font-size:13px}
  input{width:100%;padding:13px 14px;border-radius:12px;border:1px solid #285241;background:#07110e;color:#fff;outline:none}
  button{width:100%;margin-top:18px;padding:13px;border:0;border-radius:12px;background:#7cf0b6;color:#062117;font-weight:800;cursor:pointer}
  #msg{min-height:20px;margin-top:12px;color:#ff9f9f;font-size:13px}
</style>
</head>
<body>
<form id="login">
  <h1>Вход владельца</h1>
  <label>Почта</label><input id="email" type="email" autocomplete="username" required>
  <label>Пароль</label><input id="password" type="password" autocomplete="current-password" required>
  <button type="submit">Войти</button>
  <div id="msg"></div>
</form>
<script>
document.getElementById('login').addEventListener('submit',async e=>{
  e.preventDefault();
  const msg=document.getElementById('msg');msg.textContent='';
  const r=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('password').value})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){msg.textContent=d.error||'Не удалось войти';return}
  location.href='/';
});
</script>
</body>
</html>`;
}

async function handle(req, res, url) {
  const path = url.pathname;

  if (path === '/owner-login' && req.method === 'GET') {
    const state = await currentState();
    if (!state.active) return false;
    res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
    res.end(ownerLoginPage());
    return true;
  }

  if (!path.startsWith('/api/site-maintenance/')) return false;

  const user = await userFor(req);
  if (!user) {
    json(res, 401, { error: 'Войдите в аккаунт' });
    return true;
  }

  if (path === '/api/site-maintenance/status' && req.method === 'GET') {
    const moderator = user.role !== 'admin' && Boolean(await moderatorRecord(user.id));
    json(res, 200, {
      ...(await currentState()),
      admin: user.role === 'admin',
      moderator,
      canActivate: moderator,
      canDeactivate: user.role === 'admin',
    });
    return true;
  }

  if (path === '/api/site-maintenance/activate' && req.method === 'POST') {
    if (user.role === 'admin' || !(await moderatorRecord(user.id))) {
      json(res, 403, { error: 'Только модератор может включить этот режим' });
      return true;
    }
    await run(
      'UPDATE site_maintenance SET active=1,activated_by=?,activated_at=CURRENT_TIMESTAMP,deactivated_by=NULL,deactivated_at=NULL WHERE id=1',
      user.id,
    );
    json(res, 200, { ok: true, ...(await currentState()) });
    return true;
  }

  if (path === '/api/site-maintenance/deactivate' && req.method === 'POST') {
    if (user.role !== 'admin') {
      json(res, 403, { error: 'Вернуть сайт может только владелец' });
      return true;
    }
    await run(
      'UPDATE site_maintenance SET active=0,deactivated_by=?,deactivated_at=CURRENT_TIMESTAMP WHERE id=1',
      user.id,
    );
    json(res, 200, { ok: true, ...(await currentState()) });
    return true;
  }

  json(res, 404, { error: 'Маршрут не найден' });
  return true;
}

async function enforce(req, res, url) {
  const state = await currentState();
  if (!state.active) return false;

  const path = url.pathname;
  if (path === '/api/health' || path === '/api/login' || path === '/api/logout') return false;

  const user = await userFor(req);
  if (user?.role === 'admin') return false;

  if (path.startsWith('/api/')) {
    json(res, 503, {
      error: 'Сервис временно недоступен. Проводятся технические работы.',
      code: 'MAINTENANCE_MODE',
    });
    return true;
  }

  res.writeHead(503, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'retry-after': '300',
  });
  if (req.method === 'HEAD') res.end();
  else res.end(maintenancePage());
  return true;
}

module.exports = { ensureSchema, handle, enforce, currentState };
