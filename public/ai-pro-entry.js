(()=>{
  'use strict';

  const PRICE=Number(window.OSNOVA_AI_PRO_PRICE)||39990;
  let cornerState='';
  let cornerBusy=false;

  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const navigate=route=>{if(typeof go==='function')go(route);else location.hash=route};

  async function subscriptionStatus(force=false){
    if(window.OsnovaSubscription?.getStatus)return window.OsnovaSubscription.getStatus(force);
    try{
      const response=await fetch('/api/subscription/status',{credentials:'same-origin',headers:{accept:'application/json'}});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'status');
      return data;
    }catch{
      return {active:false,plan:null,expiresAt:null,permanent:false};
    }
  }

  function expiryLabel(status){
    if(!status?.active)return '';
    if(status.permanent||!status.expiresAt)return 'Без ограничения срока';
    const date=new Date(status.expiresAt);
    if(!Number.isFinite(date.getTime()))return 'Подписка активна';
    return `До ${date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}`;
  }

  function ensureCorner(){
    if(typeof state==='undefined'||!state?.user)return;
    const topbar=document.querySelector('.topbar');
    if(!topbar)return;
    let button=topbar.querySelector('[data-ai-pro-corner]');
    if(!button){
      button=document.createElement('button');
      button.type='button';
      button.className='ai-pro-corner';
      button.dataset.aiProCorner='1';
      button.setAttribute('aria-label','AI PRO — подробнее о подписке');
      button.innerHTML='<span class="ai-pro-corner-icon" aria-hidden="true">♛</span><span class="ai-pro-corner-copy"><strong>AI PRO</strong><span class="ai-pro-corner-status">Подробнее</span></span>';
      button.addEventListener('click',()=>navigate('pro-about'));
      const theme=topbar.querySelector('#theme');
      if(theme)topbar.insertBefore(button,theme);else topbar.appendChild(button);
    }
    updateCorner(button);
  }

  async function updateCorner(button=document.querySelector('[data-ai-pro-corner]')){
    if(!button||cornerBusy)return;
    cornerBusy=true;
    try{
      const status=await subscriptionStatus();
      if(!button.isConnected)return;
      const signature=status.active?`active:${status.permanent?'permanent':status.expiresAt||'open'}`:'inactive';
      if(button.dataset.aiProState!==signature){
        button.dataset.aiProState=signature;
        button.classList.toggle('is-active',Boolean(status.active));
        const label=button.querySelector('.ai-pro-corner-status');
        if(label)label.textContent=status.active?'Активирована':'Подробнее';
        button.setAttribute('aria-label',status.active?'AI PRO — подписка активирована':'AI PRO — подробнее о подписке');
      }
      cornerState=signature;
    }finally{
      cornerBusy=false;
    }
  }

  function feature(icon,title,text){
    return `<article class="ai-pro-feature"><div class="ai-pro-feature-icon" aria-hidden="true">${icon}</div><b>${escapeHtml(title)}</b><p>${escapeHtml(text)}</p></article>`;
  }

  function aboutHtml(status){
    const active=Boolean(status?.active);
    const price=new Intl.NumberFormat('ru-RU').format(PRICE);
    const period=expiryLabel(status);
    return `<section class="ai-pro-about">
      <section class="ai-pro-about-hero">
        <div class="ai-pro-about-top">
          <div>
            <span class="ai-pro-about-kicker">ОСНОВА · подписка</span>
            <h1>AI <em>PRO</em></h1>
            <p class="ai-pro-about-lead">Персональный AI-репетитор внутри ОСНОВЫ: видит твою подготовку, помогает разбирать ошибки, строит план и подбирает следующий шаг по биологии и химии.</p>
          </div>
          <span class="ai-pro-about-status ${active?'active':''}">${active?'Активирована':'Не активирована'}</span>
        </div>
        <div class="ai-pro-about-actions">
          ${active?'<button type="button" class="btn" data-ai-pro-open>Открыть AI PRO →</button>':'<button type="button" class="btn" disabled>AI PRO пока не активирована</button>'}
          <button type="button" class="btn ghost" data-ai-pro-back>Вернуться к подготовке</button>
        </div>
      </section>

      ${active?`<div class="ai-pro-active-strip"><div><b>AI PRO активирована в твоём аккаунте</b><span>${escapeHtml(period)}. Все функции PRO доступны.</span></div><span class="pro-access-pill">✦ PRO</span></div>`:''}

      <div class="ai-pro-about-overview">
        <section class="ai-pro-about-card">
          <h2>Что даёт AI PRO</h2>
          <p>Не отдельный «чат ради чата», а инструменты, связанные с твоими заданиями, ошибками и прогрессом на сайте.</p>
          <div class="ai-pro-features">
            ${feature('AI','AI-репетитор','Объясняет темы, задаёт вопросы, проверяет понимание и помогает готовиться на высокий балл.')}
            ${feature('↗','Личный план','Учитывает цель, дату экзамена, доступное время и перестраивает приоритеты по мере подготовки.')}
            ${feature('✓','Разбор ошибок','Находит слабые места и собирает повторение и тренировку именно по ним.')}
            ${feature('▧','Фото задания','Можно отправить фотографию задания: AI определит тему и поможет разобрать решение.')}
            ${feature('▥','Аналитика','Показывает точность, объём работы, динамику и то, чему стоит уделить внимание дальше.')}
            ${feature('Б+Х','Биология и химия','AI PRO работает с двумя предметами внутри одной системы подготовки ОСНОВА.')}
          </div>
        </section>
        <aside class="ai-pro-about-card ai-pro-price ${active?'is-active':''}">
          <div>
            <small>${active?'Твой статус':'Стоимость подписки'}</small>
            <strong>${active?'Активирована':`${price} ₽`}</strong>
            <span>${active?escapeHtml(period):'AI PRO открывает персональные AI-функции поверх основной подготовки к ЕГЭ.'}</span>
          </div>
        </aside>
      </div>

      ${active?'':`<div class="ai-pro-about-note"><b>Как получить доступ.</b> Сейчас AI PRO активируется администратором ОСНОВЫ. До активации обычные разделы биологии, химии, пробники и основная подготовка продолжают работать как раньше.</div>`}
    </section>`;
  }

  async function renderProAbout(){
    if(typeof state==='undefined'||!state?.user){
      if(typeof renderAuth==='function')return renderAuth();
      return;
    }
    state.route='pro-about';
    app.innerHTML=shell('<div class="page-state" role="status"><span>Проверяем статус AI PRO…</span></div>');
    bindShell();
    ensureCorner();
    const status=await subscriptionStatus();
    if(state.route!=='pro-about')return;
    app.innerHTML=shell(aboutHtml(status));
    bindShell();
    ensureCorner();
    const open=document.querySelector('[data-ai-pro-open]');
    if(open)open.addEventListener('click',()=>navigate('pro'));
    document.querySelector('[data-ai-pro-back]')?.addEventListener('click',()=>navigate('dashboard'));
  }

  if(typeof render==='function'){
    const previousRender=render;
    render=async function(){
      if(typeof state!=='undefined'&&state?.route==='pro-about')return renderProAbout();
      const result=await previousRender();
      ensureCorner();
      return result;
    };
  }

  let queued=false;
  const schedule=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{
      queued=false;
      ensureCorner();
    });
  };

  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('hashchange',schedule);
  setInterval(()=>updateCorner(),30000);
  schedule();
})();
