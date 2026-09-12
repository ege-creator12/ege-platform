(function(){
  const escUser=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  let moderatorStatus=null,moderatorStatusAt=0,moderatorUserId=null;
  let enhancing=false,enhanceScheduled=false;

  const style=document.createElement('style');
  style.textContent=`
    html.osnova-moderator [data-admin-tab="users"],
    html.osnova-moderator [data-admin-tab="site"],
    html.osnova-moderator [data-open-tab="users"],
    html.osnova-moderator [data-open-tab="site"],
    html.osnova-moderator [data-delete-block],
    html.osnova-moderator [data-delete-user]{display:none!important}
    .admin-user-actions{display:flex;align-items:center;gap:12px;justify-content:flex-end;flex-wrap:wrap}
    .admin-user-delete{color:#ff9b9b!important;opacity:.84}
    .admin-user-delete:hover{color:#ffc0c0!important;opacity:1}
    .admin-danger-zone{margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,120,120,.16);display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}
    .admin-danger-zone strong{display:block;color:#ffc0c0;margin-bottom:4px}.admin-danger-zone small{display:block;color:var(--muted);max-width:520px;line-height:1.45}
    .admin-delete-account{background:rgba(198,66,66,.13)!important;color:#ffc0c0!important;border:1px solid rgba(255,128,128,.24)!important}
  `;
  document.head.appendChild(style);

  async function getModeratorStatus(force=false){
    const id=typeof state!=='undefined'&&state.user?Number(state.user.id):null;
    if(!id)return {moderator:false,admin:false};
    if(moderatorUserId!==id){moderatorStatus=null;moderatorStatusAt=0;moderatorUserId=id}
    if(!force&&moderatorStatus&&Date.now()-moderatorStatusAt<30000)return moderatorStatus;
    try{
      const r=await fetch('/api/moderator/status',{credentials:'same-origin',headers:{accept:'application/json'}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'status');
      moderatorStatus={moderator:Boolean(d.moderator),admin:Boolean(d.admin)};moderatorStatusAt=Date.now();
    }catch{moderatorStatus={moderator:false,admin:typeof state!=='undefined'&&state.user?.role==='admin'};moderatorStatusAt=Date.now()}
    return moderatorStatus;
  }

  async function enhanceShell(){
    if(enhancing)return;
    enhancing=true;
    try{
      const status=await getModeratorStatus();
      const moderatorOnly=status.moderator&&!status.admin;
      document.documentElement.classList.toggle('osnova-moderator',moderatorOnly);
      if(!moderatorOnly)return;
      const nav=document.querySelector('.sidebar nav');
      if(nav&&!nav.querySelector('[data-moderator-nav]')){
        const btn=document.createElement('button');
        btn.type='button';btn.dataset.moderatorNav='1';btn.dataset.nav='admin';
        if(location.hash.slice(1)==='admin')btn.classList.add('active');
        btn.innerHTML='<span class="nav-icon" aria-hidden="true">◇</span><span>Модерация</span>';
        btn.onclick=()=>{location.hash='admin'};
        nav.appendChild(btn);
      }
      const chip=document.querySelector('.user-chip small');
      if(chip&&chip.textContent!=='Модератор')chip.textContent='Модератор';
      document.querySelectorAll('[data-admin-tab="users"],[data-admin-tab="site"],[data-open-tab="users"],[data-open-tab="site"],[data-delete-block],[data-delete-user]').forEach(x=>{if(x.style.display!=='none')x.style.display='none'});
      const eyebrow=document.querySelector('.admin-console header .eyebrow');
      if(eyebrow&&eyebrow.textContent!=='Модератор')eyebrow.textContent='Модератор';
    }finally{enhancing=false}
  }

  function scheduleEnhance(){
    if(enhanceScheduled)return;
    enhanceScheduled=true;
    requestAnimationFrame(()=>{
      enhanceScheduled=false;
      enhanceShell().catch(()=>{});
    });
  }

  async function moderatorOverview(){
    const d=await adminApi('/overview'),c=d.counts||{};
    const metrics=[['Предметы',c.subjects],['Разделы',c.sections],['Темы',c.topics],['Уроки',c.lessons],['Задания',c.questions]];
    adminFrame(`<div class="admin-note">Доступ модератора ограничен учебным контентом: теория, уроки и задания. Данные пользователей, активность учеников и настройки сайта недоступны.</div><div class="admin-metrics">${metrics.map(([n,v])=>`<div class="card metric"><span>${n}</span><strong>${Number(v)||0}</strong></div>`).join('')}</div><div class="admin-grid"><button class="card admin-action" data-moderator-open="content"><b>Редактировать курс</b><span>Темы, уроки и содержимое уроков</span></button><button class="card admin-action" data-moderator-open="questions"><b>База заданий</b><span>Добавлять и исправлять вопросы</span></button></div>`,'Модерация контента');
    document.querySelectorAll('[data-moderator-open]').forEach(x=>x.onclick=()=>{adminTab=x.dataset.moderatorOpen;admin()});
  }

  window.deleteUserAccount=async function(u,trigger){
    if(!u)return;
    const currentId=Number(typeof state!=='undefined'&&state.user?.id)||0;
    if(Number(u.id)===currentId)return notify('Текущий аккаунт администратора удалить нельзя');
    const role=u.role==='admin'?'администратора':u.role==='moderator'?'модератора':'ученика';
    const ok=confirm(`Удалить аккаунт ${role} «${u.name}» (${u.email})?\n\nАккаунт, сессии, прогресс, попытки, пробники и связанные данные будут удалены из базы. Отменить это действие нельзя.`);
    if(!ok)return;
    if(trigger){trigger.disabled=true;trigger.textContent='Удаляем…'}
    try{
      const result=await adminApi(`/users/${u.id}`,{method:'DELETE'});
      adminCache.overview=null;
      notify(`Аккаунт ${result?.deleted?.name||u.name} удалён`);
      adminTab='users';
      await adminUsers();
    }catch(e){
      notify(e.message||'Не удалось удалить аккаунт');
      if(trigger){trigger.disabled=false;trigger.textContent='Удалить'}
    }
  };

  window.adminUsers=async function(){
    try{
      const [d,mods]=await Promise.all([adminApi('/overview'),api('/moderator-admin/list')]);
      const moderatorIds=new Set((mods.userIds||[]).map(Number));
      const users=(d.users||[]).map(u=>({...u,role:u.role==='admin'?'admin':moderatorIds.has(Number(u.id))?'moderator':'student'}));
      const roleLabel=r=>r==='admin'?'Администратор':r==='moderator'?'Модератор':'Ученик';
      const currentId=Number(typeof state!=='undefined'&&state.user?.id)||0;
      adminFrame(`<div class="admin-note">Только администратор может управлять аккаунтами. Удаление окончательное: пользователь и связанные с ним данные удаляются из базы.</div><div class="card admin-table-wrap"><table class="admin-table"><thead><tr><th>Пользователь</th><th>Роль</th><th>XP</th><th>Решено</th><th></th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${escUser(u.name)}</b><small>${escUser(u.email)}</small></td><td>${roleLabel(u.role)}</td><td>${Number(u.xp)||0}</td><td>${u.solved??0}</td><td><div class="admin-user-actions"><button class="link" data-edit-user="${u.id}">Изменить</button>${Number(u.id)!==currentId?`<button class="link admin-user-delete" data-delete-user="${u.id}">Удалить</button>`:'<small>Текущий аккаунт</small>'}</div></td></tr>`).join('')}</tbody></table></div>`,'Пользователи');
      document.querySelectorAll('[data-edit-user]').forEach(x=>x.onclick=()=>window.editUser(users.find(u=>Number(u.id)===Number(x.dataset.editUser))));
      document.querySelectorAll('[data-delete-user]').forEach(x=>x.onclick=()=>window.deleteUserAccount(users.find(u=>Number(u.id)===Number(x.dataset.deleteUser)),x));
    }catch(e){
      adminFrame(`<div class="card"><h2>Не удалось загрузить пользователей</h2><p class="subtitle">${escUser(e.message)}</p><button class="btn" id="users-retry">Повторить</button></div>`,'Пользователи');
      document.querySelector('#users-retry').onclick=()=>adminUsers();
    }
  };

  window.editUser=function(u){
    const currentId=Number(typeof state!=='undefined'&&state.user?.id)||0;
    const danger=Number(u.id)!==currentId?`<div class="admin-danger-zone"><div><strong>Удалить аккаунт</strong><small>Удалит пользователя, активные сессии, прогресс, попытки, данные пробников и другие связанные записи из базы.</small></div><button type="button" class="btn admin-delete-account" id="admin-delete-account">Удалить аккаунт</button></div>`:'';
    adminFrame(`<button class="back" id="admin-back">← Пользователи</button><form class="card admin-editor" id="user-edit"><h2>${escUser(u.name)}</h2><p class="subtitle">${escUser(u.email)}</p><div class="field"><label>ИМЯ</label><input name="name" value="${escUser(u.name)}"></div><div class="field"><label>XP</label><input name="xp" type="number" min="0" value="${Number(u.xp)||0}"></div><div class="field"><label>РОЛЬ</label><select name="role"><option value="student" ${u.role==='student'?'selected':''}>Ученик</option><option value="moderator" ${u.role==='moderator'?'selected':''}>Модератор</option><option value="admin" ${u.role==='admin'?'selected':''}>Администратор</option></select></div><div class="admin-note">Модератор: контент + задания + проверка сайта. Без пользователей, оформления, удаления и системных настроек.</div><button class="btn">Сохранить</button>${danger}</form>`,'Пользователь');
    document.querySelector('#admin-back').onclick=()=>{adminTab='users';admin()};
    const deleteButton=document.querySelector('#admin-delete-account');if(deleteButton)deleteButton.onclick=()=>window.deleteUserAccount(u,deleteButton);
    document.querySelector('#user-edit').onsubmit=async e=>{
      e.preventDefault();
      const b=Object.fromEntries(new FormData(e.target));
      const selected=b.role;
      await adminApi(`/users/${u.id}`,{method:'PATCH',body:JSON.stringify({name:b.name,xp:b.xp,role:selected==='admin'?'admin':'student'})});
      await api(`/moderator-admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify({enabled:selected==='moderator'})});
      adminCache.overview=null;notify(selected==='moderator'?'Роль модератора выдана':'Пользователь обновлён');adminTab='users';admin();
    };
  };

  const originalAdmin=window.admin;
  window.admin=async function(){
    const status=await getModeratorStatus();
    const moderatorOnly=status.moderator&&!status.admin;
    if(moderatorOnly&&['users','site'].includes(adminTab))adminTab='overview';
    adminLoading();
    try{
      if(adminTab==='overview'){
        if(moderatorOnly)await moderatorOverview();else await adminOverview();
      }
      else if(adminTab==='content')await adminContent();
      else if(adminTab==='questions')await adminQuestions();
      else if(adminTab==='users')await adminUsers();
      else if(adminTab==='site')await adminSite();
      else await originalAdmin();
      await enhanceShell();
    }catch(e){
      adminFrame(`<div class="card"><h2>Не удалось открыть панель</h2><p class="subtitle">${escUser(e.message)}</p><button class="btn" id="admin-retry">Повторить</button></div>`,moderatorOnly?'Модерация':'Управление платформой');
      document.querySelector('#admin-retry').onclick=()=>admin();
      await enhanceShell();
    }
  };

  const observer=new MutationObserver(scheduleEnhance);
  const appRoot=document.querySelector('#app');if(appRoot)observer.observe(appRoot,{childList:true,subtree:true});
  addEventListener('hashchange',scheduleEnhance);
  setTimeout(scheduleEnhance,500);
})();