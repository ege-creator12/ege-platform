(()=>{
'use strict';

let overlay=null;
let poller=null;
let loading=false;
let renderSignature='';
let me={staff:false,admin:false,mutedUntil:null};
let serverMessages=[];
let pendingMessages=[];
let outbox=[];
let sending=false;
let pendingSeq=0;
let lastSentAt=0;

const SEND_GAP_MS=1250;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const toast=message=>{if(typeof notify==='function')return notify(message);const t=document.querySelector('#toast');if(t){t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}};

const style=document.createElement('style');
style.textContent=`
.community-chat-nav .nav-icon{display:grid;place-items:center}.community-chat-nav svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.community-chat-mobile-launch{display:none}
.community-chat-overlay{position:fixed;inset:0;z-index:2100;background:rgba(0,0,0,.58);backdrop-filter:blur(9px);display:flex;align-items:stretch;justify-content:flex-end}
.community-chat-panel{width:min(720px,100%);height:100%;background:linear-gradient(180deg,rgba(9,20,16,.985),rgba(7,14,11,.995));border-left:1px solid rgba(143,208,174,.18);box-shadow:-24px 0 70px rgba(0,0,0,.35);display:grid;grid-template-rows:auto 1fr auto;color:#edf8f1}
.community-chat-head{padding:20px 22px 16px;border-bottom:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between;gap:16px;background:rgba(255,255,255,.015)}
.community-chat-head h2{margin:2px 0 3px;font-size:22px;letter-spacing:-.02em}.community-chat-head p{margin:0;font-size:12px;opacity:.58}.community-chat-eyebrow{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#76e7a7;font-weight:800}.community-chat-close{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.04);color:inherit;border-radius:12px;width:40px;height:40px;font-size:24px;cursor:pointer}
.community-chat-feed{overflow:auto;padding:20px 22px 28px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth}.community-chat-empty{margin:auto;text-align:center;opacity:.58;padding:50px 20px}.community-chat-empty b{display:block;font-size:18px;margin-bottom:5px}
.community-chat-message{max-width:82%;align-self:flex-start;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.075);border-radius:18px 18px 18px 5px;padding:11px 13px 10px;position:relative;box-shadow:0 8px 28px rgba(0,0,0,.08)}.community-chat-message.mine{align-self:flex-end;border-radius:18px 18px 5px 18px;background:rgba(74,210,132,.12);border-color:rgba(84,226,145,.18)}.community-chat-message.pending{opacity:.78}.community-chat-message.pending .community-chat-time{color:#8ceab2;opacity:.72}.community-chat-message.optimistic:not(.pending) .community-chat-time{color:#8ceab2;opacity:.62}
.community-chat-meta{display:flex;align-items:center;gap:7px;margin-bottom:6px;min-height:19px}.community-chat-name{font-size:12px;font-weight:800}.community-chat-badge{font-size:9px;text-transform:uppercase;letter-spacing:.06em;padding:3px 6px;border-radius:999px;background:rgba(91,232,151,.12);border:1px solid rgba(91,232,151,.2);color:#9af0bd}.community-chat-time{font-size:10px;opacity:.4;margin-left:auto}.community-chat-text{font-size:14px;line-height:1.48;white-space:pre-wrap;overflow-wrap:anywhere}
.community-chat-more{border:0;background:transparent;color:inherit;opacity:.55;cursor:pointer;font-size:20px;line-height:1;padding:0 2px;margin-left:2px}.community-chat-more:hover{opacity:1}.community-chat-mute-menu{margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,.07);display:flex;gap:6px;flex-wrap:wrap}.community-chat-mute-menu button{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);color:inherit;border-radius:9px;padding:6px 8px;font:inherit;font-size:10px;cursor:pointer}.community-chat-mute-menu button:hover{border-color:rgba(112,231,164,.35);background:rgba(73,210,132,.09)}.community-chat-mute-menu .danger{border-color:rgba(255,125,125,.18);color:#ffc2c2}
.community-chat-compose{border-top:1px solid rgba(255,255,255,.075);padding:13px 18px 16px;background:rgba(5,12,9,.92)}.community-chat-muted{display:none;margin:0 0 10px;padding:9px 11px;border-radius:11px;background:rgba(255,176,75,.08);border:1px solid rgba(255,176,75,.14);font-size:11px;color:#ffd9a0}.community-chat-muted.show{display:block}.community-chat-form{display:grid;grid-template-columns:1fr auto;gap:9px;align-items:end}.community-chat-form textarea{min-height:44px;max-height:130px;resize:none;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);color:inherit;border-radius:14px;padding:12px 13px;font:inherit;font-size:14px;outline:none}.community-chat-form textarea:focus{border-color:rgba(91,232,151,.45);box-shadow:0 0 0 3px rgba(91,232,151,.07)}.community-chat-send{height:44px;border:0;border-radius:13px;padding:0 17px;background:#67e49c;color:#082012;font:inherit;font-weight:800;cursor:pointer}.community-chat-send:disabled,.community-chat-form textarea:disabled{opacity:.48;cursor:not-allowed}.community-chat-hint{margin-top:7px;font-size:10px;opacity:.38;padding-left:2px}
@media(max-width:760px){.community-chat-overlay{background:#07100c}.community-chat-panel{width:100%;border-left:0}.community-chat-head{padding:15px 14px 13px}.community-chat-feed{padding:14px 12px 22px}.community-chat-message{max-width:90%}.community-chat-compose{padding:10px 10px calc(12px + env(safe-area-inset-bottom))}.community-chat-form{grid-template-columns:1fr auto}.community-chat-send{padding:0 14px}.community-chat-mobile-launch{display:grid;place-items:center;position:fixed;right:14px;bottom:186px;z-index:68;width:43px;height:43px;border-radius:50%;border:1px solid rgba(143,208,174,.28);background:rgba(7,16,12,.92);color:#dff5e7;box-shadow:0 12px 30px rgba(0,0,0,.25);font-size:18px;cursor:pointer}.community-chat-nav{display:none!important}}
`;
document.head.appendChild(style);

function fmtTime(value){try{return new Date(value).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}catch{return ''}}
function fmtMute(value){const until=Number(value||0);if(!until)return '';const d=new Date(until);if(d.getUTCFullYear()>2900)return 'Вам выдан мут без срока.';return `Вам выдан мут до ${d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}.`}

function closeChat(){
  overlay?.remove();
  overlay=null;
  renderSignature='';
  serverMessages=[];
  loading=false;
  if(poller){clearInterval(poller);poller=null}
}

function messagesSignature(messages){
  return messages.map(m=>[m.id,m.body,m.name,m.badge,m.mine?1:0,m.moderatable?1:0,m.pending?1:0,m.optimistic?1:0].join('\u0001')).join('\u0002');
}

function combinedMessages(nextMessages){
  if(Array.isArray(nextMessages)){
    serverMessages=nextMessages;
    const confirmed=new Set(serverMessages.map(message=>Number(message.id)));
    pendingMessages=pendingMessages.filter(message=>!message.serverId||!confirmed.has(Number(message.serverId)));
  }
  return [...serverMessages,...pendingMessages];
}

function renderMessages(data={},initial=false){
  if(!overlay)return;
  me=data.me||me;
  const feed=overlay.querySelector('.community-chat-feed');
  if(!feed)return;
  const nearBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<90;
  const messages=combinedMessages(data.messages);
  const signature=messagesSignature(messages);
  const openMenuCard=feed.querySelector('.community-chat-mute-menu')?.closest('[data-chat-message]');
  const openMenuId=Number(openMenuCard?.dataset.chatMessage||0);

  if(initial||signature!==renderSignature){
    renderSignature=signature;
    feed.innerHTML=messages.length?messages.map(m=>`<article class="community-chat-message ${m.mine?'mine':''} ${m.pending?'pending':''} ${m.optimistic?'optimistic':''}" data-chat-message="${Number(m.id)}"><div class="community-chat-meta"><span class="community-chat-name">${esc(m.name)}</span>${m.badge?`<span class="community-chat-badge">${esc(m.badge)}</span>`:''}<span class="community-chat-time">${esc(m.pending?'отправляется…':m.optimistic?'сейчас':fmtTime(m.createdAt))}</span>${m.moderatable?'<button type="button" class="community-chat-more" data-chat-more aria-label="Модерация">⋯</button>':''}</div><div class="community-chat-text">${esc(m.body)}</div></article>`).join(''):'<div class="community-chat-empty"><b>Пока тихо</b><span>Напиши первым — можно обсудить задание, тему или подготовку.</span></div>';
    feed.querySelectorAll('[data-chat-more]').forEach(btn=>btn.onclick=()=>toggleMuteMenu(btn.closest('[data-chat-message]')));
    if(openMenuId){
      const reopened=feed.querySelector(`[data-chat-message="${openMenuId}"]`);
      if(reopened?.querySelector('[data-chat-more]'))toggleMuteMenu(reopened);
    }
    if(initial||nearBottom||pendingMessages.length)feed.scrollTop=feed.scrollHeight;
  }
  updateComposer();
}

function updateComposer(){
  if(!overlay)return;
  const until=Number(me.mutedUntil||0);
  const muted=until>Date.now();
  const banner=overlay.querySelector('.community-chat-muted');
  const area=overlay.querySelector('textarea');
  const send=overlay.querySelector('.community-chat-send');
  if(!banner||!area||!send)return;
  banner.classList.toggle('show',muted);
  banner.textContent=muted?fmtMute(until):'';
  area.disabled=muted;
  send.disabled=muted;
  area.placeholder=muted?'Вы не можете писать во время мута':'Напишите сообщение…';
}

function toggleMuteMenu(card){
  if(!card)return;
  const existing=card.querySelector('.community-chat-mute-menu');
  document.querySelectorAll('.community-chat-mute-menu').forEach(x=>x.remove());
  if(existing)return;
  const id=Number(card.dataset.chatMessage);
  const menu=document.createElement('div');
  menu.className='community-chat-mute-menu';
  const options=[[10,'10 мин'],[60,'1 час'],[1440,'24 часа']];
  if(me.admin)options.push([10080,'7 дней'],[0,'Навсегда']);
  menu.innerHTML=options.map(([minutes,label])=>`<button type="button" data-chat-mute="${minutes}" data-chat-id="${id}">${label}</button>`).join('')+`<button type="button" class="danger" data-chat-unmute data-chat-id="${id}">Снять мут</button>`;
  menu.querySelectorAll('[data-chat-mute]').forEach(btn=>btn.onclick=()=>muteMessage(Number(btn.dataset.chatId),Number(btn.dataset.chatMute),btn));
  menu.querySelector('[data-chat-unmute]').onclick=()=>unmuteMessage(id,menu.querySelector('[data-chat-unmute]'));
  card.appendChild(menu);
}

async function muteMessage(id,minutes,button){
  button.disabled=true;
  try{
    const r=await fetch(`/api/community-chat/messages/${id}/mute`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({minutes})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Не удалось выдать мут');
    toast(minutes===0?'Мут выдан без срока':`Мут выдан: ${button.textContent}`);
    await loadChat();
  }catch(e){toast(e.message||'Не удалось выдать мут');button.disabled=false}
}

async function unmuteMessage(id,button){
  button.disabled=true;
  try{
    const r=await fetch(`/api/community-chat/messages/${id}/unmute`,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Не удалось снять мут');
    toast('Мут снят');
    await loadChat();
  }catch(e){toast(e.message||'Не удалось снять мут');button.disabled=false}
}

async function loadChat(initial=false){
  if(!overlay||loading)return;
  loading=true;
  const target=overlay;
  try{
    const r=await fetch('/api/community-chat',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Не удалось загрузить чат');
    if(target!==overlay)return;
    renderMessages(d,initial);
  }catch(e){
    if(initial&&target===overlay){
      const feed=overlay?.querySelector('.community-chat-feed');
      if(feed)feed.innerHTML=`<div class="community-chat-empty"><b>Чат пока недоступен</b><span>${esc(e.message||'Попробуйте позже')}</span></div>`;
    }
  }finally{
    loading=false;
  }
}

function makePending(body){
  pendingSeq+=1;
  return {id:-pendingSeq,body,name:'Вы',badge:'',mine:true,moderatable:false,createdAt:new Date().toISOString(),pending:true,optimistic:true,serverId:0};
}

async function flushOutbox(){
  if(sending||!outbox.length)return;
  sending=true;
  const item=outbox[0];
  const gap=Math.max(0,SEND_GAP_MS-(Date.now()-lastSentAt));
  if(gap)await sleep(gap);
  try{
    const r=await fetch('/api/community-chat/messages',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({body:item.body})});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){if(d.mutedUntil)me.mutedUntil=d.mutedUntil;throw new Error(d.error||'Не удалось отправить')}
    lastSentAt=Date.now();
    item.pending.serverId=Number(d.id||0);
    item.pending.pending=false;
    outbox.shift();
    renderMessages({me},false);
    void loadChat(false);
  }catch(e){
    outbox.shift();
    pendingMessages=pendingMessages.filter(message=>message!==item.pending);
    renderMessages({me},false);
    const area=overlay?.querySelector('textarea');
    if(area&&!area.value.trim()){
      area.value=item.body;
      area.style.height='auto';
      area.style.height=Math.min(area.scrollHeight,130)+'px';
    }
    toast(e.message||'Не удалось отправить');
  }finally{
    sending=false;
    if(outbox.length)void flushOutbox();
  }
}

function sendMessage(){
  if(!overlay)return;
  const area=overlay.querySelector('textarea');
  if(!area)return;
  const body=area.value.trim();
  if(!body)return;
  if(Number(me.mutedUntil||0)>Date.now())return updateComposer();

  const pending=makePending(body);
  pendingMessages.push(pending);
  outbox.push({body,pending});
  area.value='';
  area.style.height='auto';
  renderMessages({me},false);
  area.focus({preventScroll:true});
  void flushOutbox();
}

function openChat(){
  if(overlay?.isConnected){
    overlay.querySelector('textarea')?.focus({preventScroll:true});
    return;
  }
  if(overlay&&!overlay.isConnected)overlay=null;
  if(poller){clearInterval(poller);poller=null}
  loading=false;

  overlay=document.createElement('div');
  overlay.className='community-chat-overlay';
  overlay.innerHTML=`<section class="community-chat-panel" role="dialog" aria-modal="true" aria-label="Общий чат"><header class="community-chat-head"><div><div class="community-chat-eyebrow">Сообщество ОСНОВЫ</div><h2>Общий чат</h2><p>Обсуждайте задания, темы и подготовку вместе.</p></div><button type="button" class="community-chat-close" aria-label="Закрыть">×</button></header><div class="community-chat-feed"><div class="community-chat-empty"><b>Загружаем чат…</b></div></div><footer class="community-chat-compose"><div class="community-chat-muted"></div><div class="community-chat-form"><textarea maxlength="900" rows="1" placeholder="Напишите сообщение…"></textarea><button type="button" class="community-chat-send">Отправить</button></div><div class="community-chat-hint">Enter — отправить · Shift + Enter — новая строка</div></footer></section>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.community-chat-close').addEventListener('click',closeChat);
  overlay.addEventListener('click',e=>{if(e.target===overlay)closeChat()});
  const area=overlay.querySelector('textarea');
  area.addEventListener('input',()=>{area.style.height='auto';area.style.height=Math.min(area.scrollHeight,130)+'px'});
  area.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}});
  overlay.querySelector('.community-chat-send').addEventListener('click',sendMessage);
  renderSignature='';
  serverMessages=[];
  void loadChat(true);
  poller=setInterval(()=>void loadChat(false),2500);
  setTimeout(()=>overlay?.querySelector('textarea')?.focus({preventScroll:true}),120);
}

window.OsnovaCommunityChat={
  open:openChat,
  close:closeChat,
  isOpen:()=>Boolean(overlay?.isConnected),
};

function chatIcon(){return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/><path d="M8 10h8M8 13h5"/></svg>'}

function ensureLaunchers(){
  const nav=document.querySelector('.sidebar nav');
  if(nav&&!nav.querySelector('[data-community-chat-launch]')){
    const btn=document.createElement('button');
    btn.type='button';btn.className='community-chat-nav';btn.dataset.communityChatLaunch='1';
    btn.innerHTML=`<span class="nav-icon">${chatIcon()}</span><span>Общий чат</span>`;
    btn.addEventListener('click',openChat);
    const profile=nav.querySelector('[data-nav="profile"]');
    if(profile)nav.insertBefore(btn,profile);else nav.appendChild(btn);
  }
  const hasApp=document.querySelector('.app .mobile-nav');
  let mobile=document.querySelector('.community-chat-mobile-launch');
  if(hasApp&&!mobile){
    mobile=document.createElement('button');
    mobile.type='button';
    mobile.className='community-chat-mobile-launch';
    mobile.setAttribute('aria-label','Открыть общий чат');
    mobile.textContent='💬';
    mobile.addEventListener('click',openChat);
    document.body.appendChild(mobile);
  }
  if(!hasApp&&mobile)mobile.remove();
}

const observer=new MutationObserver(()=>ensureLaunchers());
observer.observe(document.documentElement,{childList:true,subtree:true});
addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay)closeChat()});
ensureLaunchers();
})();
