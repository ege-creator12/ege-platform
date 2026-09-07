(function(){
  const originalAdmin=admin;
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
  getOverview=async function(force=false){if(!adminCache.overview||force)adminCache.overview=await adminRequest('/overview');return adminCache.overview};
  getContent=async function(force=false){if(!adminCache.content||force)adminCache.content=await adminRequest('/content');return adminCache.content};
  admin=async function(){
    if(state.user?.role!=='admin'){
      try{
        const fresh=await api('/me');
        if(fresh?.user){state.user=fresh.user;state.stats=fresh.stats||state.stats;state.examDate=fresh.examDate||state.examDate}
      }catch{}
    }
    if(state.user?.role!=='admin'){
      app.innerHTML=shell(`<div class="admin-console"><header><div class="eyebrow">Администратор</div><h1>Доступ к управлению</h1><p class="subtitle">Этот аккаунт пока не имеет роли администратора.</p></header><div class="card"><h2>Обновите страницу после деплоя</h2><p class="subtitle">Если это первый аккаунт платформы, сервер автоматически назначит его владельцем при следующем запуске.</p><button class="btn" id="admin-refresh">Обновить страницу</button></div></div>`);
      bindShell();document.querySelector('#admin-refresh').onclick=()=>location.reload();return;
    }
    return originalAdmin();
  };
})();
