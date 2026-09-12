(()=>{
  'use strict';
  let status=null,statusAt=0,loading=null;
  const style=document.createElement('style');
  style.textContent=`
    .pro-access-banner{margin:12px 0 18px;padding:15px 17px;border-radius:16px;border:1px solid rgba(91,193,135,.16);background:linear-gradient(135deg,rgba(40,126,78,.11),rgba(72,82,174,.07));display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}
    .pro-access-banner b{display:block;margin-bottom:3px}.pro-access-banner small{color:var(--muted);line-height:1.45}.pro-access-banner.locked{border-color:rgba(212,174,84,.18);background:linear-gradient(135deg,rgba(129,93,29,.09),rgba(73,68,137,.06))}
    .pro-access-pill{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(78,184,120,.12);color:#a1e5ba}.pro-access-banner.locked .pro-access-pill{background:rgba(215,177,83,.11);color:#e8ce8e}
    .aihub.pro-locked .aihub-card{opacity:.72}.aihub.pro-locked .aihub-card .btn:not([disabled]){opacity:.58}.aihub.pro-locked .aihub-card .btn:not([disabled])::after{content:' · PRO';font-size:10px}
  `;
  document.head.appendChild(style);

  async function getStatus(force=false){
    if(!force&&status&&Date.now()-statusAt<30000)return status;
    if(loading)return loading;
    loading=fetch('/api/subscription/status',{credentials:'same-origin',headers:{accept:'application/json'}})
      .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'status');status=d;statusAt=Date.now();return d})
      .catch(()=>{status={active:false,plan:null,expiresAt:null};statusAt=Date.now();return status})
      .finally(()=>{loading=null});
    return loading;
  }
  function dateLabel(value){
    if(!value)return 'без срока';
    const d=new Date(value);if(!Number.isFinite(d.getTime()))return 'активна';
    return `до ${d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'})}`;
  }
  async function decorate(){
    const hub=document.querySelector('.aihub');if(!hub)return;
    const s=await getStatus();
    if(!hub.isConnected)return;
    hub.classList.toggle('pro-locked',!s.active);
    let banner=hub.querySelector('[data-pro-access-banner]');
    if(!banner){
      banner=document.createElement('div');
      banner.dataset.proAccessBanner='1';
      const hero=hub.querySelector('.aihub-hero');
      hero?.insertAdjacentElement('afterend',banner);
    }
    if(!banner)return;

    const signature=s.active
      ? `active:${s.permanent?'permanent':s.expiresAt||'open'}`
      : 'locked';
    if(banner.dataset.proAccessState===signature)return;
    banner.dataset.proAccessState=signature;

    if(s.active){
      banner.className='pro-access-banner';
      banner.innerHTML=`<div><b>ОСНОВА PRO активна</b><small>Все AI-инструменты доступны ${s.permanent||!s.expiresAt?'без ограничения по сроку':dateLabel(s.expiresAt)}.</small></div><span class="pro-access-pill">✦ PRO</span>`;
    }else{
      banner.className='pro-access-banner locked';
      banner.innerHTML='<div><b>AI-инструменты доступны по ОСНОВА PRO</b><small>Обычная подготовка остаётся доступной. PRO выдаётся администратором вручную — без оплаты внутри сайта.</small></div><span class="pro-access-pill">PRO требуется</span>';
    }
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-ai-route]');if(!button)return;
    const target=button.dataset.aiRoute;
    event.preventDefault();event.stopImmediatePropagation();
    getStatus().then(s=>{
      if(s.active){if(typeof go==='function')go(target);else location.hash=target;return}
      if(typeof notify==='function')notify('Для AI-инструментов нужна подписка ОСНОВА PRO');
    });
  },true);

  async function guardRoute(){
    const route=String(location.hash||'').replace(/^#/,'');
    if(route!=='pro')return;
    const s=await getStatus();
    if(s.active)return;
    if(typeof notify==='function')notify('AI PRO доступен по подписке ОСНОВА PRO');
    if(typeof go==='function')go('ai-tools');else location.hash='ai-tools';
  }

  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorate();guardRoute()})};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('hashchange',schedule);
  window.OsnovaSubscription={getStatus,refresh:async()=>{const next=await getStatus(true);schedule();return next}};
  schedule();
})();
