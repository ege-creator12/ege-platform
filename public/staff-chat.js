(()=>{
'use strict';

let overlay=null;
let poller=null;
let access='unknown';
let checking=false;
let loading=false;
let lastMessages=[];

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const toast=message=>{if(typeof notify==='function')return notify(message);const t=document.querySelector('#toast');if(t){t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}};
const fmt=value=>{try{return new Date(value).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}catch{return''}};

const style=document.createElement('style');
style.textContent=`
.staff-chat-nav{position:relative}
.staff-chat-nav .nav-icon svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.staff-chat-overlay{position:fixed;inset:0;z-index:2147483100;background:rgba(3,9,8,.72);backdrop-filter:blur(12px);display:grid;place-items:center;padding:18px}
.staff-chat-panel{width:min(760px,100%);height:min(720px,calc(100vh - 36px));display:grid;grid-template-rows:auto 1fr auto;background:linear-gradient(180deg,rgba(13,28,24,.98),rgba(7,16,14,.99));border:1px solid rgba(133,231,181,.18);border-radius:22px;box-shadow:0 28px 90px rgba(0,0,0,.5);overflow:hidden;color:#eef8f3}
.staff-chat-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:20px 22px;border-bottom:1px solid rgba(255,255,255,.07)}
.staff-chat-head h2{margin:3px 0 5px;font-size:22px}.staff-chat-head p{margin:0;color:#9eb8ac;font-size:13px}
.staff-chat-eyebrow{font-size:10px;text-transform:uppercase;letter-spacing:.18em;color:#79dfa9;font-weight:800}
.staff-chat-close{border:0;background:rgba(255,255,255,.07);color:#fff;width:36px;height:36px;border-radius:12px;font-size:24px;cursor:pointer}
.staff-chat-feed{overflow:auto;padding:18px 20px;display:flex;flex-direction:column;gap:10px}
.staff-chat-empty{margin:auto;text-align:center;color:#8ea79c}.staff-chat-empty b{display:block;color:#dcebe4;margin-bottom:5px}
.staff-chat-message{max-width:82%;padding:11px 13px;border-radius:15px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.065)}
.staff-chat-message.mine{align-self:flex-end;background:rgba(75,193,128,.12);border-color:rgba(91,220,148,.18)}
.staff-chat-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:5px;font-size:11px}.staff-chat-name{font-weight:800}.staff-chat-badge{padding:2px 6px;border-radius:999px;background:rgba(108,222,158,.12);color:#8ce2b2}.staff-chat-time{color:#708a7f}
.staff-chat-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.45;font-size:14px}
.staff-chat-compose{padding:14px 18px 16px;border-top:1px solid rgba(255,255,255,.07);background:rgba(0,0,0,.08)}
.staff-chat-form{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:end}
.staff-chat-form textarea{resize:none;min-height:44px;max-height:130px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.055);color:#fff;padding:11px 12px;font:inherit;outline:none}
.staff-chat-form textarea:focus{border-color:rgba(101,224,155,.34)}
.staff-chat-send{border:0;border-radius:13px;padding:12px 16px;background:#70dda2;color:#082016;font-weight:800;cursor:pointer}
.staff-chat-hint{font-size:10px;color:#6f877c;margin-top:7px}
.staff-chat-mobile-launch{position:fixed;right:18px;bottom:92px;z-index:2147482000;width:48px;height:48px;border:1px solid rgba(120,229,170,.24);border-radius:16px;background:rgba(12,30,24,.94);color:#8ce9b5;box-shadow:0 12px 30px rgba(0,0,0,.28);font-size:21px}
@media(max-width:640px){.staff-chat-overlay{padding:0}.staff-chat-panel{width:100%;height:100dvh;border-radius:0;border:0}.staff-chat-head{padding:16px}.staff-chat-feed{padding:14px}.staff-chat-message{max-width:92%}.staff-chat-compose{padding:12px}.staff-chat-form{grid-template-columns:1fr}.staff-chat-send{width:100%}}
`;
document.head.appendChild(style);

function render(data){
  if(!overlay)return;
  lastMessages=Array.isArray(data.messages)?data.messages:lastMessages;
  const feed=overlay.querySelector('.staff-chat-feed');
  const nearBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<100;
  feed.innerHTML=lastMessages.length?lastMessages.map(m=>`<article class="staff-chat-message ${m.mine?'mine':''}"><div class="staff-chat-meta"><span class="staff-chat-name">${esc(m.name)}</span><span class="staff-chat-badge">${esc(m.badge||'Персонал')}</span><span class="staff-chat-time">${esc(fmt(m.createdAt))}</span></div><div class="staff-chat-text">${esc(m.body)}</div></article>`).join(''):'<div class="staff-chat-empty"><b>Служебный чат пуст</b><span>Здесь видны только модерация и администрация.</span></div>';
  if(nearBottom||!feed.dataset.ready)feed.scrollTop=feed.scrollHeight;
  feed.dataset.ready='1';
}

async function load(initial=false){
  if(!overlay||loading)return;
  loading=true;
  try{
    const r=await fetch('/api/staff-chat',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(r.status===403){access='denied';close();removeLaunchers();return}
    if(!r.ok)throw new Error(d.error||'Не удалось загрузить служебный чат');
    access='allowed';render(d);
  }catch(e){
    if(initial&&overlay){const feed=overlay.querySelector('.staff-chat-feed');if(feed)feed.innerHTML=`<div class="staff-chat-empty"><b>Чат недоступен</b><span>${esc(e.message||'Попробуйте позже')}</span></div>`}
  }finally{loading=false}
}

async function send(){
  const area=overlay?.querySelector('textarea');
  const button=overlay?.querySelector('.staff-chat-send');
  const body=area?.value.trim();
  if(!body||!button)return;
  button.disabled=true;
  try{
    const r=await fetch('/api/staff-chat/messages',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({body})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Не удалось отправить');
    area.value='';area.style.height='auto';await load(false);
  }catch(e){toast(e.message||'Не удалось отправить')}finally{button.disabled=false;area?.focus({preventScroll:true})}
}

function close(){
  if(poller){clearInterval(poller);poller=null}
  overlay?.remove();overlay=null;
}
function open(){
  if(access!=='allowed')return;
  if(overlay?.isConnected)return overlay.querySelector('textarea')?.focus({preventScroll:true});
  overlay=document.createElement('div');
  overlay.className='staff-chat-overlay';
  overlay.innerHTML=`<section class="staff-chat-panel" role="dialog" aria-modal="true" aria-label="Чат персонала"><header class="staff-chat-head"><div><div class="staff-chat-eyebrow">Закрытый канал</div><h2>Чат модерации и администрации</h2><p>Доступ только персоналу сайта.</p></div><button type="button" class="staff-chat-close" aria-label="Закрыть">×</button></header><div class="staff-chat-feed"><div class="staff-chat-empty"><b>Загружаем…</b></div></div><footer class="staff-chat-compose"><div class="staff-chat-form"><textarea maxlength="1200" rows="1" placeholder="Сообщение для команды…"></textarea><button type="button" class="staff-chat-send">Отправить</button></div><div class="staff-chat-hint">Enter — отправить · Shift + Enter — новая строка</div></footer></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.staff-chat-close').onclick=close;
  overlay.onclick=e=>{if(e.target===overlay)close()};
  const area=overlay.querySelector('textarea');
  area.oninput=()=>{area.style.height='auto';area.style.height=Math.min(area.scrollHeight,130)+'px'};
  area.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}};
  overlay.querySelector('.staff-chat-send').onclick=send;
  void load(true);
  poller=setInterval(()=>void load(false),2200);
  setTimeout(()=>area.focus({preventScroll:true}),100);
}

function icon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.6 2.8 8.1 7 10 4.2-1.9 7-5.4 7-10V6l-7-3Z"/><path d="M8.5 10.5h7M8.5 13.5h4.5"/></svg>'}
function removeLaunchers(){document.querySelectorAll('[data-staff-chat-launch]').forEach(x=>x.remove())}
function ensureLaunchers(){
  if(access!=='allowed')return;
  const nav=document.querySelector('.sidebar nav');
  if(nav&&!nav.querySelector('[data-staff-chat-launch]')){
    const btn=document.createElement('button');btn.type='button';btn.className='staff-chat-nav';btn.dataset.staffChatLaunch='1';btn.innerHTML=`<span class="nav-icon">${icon()}</span><span>Чат персонала</span>`;btn.onclick=open;
    const profile=nav.querySelector('[data-nav="profile"]');if(profile)nav.insertBefore(btn,profile);else nav.appendChild(btn);
  }
  if(document.querySelector('.app .mobile-nav')&&!document.querySelector('.staff-chat-mobile-launch')){
    const btn=document.createElement('button');btn.type='button';btn.className='staff-chat-mobile-launch';btn.dataset.staffChatLaunch='1';btn.setAttribute('aria-label','Открыть чат персонала');btn.textContent='🛡';btn.onclick=open;document.body.appendChild(btn);
  }
}

async function checkAccess(){
  if(checking||access==='allowed'||access==='denied')return;
  checking=true;
  try{
    const r=await fetch('/api/staff-chat',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    if(r.status===403){access='denied';removeLaunchers();return}
    if(r.status===401)return;
    if(!r.ok)return;
    access='allowed';ensureLaunchers();
  }catch{}finally{checking=false}
}

const observer=new MutationObserver(()=>{ensureLaunchers();if(access==='unknown')void checkAccess()});
observer.observe(document.documentElement,{childList:true,subtree:true});
addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay)close()});
setInterval(()=>{if(access==='unknown')void checkAccess();else ensureLaunchers()},2500);
void checkAccess();
})();
