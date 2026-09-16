(()=>{
'use strict';

const route=()=>location.hash.slice(1)||'dashboard';
const user=()=>typeof state!=='undefined'?state?.user:null;
const userId=()=>Number(user()?.id)||0;

function isModeratorKnown(){
  const u=user();
  if(!u||u.role==='admin')return false;
  if(u.isModerator)return true;
  try{return sessionStorage.getItem(`osnova:moderator-nav:${userId()}`)==='1'}catch{return false}
}

function icon(name,fallback){
  try{return typeof uiIcon==='function'?uiIcon(name):fallback}catch{return fallback}
}

function isActive(kind){
  const r=route();
  if(kind==='bio-search')return r.startsWith('biology/search');
  if(kind==='chem-search')return r.startsWith('chemistry/search');
  if(kind==='map')return r.startsWith('progress-map');
  if(kind==='pro')return r==='pro';
  if(kind==='mocks')return r.startsWith('mocks');
  if(kind==='profile')return r==='profile';
  if(kind==='admin')return r==='admin';
  if(kind==='dashboard')return r==='dashboard';
  if(kind==='biology'){
    try{return typeof currentNav==='function'&&currentNav()==='biology'&&!r.startsWith('biology/search')}catch{return r.startsWith('biology')&&!r.startsWith('biology/search')}
  }
  if(kind==='chemistry'){
    try{return typeof currentNav==='function'&&currentNav()==='chemistry'&&!r.startsWith('chemistry/search')}catch{return r.startsWith('chemistry')&&!r.startsWith('chemistry/search')}
  }
  return false;
}

function btn({routeTo,label,kind,iconHtml,attrs='',cls=''}){
  const active=isActive(kind);
  return `<button type="button" ${routeTo?`data-nav="${routeTo}"`:''} ${attrs} class="${cls}${active?' active':''}" ${active?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">${iconHtml}</span><span>${label}</span></button>`;
}

function desktopNavHtml(){
  const u=user();
  if(!u)return '<nav aria-label="Основная навигация" data-stable-sidebar="1"></nav>';
  const parts=[];
  parts.push(btn({routeTo:'dashboard',label:'Главная',kind:'dashboard',iconHtml:icon('dashboard','⌂')}));
  parts.push(btn({routeTo:'biology',label:'Биология',kind:'biology',iconHtml:icon('biology','⌘')}));
  parts.push(btn({routeTo:'biology/search',label:'Поиск по биологии',kind:'bio-search',iconHtml:icon('search','⌕'),attrs:'data-bio-search-nav="1"',cls:'subject-search bio-search-nav'}));
  parts.push(btn({routeTo:'chemistry',label:'Химия',kind:'chemistry',iconHtml:icon('chemistry','⚗')}));
  parts.push(btn({routeTo:'chemistry/search',label:'Поиск по химии',kind:'chem-search',iconHtml:icon('search','⌕'),attrs:'data-chem-search-nav="1"',cls:'subject-search chem-search-nav'}));
  parts.push(btn({routeTo:'progress-map/biology',label:'Карта ЕГЭ',kind:'map',iconHtml:'▦',attrs:'data-ege-map-nav="1"'}));
  parts.push(btn({routeTo:'mocks',label:'Пробники',kind:'mocks',iconHtml:icon('mocks','◷')}));
  parts.push(btn({routeTo:'pro',label:'PRO',kind:'pro',iconHtml:'✦',attrs:'data-student-pro="1"'}));
  parts.push(btn({label:'Аналитика',kind:'analytics',iconHtml:'⌁',attrs:'data-analytics-placeholder="1"',cls:'product-analytics-nav analytics-placeholder'}));
  parts.push(btn({routeTo:'profile',label:'Профиль',kind:'profile',iconHtml:icon('profile','◎')}));
  parts.push(window.osnovaTeacherNavigation?.html()||'');
  if(u.role==='admin')parts.push(btn({routeTo:'admin',label:'Управление',kind:'admin',iconHtml:icon('admin','◇')}));
  else if(isModeratorKnown())parts.push(btn({routeTo:'admin',label:'Модерация',kind:'admin',iconHtml:'◇',attrs:'data-moderator-nav="1"'}));
  return `<nav aria-label="Основная навигация" data-stable-sidebar="1">${parts.join('')}</nav>`;
}

function bindNav(nav){
  if(!nav)return;
  nav.querySelectorAll('[data-nav]').forEach(button=>{
    button.onclick=()=>{try{go(button.dataset.nav)}catch{location.hash=button.dataset.nav}};
  });
  const placeholder=nav.querySelector('[data-analytics-placeholder]');
  if(placeholder){
    placeholder.onclick=()=>{
      const real=nav.querySelector('[data-product-analytics]');
      if(real)return real.click();
      setTimeout(()=>nav.querySelector('[data-product-analytics]')?.click(),140);
    };
  }
}

function normalizeAnalytics(nav){
  const real=nav.querySelector('[data-product-analytics]');
  const placeholder=nav.querySelector('[data-analytics-placeholder]');
  if(real){
    real.classList.add('product-analytics-nav');
    if(!real.querySelector('span:last-child')||real.querySelectorAll('span').length<2){
      real.innerHTML='<span class="nav-icon" aria-hidden="true">⌁</span><span>Аналитика</span>';
    }
    if(placeholder)placeholder.hidden=true;
  }else if(placeholder){
    placeholder.hidden=false;
  }
  return real||placeholder;
}

function stableOrder(nav){
  const analytics=normalizeAnalytics(nav);
  const staff=nav.querySelector('[data-moderator-nav]')||nav.querySelector('[data-nav="admin"]');
  const desired=[
    nav.querySelector('[data-nav="dashboard"]'),
    nav.querySelector('[data-nav="biology"]'),
    nav.querySelector('[data-bio-search-nav]'),
    nav.querySelector('[data-nav="chemistry"]'),
    nav.querySelector('[data-chem-search-nav]'),
    nav.querySelector('[data-ege-map-nav]'),
    nav.querySelector('[data-nav="mocks"]'),
    nav.querySelector('[data-student-pro]'),
    analytics,
    nav.querySelector('[data-nav="profile"]'),
    nav.querySelector('[data-nav="teacher"]'),
    nav.querySelector('[data-nav="homework"]'),
    nav.querySelector('[data-ai-tools-nav]'),
    staff
  ].filter(Boolean);
  const current=[...nav.children];
  const unknown=current.filter(node=>!desired.includes(node));
  const final=[...desired,...unknown];
  if(final.length===current.length&&final.every((node,i)=>node===current[i]))return;
  // Move only misplaced items. Detaching the whole list resets scroll/focus.
  final.forEach((node,i)=>{if(nav.children[i]!==node)nav.insertBefore(node,nav.children[i]||null)});
}

let normalizing=false;
function stabilizeCurrent(){
  if(normalizing)return;
  normalizing=true;
  try{
    let nav=document.querySelector('.sidebar nav');
    if(!nav)return;
    if(nav.dataset.stableSidebar!=='1'){
      const wrap=document.createElement('div');
      wrap.innerHTML=desktopNavHtml();
      const fresh=wrap.firstElementChild;
      nav.replaceWith(fresh);
      nav=fresh;
    }
    bindNav(nav);
    stableOrder(nav);
  }finally{normalizing=false}
}

if(typeof shell==='function'){
  const baseShell=shell;
  shell=function(content){
    const html=baseShell(content);
    return html.replace(/<nav aria-label="Основная навигация">[\s\S]*?<\/nav>/,desktopNavHtml());
  };
}

const root=document.querySelector('#app');
if(root)new MutationObserver(()=>stabilizeCurrent()).observe(root,{childList:true,subtree:true});
addEventListener('hashchange',()=>queueMicrotask(stabilizeCurrent));
queueMicrotask(stabilizeCurrent);
})();
