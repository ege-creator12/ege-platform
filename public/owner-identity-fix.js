(()=>{
'use strict';

const OWNER_REPLY='Владелец и создатель платформы ОСНОВА — Великий Саид.';
const MODEL_REPLY='Я — AI-помощник платформы ОСНОВА.';
const PRO_CHAT_PREFIX='osnova-pro-coach-v3:';
const TUTOR_CHAT_KEY='osnova-ai-tutor-history-v1';

const isOwnerQuestion=value=>{
  const q=String(value||'').toLowerCase().replace(/ё/g,'е');
  return /(кто\s+.*(владел|создат|сделал|создал)|владелец|создатель|кому\s+принадлеж|чей\s+(сайт|проект|платформ)|кто\s+стоит\s+за)/i.test(q);
};

const isModelQuestion=value=>{
  const q=String(value||'').toLowerCase().replace(/ё/g,'е');
  return /(какая|какой|что\s+за|что\s+ты\s+за|на\s+какой|кто\s+ты).{0,40}(модел|нейросет|ии|ai)|кто\s+тебя\s+(разработал|создал)|чья\s+ты\s+нейросет/i.test(q);
};

function repairHistory(key){
  try{
    const history=JSON.parse(localStorage.getItem(key)||'[]');
    if(!Array.isArray(history))return;
    let changed=false;
    for(let j=0;j<history.length;j++){
      const item=history[j],prev=history[j-1];
      if(item?.role!=='assistant'||prev?.role!=='user')continue;
      let text=String(item.text||'');
      if(isOwnerQuestion(prev.text))text=OWNER_REPLY;
      else if(isModelQuestion(prev.text))text=MODEL_REPLY;
      if(text!==item.text){item.text=text;item.actions=[];changed=true}
    }
    if(changed)localStorage.setItem(key,JSON.stringify(history));
  }catch{}
}

function repairStoredHistory(){
  try{
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(key&&(key.startsWith(PRO_CHAT_PREFIX)||key===TUTOR_CHAT_KEY))repairHistory(key);
    }
  }catch{}
}

function replaceAssistant(userText,assistant){
  if(!assistant)return;
  const current=assistant.textContent||'';
  const next=isOwnerQuestion(userText)?OWNER_REPLY:isModelQuestion(userText)?MODEL_REPLY:current;
  if(next!==current)assistant.textContent=next;
}

function repairVisibleMessages(){
  document.querySelectorAll('.pro-msg-wrap.user').forEach(userWrap=>{
    const userText=userWrap.querySelector('.pro-msg.user')?.textContent||'';
    replaceAssistant(userText,userWrap.nextElementSibling?.querySelector?.('.pro-msg.assistant'));
  });

  document.querySelectorAll('.ai-msg.user').forEach(user=>{
    const next=user.nextElementSibling;
    if(next?.classList?.contains('assistant'))replaceAssistant(user.textContent||'',next);
  });
}

repairStoredHistory();
repairVisibleMessages();
let queued=false;
new MutationObserver(()=>{
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;repairVisibleMessages()});
}).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();
