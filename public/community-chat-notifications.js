(()=>{
'use strict';

const SEEN_KEY='osnova.communityChat.lastSeenId';
let initialized=false;
let syncing=false;
let lastKnownId=0;
let unread=0;
let timer=null;
let alertTimer=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[ch]));
const seenId=()=>Math.max(0,Number(localStorage.getItem(SEEN_KEY)||0)||0);
const chatOpen=()=>Boolean(document.querySelector('.community-chat-overlay'));
const appOpen=()=>Boolean(document.querySelector('.app'));

const style=document.createElement('style');
style.textContent=`
.community-chat-nav{position:relative}
.community-chat-unread-badge{display:none;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#ff4d5f;color:#fff;font:800 10px/1 Manrope,system-ui,sans-serif;box-shadow:0 0 0 2px rgba(7,16,12,.92);margin-left:auto}
.community-chat-unread-badge.show{display:inline-flex}
.community-chat-mobile-launch .community-chat-unread-badge{position:absolute;right:-4px;top:-5px;margin:0;box-shadow:0 0 0 2px #07100c}
.community-chat-alert{position:fixed;right:22px;top:82px;z-index:2050;width:min(360px,calc(100vw - 28px));border:1px solid rgba(108,229,159,.25);background:rgba(7,17,13,.97);color:#edf8f1;border-radius:16px;padding:13px 14px;box-shadow:0 20px 50px rgba(0,0,0,.34);backdrop-filter:blur(14px);cursor:pointer;animation:communityChatAlertIn .18s ease-out}
.community-chat-alert-head{display:flex;align-items:center;gap:8px;margin-bottom:5px}.community-chat-alert-head b{font-size:12px}.community-chat-alert-head span{margin-left:auto;font-size:10px;opacity:.48}.community-chat-alert-text{font-size:13px;line-height:1.4;opacity:.86;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.community-chat-alert small{display:block;margin-top:7px;font-size:10px;color:#86e9ad;opacity:.85}
@keyframes communityChatAlertIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@media(max-width:760px){.community-chat-alert{top:14px;right:14px}}
`;
document.head.appendChild(style);

function badgeText(){return unread>99?'99+':String(unread)}
function updateBadges(){
  document.querySelectorAll('[data-community-chat-launch],.community-chat-mobile-launch').forEach(button=>{
    let badge=button.querySelector('.community-chat-unread-badge');
    if(!badge){badge=document.createElement('span');badge.className='community-chat-unread-badge';badge.setAttribute('aria-hidden','true');button.appendChild(badge)}
    const label=badgeText();
    if(badge.textContent!==label)badge.textContent=label;
    badge.classList.toggle('show',unread>0);
    if(unread>0)button.setAttribute('aria-label',`Общий чат, новых сообщений: ${unread}`);
    else if(button.classList.contains('community-chat-mobile-launch'))button.setAttribute('aria-label','Открыть общий чат');
    else button.removeAttribute('aria-label');
  });
}

function markSeen(id){
  const safe=Math.max(0,Number(id)||0);
  if(safe>seenId())localStorage.setItem(SEEN_KEY,String(safe));
  unread=0;
  updateBadges();
}

function openChatFromAlert(){
  const launcher=document.querySelector('[data-community-chat-launch]')||document.querySelector('.community-chat-mobile-launch');
  launcher?.click();
}

function showAlert(message,count){
  if(chatOpen()||!message)return;
  document.querySelector('.community-chat-alert')?.remove();
  clearTimeout(alertTimer);
  const el=document.createElement('div');
  el.className='community-chat-alert';
  el.setAttribute('role','status');
  el.innerHTML=`<div class="community-chat-alert-head"><b>💬 ${esc(message.name||'Новое сообщение')}</b><span>${count>1?`+${count-1} ещё`:''}</span></div><div class="community-chat-alert-text">${esc(message.body||'')}</div><small>Нажмите, чтобы открыть общий чат</small>`;
  el.onclick=()=>{el.remove();openChatFromAlert()};
  document.body.appendChild(el);
  alertTimer=setTimeout(()=>el.remove(),5500);
}

async function sync(){
  if(syncing||!appOpen())return;
  syncing=true;
  try{
    const r=await fetch('/api/community-chat',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    if(!r.ok)return;
    const data=await r.json().catch(()=>({}));
    const messages=Array.isArray(data.messages)?data.messages:[];
    const latest=messages.length?Math.max(...messages.map(m=>Number(m.id)||0)):0;

    if(!initialized){
      initialized=true;
      lastKnownId=latest;
      if(!seenId()){
        markSeen(latest);
      }else if(chatOpen()){
        markSeen(latest);
      }else{
        unread=messages.filter(m=>!m.mine&&(Number(m.id)||0)>seenId()).length;
        updateBadges();
      }
      return;
    }

    if(chatOpen()){
      lastKnownId=Math.max(lastKnownId,latest);
      markSeen(latest);
      return;
    }

    const incoming=messages.filter(m=>!m.mine&&(Number(m.id)||0)>lastKnownId);
    lastKnownId=Math.max(lastKnownId,latest);
    unread=messages.filter(m=>!m.mine&&(Number(m.id)||0)>seenId()).length;
    updateBadges();
    if(incoming.length)showAlert(incoming[incoming.length-1],incoming.length);
  }catch{}
  finally{syncing=false}
}

function refreshLifecycle(){
  updateBadges();
  if(appOpen()){
    if(!timer){sync();timer=setInterval(sync,5000)}
  }else{
    if(timer){clearInterval(timer);timer=null}
    initialized=false;lastKnownId=0;unread=0;updateBadges();
    document.querySelector('.community-chat-alert')?.remove();
  }
  if(chatOpen()){
    document.querySelector('.community-chat-alert')?.remove();
    if(lastKnownId)markSeen(lastKnownId);
    sync();
  }
}

const observer=new MutationObserver(refreshLifecycle);
observer.observe(document.documentElement,{childList:true,subtree:true});
addEventListener('focus',sync);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
refreshLifecycle();
})();
