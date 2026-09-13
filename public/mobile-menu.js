(()=>{
  const MOBILE_QUERY='(max-width:900px)';
  const mq=window.matchMedia(MOBILE_QUERY);
  let scheduled=false;

  const closeMenu=()=>{
    document.body.classList.remove('mobile-menu-open');
    document.querySelector('.mobile-menu-overlay')?.classList.remove('open');
    document.querySelector('.mobile-menu-panel')?.classList.remove('open');
    const toggle=document.querySelector('.mobile-menu-toggle');
    if(toggle)toggle.setAttribute('aria-expanded','false');
  };

  const openMenu=()=>{
    if(!mq.matches)return;
    const panel=document.querySelector('.mobile-menu-panel');
    const overlay=document.querySelector('.mobile-menu-overlay');
    const toggle=document.querySelector('.mobile-menu-toggle');
    if(!panel||!overlay||!toggle)return;
    document.body.classList.add('mobile-menu-open');
    panel.classList.add('open');
    overlay.classList.add('open');
    toggle.setAttribute('aria-expanded','true');
    requestAnimationFrame(()=>panel.querySelector('button.active,button[data-nav],button[data-mobile-action]')?.focus({preventScroll:true}));
  };

  const navigate=route=>{
    closeMenu();
    if(!route)return;
    const current=location.hash.slice(1)||'dashboard';
    if(current===route){
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
    location.hash=route;
  };

  const openAiTutor=()=>{
    closeMenu();
    const open=()=>document.querySelector('#ai-tutor-fab')?.click();
    if(open())return;
    requestAnimationFrame(()=>{
      if(open())return;
      setTimeout(open,80);
    });
  };

  const ensureContainers=()=>{
    let overlay=document.querySelector('.mobile-menu-overlay');
    if(!overlay){
      overlay=document.createElement('div');
      overlay.className='mobile-menu-overlay';
      overlay.setAttribute('aria-hidden','true');
      overlay.addEventListener('click',closeMenu);
      document.body.appendChild(overlay);
    }

    let panel=document.querySelector('.mobile-menu-panel');
    if(!panel){
      panel=document.createElement('aside');
      panel.className='mobile-menu-panel';
      panel.id='mobile-section-menu';
      panel.setAttribute('aria-label','Разделы сайта');
      panel.innerHTML=`
        <div class="mobile-menu-head">
          <div class="mobile-menu-brand">
            <span class="brand-mark" aria-hidden="true">о</span>
            <div><b>основа</b><small>Все разделы в одном месте</small></div>
          </div>
          <button class="mobile-menu-close" type="button" aria-label="Закрыть меню">×</button>
        </div>
        <div class="mobile-menu-caption">Разделы</div>
        <nav class="mobile-menu-links" aria-label="Мобильная навигация"></nav>
        <div class="mobile-menu-foot">Выбери раздел — меню закроется автоматически.</div>`;
      panel.querySelector('.mobile-menu-close').addEventListener('click',closeMenu);
      panel.addEventListener('click',e=>{
        const aiButton=e.target.closest('button[data-mobile-action="ai"]');
        if(aiButton){openAiTutor();return;}
        const button=e.target.closest('button[data-nav]');
        if(button)navigate(button.dataset.nav);
      });
      document.body.appendChild(panel);
    }
    return {overlay,panel};
  };

  const mapButtonHtml=active=>`<button type="button" data-nav="progress-map/biology" class="${active?'active':''}" ${active?'aria-current="page"':''}><span class="nav-icon" aria-hidden="true">▦</span><span>Карта ЕГЭ</span></button>`;
  const aiButtonHtml=()=>`<button type="button" data-mobile-action="ai"><span class="nav-icon" aria-hidden="true">✦</span><span>ИИ-репетитор</span></button>`;

  const syncLinks=(panel,sourceNav)=>{
    const target=panel.querySelector('.mobile-menu-links');
    if(!target||!sourceNav)return;
    const sourceButtons=[...sourceNav.querySelectorAll('button[data-nav]')];
    const current=location.hash.slice(1)||'dashboard';
    const signature=sourceButtons.map(btn=>`${btn.dataset.nav}:${btn.classList.contains('active')}`).join('|')+`|route:${current}|extras:v3`;
    if(target.dataset.signature===signature)return;
    target.dataset.signature=signature;

    const regular=sourceButtons.map(btn=>({
      route:btn.dataset.nav||'',
      active:btn.classList.contains('active'),
      html:btn.innerHTML
    }));
    const mapActive=current.startsWith('progress-map');
    const hasMap=regular.some(item=>item.route.startsWith('progress-map'));
    let html='';
    for(const item of regular){
      if(item.route==='mocks'&&!hasMap)html+=mapButtonHtml(mapActive);
      if(item.route==='profile')html+=aiButtonHtml();
      html+=`<button type="button" data-nav="${item.route}" class="${item.active?'active':''}" ${item.active?'aria-current="page"':''}>${item.html}</button>`;
    }
    if(!hasMap)html+=mapButtonHtml(mapActive);
    if(!regular.some(item=>item.route==='profile'))html+=aiButtonHtml();
    target.innerHTML=html;
  };

  const enhance=()=>{
    scheduled=false;
    const shell=document.querySelector('#app .app');
    if(!shell){closeMenu();return;}
    const topbar=shell.querySelector('.topbar');
    const sourceNav=shell.querySelector('.sidebar nav');
    if(!topbar||!sourceNav)return;

    let toggle=topbar.querySelector('.mobile-menu-toggle');
    if(!toggle){
      toggle=document.createElement('button');
      toggle.type='button';
      toggle.className='mobile-menu-toggle';
      toggle.setAttribute('aria-label','Открыть разделы');
      toggle.setAttribute('aria-controls','mobile-section-menu');
      toggle.setAttribute('aria-expanded','false');
      toggle.innerHTML='<span class="hamburger" aria-hidden="true"><i></i><i></i><i></i></span>';
      toggle.addEventListener('click',()=>toggle.getAttribute('aria-expanded')==='true'?closeMenu():openMenu());
      topbar.prepend(toggle);
    }

    const {panel}=ensureContainers();
    syncLinks(panel,sourceNav);
  };

  const scheduleEnhance=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(enhance);
  };

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape')closeMenu();
  });
  window.addEventListener('hashchange',()=>{closeMenu();scheduleEnhance()});
  mq.addEventListener?.('change',e=>{if(!e.matches)closeMenu();scheduleEnhance()});

  const root=document.querySelector('#app');
  if(root)new MutationObserver(scheduleEnhance).observe(root,{childList:true,subtree:true});
  scheduleEnhance();
})();
