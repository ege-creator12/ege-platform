(()=>{
'use strict';

const PRICE=Number(window.OSNOVA_AI_PRO_PRICE)||1749;
let overlay=null;
let launcher=null;
let previousFocus=null;
let statusCache=null;
let statusBusy=false;

const money=value=>new Intl.NumberFormat('ru-RU').format(Number(value)||0);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[ch]));
const currentUser=()=>typeof state!=='undefined'&&state?.user?state.user:null;
const currentRoute=()=>typeof state!=='undefined'&&state?.route?String(state.route):String(location.hash||'').replace(/^#/,'');

async function getStatus(force=false){
  if(statusBusy&&!force)return statusCache||{active:false};
  statusBusy=true;
  try{
    if(window.OsnovaSubscription?.getStatus){
      statusCache=await window.OsnovaSubscription.getStatus(force);
      return statusCache||{active:false};
    }
    const response=await fetch('/api/subscription/status',{credentials:'same-origin',headers:{accept:'application/json'}});
    if(!response.ok)throw new Error('subscription status');
    statusCache=await response.json();
    return statusCache||{active:false};
  }catch{
    statusCache={active:false,plan:null,expiresAt:null,permanent:false};
    return statusCache;
  }finally{
    statusBusy=false;
  }
}

function expiry(status){
  if(!status?.active)return '';
  if(status.permanent||!status.expiresAt)return 'Без ограничения срока';
  const date=new Date(status.expiresAt);
  if(!Number.isFinite(date.getTime()))return 'Подписка активна';
  return `до ${date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}`;
}

function feature(icon,title,text){
  return `<article class="ai-pro-overlay-feature"><span aria-hidden="true">${icon}</span><div><b>${esc(title)}</b><p>${esc(text)}</p></div></article>`;
}

function content(status){
  const active=Boolean(status?.active);
  return `
    <div class="ai-pro-overlay-backdrop" data-ai-pro-close></div>
    <section class="ai-pro-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="ai-pro-overlay-title">
      <button class="ai-pro-overlay-close" type="button" aria-label="Закрыть AI PRO" data-ai-pro-close>×</button>
      <div class="ai-pro-overlay-glow" aria-hidden="true"></div>
      <header class="ai-pro-overlay-hero">
        <div class="ai-pro-overlay-brand"><span>ОСНОВА</span><strong>AI PRO</strong></div>
        <span class="ai-pro-overlay-state ${active?'is-active':''}">${active?'✓ Активирована':'PRO-доступ'}</span>
        <h1 id="ai-pro-overlay-title">Нарешивай ЕГЭ<br><em>вместе с AI</em></h1>
        <p>Умный решебник и тренажёр внутри ОСНОВЫ: задания, подсказки, разбор ошибок и персональный AI-помощник по биологии и химии.</p>
      </header>

      <div class="ai-pro-overlay-grid">
        <div class="ai-pro-overlay-features">
          ${feature('✦','AI рядом с каждым заданием','Проси объяснение, подсказку или разбор решения прямо во время тренировки.')}
          ${feature('↗','Разбор слабых линий','AI учитывает прогресс и помогает возвращаться именно к тем линиям ЕГЭ, где больше ошибок.')}
          ${feature('◎','Фото задания','Загрузи фотографию задания и разбери его вместе с AI.')}
          ${feature('✓','Разбор ошибок','Понимай не только правильный ответ, но и почему твой вариант оказался неверным.')}
          ${feature('Б+Х','Биология + химия','Одна подписка открывает AI-инструменты сразу для двух предметов.')}
          ${feature('▥','Прогресс и рекомендации','Статистика подготовки помогает выбрать, что нарешивать следующим.')}
        </div>

        <aside class="ai-pro-overlay-buy ${active?'is-active':''}">
          <span class="ai-pro-overlay-buy-label">${active?'Твой статус':'AI PRO'}</span>
          ${active
            ? `<strong class="ai-pro-overlay-active-title">Подписка активна</strong><p>${esc(expiry(status))}. Все функции AI PRO доступны.</p>`
            : `<div class="ai-pro-overlay-price"><strong>${money(PRICE)} ₽</strong><span>/ месяц</span></div><p>Полный доступ к AI-инструментам для ежедневного нарешивания ЕГЭ.</p>`}
          <div class="ai-pro-overlay-divider"></div>
          <p class="ai-pro-overlay-position"><b>Это не курс.</b> AI PRO — инструмент для самостоятельной ежедневной практики с персональным AI-помощником.</p>
          <button class="ai-pro-overlay-cta" type="button" data-ai-pro-action>${active?'Открыть AI PRO →':'Получить AI PRO →'}</button>
          ${active?`<small>${esc(expiry(status))}</small>`:'<small>Доступ привязывается к твоему аккаунту ОСНОВЫ.</small>'}
        </aside>
      </div>
    </section>`;
}

function closeOverlay(){
  if(!overlay)return;
  overlay.classList.remove('is-open');
  document.documentElement.classList.remove('ai-pro-overlay-open');
  setTimeout(()=>{
    overlay?.remove();
    overlay=null;
  },180);
  if(previousFocus&&typeof previousFocus.focus==='function')previousFocus.focus({preventScroll:true});
}

async function openOverlay(){
  if(overlay)return;
  previousFocus=document.activeElement;
  overlay=document.createElement('div');
  overlay.className='ai-pro-overlay';
  overlay.innerHTML='<div class="ai-pro-overlay-backdrop"></div><section class="ai-pro-overlay-panel ai-pro-overlay-loading" role="dialog" aria-modal="true"><div class="ai-pro-overlay-loader">AI PRO<span></span></div></section>';
  document.body.appendChild(overlay);
  document.documentElement.classList.add('ai-pro-overlay-open');
  requestAnimationFrame(()=>overlay?.classList.add('is-open'));
  const status=await getStatus(true);
  if(!overlay)return;
  overlay.innerHTML=content(status);
  overlay.querySelectorAll('[data-ai-pro-close]').forEach(el=>el.addEventListener('click',closeOverlay));
  const action=overlay.querySelector('[data-ai-pro-action]');
  action?.addEventListener('click',()=>{
    if(status?.active){
      closeOverlay();
      if(typeof go==='function')go('pro');
      else location.hash='pro';
      return;
    }
    const message='AI PRO стоит 1 749 ₽ в месяц. Для активации подписки обратись к администратору ОСНОВЫ.';
    if(typeof toast==='function')toast(message);
    else if(document.querySelector('#toast')){
      const el=document.querySelector('#toast');
      el.textContent=message;
      el.classList.add('show');
      setTimeout(()=>el.classList.remove('show'),3200);
    }else alert(message);
    window.dispatchEvent(new CustomEvent('osnova:ai-pro-request',{detail:{price:PRICE,period:'month'}}));
  });
  overlay.querySelector('.ai-pro-overlay-close')?.focus({preventScroll:true});
}

async function refreshLauncher(){
  if(!launcher?.isConnected)return;
  const status=await getStatus();
  if(!launcher?.isConnected)return;
  launcher.classList.toggle('is-active',Boolean(status?.active));
  const sub=launcher.querySelector('span');
  if(sub)sub.textContent=status?.active?'Активирована':`${money(PRICE)} ₽/мес`;
}

function shouldShow(){
  const user=currentUser();
  if(!user)return false;
  const route=currentRoute();
  return !route||route==='dashboard'||route==='home';
}

function ensureLauncher(){
  if(!shouldShow()){
    launcher?.remove();
    launcher=null;
    if(overlay)closeOverlay();
    return;
  }
  if(launcher?.isConnected)return;
  launcher=document.createElement('button');
  launcher.type='button';
  launcher.className='ai-pro-overlay-launcher';
  launcher.setAttribute('aria-label','Открыть информацию об AI PRO');
  launcher.innerHTML='<i aria-hidden="true">✦</i><b>AI PRO</b><span>1 749 ₽/мес</span>';
  launcher.addEventListener('click',openOverlay);
  document.body.appendChild(launcher);
  refreshLauncher();
}

addEventListener('keydown',event=>{
  if(event.key==='Escape'&&overlay)closeOverlay();
});
addEventListener('hashchange',()=>setTimeout(ensureLauncher,0));
addEventListener('osnova:subscription-changed',()=>{statusCache=null;refreshLauncher();});

let queued=false;
const schedule=()=>{
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;ensureLauncher();});
};
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
setInterval(()=>{ensureLauncher();if(launcher)refreshLauncher();},30000);
setTimeout(ensureLauncher,0);
})();
