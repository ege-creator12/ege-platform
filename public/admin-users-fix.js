(function(){
  const escUser=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  async function loadStudents(){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const r=await fetch('/api/admin/stats',{headers:{'content-type':'application/json'},credentials:'same-origin',signal:controller.signal});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'Не удалось загрузить пользователей');
      return d;
    }finally{clearTimeout(timer)}
  }
  window.adminUsers=async function(){
    try{
      const d=await loadStudents();
      const adminRow=state?.user?.role==='admin'?{id:state.user.id,name:state.user.name,email:state.user.email,role:'admin',xp:state.user.xp||0,solved:'—'}:null;
      const users=[...(adminRow?[adminRow]:[]),...(d.users||[]).map(u=>({...u,role:'student'}))];
      adminFrame(`<div class="card admin-table-wrap"><table class="admin-table"><thead><tr><th>Пользователь</th><th>Роль</th><th>XP</th><th>Решено</th><th></th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${escUser(u.name)}</b><small>${escUser(u.email)}</small></td><td>${u.role==='admin'?'Админ':'Ученик'}</td><td>${Number(u.xp)||0}</td><td>${u.solved??0}</td><td><button class="link" data-edit-user="${u.id}">Изменить</button></td></tr>`).join('')}</tbody></table></div>`,'Пользователи');
      document.querySelectorAll('[data-edit-user]').forEach(x=>x.onclick=()=>editUser(users.find(u=>Number(u.id)===Number(x.dataset.editUser))));
    }catch(e){
      adminFrame(`<div class="card"><h2>Не удалось загрузить пользователей</h2><p class="subtitle">${escUser(e.name==='AbortError'?'Сервер слишком долго отвечает. Обновите страницу после завершения деплоя.':e.message)}</p><button class="btn" id="users-retry">Повторить</button></div>`,'Пользователи');
      document.querySelector('#users-retry').onclick=()=>adminUsers();
    }
  };
  const originalAdmin=window.admin;
  window.admin=async function(){
    adminLoading();
    try{
      if(adminTab==='overview')return await adminOverview();
      if(adminTab==='content')return await adminContent();
      if(adminTab==='questions')return await adminQuestions();
      if(adminTab==='users')return await adminUsers();
      if(adminTab==='site')return await adminSite();
      return await originalAdmin();
    }catch(e){
      adminFrame(`<div class="card"><h2>Не удалось открыть админ-панель</h2><p class="subtitle">${escUser(e.message)}</p><button class="btn" id="admin-retry">Повторить</button></div>`);
      document.querySelector('#admin-retry').onclick=()=>admin();
    }
  };
})();
