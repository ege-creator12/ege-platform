(()=>{
'use strict';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const fmtTime=value=>{try{return new Date(value).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}catch{return''}};

function insertLiveMessage(message){
  if(!message||message.mine)return;
  const feed=document.querySelector('.community-chat-feed');
  if(!feed)return;
  const id=Math.max(0,Number(message.id)||0);
  if(!id||feed.querySelector(`[data-chat-message="${id}"]`))return;

  const nearBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<120;
  feed.querySelector('.community-chat-empty')?.remove();

  const card=document.createElement('article');
  card.className='community-chat-message live-arrival';
  card.dataset.chatMessage=String(id);
  card.innerHTML=`<div class="community-chat-meta"><span class="community-chat-name">${esc(message.name||'Ученик')}</span>${message.badge?`<span class="community-chat-badge">${esc(message.badge)}</span>`:''}<span class="community-chat-time">${esc(fmtTime(message.createdAt||Date.now()))}</span></div><div class="community-chat-text">${esc(message.body||'')}</div>`;
  feed.appendChild(card);
  if(nearBottom)feed.scrollTop=feed.scrollHeight;
}

const style=document.createElement('style');
style.textContent='.community-chat-message.live-arrival{animation:communityChatLiveIn .18s ease-out}@keyframes communityChatLiveIn{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}';
document.head.appendChild(style);

window.addEventListener('osnova:community-chat-message',event=>insertLiveMessage(event.detail));
})();
