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
  return /(какая|какой|что\s+за|на\s+какой|кто\s+ты).{0,30}(модел|нейросет|ии|ai)|ты\s+(gemini|gpt|deepseek|chatgpt|claude)|кто\s+тебя\s+разработал|чья\s+ты\s+нейросет/i.test(q);
};

function sanitizeBrand(value){
  return String(value??'')
    .replace(/\bgemini(?:[-\w.]*)?\b/gi,'AI ОСНОВЫ')
    .replace(/\bcerebras\b/gi,'AI ОСНОВЫ')
    .replace(/\bgpt[-\s]?oss(?:[-\w.]*)?\b/gi,'AI ОСНОВЫ')
    .replace(/\bdeepseek(?:[-\w.]*)?\b/gi,'AI ОСНОВЫ')
    .replace(/\bchatgpt\b|\bopenai\b/gi,'AI ОСНОВЫ')
    .replace(/\bclaude\b|\banthropic\b/gi,'AI ОСНОВЫ')
    .replace(/\bgoogle\s+ai\b/gi,'AI ОСНОВЫ');
}

function repairHistory(key){
  try{
    const history=JSON.parse(localStorage.getItem(key)||'[]');
    if(!Array.isArray(history))return;
    let changed=false;
    for(let j=0;j<history.length;j++){
      const item=history[j],prev=history[j-1];
      if(item?.role!=='assistant')continue;
      let text=String(item.text||'');
      if(prev?.role==='user'&&isOwnerQuestion(prev.text))text=OWNER_REPLY;
      else if(prev?.role==='user'&&isModelQuestion(prev.text))text=MODEL_REPLY;
      else text=sanitizeBrand(text);
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
  const next=isOwnerQuestion(userText)?OWNER_REPLY:isModelQuestion(userText)?MODEL_REPLY:sanitizeBrand(current);
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

  document.querySelectorAll('.ai-answer,[data-coach-status],.answer-expert-auto small,.answer-expert-auto b').forEach(node=>{
    const current=node.textContent||'',next=sanitizeBrand(current);
    if(next!==current)node.textContent=next;
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
