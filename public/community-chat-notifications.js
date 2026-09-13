(()=>{
'use strict';

const SEEN_KEY='osnova.communityChat.lastSeenId.v2';
let baselineReady=false;
let latestKnown=0;
let syncing=false;
let unread=0;
let timer=null;
let popupTimer=null;
let stream=null;
let streamStarted=false;
let streamRetryTimer=null;

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const getSeen=()=>{try{return Math.max(0,Number(localStorage.getItem(SEEN_KEY)||0)||0)}catch{return 0}};
const isChatOpen=()=>Boolean(document.querySelector('.community-chat-overlay'));

const style=document.createElement('style');
style.textContent=`
.community-chat-nav{position:relative!important}
.community-chat-unread-badge{display:none;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#ff3f55;color:#fff;font:800 10px/1 Manrope,system-ui,sans-serif;box-shadow:0 0 0 2px #091411,0 4px 12px rgba(255,63,85,.34);margin-left:auto;animation:chatBadgePulse 1.7s infinite}
.community-chat-unread-badge.show{display:inline-flex!important}
.community-chat-mobile-launch{position:fixed!important}
.community-chat-mobile-launch .community-chat-unread-badge{position:absolute;right:-5px;top:-6px;margin:0;z-index:3}
.community-chat-live-popup{position:fixed!important;left:50%!important;top:18px!important;transform:translateX(-50%)!important;z-index:2147483000!important;width:min(430px,calc(100vw - 24px));padding:14px 15px;border-radius:16px;border:1px solid rgba(102,235,158,.42);background:#091712;color:#effaf3;box-shadow:0 22px 65px rgba(0,0,0,.52),0 0 0 1px rgba(255,255,255,.04) inset;font-family:Manrope,system-ui,sans-serif;cursor:pointer;animation:chatPopupIn .2s ease-out}
.community-chat-live-popup-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}.community-chat-live-popup-icon{display:grid;place-items:center;width:27px;height:27px;border-radius:9px;background:rgba(94,229,151,.13);font-size:14px}.community-chat-live-popup-name{font-size:13px;font-weight:800;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.community-chat-live-popup-count{margin-left:auto;font-size:10px;opacity:.55}.community-chat-live-popup-text{font-size:13px;line-height:1.42;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-left:35px}.community-chat-live-popup-open{display:block;padding-left:35px;margin-top:6px;font-size:10px;color:#7fe9ab;font-weight:700}
@keyframes chatPopupIn{from{opacity:0;transform:translate(-50%,-12px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes chatBadgePulse{0%,70%,100%{transform:scale(1)}80%{transform:scale(1.11)}}
@media(max-width:760px){.community-chat-live-popup{top:10px!important;width:calc(100vw - 20px)}}
`;
document.head.appendChild(style);

function setSeen(id){
  const safe=Math.max(0,Number(id)||0);
  try{if(safe>getSeen())localStorage.setItem(SEEN_KEY,String(safe))}catch{}
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
    const nextText=unread>99?'99+':String(unread);
    if(badge.textContent!==nextText)badge.textContent=nextText;
    const shouldShow=unread>0;
    if(badge.classList.contains('show')!==shouldShow)badge.classList.toggle('show',shouldShow);
    if(shouldShow){
      const label=`Общий чат — ${unread} новых сообщений`;
      if(btn.getAttribute('aria-label')!==label)btn.setAttribute('aria-label',label);
    }
  });
}

function openChat(){
  const launcher=document.querySelector('[data-community-chat-launch]')||document.querySelector('.community-chat-mobile-launch');
  if(launcher)launcher.click();
}

function popup(message,count=1){
  if(!message||message.mine)return;
  document.querySelector('.community-chat-live-popup')?.remove();
  clearTimeout(popupTimer);
  const node=document.createElement('div');
  node.className='community-chat-live-popup';
  node.setAttribute('role','status');
  node.setAttribute('aria-live','assertive');
  node.innerHTML=`<div class="community-chat-live-popup-head"><span class="community-chat-live-popup-icon">💬</span><span class="community-chat-live-popup-name">${esc(message.name||'Новое сообщение')}</span><span class="community-chat-live-popup-count">${count>1?`+${count-1}`:''}</span></div><div class="community-chat-live-popup-text">${esc(message.body||'')}</div><small class="community-chat-live-popup-open">Открыть общий чат</small>`;
  node.onclick=()=>{node.remove();if(!isChatOpen())openChat()};
  document.body.appendChild(node);
  popupTimer=setTimeout(()=>node.remove(),7000);
}

function dispatchLive(message){
  try{window.dispatchEvent(new CustomEvent('osnova:community-chat-message',{detail:message}))}catch{}
}

function acceptLive(message){
  const id=Math.max(0,Number(message?.id)||0);
  if(!id)return;
  const isNew=id>latestKnown;
  latestKnown=Math.max(latestKnown,id);
  if(!isNew){
    if(isChatOpen())dispatchLive(message);
    return;
  }
  dispatchLive(message);
  if(message.mine)return;
  if(isChatOpen()){
    setSeen(id);
    popup(message,1);
    return;
  }
  if(id<=getSeen())return;
  unread+=1;
  paintBadges();
  popup(message,1);
}

function closeStream(){
  if(stream){try{stream.close()}catch{}stream=null}
  streamStarted=false;
}

function ensureStream(){
  if(streamStarted||!baselineReady||typeof EventSource==='undefined')return;
  streamStarted=true;
  try{
    stream=new EventSource('/api/community-chat/stream',{withCredentials:true});
    stream.addEventListener('ready',()=>{});
    stream.addEventListener('chat-message',event=>{
      try{acceptLive(JSON.parse(event.data||'{}'))}catch{}
    });
    stream.onerror=()=>{
      closeStream();
      clearTimeout(streamRetryTimer);
      streamRetryTimer=setTimeout(()=>{if(!document.hidden)ensureStream()},1800);
    };
  }catch{
    closeStream();
  }
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
        const unseen=messages.filter(m=>!m.mine&&(Number(m.id)||0)>stored);
        unread=unseen.length;
        paintBadges();
        if(unseen.length)popup(unseen[unseen.length-1],unseen.length);
      }
      ensureStream();
      return;
    }

    if(isChatOpen()){
      const fresh=messages.filter(m=>!m.mine&&(Number(m.id)||0)>latestKnown);
      latestKnown=Math.max(latestKnown,latest);
      setSeen(latest);
      if(fresh.length){
        fresh.forEach(dispatchLive);
        popup(fresh[fresh.length-1],fresh.length);
      }
      ensureStream();
      return;
    }

    const incoming=messages.filter(m=>!m.mine&&(Number(m.id)||0)>latestKnown);
    latestKnown=Math.max(latestKnown,latest);
    unread=messages.filter(m=>!m.mine&&(Number(m.id)||0)>getSeen()).length;
    paintBadges();
    if(incoming.length)popup(incoming[incoming.length-1],incoming.length);
    ensureStream();
  }catch{}
  finally{syncing=false}
}

let observerQueued=false;
const observer=new MutationObserver(()=>{
  if(observerQueued)return;
  observerQueued=true;
  requestAnimationFrame(()=>{
    observerQueued=false;
    paintBadges();
    if(isChatOpen()&&latestKnown)setSeen(latestKnown);
  });
});
observer.observe(document.documentElement,{childList:true,subtree:true});

document.addEventListener('visibilitychange',()=>{
  if(document.hidden)return;
  sync();
  ensureStream();
});
addEventListener('focus',()=>{sync();ensureStream()});
addEventListener('beforeunload',closeStream);

sync();
timer=setInterval(sync,4000);
paintBadges();
})();
