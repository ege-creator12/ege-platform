(()=>{
'use strict';
if(window.__OSNOVA_RELEASE_NAV_LOCK__)return;
window.__OSNOVA_RELEASE_NAV_LOCK__=true;

const STYLE_ID='osnova-release-nav-lock-style';
const HIDDEN='data-release-nav-hidden';
const route=()=>String((typeof state!=='undefined'&&state?.route)||(location.hash.slice(1)||'dashboard'));
const currentUser=()=>typeof state!=='undefined'?state?.user:null;
const icon=(name,fallback)=>{try{return typeof uiIcon==='function'?uiIcon(name):fallback}catch{return fallback}};
const clean=v=>String(v||'').replace(/\s+/g,' ').trim().toLowerCase();

function injectStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    .sidebar nav[data-release-nav="1"]{display:flex!important;flex-direction:column!important;gap:4px!important;overflow-anchor:none!important;contain:layout style!important}
    .sidebar nav[data-release-nav="1"]>button[data-release-slot]{box-sizing:border-box!important;height:44px!important;min-height:44px!important;max-height:44px!important;flex:0 0 44px!important;margin:0!important;transform:none!important;transition:background-color .14s ease,border-color .14s ease,color .14s ease,box-shadow .14s ease!important}
    .sidebar nav[data-release-nav="1"]>[data-release-slot="dashboard"]{order:10}.sidebar nav[data-release-nav="1"]>[data-release-slot="biology"]{order:20}.sidebar nav[data-release-nav="1"]>[data-release-slot="bio-search"]{order:30}.sidebar nav[data-release-nav="1"]>[data-release-slot="chemistry"]{order:40}.sidebar nav[data-release-nav="1"]>[data-release-slot="chem-search"]{order:50}.sidebar nav[data-release-nav="1"]>[data-release-slot="map"]{order:60}.sidebar nav[data-release-nav="1"]>[data-release-slot="mocks"]{order:70}.sidebar nav[data-release-nav="1"]>[data-release-slot="pro"]{order:80}.sidebar nav[data-release-nav="1"]>[data-release-slot="analytics"]{order:90}.sidebar nav[data-release-nav="1"]>[data-release-slot="homework"]{order:100}.sidebar nav[data-release-nav="1"]>[data-release-slot="ai-tools"]{order:110}.sidebar nav[data-release-nav="1"]>[data-release-slot="profile"]{order:120}.sidebar nav[data-release-nav="1"]>[data-release-slot="chat"]{order:130}.sidebar nav[data-release-nav="1"]>[data-release-slot="teacher"]{order:140}.sidebar nav[data-release-nav="1"]>[data-release-slot="staff"]{order:150}
    .sidebar nav[data-release-nav="1"]>button[${HIDDEN}]{position:absolute!important;left:-10000px!important;top:-10000px!important;width:1px!important;height:1px!important;min-height:0!important;max-height:1px!important;margin:0!important;padding:0!important;opacity:0!important;pointer-events:none!important;overflow:hidden!important}
    .sidebar nav[data-release-nav="1"]>button[data-release-role-slot][aria-hidden="true"]{display:none!important}
  `;
  document.head.appendChild(style);
}

function button(routeTo,label,iconHtml,slot,extra=''){
  const r=route();
  const active=routeTo==='dashboard'?r==='dashboard':
    routeTo==='biology'?r==='biology'||(r.startsWith('biology/')&&!r.startsWith('biology/search')):
    routeTo==='biology/search'?r.startsWith('biology/search'):
    routeTo==='chemistry'?r==='chemistry'||(r.startsWith('chemistry/')&&!r.startsWith('chemistry/search')):
    routeTo==='chemistry/search'?r.startsWith('chemistry/search'):
    routeTo==='progress-map/biology'?r.startsWith('progress-map'):
    routeTo==='mocks'?r.startsWith('mocks'):
    routeTo==='homework'?r==='homework'||r==='classroom':r===routeTo;
  return `<button type="button" data-release-slot="${slot}" data-nav="${routeTo}" ${extra} class="${active?'active':''}" ${active?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${iconHtml}</span><span>${label}</span></button>`;
}

function fixedNavHtml(){
  const u=currentUser();
  if(!u)return '<nav aria-label="Основная навигация" data-release-nav="1"></nav>';
  const admin=u.role==='admin';
  return `<nav aria-label="Основная навигация" data-release-nav="1">
    ${button('dashboard','Главная',icon('dashboard','⌂'),'dashboard')}
    ${button('biology','Биология',icon('biology','⌘'),'biology')}
    ${button('biology/search','Поиск по биологии',icon('search','⌕'),'bio-search','data-bio-search-nav="1"')}
    ${button('chemistry','Химия',icon('chemistry','⚗'),'chemistry')}
    ${button('chemistry/search','Поиск по химии',icon('search','⌕'),'chem-search','data-chem-search-nav="1"')}
    ${button('progress-map/biology','Карта ЕГЭ','▦','map','data-ege-map-nav="1"')}
    ${button('mocks','Пробники',icon('mocks','◷'),'mocks')}
    ${button('pro','PRO','✦','pro','data-student-pro="1"')}
    <button type="button" data-release-slot="analytics" data-release-analytics="1" class="product-analytics-nav"><span class="nav-icon" aria-hidden="true">⌁</span><span>Аналитика</span></button>
    ${button('homework','Домашние задания','▣','homework','data-student-homework-stable="1"')}
    ${button('ai-tools','AI-инструменты','✦','ai-tools','data-ai-tools-nav="1"')}
    ${button('profile','Профиль',icon('profile','◎'),'profile')}
    <button type="button" data-release-slot="chat" data-release-chat="1" class="community-chat-nav"><span class="nav-icon" aria-hidden="true">💬</span><span>Общий чат</span></button>
    <button type="button" data-release-slot="teacher" data-release-role-slot="teacher" aria-hidden="true"><span class="nav-icon" aria-hidden="true">▥</span><span>Кабинет учителя</span></button>
    <button type="button" data-release-slot="staff" data-release-role-slot="staff" ${admin?'data-nav="admin"':'aria-hidden="true"'}><span class="nav-icon" aria-hidden="true">${icon('admin','◇')}</span><span>${admin?'Управление':'Модерация'}</span></button>
  </nav>`;
}

function replaceDesktopNav(html){return html.replace(/<nav aria-label="Основная навигация">[\s\S]*?<\/nav>/,fixedNavHtml())}
if(typeof shell==='function'){
  const baseShell=shell;
  shell=function(content){return replaceDesktopNav(baseShell.apply(this,arguments))};
}

function classify(node){
  if(!node||node.nodeType!==1)return '';
  const r=String(node.dataset?.nav||''),t=clean(node.textContent);
  if(node.hasAttribute('data-product-analytics')||node.hasAttribute('data-analytics-placeholder')||t==='аналитика')return 'analytics';
  if(node.hasAttribute('data-community-chat-launch')||node.classList.contains('community-chat-nav')||t==='общий чат')return 'chat';
  if(r==='teacher'||node.hasAttribute('data-teacher-nav')||node.hasAttribute('data-teacher-v2-nav')||t==='кабинет учителя')return 'teacher';
  if(r==='admin'||node.hasAttribute('data-moderator-nav')||t==='управление'||t==='модерация')return 'staff';
  if(r==='homework'||r==='classroom'||node.hasAttribute('data-homework-nav')||node.hasAttribute('data-student-homework-stable')||t.startsWith('домашние задан'))return 'homework';
  if(r==='ai-tools'||node.hasAttribute('data-ai-tools-nav')||t==='ai-инструменты')return 'ai-tools';
  if(r==='pro'||node.hasAttribute('data-student-pro')||t==='pro')return 'pro';
  if(r==='profile'||t==='профиль')return 'profile';
  if(r==='dashboard'||t==='главная')return 'dashboard';
  if(r==='biology/search'||node.hasAttribute('data-bio-search-nav')||t==='поиск по биологии')return 'bio-search';
  if(r==='biology'||t==='биология')return 'biology';
  if(r==='chemistry/search'||node.hasAttribute('data-chem-search-nav')||t==='поиск по химии')return 'chem-search';
  if(r==='chemistry'||t==='химия')return 'chemistry';
  if(r.startsWith('progress-map')||node.hasAttribute('data-ege-map-nav')||t==='карта егэ')return 'map';
  if(r==='mocks'||t==='пробники')return 'mocks';
  return '';
}

function activateRole(nav,kind,source){
  const slot=nav.querySelector(`[data-release-role-slot="${kind}"]`);if(!slot)return;
  slot.removeAttribute('aria-hidden');
  if(kind==='teacher'){
    slot.dataset.nav='teacher';
    slot.querySelector('span:last-child').textContent='Кабинет учителя';
  }else{
    slot.dataset.nav='admin';
    const label=clean(source?.textContent).includes('управлен')||currentUser()?.role==='admin'?'Управление':'Модерация';
    slot.querySelector('span:last-child').textContent=label;
  }
}

function hideLate(node,nav){
  if(!node||node.nodeType!==1||node.parentElement!==nav||node.hasAttribute('data-release-slot'))return;
  const kind=classify(node);if(!kind)return;
  if(kind==='teacher'||kind==='staff')activateRole(nav,kind,node);
  node.setAttribute(HIDDEN,'1');
}
function hiddenTrigger(nav,selector){return [...nav.querySelectorAll(selector)].find(node=>node.hasAttribute(HIDDEN))}

function bind(nav){
  if(!nav)return;
  nav.querySelectorAll(':scope>button[data-release-slot][data-nav]').forEach(btn=>{
    btn.onclick=()=>{const target=btn.dataset.nav;try{typeof go==='function'?go(target):location.hash=target}catch{location.hash=target}};
  });
  const analytics=nav.querySelector('[data-release-analytics]');
  if(analytics)analytics.onclick=()=>{const launch=()=>hiddenTrigger(nav,'[data-product-analytics]');const real=launch();if(real)return real.click();setTimeout(()=>launch()?.click(),100)};
  const chat=nav.querySelector('[data-release-chat]');
  if(chat)chat.onclick=()=>{const launch=()=>hiddenTrigger(nav,'[data-community-chat-launch]');const real=launch();if(real)return real.click();setTimeout(()=>launch()?.click(),100)};
}

function syncActive(nav){
  if(!nav)return;const r=route();
  nav.querySelectorAll(':scope>button[data-release-slot][data-nav]').forEach(btn=>{
    const to=String(btn.dataset.nav||'');let active=false;
    if(to==='dashboard')active=r==='dashboard';
    else if(to==='biology')active=r==='biology'||(r.startsWith('biology/')&&!r.startsWith('biology/search'));
    else if(to==='biology/search')active=r.startsWith('biology/search');
    else if(to==='chemistry')active=r==='chemistry'||(r.startsWith('chemistry/')&&!r.startsWith('chemistry/search'));
    else if(to==='chemistry/search')active=r.startsWith('chemistry/search');
    else if(to.startsWith('progress-map'))active=r.startsWith('progress-map');
    else if(to==='mocks')active=r.startsWith('mocks');
    else if(to==='homework')active=r==='homework'||r==='classroom';
    else active=r===to;
    btn.classList.toggle('active',active);active?btn.setAttribute('aria-current','page'):btn.removeAttribute('aria-current');
  });
}

let watched=null,observer=null,queued=false;
function stabilize(){
  queued=false;const nav=document.querySelector('.sidebar nav[data-release-nav="1"]');if(!nav)return;
  [...nav.children].forEach(node=>hideLate(node,nav));
  if(currentUser()?.role==='admin')activateRole(nav,'staff');
  bind(nav);syncActive(nav);
  if(watched!==nav){
    observer?.disconnect();watched=nav;
    observer=new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes)hideLate(node,nav);
      bind(nav);syncActive(nav);
    });
    observer.observe(nav,{childList:true});
  }
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(stabilize)}

injectStyle();
const appRoot=document.querySelector('#app');
if(appRoot)new MutationObserver(schedule).observe(appRoot,{childList:true});
addEventListener('hashchange',schedule);addEventListener('pageshow',schedule);schedule();
})();
