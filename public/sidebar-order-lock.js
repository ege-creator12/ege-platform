(()=>{
'use strict';
if(window.__OSNOVA_SIDEBAR_ORDER_LOCK__)return;
window.__OSNOVA_SIDEBAR_ORDER_LOCK__=true;

const clean=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
const direct=nav=>[...nav.children].filter(Boolean);

function key(node){
  const r=node?.dataset?.nav||'';
  const t=clean(node?.textContent);
  if(r==='dashboard'||t==='главная')return 'dashboard';
  if(r==='biology'||t==='биология')return 'biology';
  if(r==='biology/search'||node?.hasAttribute?.('data-bio-search-nav')||t==='поиск по биологии')return 'bio-search';
  if(r==='chemistry'||t==='химия')return 'chemistry';
  if(r==='chemistry/search'||node?.hasAttribute?.('data-chem-search-nav')||t==='поиск по химии')return 'chem-search';
  if(r.startsWith('progress-map')||node?.hasAttribute?.('data-ege-map-nav')||t==='карта егэ')return 'map';
  if(r==='mocks'||t==='пробники')return 'mocks';
  if(r==='pro'||node?.hasAttribute?.('data-student-pro')||t==='pro')return 'pro';
  if(node?.hasAttribute?.('data-product-analytics')||node?.hasAttribute?.('data-analytics-placeholder')||t==='аналитика')return 'analytics';
  if(r==='ai-tools'||node?.hasAttribute?.('data-ai-tools-nav')||t==='ai-инструменты')return 'ai-tools';
  if(r==='profile'||t==='профиль')return 'profile';
  if(r==='teacher'||r==='homework'||r==='classroom'||node?.hasAttribute?.('data-teacher-nav')||node?.hasAttribute?.('data-teacher-v2-nav')||node?.hasAttribute?.('data-homework-nav')||node?.hasAttribute?.('data-classroom-nav')||t==='кабинет учителя'||t==='домашние задания'||t==='мой класс')return 'role';
  if(node?.hasAttribute?.('data-community-chat-launch')||node?.classList?.contains('community-chat-nav')||t==='общий чат')return 'chat';
  if(r==='admin'||node?.hasAttribute?.('data-moderator-nav')||t==='управление'||t==='модерация')return 'staff';
  return t?`other:${t}`:'other';
}

const rank={
  dashboard:10,biology:20,'bio-search':30,chemistry:40,'chem-search':50,
  map:60,mocks:70,pro:80,analytics:90,'ai-tools':100,profile:110,
  role:120,chat:130,staff:150
};

function preferred(k,nodes){
  if(k==='analytics')return nodes.find(n=>n.hasAttribute('data-product-analytics'))||nodes[0];
  if(k==='role'){
    const teacher=nodes.find(n=>n.dataset.nav==='teacher'||n.hasAttribute('data-teacher-nav')||n.hasAttribute('data-teacher-v2-nav')||clean(n.textContent)==='кабинет учителя');
    const homework=nodes.find(n=>n.dataset.nav==='homework'||n.dataset.nav==='classroom'||n.hasAttribute('data-homework-nav')||n.hasAttribute('data-classroom-nav'));
    return document.documentElement.classList.contains('osnova-teacher')?(teacher||homework):(teacher||homework);
  }
  return nodes[0];
}

function canonicalize(nav){
  if(!nav)return;
  const groups=new Map();
  direct(nav).forEach(node=>{
    const k=key(node);
    if(!groups.has(k))groups.set(k,[]);
    groups.get(k).push(node);
  });

  groups.forEach((nodes,k)=>{
    if(nodes.length<2)return;
    const keep=preferred(k,nodes);
    nodes.forEach(node=>{if(node!==keep)node.remove()});
  });

  const items=direct(nav).map((node,index)=>({node,index,k:key(node)}));
  items.sort((a,b)=>{
    const ra=rank[a.k]??140;
    const rb=rank[b.k]??140;
    return ra-rb||a.index-b.index;
  });

  items.forEach((item,index)=>{
    if(nav.children[index]!==item.node)nav.insertBefore(item.node,nav.children[index]||null);
  });
}

let desktopNav=null,mobileNav=null,desktopObserver=null,mobileObserver=null,queued=false,busy=false;
function watch(nav,type){
  if(!nav)return;
  if(type==='desktop'&&desktopNav===nav)return;
  if(type==='mobile'&&mobileNav===nav)return;
  const observer=new MutationObserver(schedule);
  observer.observe(nav,{childList:true});
  if(type==='desktop'){
    desktopObserver?.disconnect();desktopObserver=observer;desktopNav=nav;
  }else{
    mobileObserver?.disconnect();mobileObserver=observer;mobileNav=nav;
  }
}

function run(){
  if(busy)return;
  busy=true;
  try{
    const desktop=document.querySelector('.sidebar nav');
    const mobile=document.querySelector('.mobile-nav');
    canonicalize(desktop);
    canonicalize(mobile);
    watch(desktop,'desktop');
    watch(mobile,'mobile');
  }finally{busy=false}
}

function schedule(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;run()});
}

const app=document.querySelector('#app');
if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
addEventListener('hashchange',schedule);
setTimeout(schedule,0);
setTimeout(schedule,250);
setTimeout(schedule,1000);
})();
