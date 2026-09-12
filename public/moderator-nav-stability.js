(()=>{
  'use strict';

  const CACHE_PREFIX='osnova:moderator-nav:';
  let status=null;
  let statusUserId=0;
  let request=null;

  const user=()=>typeof state!=='undefined'?state.user:null;
  const userId=()=>Number(user()?.id)||0;
  const route=()=>location.hash.slice(1)||'dashboard';
  const cacheKey=id=>`${CACHE_PREFIX}${id}`;

  function cachedModerator(id){
    if(!id)return false;
    try{return sessionStorage.getItem(cacheKey(id))==='1'}catch{return false}
  }

  function saveCached(id,value){
    if(!id)return;
    try{
      if(value)sessionStorage.setItem(cacheKey(id),'1');
      else sessionStorage.removeItem(cacheKey(id));
    }catch{}
  }

  function isModeratorOnly(){
    const u=user(),id=userId();
    if(!u||!id||u.role==='admin')return false;
    if(status&&statusUserId===id)return Boolean(status.moderator&&!status.admin);
    return cachedModerator(id);
  }

  function syncModeratorNav(){
    const u=user();
    const nav=document.querySelector('.sidebar nav');
    if(!u||!nav)return;

    const existing=nav.querySelector('[data-moderator-nav]');

    if(u.role==='admin'){
      existing?.remove();
      return;
    }

    if(!isModeratorOnly()){
      if(status&&statusUserId===userId()&&!status.moderator)existing?.remove();
      return;
    }

    let btn=existing;
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';
      btn.dataset.moderatorNav='1';
      btn.dataset.nav='admin';
      btn.innerHTML='<span class="nav-icon" aria-hidden="true">◇</span><span>Модерация</span>';
      btn.onclick=()=>{location.hash='admin'};
      nav.appendChild(btn);
    }

    btn.classList.toggle('active',route()==='admin');
    if(route()==='admin')btn.setAttribute('aria-current','page');
    else btn.removeAttribute('aria-current');

    const label=btn.querySelector('span:last-child');
    if(label&&label.textContent!=='Модерация')label.textContent='Модерация';

    const chip=document.querySelector('.user-chip small');
    if(chip&&chip.textContent!=='Модератор')chip.textContent='Модератор';
  }

  async function refreshModeratorStatus(){
    const id=userId();
    if(!id||user()?.role==='admin')return;
    if(request)return request;

    request=(async()=>{
      try{
        const r=await fetch('/api/moderator/status',{credentials:'same-origin',headers:{accept:'application/json'}});
        const d=await r.json().catch(()=>({}));
        if(!r.ok)throw new Error(d.error||'status');
        status={moderator:Boolean(d.moderator),admin:Boolean(d.admin)};
        statusUserId=id;
        saveCached(id,status.moderator&&!status.admin);
        if(typeof state!=='undefined'&&state.user&&Number(state.user.id)===id){
          state.user.isModerator=Boolean(status.moderator&&!status.admin);
        }
      }catch{
        status={moderator:cachedModerator(id),admin:false};
        statusUserId=id;
      }finally{
        request=null;
        syncModeratorNav();
      }
    })();
    return request;
  }

  function syncAndRefresh(){
    const id=userId();
    if(statusUserId&&id!==statusUserId){status=null;statusUserId=0}
    syncModeratorNav();
    if(id&&user()?.role!=='admin'&&(!status||statusUserId!==id))refreshModeratorStatus();
  }

  const root=document.querySelector('#app');
  if(root)new MutationObserver(syncAndRefresh).observe(root,{childList:true,subtree:true});
  addEventListener('hashchange',syncAndRefresh);
  addEventListener('pageshow',syncAndRefresh);
  syncAndRefresh();
})();
