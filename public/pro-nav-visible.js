(()=>{
  'use strict';

  const style=document.createElement('style');
  style.textContent='[data-student-pro]{display:flex!important}';
  document.head.appendChild(style);

  if(!document.querySelector('link[data-ai-pro-entry-style]')){
    const link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/ai-pro-entry.css?v=20260916-1';
    link.dataset.aiProEntryStyle='1';
    document.head.appendChild(link);
  }
  if(!document.querySelector('script[data-ai-pro-entry-script]')){
    const script=document.createElement('script');
    script.src='/ai-pro-entry.js?v=20260916-1';
    script.async=false;
    script.dataset.aiProEntryScript='1';
    document.body.appendChild(script);
  }

  let scheduled=false;

  function ensureProNav(){
    if(typeof state==='undefined'||!state?.user)return;
    document.querySelectorAll('.sidebar nav,.mobile-nav').forEach(nav=>{
      let button=nav.querySelector('[data-student-pro]');
      if(!button){
        button=document.createElement('button');
        button.type='button';
        button.dataset.studentPro='1';
        const profile=nav.querySelector('[data-nav="profile"]');
        if(profile)nav.insertBefore(button,profile);else nav.appendChild(button);
      }
      button.dataset.nav='pro-about';
      button.innerHTML='<span class="nav-icon">✦</span><span>AI PRO</span>';
      button.onclick=()=>go('pro-about');
      const active=String(state.route||'')==='pro'||String(state.route||'')==='pro-about';
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;ensureProNav()});
  }

  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
  schedule();
})();
