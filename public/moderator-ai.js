(()=>{
'use strict';

const AI_TAB='moderator-ai';
const CHAT_LIMIT=40;
const CHAT_PREFIX='osnova:moderator-ai-chat:v2:';
const DRAFT_PREFIX='osnova:moderator-ai-draft:v2:';
let statusCache=null,statusAt=0,pendingTarget=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const labels={subjects:'Предмет',sections:'Раздел',topics:'Тема',lessons:'Урок',questions:'Задание'};
const modes=[
  ['chat','Обычный чат','Любые рабочие вопросы по платформе'],
  ['audit','Проверить ошибки','Факты, пропуски и двусмысленности'],
  ['improve','Улучшить текст','Сделать точнее и понятнее'],
  ['ege','Проверить для ЕГЭ','Что важно, лишнее и чего не хватает'],
  ['question','Проверить задание','Условие, ответ и объяснение'],
  ['explanation','Сделать разбор','Готовое объяснение по шагам'],
  ['variants','Создать варианты','Похожие задания по той же идее'],
];

const style=document.createElement('style');
style.textContent=`
.mod-ai-shell{max-width:1040px;margin:0 auto}.mod-ai-card{padding:0;overflow:hidden;background:linear-gradient(180deg,rgba(5,25,17,.94),rgba(4,18,13,.9));border-color:rgba(126,245,177,.16)}
.mod-ai-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:20px 22px 15px;border-bottom:1px solid rgba(255,255,255,.07)}.mod-ai-head h2{margin:4px 0 5px;font-size:21px}.mod-ai-head p{margin:0;opacity:.65}.mod-ai-badge{flex:0 0 auto;border:1px solid rgba(95,239,158,.24);background:rgba(50,210,118,.09);padding:7px 10px;border-radius:999px;font-size:11px;color:#d8ffea}
.mod-ai-source{margin:14px 18px 0;display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(154,255,197,.14);border-radius:13px;padding:11px 12px;background:rgba(71,220,134,.055)}.mod-ai-source small{display:block;opacity:.58;margin-top:2px}
.mod-ai-chat-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px 8px}.mod-ai-chat-toolbar span{font-size:12px;opacity:.55}.mod-ai-clear-chat{font-size:12px}
.mod-ai-chat{display:flex;flex-direction:column;gap:11px;min-height:330px;max-height:500px;overflow:auto;padding:12px 20px 18px;scrollbar-width:thin;scrollbar-color:rgba(102,230,157,.25) transparent}.mod-ai-msg{max-width:min(82%,760px);border:1px solid rgba(255,255,255,.08);border-radius:17px;padding:12px 14px;line-height:1.58;font-size:13.5px;overflow-wrap:anywhere}.mod-ai-msg.user{align-self:flex-end;background:linear-gradient(135deg,rgba(87,225,148,.16),rgba(66,181,120,.08));border-color:rgba(107,235,163,.18)}.mod-ai-msg.assistant{align-self:flex-start;background:rgba(255,255,255,.045);border-color:rgba(255,255,255,.075)}.mod-ai-msg small{display:block;opacity:.46;font-size:10px;margin-bottom:6px}.mod-ai-msg strong{color:#effff5;font-weight:800}.mod-ai-msg code{padding:2px 5px;border-radius:6px;background:rgba(255,255,255,.08);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em}.mod-ai-msg.loading{opacity:.64}.mod-ai-empty{margin:auto;max-width:520px;padding:28px 16px;text-align:center;opacity:.56;line-height:1.6}
.mod-ai-tools{border-top:1px solid rgba(255,255,255,.07);padding:13px 18px 0}.mod-ai-tools-label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;opacity:.44;margin:0 2px 8px}.mod-ai-actions{display:flex;gap:7px;overflow-x:auto;padding:0 1px 11px;scrollbar-width:none}.mod-ai-actions::-webkit-scrollbar{display:none}.mod-ai-mode{flex:0 0 auto;border:1px solid rgba(154,255,197,.13);border-radius:999px;background:rgba(255,255,255,.035);color:inherit;padding:8px 11px;cursor:pointer;font:inherit;font-size:11.5px;white-space:nowrap;transition:.15s ease}.mod-ai-mode:hover{background:rgba(82,225,144,.09);border-color:rgba(114,242,170,.25)}.mod-ai-mode.active{border-color:rgba(86,236,152,.55);background:rgba(45,216,116,.17);color:#eefff5;box-shadow:0 0 0 1px rgba(86,236,152,.07) inset}
.mod-ai-compose{padding:10px 18px 18px}.mod-ai-compose-box{border:1px solid rgba(149,255,196,.14);border-radius:17px;background:rgba(0,0,0,.16);padding:10px 11px 10px;transition:.15s ease}.mod-ai-compose-box:focus-within{border-color:rgba(91,239,158,.38);box-shadow:0 0 0 3px rgba(67,220,132,.055)}.mod-ai-textarea{width:100%;min-height:74px;max-height:180px;resize:vertical;background:transparent!important;border:0!important;padding:4px 3px!important;outline:none!important;color:inherit;font:inherit;line-height:1.55}.mod-ai-compose-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px}.mod-ai-compose-foot small{opacity:.5;font-size:10.5px}.mod-ai-buttons{display:flex;gap:8px;align-items:center}.mod-ai-copy-last{display:none}.mod-ai-copy-last.show{display:inline-flex}.mod-ai-target-link{margin-left:7px!important}
@media(max-width:760px){.mod-ai-head{padding:17px 16px 13px}.mod-ai-head p{font-size:12px}.mod-ai-badge{display:none}.mod-ai-source{margin:12px 12px 0}.mod-ai-chat-toolbar{padding:12px 14px 6px}.mod-ai-chat{min-height:300px;max-height:48vh;padding:10px 12px 14px}.mod-ai-msg{max-width:92%;font-size:13px}.mod-ai-tools{padding:11px 12px 0}.mod-ai-compose{padding:9px 12px 14px}.mod-ai-compose-foot{align-items:flex-end}.mod-ai-compose-foot small{max-width:165px}.mod-ai-copy-last{display:none!important}}
`;
document.head.appendChild(style);

const userId=()=>Number(typeof state!=='undefined'&&state.user?.id)||0;
const chatKey=()=>CHAT_PREFIX+(userId()||'anon');
const draftKey=()=>DRAFT_PREFIX+(userId()||'anon');
function loadChat(){try{const x=JSON.parse(localStorage.getItem(chatKey())||'[]');return Array.isArray(x)?x.slice(-CHAT_LIMIT):[]}catch{return[]}}
function saveChat(items){try{localStorage.setItem(chatKey(),JSON.stringify(items.slice(-CHAT_LIMIT)))}catch{}}
function loadDraft(){try{return JSON.parse(localStorage.getItem(draftKey())||'{}')||{}}catch{return{}}}
function saveDraft(value){try{localStorage.setItem(draftKey(),JSON.stringify(value||{}))}catch{}}
function clearSavedChat(){try{localStorage.removeItem(chatKey());localStorage.removeItem(draftKey())}catch{}}
function modeLabel(id){return modes.find(x=>x[0]===id)?.[1]||'Сообщение'}
function say(message){if(typeof notify==='function')notify(message)}
function formatAi(text){
  let s=esc(text||'');
  s=s.replace(/^#{1,3}\s+(.+)$/gm,'<strong>$1</strong>');
  s=s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
  s=s.replace(/^[-•]\s+(.+)$/gm,'• $1');
  return s.replace(/\n/g,'<br>');
}

async function status(force=false){
  if(!force&&statusCache&&Date.now()-statusAt<30000)return statusCache;
  try{const r=await fetch('/api/moderator/status',{credentials:'same-origin',cache:'no-store'});const d=await r.json().catch(()=>({}));statusCache={moderator:Boolean(d.moderator),admin:Boolean(d.admin)}}
  catch{statusCache={moderator:false,admin:typeof state!=='undefined'&&state.user?.role==='admin'}}
  statusAt=Date.now();return statusCache;
}

function ensureTab(){
  status().then(s=>{
    if(!s.moderator&&!s.admin)return;
    if(window.OsnovaModeratorToolTabs?.sync)return window.OsnovaModeratorToolTabs.sync();
    const tabs=document.querySelector('.admin-tabs');if(!tabs)return;
    let btn=tabs.querySelector(`[data-admin-tab="${AI_TAB}"]`);
    if(!btn){btn=document.createElement('button');btn.type='button';btn.dataset.adminTab=AI_TAB;btn.textContent='AI-помощник';btn.onclick=()=>{adminTab=AI_TAB;window.admin?.()}}
    const journal=tabs.querySelector('[data-admin-tab="problem-journal"]');
    if(journal&&btn.nextElementSibling!==journal)tabs.insertBefore(btn,journal);else if(!btn.parentNode)tabs.appendChild(btn);
    btn.classList.toggle('active',typeof adminTab!=='undefined'&&adminTab===AI_TAB);
  }).catch(()=>{});
}

function enhanceRows(){
  status().then(s=>{
    if(!s.moderator&&!s.admin)return;
    document.querySelectorAll('[data-edit-kind]').forEach(btn=>{
      const row=btn.closest('tr');if(!row||row.querySelector('[data-mod-ai-source]'))return;
      const ai=document.createElement('button');ai.type='button';ai.className='link mod-ai-target-link';ai.dataset.modAiSource='1';ai.textContent='AI';
      ai.onclick=()=>{pendingTarget={type:btn.dataset.editKind,id:Number(btn.dataset.editId),title:row.querySelector('td')?.innerText?.split('\n')[0]||''};adminTab=AI_TAB;window.admin?.()};btn.insertAdjacentElement('afterend',ai);
    });
    document.querySelectorAll('[data-edit-question]').forEach(btn=>{
      const row=btn.closest('tr');if(!row||row.querySelector('[data-mod-ai-question]'))return;
      const ai=document.createElement('button');ai.type='button';ai.className='link mod-ai-target-link';ai.dataset.modAiQuestion='1';ai.textContent='AI';
      ai.onclick=()=>{pendingTarget={type:'questions',id:Number(btn.dataset.editQuestion),title:row.querySelector('td')?.innerText?.slice(0,80)||''};adminTab=AI_TAB;window.admin?.()};btn.insertAdjacentElement('afterend',ai);
    });
  }).catch(()=>{});
}

async function requestAi(payload){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  try{const r=await fetch('/api/moderator-ai',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),signal:controller.signal});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Не удалось получить ответ AI');return d}
  finally{clearTimeout(timer)}
}

function chatHtml(items){
  if(!items.length)return '<div class="mod-ai-empty"><b>Рабочий чат модератора</b><br><br>Можно спросить про контент, задания, структуру курса, найденную ошибку, формулировку, оформление или то, как лучше организовать работу с платформой.</div>';
  return items.map(x=>`<div class="mod-ai-msg ${x.role==='assistant'?'assistant':'user'}"><small>${x.role==='assistant'?'AI-помощник':esc(modeLabel(x.mode))}${x.targetTitle?' · '+esc(x.targetTitle):''}</small>${x.role==='assistant'?formatAi(x.text):esc(x.text||'')}</div>`).join('');
}
function renderChat(items){const host=document.querySelector('#mod-ai-chat');if(!host)return;host.innerHTML=chatHtml(items);host.scrollTop=host.scrollHeight;const copy=document.querySelector('#mod-ai-copy-last'),last=[...items].reverse().find(x=>x.role==='assistant');if(copy)copy.classList.toggle('show',Boolean(last))}

async function renderAi(){
  const s=await status();if(!s.moderator&&!s.admin){adminTab='overview';return window.admin?.()}
  const draft=loadDraft();let selected=pendingTarget?'audit':(modes.some(x=>x[0]===draft.mode)?draft.mode:'chat');let history=loadChat();const target=pendingTarget;
  adminFrame(`<div class="mod-ai-shell"><section class="card mod-ai-card"><div class="mod-ai-head"><div><div class="eyebrow">ОСНОВА · РАБОЧИЙ AI</div><h2>Помощник модератора</h2><p>Нормальный рабочий чат: помогает с контентом и задачами по платформе, но не имеет доступа к пользователям и системным настройкам.</p></div><span class="mod-ai-badge">отдельный лимит AI</span></div>${target?`<div class="mod-ai-source"><div><b>${esc(labels[target.type]||'Материал')}: ${esc(target.title||('#'+target.id))}</b><small>Материал прикреплён с сайта · ID ${target.id}</small></div><button type="button" class="link" id="mod-ai-clear">Убрать</button></div>`:''}<div class="mod-ai-chat-toolbar"><span>История сохраняется на этом устройстве</span><button type="button" class="link mod-ai-clear-chat" id="mod-ai-clear-chat">Очистить чат</button></div><div id="mod-ai-chat" class="mod-ai-chat">${chatHtml(history)}</div><div class="mod-ai-tools"><div class="mod-ai-tools-label">Режим ответа</div><div class="mod-ai-actions">${modes.map(([id,title])=>`<button type="button" class="mod-ai-mode ${selected===id?'active':''}" data-mod-ai-mode="${id}">${title}</button>`).join('')}</div></div><div class="mod-ai-compose"><div class="mod-ai-compose-box"><textarea id="mod-ai-input" class="mod-ai-textarea" maxlength="12000" placeholder="Напиши, что нужно сделать…">${esc(draft.text||'')}</textarea><div class="mod-ai-compose-foot"><small id="mod-ai-state">${target?'Прикреплён материал с сайта.':'Enter — новая строка · Ctrl+Enter — отправить'}</small><div class="mod-ai-buttons"><button type="button" class="btn ghost mod-ai-copy-last" id="mod-ai-copy-last">Копировать ответ</button><button type="button" class="btn" id="mod-ai-send">Отправить</button></div></div></div></div></section></div>`,'AI-помощник модератора');
  ensureTab();window.OsnovaModeratorToolTabs?.sync?.();
  const send=document.querySelector('#mod-ai-send'),stateEl=document.querySelector('#mod-ai-state'),input=document.querySelector('#mod-ai-input'),copy=document.querySelector('#mod-ai-copy-last');renderChat(history);
  input.oninput=()=>saveDraft({mode:selected,text:input.value});
  input.onkeydown=e=>{if(e.ctrlKey&&e.key==='Enter'){e.preventDefault();send.click()}};
  document.querySelectorAll('[data-mod-ai-mode]').forEach(btn=>btn.onclick=()=>{selected=btn.dataset.modAiMode;document.querySelectorAll('[data-mod-ai-mode]').forEach(x=>x.classList.toggle('active',x===btn));saveDraft({mode:selected,text:input.value})});
  const clear=document.querySelector('#mod-ai-clear');if(clear)clear.onclick=()=>{pendingTarget=null;renderAi()};
  document.querySelector('#mod-ai-clear-chat').onclick=()=>{if(!history.length||confirm('Очистить историю AI-помощника?')){history=[];clearSavedChat();input.value='';selected='chat';renderAi()}};
  copy.onclick=async()=>{const last=[...history].reverse().find(x=>x.role==='assistant');if(!last)return;try{await navigator.clipboard.writeText(last.text);say('Ответ скопирован')}catch{say('Не удалось скопировать')}};
  send.onclick=async()=>{
    const message=input.value.trim();if(!target&&!message)return say('Напиши сообщение');
    const userMessage=message||`Проверь прикреплённый материал: ${target?.title||'#'+target?.id}`;const context=history.slice(-8).map(x=>({role:x.role,text:x.text}));
    history.push({role:'user',text:userMessage,mode:selected,targetTitle:target?.title||'',ts:Date.now()});history=history.slice(-CHAT_LIMIT);saveChat(history);renderChat(history);
    send.disabled=true;send.textContent='Отправляем…';stateEl.textContent='AI думает…';input.value='';saveDraft({mode:selected,text:''});
    const host=document.querySelector('#mod-ai-chat');if(host){const loading=document.createElement('div');loading.className='mod-ai-msg assistant loading';loading.id='mod-ai-loading';loading.innerHTML='<small>AI-помощник</small>Думаю…';host.appendChild(loading);host.scrollTop=host.scrollHeight}
    try{const data=await requestAi({action:selected,message,targetType:target?.type||'',targetId:target?.id||null,history:context});document.querySelector('#mod-ai-loading')?.remove();history.push({role:'assistant',text:data.answer||'Нет ответа',mode:selected,targetTitle:target?.title||'',ts:Date.now()});history=history.slice(-CHAT_LIMIT);saveChat(history);renderChat(history);stateEl.textContent=`Готово · осталось ${Number(data.remaining)||0} запросов сегодня`}
    catch(e){document.querySelector('#mod-ai-loading')?.remove();stateEl.textContent=e.name==='AbortError'?'AI отвечает слишком долго. Попробуй ещё раз.':(e.message||'Не удалось получить ответ');say(stateEl.textContent)}
    finally{send.disabled=false;send.textContent='Отправить'}
  };
}

const previousAdmin=window.admin;
window.admin=async function(){if(typeof adminTab!=='undefined'&&adminTab===AI_TAB)return renderAi();const out=await previousAdmin?.();queueMicrotask(()=>{ensureTab();enhanceRows()});return out};
const observer=new MutationObserver(()=>{const admin=document.querySelector('.admin-console');if(!admin)return;ensureTab();enhanceRows()});
const root=document.querySelector('#app');if(root)observer.observe(root,{childList:true,subtree:true});
setTimeout(()=>{ensureTab();enhanceRows()},700);
})();