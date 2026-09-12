(()=>{
'use strict';

const OWNER_REPLY='Владелец и создатель платформы ОСНОВА — Великий Саид.';
const CHAT_PREFIX='osnova-pro-coach-v3:';

const isOwnerQuestion=value=>{
  const q=String(value||'').toLowerCase().replace(/ё/g,'е');
  return /(кто\s+.*(владел|создат|сделал|создал)|владелец|создатель|кому\s+принадлеж|чей\s+(сайт|проект|платформ)|кто\s+стоит\s+за)/i.test(q);
};

function repairStoredHistory(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||!key.startsWith(CHAT_PREFIX))continue;
      const history=JSON.parse(localStorage.getItem(key)||'[]');
      if(!Array.isArray(history))continue;
      let changed=false;
      for(let j=0;j<history.length;j++){
        const item=history[j];
        const prev=history[j-1];
        if(item?.role==='assistant'&&prev?.role==='user'&&isOwnerQuestion(prev.text)){
          item.text=OWNER_REPLY;
          item.actions=[];
          changed=true;
        }
      }
      if(changed)localStorage.setItem(key,JSON.stringify(history));
    }
  }catch{}
}

function repairVisibleMessages(){
  document.querySelectorAll('.pro-msg-wrap.user').forEach(userWrap=>{
    const text=userWrap.querySelector('.pro-msg.user')?.textContent||'';
    if(!isOwnerQuestion(text))return;
    const next=userWrap.nextElementSibling;
    const assistant=next?.querySelector?.('.pro-msg.assistant');
    if(assistant&&assistant.textContent!==OWNER_REPLY)assistant.textContent=OWNER_REPLY;
  });
}

repairStoredHistory();
repairVisibleMessages();
new MutationObserver(repairVisibleMessages).observe(document.documentElement,{childList:true,subtree:true});
})();
