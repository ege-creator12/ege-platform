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
    html.osnova-moderator [data-delete-block]{display:none!important}
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
      document.querySelectorAll('[data-admin-tab="users"],[data-admin-tab="site"],[data-open-tab="users"],[data-open-tab="site"],[data-delete-block]').forEach(x=>{if(x.style.display!=='none')x.style.display='none'});
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

  window.adminUsers=async function(){
    try{
      const [d,mods]=await Promise.all([adminApi('/overview'),api('/moderator-admin/list')]);
      const moderatorIds=new Set((mods.userIds||[]).map(Number));
      const users=(d.users||[]).map(u=>({...u,role:u.role==='admin'?'admin':moderatorIds.has(Number(u.id))?'moderator':'student'}));
      const roleLabel=r=>r==='admin'?'Администратор':r==='moderator'?'Модератор':'Ученик';
      adminFrame(`<div class="admin-note">Модератор может редактировать теорию, уроки и задания, но не имеет доступа к пользователям, настройкам сайта, удалению контента и технической части.</div><div class="card admin-table-wrap"><table class="admin-table"><thead><tr><th>Пользователь</th><th>Роль</th><th>XP</th><th>Решено</th><th></th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${escUser(u.name)}</b><small>${escUser(u.email)}</small></td><td>${roleLabel(u.role)}</td><td>${Number(u.xp)||0}</td><td>${u.solved??0}</td><td><button class="link" data-edit-user="${u.id}">Изменить</button></td></tr>`).join('')}</tbody></table></div>`,'Пользователи');
      document.querySelectorAll('[data-edit-user]').forEach(x=>x.onclick=()=>window.editUser(users.find(u=>Number(u.id)===Number(x.dataset.editUser))));
    }catch(e){
      adminFrame(`<div class="card"><h2>Не удалось загрузить пользователей</h2><p class="subtitle">${escUser(e.message)}</p><button class="btn" id="users-retry">Повторить</button></div>`,'Пользователи');
      document.querySelector('#users-retry').onclick=()=>adminUsers();
    }
  };

  window.editUser=function(u){
    adminFrame(`<button class="back" id="admin-back">← Пользователи</button><form class="card admin-editor" id="user-edit"><h2>${escUser(u.name)}</h2><p class="subtitle">${escUser(u.email)}</p><div class="field"><label>ИМЯ</label><input name="name" value="${escUser(u.name)}"></div><div class="field"><label>XP</label><input name="xp" type="number" min="0" value="${Number(u.xp)||0}"></div><div class="field"><label>РОЛЬ</label><select name="role"><option value="student" ${u.role==='student'?'selected':''}>Ученик</option><option value="moderator" ${u.role==='moderator'?'selected':''}>Модератор</option><option value="admin" ${u.role==='admin'?'selected':''}>Администратор</option></select></div><div class="admin-note">Модератор: контент + задания + проверка сайта. Без пользователей, оформления, удаления и системных настроек.</div><button class="btn">Сохранить</button></form>`,'Пользователь');
    document.querySelector('#admin-back').onclick=()=>{adminTab='users';admin()};
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
    if(status.moderator&&!status.admin&&['users','site'].includes(adminTab))adminTab='overview';
    adminLoading();
    try{
      if(adminTab==='overview')await adminOverview();
      else if(adminTab==='content')await adminContent();
      else if(adminTab==='questions')await adminQuestions();
      else if(adminTab==='users')await adminUsers();
      else if(adminTab==='site')await adminSite();
      else await originalAdmin();
      await enhanceShell();
    }catch(e){
      adminFrame(`<div class="card"><h2>Не удалось открыть панель</h2><p class="subtitle">${escUser(e.message)}</p><button class="btn" id="admin-retry">Повторить</button></div>`,status.moderator&&!status.admin?'Модерация':'Управление платформой');
      document.querySelector('#admin-retry').onclick=()=>admin();
      await enhanceShell();
    }
  };

  const observer=new MutationObserver(scheduleEnhance);
  const appRoot=document.querySelector('#app');if(appRoot)observer.observe(appRoot,{childList:true,subtree:true});
  addEventListener('hashchange',scheduleEnhance);
  setTimeout(scheduleEnhance,500);
})();
