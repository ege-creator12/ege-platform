(()=>{
'use strict';

const SEEN_KEY='osnova.communityChat.lastSeenId.v2';
let baselineReady=false;
let latestKnown=0;
let syncing=false;
let unread=0;
let timer=null;
let popupTimer=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const getSeen=()=>Math.max(0,Number(localStorage.getItem(SEEN_KEY)||0)||0);
const isChatOpen=()=>Boolean(document.querySelector('.community-chat-overlay'));

const style=document.createElement('style');
style.textContent=`
.community-chat-nav{position:relative!important}
.community-chat-unread-badge{display:none;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#ff3f55;color:#fff;font:800 10px/1 Manrope,system-ui,sans-serif;box-shadow:0 0 0 2px #091411,0 4px 12px rgba(255,63,85,.34);margin-left:auto;animation:chatBadgePulse 1.7s infinite}
.community-chat-unread-badge.show{display:inline-flex!important}
.community-chat-mobile-launch{position:fixed!important}
.community-chat-mobile-launch .community-chat-unread-badge{position:absolute;right:-5px;top:-6px;margin:0;z-index:3}
.community-chat-live-popup{position:fixed!important;left:50%!important;top:18px!important;transform:translateX(-50%)!important;z-index:2147483000!important;width:min(430px,calc(100vw - 24px));padding:14px 15px;border-radius:16px;border:1px solid rgba(102,235,158,.34);background:#091712;color:#effaf3;box-shadow:0 22px 65px rgba(0,0,0,.48),0 0 0 1px rgba(255,255,255,.03) inset;font-family:Manrope,system-ui,sans-serif;cursor:pointer;animation:chatPopupIn .2s ease-out}
.community-chat-live-popup-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}.community-chat-live-popup-icon{display:grid;place-items:center;width:27px;height:27px;border-radius:9px;background:rgba(94,229,151,.13);font-size:14px}.community-chat-live-popup-name{font-size:13px;font-weight:800;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.community-chat-live-popup-count{margin-left:auto;font-size:10px;opacity:.55}.community-chat-live-popup-text{font-size:13px;line-height:1.42;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:35px}.community-chat-live-popup-open{display:block;padding-left:35px;margin-top:6px;font-size:10px;color:#7fe9ab;font-weight:700}
@keyframes chatPopupIn{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes chatBadgePulse{0%,70%,100%{transform:scale(1)}80%{transform:scale(1.11)}}
@media(max-width:760px){.community-chat-live-popup{top:10px!important;width:calc(100vw - 20px)}}
`;
document.head.appendChild(style);

function setSeen(id){
  const safe=Math.max(0,Number(id)||0);
  if(safe>getSeen())localStorage.setItem(SEEN_KEY,String(safe));
  unread=0;
  paintBadges();
}

function paintBadges(){
  const launchers=document.querySelectorAll('[data-community-chat-launch],.community-chat-mobile-launch');
  launchers.forEach(btn=>{
    let badge=btn.querySelector('.community-chat-unread-badge');
    if(!badge){
      badge=document.createElement('span');
      badge.className='community-chat-unread-badge';
      badge.setAttribute('aria-hidden','true');
      btn.appendChild(badge);
    }
    badge.textContent=unread>99?'99+':String(unread);
    badge.classList.toggle('show',unread>0);
    if(unread>0)btn.setAttribute('aria-label',`Общий чат — ${unread} новых сообщений`);
  });
}

function openChat(){
  const launcher=document.querySelector('[data-community-chat-launch]')||document.querySelector('.community-chat-mobile-launch');
  if(launcher)launcher.click();
}

function popup(message,count){
  if(!message||isChatOpen())return;
  document.querySelector('.community-chat-live-popup')?.remove();
  clearTimeout(popupTimer);
  const node=document.createElement('div');
  node.className='community-chat-live-popup';
  node.setAttribute('role','status');
  node.innerHTML=`<div class="community-chat-live-popup-head"><span class="community-chat-live-popup-icon">💬</span><span class="community-chat-live-popup-name">${esc(message.name||'Новое сообщение')}</span><span class="community-chat-live-popup-count">${count>1?`+${count-1}`:''}</span></div><div class="community-chat-live-popup-text">${esc(message.body||'')}</div><small class="community-chat-live-popup-open">Открыть общий чат</small>`;
  node.onclick=()=>{node.remove();openChat()};
  document.body.appendChild(node);
  popupTimer=setTimeout(()=>node.remove(),7000);
}

async function sync(){
  if(syncing)return;
  syncing=true;
  try{
    const r=await fetch('/api/community-chat',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    if(!r.ok)return;
    const data=await r.json().catch(()=>({}));
    const messages=Array.isArray(data.messages)?data.messages:[];
    const latest=messages.length?Math.max(...messages.map(m=>Number(m.id)||0)):0;

    if(!baselineReady){
      baselineReady=true;
      latestKnown=latest;
      const stored=getSeen();
      if(!stored){
        setSeen(latest);
      }else if(isChatOpen()){
        setSeen(latest);
      }else{
        unread=messages.filter(m=>!m.mine&&(Number(m.id)||0)>stored).length;
        paintBadges();
      }
      return;
    }

    if(isChatOpen()){
      latestKnown=Math.max(latestKnown,latest);
      setSeen(latest);
      document.querySelector('.community-chat-live-popup')?.remove();
      return;
    }

    const incoming=messages.filter(m=>!m.mine&&(Number(m.id)||0)>latestKnown);
    latestKnown=Math.max(latestKnown,latest);
    unread=messages.filter(m=>!m.mine&&(Number(m.id)||0)>getSeen()).length;
    paintBadges();
    if(incoming.length)popup(incoming[incoming.length-1],incoming.length);
  }catch{}
  finally{syncing=false}
}

const observer=new MutationObserver(()=>{
  paintBadges();
  if(isChatOpen()&&latestKnown)setSeen(latestKnown);
});
observer.observe(document.documentElement,{childList:true,subtree:true});

document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
addEventListener('focus',sync);

sync();
timer=setInterval(sync,2000);
paintBadges();
})();
