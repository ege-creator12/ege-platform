(()=>{
'use strict';

const OWNER_REPLY='Владелец и создатель платформы ОСНОВА — Великий Саид.';
const CHAT_PREFIX='osnova-pro-coach-v3:';
const isOwnerQuestion=value=>{
  const q=String(value||'').toLowerCase().replace(/ё/g,'е');
  return /(кто\s+.*(владел|создат|сделал|создал)|владелец|владелец\s+сайта|создатель|создатель\s+сайта|кому\s+принадлеж|чей\s+(сайт|проект|платформ)|кто\s+стоит\s+за)/i.test(q);
};
const responsePayload=()=>({text:OWNER_REPLY,subjectSlug:null,source:'owner-identity',aiAvailable:true,actions:[]});

function parseBody(body){
  if(!body)return{};
  if(typeof body==='string'){try{return JSON.parse(body)}catch{return{}}}
  return body&&typeof body==='object'?body:{};
}

function patchOsnovaData(){
  const data=window.OsnovaData;
  if(!data||typeof data.request!=='function'||data.request.__ownerIdentityPatched)return false;
  const original=data.request.bind(data);
  const wrapped=async(path,opts={})=>{
    const body=parseBody(opts?.body);
    if(String(path||'').includes('/api/ai-pro/coach')&&String(opts?.method||'GET').toUpperCase()==='POST'&&isOwnerQuestion(body.message)){
      return responsePayload();
    }
    return original(path,opts);
  };
  wrapped.__ownerIdentityPatched=true;
  data.request=wrapped;
  return true;
}

const originalFetch=window.fetch.bind(window);
window.fetch=async(input,init={})=>{
  const url=typeof input==='string'?input:String(input?.url||'');
  const body=parseBody(init?.body);
  if(/\/api\/ai-pro\/coach(?:\?|$)/.test(url)&&String(init?.method||'GET').toUpperCase()==='POST'&&isOwnerQuestion(body.message)){
    return new Response(JSON.stringify(responsePayload()),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }
  return originalFetch(input,init);
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
        if(item?.role!=='assistant')continue;
        const prev=history[j-1];
        if(prev?.role==='user'&&isOwnerQuestion(prev.text)){
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
    if(assistant)assistant.textContent=OWNER_REPLY;
  });
}

repairStoredHistory();
patchOsnovaData();
let attempts=0;
const timer=setInterval(()=>{patchOsnovaData();repairVisibleMessages();if(++attempts>40)clearInterval(timer)},250);
new MutationObserver(repairVisibleMessages).observe(document.documentElement,{childList:true,subtree:true});
})();
