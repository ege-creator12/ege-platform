(()=>{
  'use strict';
  if(window.__OSNOVA_HARD_SIDEBAR_FREEZE_V3__)return;
  window.__OSNOVA_HARD_SIDEBAR_FREEZE_V3__=true;
  window.__OSNOVA_HARD_SIDEBAR_FREEZE__=true;

  const STYLE_ID='osnova-hard-sidebar-freeze-style-v3';
  const ORDER=['dashboard','biology','bio-search','chemistry','chem-search','map','mocks','pro','analytics','ai-tools','profile','teacher','homework','chat','staff'];
  const REQUIRED=new Set(['dashboard','biology','bio-search','chemistry','chem-search','map','mocks','pro','analytics','ai-tools','profile']);
  let frozenHtml='';
  let frozenUserId=0;
  let currentNav=null;
  let navObserver=null;
  let appQueued=false;
  let busy=false;

  const text=node=>String(node?.textContent||'').replace(/\s+/g,' ').trim().toLowerCase();
  const userId=()=>Number((typeof state!=='undefined'&&state?.user?.id)||0);
  const route=()=>String((typeof state!=='undefined'&&state?.route)||(location.hash.slice(1)||'dashboard'));

  function injectStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=`
      .sidebar nav[data-hard-frozen-sidebar="1"]{display:flex!important;flex-direction:column!important;gap:4px!important;overflow-anchor:none!important;contain:layout style!important}
      .sidebar nav[data-hard-frozen-sidebar="1"]>button[data-hard-slot]{display:flex!important;box-sizing:border-box!important;min-height:44px!important;height:44px!important;max-height:44px!important;flex:0 0 44px!important;margin:0!important;transform:none!important;transition:background-color .14s ease,border-color .14s ease,color .14s ease,box-shadow .14s ease!important}
      .sidebar nav[data-hard-frozen-sidebar="1"]>button:not([data-hard-slot]){display:none!important}
    `;
    document.head.appendChild(style);
  }

  function key(node){
    if(!node||node.nodeType!==1)return '';
    const r=String(node.dataset?.nav||'');
    const t=text(node);
    if(r==='dashboard'||t==='главная')return 'dashboard';
    if(r==='biology'||t==='биология')return 'biology';
    if(r==='biology/search'||node.hasAttribute('data-bio-search-nav')||t==='поиск по биологии')return 'bio-search';
    if(r==='chemistry'||t==='химия')return 'chemistry';
    if(r==='chemistry/search'||node.hasAttribute('data-chem-search-nav')||t==='поиск по химии')return 'chem-search';
    if(r.startsWith('progress-map')||node.hasAttribute('data-ege-map-nav')||t==='карта егэ')return 'map';
    if(r==='mocks'||t==='пробники')return 'mocks';
    if(r==='pro'||node.hasAttribute('data-student-pro')||t==='pro')return 'pro';
    if(node.hasAttribute('data-hard-analytics-proxy')||node.hasAttribute('data-product-analytics')||node.hasAttribute('data-analytics-placeholder')||t==='аналитика')return 'analytics';
    if(r==='ai-tools'||node.hasAttribute('data-ai-tools-nav')||t==='ai-инструменты')return 'ai-tools';
    if(r==='profile'||t==='профиль')return 'profile';
    if(r==='teacher'||node.hasAttribute('data-teacher-nav')||node.hasAttribute('data-teacher-v2-nav')||t==='кабинет учителя')return 'teacher';
    if(r==='homework'||r==='classroom'||node.hasAttribute('data-homework-nav')||node.hasAttribute('data-student-homework-stable')||t.startsWith('домашние задан'))return 'homework';
    if(node.hasAttribute('data-hard-chat-proxy')||node.hasAttribute('data-community-chat-launch')||node.classList.contains('community-chat-nav')||t==='общий чат')return 'chat';
    if(r==='admin'||node.hasAttribute('data-moderator-nav')||t==='управление'||t==='модерация')return 'staff';
    return '';
  }

  function icon(name,fallback){try{return typeof uiIcon==='function'?uiIcon(name):fallback}catch{return fallback}}

  function routeButton(k,routeTo,label,iconHtml,attrs={}){
    const b=document.createElement('button');
    b.type='button';b.dataset.nav=routeTo;b.dataset.hardSlot=k;
    Object.entries(attrs).forEach(([name,value])=>b.setAttribute(name,value));
    b.innerHTML=`<span class="nav-icon" aria-hidden="true">${iconHtml}</span><span>${label}</span>`;
    return b;
  }

  function makeMissing(k){
    if(k==='dashboard')return routeButton(k,'dashboard','Главная',icon('dashboard','⌂'));
    if(k==='biology')return routeButton(k,'biology','Биология',icon('biology','⌘'));
    if(k==='bio-search')return routeButton(k,'biology/search','Поиск по биологии',icon('search','⌕'),{'data-bio-search-nav':'1'});
    if(k==='chemistry')return routeButton(k,'chemistry','Химия',icon('chemistry','⚗'));
    if(k==='chem-search')return routeButton(k,'chemistry/search','Поиск по химии',icon('search','⌕'),{'data-chem-search-nav':'1'});
    if(k==='map')return routeButton(k,'progress-map/biology','Карта ЕГЭ','▦',{'data-ege-map-nav':'1'});
    if(k==='mocks')return routeButton(k,'mocks','Пробники',icon('mocks','◷'));
    if(k==='pro')return routeButton(k,'pro','PRO','✦',{'data-student-pro':'1'});
    if(k==='ai-tools')return routeButton(k,'ai-tools','AI-инструменты','✦',{'data-ai-tools-nav':'1'});
    if(k==='profile')return routeButton(k,'profile','Профиль',icon('profile','◎'));
    if(k==='analytics'){
      const b=document.createElement('button');
      b.type='button';b.dataset.hardSlot='analytics';b.dataset.hardAnalyticsProxy='1';b.className='product-analytics-nav analytics-placeholder';
      b.innerHTML='<span class="nav-icon" aria-hidden="true">⌁</span><span>Аналитика</span>';
      return b;
    }
    return null;
  }

  function pick(nodes,k){
    if(k==='analytics')return nodes.find(n=>n.hasAttribute('data-hard-analytics-proxy'))||null;
    if(k==='chat')return nodes.find(n=>n.hasAttribute('data-hard-chat-proxy'))||nodes[0]||null;
    if(k==='homework')return nodes.find(n=>n.hasAttribute('data-student-homework-stable'))||nodes.find(n=>n.dataset.nav==='homework')||nodes[0]||null;
    return nodes[0]||null;
  }

  function mark(node,k){if(!node)return;node.dataset.hardSlot=k;node.hidden=false}

  function cloneFrozen(nav){
    const clone=nav.cloneNode(true);
    clone.querySelectorAll(':scope>button:not([data-hard-slot])').forEach(n=>n.remove());
    clone.querySelectorAll(':scope>button').forEach(n=>{n.classList.remove('active');n.removeAttribute('aria-current')});
    frozenHtml=clone.outerHTML;frozenUserId=userId();
  }

  function bindCanonical(nav){
    nav.querySelectorAll(':scope>button[data-hard-slot][data-nav]').forEach(button=>{
      button.onclick=()=>{const target=button.dataset.nav;try{if(typeof go==='function')go(target);else location.hash=target}catch{location.hash=target}};
    });
  }

  function updateActive(nav){
    const r=route();
    nav.querySelectorAll(':scope>button[data-hard-slot]').forEach(button=>{
      const to=String(button.dataset.nav||'');
      let active=false;
      if(to==='dashboard')active=r==='dashboard';
      else if(to==='biology')active=r==='biology'||(r.startsWith('biology/')&&!r.startsWith('biology/search'));
      else if(to==='biology/search')active=r.startsWith('biology/search');
      else if(to==='chemistry')active=r==='chemistry'||(r.startsWith('chemistry/')&&!r.startsWith('chemistry/search'));
      else if(to==='chemistry/search')active=r.startsWith('chemistry/search');
      else if(to.startsWith('progress-map'))active=r.startsWith('progress-map');
      else if(to==='mocks')active=r.startsWith('mocks');
      else if(to)active=r===to||(to==='homework'&&r==='classroom');
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
  }

  function freeze(nav){
    if(!nav||busy)return;
    busy=true;
    try{
      nav.dataset.hardFrozenSidebar='1';
      const children=[...nav.children].filter(n=>n.nodeType===1);
      const groups=new Map();
      children.forEach(node=>{const k=key(node);if(!k)return;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(node)});

      const ordered=[];
      for(const k of ORDER){
        let node=pick(groups.get(k)||[],k);
        if(!node&&REQUIRED.has(k))node=makeMissing(k);
        if(node){mark(node,k);ordered.push(node)}
      }

      const keep=new Set(ordered);
      children.forEach(node=>{if(!keep.has(node))node.removeAttribute('data-hard-slot')});
      const frag=document.createDocumentFragment();ordered.forEach(node=>frag.appendChild(node));nav.prepend(frag);
      bindCanonical(nav);updateActive(nav);cloneFrozen(nav);watchNav(nav);
    }finally{busy=false}
  }

  function watchNav(nav){
    if(currentNav===nav)return;
    navObserver?.disconnect();currentNav=nav;
    navObserver=new MutationObserver(records=>{
      if(busy)return;
      let needsFreeze=false;
      for(const record of records){
        for(const added of record.addedNodes){
          if(added?.nodeType!==1||added.parentElement!==nav||added.hasAttribute('data-hard-slot'))continue;
          const k=key(added);
          if(!k)continue;
          // Duplicates from feature scripts stay hidden. Only optional slots can be promoted once.
          if((k==='teacher'||k==='homework'||k==='chat'||k==='staff')&&!nav.querySelector(`:scope>button[data-hard-slot="${k}"]`))needsFreeze=true;
        }
      }
      if(needsFreeze)freeze(nav);else updateActive(nav);
    });
    navObserver.observe(nav,{childList:true});
  }

  function hydrate(){
    const nav=document.querySelector('.sidebar nav');if(!nav)return;
    const id=userId();
    if(frozenUserId&&id!==frozenUserId){frozenHtml='';frozenUserId=0}
    if(nav.dataset.hardFrozenSidebar==='1'){bindCanonical(nav);updateActive(nav);watchNav(nav);return}
    freeze(nav);
  }

  function clickHidden(nav,selector,attempt=0){
    const real=[...nav.querySelectorAll(selector)].find(n=>!n.hasAttribute('data-hard-slot'));
    if(real){real.click();return}
    if(attempt<8)setTimeout(()=>clickHidden(nav,selector,attempt+1),100);
  }

  injectStyle();

  if(typeof shell==='function'){
    const baseShell=shell;
    shell=function(content){
      let html=baseShell.apply(this,arguments);const id=userId();
      if(frozenHtml&&id&&id===frozenUserId)html=html.replace(/<nav\b[^>]*aria-label="Основная навигация"[^>]*>[\s\S]*?<\/nav>/,frozenHtml);
      return html;
    };
  }

  const app=document.querySelector('#app');
  if(app)new MutationObserver(()=>{if(appQueued)return;appQueued=true;requestAnimationFrame(()=>{appQueued=false;hydrate()})}).observe(app,{childList:true});

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('.sidebar nav[data-hard-frozen-sidebar="1"]>button[data-hard-slot]');if(!button)return;
    const slot=button.dataset.hardSlot;
    if(slot==='analytics'){
      event.preventDefault();event.stopImmediatePropagation();clickHidden(button.parentElement,'[data-product-analytics]');
    }else if(slot==='chat'&&button.hasAttribute('data-hard-chat-proxy')){
      event.preventDefault();event.stopImmediatePropagation();clickHidden(button.parentElement,'[data-community-chat-launch]');
    }
  },true);

  addEventListener('hashchange',()=>{const nav=document.querySelector('.sidebar nav');if(nav)updateActive(nav)});
  hydrate();setTimeout(hydrate,120);setTimeout(hydrate,500);
})();
