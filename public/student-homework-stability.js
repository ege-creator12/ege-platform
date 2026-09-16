(()=>{
  'use strict';
  if(window.__OSNOVA_STUDENT_HOMEWORK_STABILITY__)return;
  window.__OSNOVA_STUDENT_HOMEWORK_STABILITY__=true;

  let homeworkCount=0;
  let homeworkCountAt=0;
  let homeworkCountUserId=0;
  let countPromise=null;
  let countPromiseUserId=0;
  let scheduled=false;

  const currentUser=()=>typeof state!=='undefined'?state?.user:null;
  const currentRoute=()=>typeof state!=='undefined'&&state?.route?String(state.route):(location.hash.slice(1)||'dashboard');
  const isHomeworkRoute=()=>['homework','classroom'].includes(currentRoute());

  function cachedCount(){
    const user=currentUser();
    return user&&Number(user.id)===homeworkCountUserId?Number(homeworkCount||0):0;
  }

  async function loadHomeworkCount(force=false){
    const user=currentUser();
    if(!user)return 0;
    const userId=Number(user.id||0);
    if(!userId)return 0;
    if(!force&&homeworkCountUserId===userId&&Date.now()-homeworkCountAt<30000)return homeworkCount;
    if(countPromise&&countPromiseUserId===userId)return countPromise;
    countPromiseUserId=userId;
    const pending=(async()=>{
      try{
        const response=await fetch('/api/teacher/student',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const data=await response.json();
        const count=(data.assignments||[]).filter(item=>item.status!=='completed').length;
        if(Number(currentUser()?.id||0)===userId){
          homeworkCount=count;
          homeworkCountAt=Date.now();
          homeworkCountUserId=userId;
        }
        return count;
      }catch{
        return homeworkCountUserId===userId?homeworkCount:0;
      }finally{
        if(countPromise===pending){countPromise=null;countPromiseUserId=0}
      }
    })();
    countPromise=pending;
    return pending;
  }

  function buttonContent(count){
    return `<span class="nav-icon" aria-hidden="true">▣</span><span>Домашние задания</span>${count?`<span class="homework-nav-badge">${count}</span>`:''}`;
  }

  function activate(button){
    const active=isHomeworkRoute();
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  }

  function normalizeButton(button,count){
    button.type='button';
    button.dataset.nav='homework';
    button.dataset.studentHomeworkStable='1';
    button.removeAttribute('data-homework-nav');
    const content=buttonContent(count);
    if(button.innerHTML!==content)button.innerHTML=content;
    activate(button);
    button.onclick=()=>{
      try{go('homework')}catch{location.hash='homework'}
    };
  }

  function insertPosition(nav,button){
    const teacher=nav.querySelector('[data-nav="teacher"]');
    const staff=nav.querySelector('[data-nav="admin"],[data-moderator-nav]');
    const aiTools=nav.querySelector('[data-ai-tools-nav]');
    const anchor=teacher?.nextElementSibling||aiTools||staff;
    if(anchor&&anchor!==button&&button.nextElementSibling!==anchor)nav.insertBefore(button,anchor);
  }

  function ensureNav(nav,count){
    if(!nav)return;
    const matches=[...nav.querySelectorAll('[data-nav="homework"],[data-student-homework-stable]')];
    let button=matches.shift();
    if(!button){
      button=document.createElement('button');
      nav.appendChild(button);
    }
    matches.forEach(duplicate=>duplicate.remove());
    normalizeButton(button,count);
    insertPosition(nav,button);
  }

  function removeWhenLoggedOut(){
    document.querySelectorAll('[data-student-homework-stable]').forEach(node=>node.remove());
  }

  function ensureAllNavs(){
    const user=currentUser();
    if(!user){removeWhenLoggedOut();return}
    const count=cachedCount();
    document.querySelectorAll('.sidebar nav,.mobile-nav').forEach(nav=>ensureNav(nav,count));
  }

  async function refreshCountAndNav(){
    const count=await loadHomeworkCount();
    document.querySelectorAll('.sidebar nav,.mobile-nav').forEach(nav=>ensureNav(nav,count));
  }

  function homeworkHtml(count=cachedCount()){
    const active=isHomeworkRoute();
    return `<button type="button" data-nav="homework" data-student-homework-stable="1" class="${active?'active':''}" ${active?'aria-current="page"':''}>${buttonContent(count)}</button>`;
  }

  function installTeacherNavigationWrapper(){
    const navApi=window.osnovaTeacherNavigation;
    if(!navApi||navApi.__studentHomeworkStable)return;
    const baseHtml=typeof navApi.html==='function'?navApi.html.bind(navApi):()=>'';
    const baseRefresh=typeof navApi.refresh==='function'?navApi.refresh.bind(navApi):async()=>{};

    navApi.html=function(){
      let html=String(baseHtml()||'');
      if(/data-nav="homework"/.test(html)){
        html=html.replace(/\sdata-homework-nav(?:="[^"]*")?/g,'')
          .replace(/<button\b([^>]*data-nav="homework"[^>]*)>/i,(full,attrs)=>{
            const clean=attrs.replace(/\sdata-student-homework-stable(?:="[^"]*")?/g,'');
            return `<button${clean} data-student-homework-stable="1">`;
          });
      }else{
        html+=homeworkHtml();
      }
      return html;
    };

    navApi.refresh=async function(){
      const result=await baseRefresh();
      ensureAllNavs();
      refreshCountAndNav().catch(()=>{});
      return result;
    };
    navApi.__studentHomeworkStable=true;
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      installTeacherNavigationWrapper();
      ensureAllNavs();
      refreshCountAndNav().catch(()=>{});
    });
  }

  installTeacherNavigationWrapper();
  ensureAllNavs();
  refreshCountAndNav().catch(()=>{});

  const root=document.querySelector('#app');
  if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
  addEventListener('hashchange',schedule);
  addEventListener('pageshow',schedule);
  setInterval(()=>{
    if(!document.hidden&&currentUser())loadHomeworkCount(true).then(()=>ensureAllNavs()).catch(()=>{});
  },30000);
})();
