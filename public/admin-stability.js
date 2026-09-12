(function(){
  const adminRequest=async(path,opts={})=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch('/api/admin-console'+path,{headers:{'content-type':'application/json'},credentials:'same-origin',signal:controller.signal,...opts});
      const text=await response.text();let data={};
      try{data=text?JSON.parse(text):{}}catch{throw new Error('Сервер админ-панели вернул некорректный ответ')}
      if(!response.ok)throw new Error(data.error||`Ошибка ${response.status}`);
      return data;
    }catch(error){
      if(error.name==='AbortError')throw new Error('Сервер админ-панели не ответил. Обновите страницу после завершения деплоя.');
      throw error;
    }finally{clearTimeout(timer)}
  };

  getOverview=async function(force=false){
    if(!adminCache.overview||force)adminCache.overview=await adminRequest('/overview');
    return adminCache.overview;
  };
  getContent=async function(force=false){
    if(!adminCache.content||force)adminCache.content=await adminRequest('/content');
    return adminCache.content;
  };

  adminUsers=async function(){
    const d=await getOverview(true);
    const users=Array.isArray(d?.users)?d.users:[];
    adminFrame(`<div class="card admin-table-wrap"><table class="admin-table"><thead><tr><th>Пользователь</th><th>Роль</th><th>XP</th><th>Решено</th><th></th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${adminEsc(u.name)}</b><small>${adminEsc(u.email)}</small></td><td>${u.role==='admin'?'Админ':'Ученик'}</td><td>${Number(u.xp)||0}</td><td>${Number(u.solved)||0}</td><td><button class="link" data-edit-user="${u.id}">Изменить</button></td></tr>`).join('')||'<tr><td colspan="5">Пользователей пока нет</td></tr>'}</tbody></table></div>`,'Пользователи');
    document.querySelectorAll('[data-edit-user]').forEach(x=>x.onclick=()=>editUser(users.find(u=>Number(u.id)===Number(x.dataset.editUser))));
  };

  admin=async function(){
    adminLoading();
    try{
      if(state.user?.role!=='admin'){
        try{
          const fresh=await api('/me');
          if(fresh?.user){state.user=fresh.user;state.stats=fresh.stats||state.stats;state.examDate=fresh.examDate||state.examDate}
        }catch{}
      }
      if(state.user?.role!=='admin'){
        adminFrame('<div class="card"><h2>Нет доступа</h2><p class="subtitle">Этот аккаунт не имеет роли администратора.</p></div>','Доступ к управлению');
        return;
      }
      if(adminTab==='overview')return await adminOverview();
      if(adminTab==='content')return await adminContent();
      if(adminTab==='questions')return await adminQuestions();
      if(adminTab==='users')return await adminUsers();
      if(adminTab==='site')return await adminSite();
      adminTab='overview';
      return await adminOverview();
    }catch(e){
      console.error('admin-ui',e);
      adminFrame(`<div class="card"><h2>Не удалось открыть раздел</h2><p class="subtitle">${adminEsc(e?.message||'Неизвестная ошибка')}</p><div class="actions"><button class="btn" id="admin-retry">Повторить</button><button class="btn ghost" id="admin-home">Обзор</button></div></div>`);
      document.querySelector('#admin-retry').onclick=()=>admin();
      document.querySelector('#admin-home').onclick=()=>{adminTab='overview';admin()};
    }
  };

  if(typeof showQuestionForm==='function'){
    const originalShowQuestionForm=showQuestionForm;
    showQuestionForm=function(){
      originalShowQuestionForm();
      const form=document.querySelector('#qform');
      const card=form?.closest('.card');
      const back=card?.previousElementSibling;
      if(back?.classList?.contains('back')){
        back.removeAttribute('onclick');
        back.onclick=()=>{adminTab='questions';admin()};
      }
    };
  }
})();
