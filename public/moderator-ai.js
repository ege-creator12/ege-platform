(()=>{
'use strict';

const AI_TAB='moderator-ai';
const CHAT_LIMIT=40;
const CHAT_PREFIX='osnova:moderator-ai-chat:v2:';
const DRAFT_PREFIX='osnova:moderator-ai-draft:v2:';
let statusCache=null,statusAt=0,pendingTarget=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
const labels={subjects:'Предмет',sections:'Раздел',topics:'Тема',lessons:'Урок',questions:'Задание'};
const modes=[
  ['audit','Проверить ошибки','Факты, пропуски, двусмысленности'],
  ['improve','Улучшить текст','Точнее и понятнее для ученика'],
  ['ege','Проверить для ЕГЭ','Что важно, лишнее и чего не хватает'],
  ['question','Проверить задание','Условие, ответ и объяснение'],
  ['explanation','Сделать разбор','Готовое объяснение по шагам'],
  ['variants','Создать варианты','3 новых задания по той же идее'],
];

const style=document.createElement('style');
style.textContent=`
.mod-ai-wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.42fr);gap:16px;align-items:start}
.mod-ai-card{padding:22px}.mod-ai-title{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.mod-ai-title h2{margin:4px 0 5px}.mod-ai-badge{border:1px solid rgba(113,255,174,.24);background:rgba(51,214,120,.08);padding:8px 11px;border-radius:12px;font-size:12px}.mod-ai-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:15px 0}.mod-ai-mode{padding:11px 10px;border:1px solid rgba(154,255,197,.16);border-radius:12px;background:rgba(3,28,18,.66);color:inherit;text-align:left;cursor:pointer}.mod-ai-mode.active{border-color:#56ec98;background:rgba(45,216,116,.16);box-shadow:0 0 0 1px rgba(86,236,152,.12) inset}.mod-ai-mode b{display:block;font-size:13px;margin-bottom:3px}.mod-ai-mode span{display:block;font-size:11px;opacity:.65}.mod-ai-textarea{width:100%;min-height:120px;resize:vertical}.mod-ai-source{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(154,255,197,.14);border-radius:12px;padding:11px 12px;margin-bottom:12px;background:rgba(7,31,22,.55)}.mod-ai-source small{display:block;opacity:.62;margin-top:2px}.mod-ai-side h3{margin-top:0}.mod-ai-side ul{padding-left:18px;line-height:1.65;opacity:.82}.mod-ai-tip{font-size:12px;opacity:.62;line-height:1.5}.mod-ai-row{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:13px}.mod-ai-target-link{margin-left:7px!important}.mod-ai-chat-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:4px 0 10px}.mod-ai-chat-head h3{margin:0;font-size:15px}.mod-ai-chat{display:flex;flex-direction:column;gap:10px;max-height:390px;overflow:auto;padding:2px 2px 12px;scrollbar-width:thin}.mod-ai-msg{max-width:92%;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:11px 12px;line-height:1.55;white-space:pre-wrap;font-size:13px}.mod-ai-msg.user{align-self:flex-end;background:rgba(255,255,255,.065)}.mod-ai-msg.assistant{align-self:flex-start;background:rgba(71,220,134,.08);border-color:rgba(91,231,151,.16)}.mod-ai-msg small{display:block;opacity:.5;font-size:10px;margin-bottom:5px}.mod-ai-msg.loading{opacity:.62}.mod-ai-empty{padding:16px 12px;border:1px dashed rgba(255,255,255,.09);border-radius:13px;opacity:.55;font-size:12px;text-align:center}.mod-ai-clear-chat{font-size:12px}.mod-ai-copy-last{display:none}.mod-ai-copy-last.show{display:inline-flex}@media(max-width:900px){.mod-ai-wrap{grid-template-columns:1fr}.mod-ai-actions{grid-template-columns:1fr 1fr}.mod-ai-chat{max-height:320px}}
`;
document.head.appendChild(style);

const userId=()=>Number(typeof state!=='undefined'&&state.user?.id)||0;
const chatKey=()=>CHAT_PREFIX+(userId()||'anon');
const draftKey=()=>DRAFT_PREFIX+(userId()||'anon');
function loadChat(){
  try{const x=JSON.parse(localStorage.getItem(chatKey())||'[]');return Array.isArray(x)?x.slice(-CHAT_LIMIT):[]}catch{return[]}
}
function saveChat(items){try{localStorage.setItem(chatKey(),JSON.stringify(items.slice(-CHAT_LIMIT)))}catch{}}
function loadDraft(){try{return JSON.parse(localStorage.getItem(draftKey())||'{}')||{}}catch{return{}}}
function saveDraft(value){try{localStorage.setItem(draftKey(),JSON.stringify(value||{}))}catch{}}
function clearSavedChat(){try{localStorage.removeItem(chatKey());localStorage.removeItem(draftKey())}catch{}}
function modeLabel(id){return modes.find(x=>x[0]===id)?.[1]||'AI'}

async function status(force=false){
  if(!force&&statusCache&&Date.now()-statusAt<30000)return statusCache;
  try{
    const r=await fetch('/api/moderator/status',{credentials:'same-origin',cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    statusCache={moderator:Boolean(d.moderator),admin:Boolean(d.admin)};
  }catch{statusCache={moderator:false,admin:typeof state!=='undefined'&&state.user?.role==='admin'}}
  statusAt=Date.now();return statusCache;
}

function ensureTab(){
  status().then(s=>{
    if(!s.moderator&&!s.admin)return;
    if(window.OsnovaModeratorToolTabs?.sync)return window.OsnovaModeratorToolTabs.sync();
    const tabs=document.querySelector('.admin-tabs');
    if(!tabs)return;
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
      ai.onclick=()=>{pendingTarget={type:btn.dataset.editKind,id:Number(btn.dataset.editId),title:row.querySelector('td')?.innerText?.split('\n')[0]||''};adminTab=AI_TAB;window.admin?.()};
      btn.insertAdjacentElement('afterend',ai);
    });
    document.querySelectorAll('[data-edit-question]').forEach(btn=>{
      const row=btn.closest('tr');if(!row||row.querySelector('[data-mod-ai-question]'))return;
      const ai=document.createElement('button');ai.type='button';ai.className='link mod-ai-target-link';ai.dataset.modAiQuestion='1';ai.textContent='AI';
      ai.onclick=()=>{pendingTarget={type:'questions',id:Number(btn.dataset.editQuestion),title:row.querySelector('td')?.innerText?.slice(0,80)||''};adminTab=AI_TAB;window.admin?.()};
      btn.insertAdjacentElement('afterend',ai);
    });
  }).catch(()=>{});
}

async function requestAi(payload){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
  try{
    const r=await fetch('/api/moderator-ai',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Не удалось получить ответ AI');return d;
  }finally{clearTimeout(timer)}
}

function chatHtml(items){
  if(!items.length)return '<div class="mod-ai-empty">История пока пустая. Первый ответ сохранится автоматически.</div>';
  return items.map(x=>`<div class="mod-ai-msg ${x.role==='assistant'?'assistant':'user'}"><small>${x.role==='assistant'?'AI-помощник':esc(modeLabel(x.mode))}${x.targetTitle?' · '+esc(x.targetTitle):''}</small>${esc(x.text||'')}</div>`).join('');
}
function renderChat(items){
  const host=document.querySelector('#mod-ai-chat');if(!host)return;host.innerHTML=chatHtml(items);host.scrollTop=host.scrollHeight;
  const copy=document.querySelector('#mod-ai-copy-last');const last=[...items].reverse().find(x=>x.role==='assistant');
  if(copy)copy.classList.toggle('show',Boolean(last));
}

async function renderAi(){
  const s=await status();
  if(!s.moderator&&!s.admin){adminTab='overview';return window.admin?.()}
  const draft=loadDraft();
  let selected=modes.some(x=>x[0]===draft.mode)?draft.mode:'audit';
  let history=loadChat();
  const target=pendingTarget;
  adminFrame(`<div class="mod-ai-wrap"><section class="card mod-ai-card"><div class="mod-ai-title"><div><div class="eyebrow">ОСНОВА · AI</div><h2>Помощник модератора</h2><p class="subtitle">Проверяет и улучшает контент. История чата сохраняется на этом аккаунте.</p></div><span class="mod-ai-badge">только контент</span></div>${target?`<div class="mod-ai-source"><div><b>${esc(labels[target.type]||'Материал')}: ${esc(target.title||('#'+target.id))}</b><small>Источник с сайта · ID ${target.id}</small></div><button type="button" class="link" id="mod-ai-clear">Убрать</button></div>`:''}<div class="mod-ai-chat-head"><h3>Чат</h3><button type="button" class="link mod-ai-clear-chat" id="mod-ai-clear-chat">Очистить чат</button></div><div id="mod-ai-chat" class="mod-ai-chat">${chatHtml(history)}</div><div class="mod-ai-actions">${modes.map(([id,title,sub])=>`<button type="button" class="mod-ai-mode ${selected===id?'active':''}" data-mod-ai-mode="${id}"><b>${title}</b><span>${sub}</span></button>`).join('')}</div><div class="field"><label>СООБЩЕНИЕ / ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ</label><textarea id="mod-ai-input" class="mod-ai-textarea" maxlength="12000" placeholder="Например: проверь, достаточно ли этого для линии 23 ЕГЭ, и укажи, что добавить.">${esc(draft.text||'')}</textarea></div><div class="mod-ai-row"><small id="mod-ai-state" class="subtitle">${target?'Материал с сайта прикреплён.':'История сохраняется даже после перезагрузки страницы.'}</small><div class="actions"><button type="button" class="btn ghost mod-ai-copy-last" id="mod-ai-copy-last">Копировать последний ответ</button><button type="button" class="btn" id="mod-ai-send">Отправить AI</button></div></div></section><aside class="card mod-ai-card mod-ai-side"><h3>Что умеет</h3><ul><li>искать фактические и методические ошибки;</li><li>улучшать теорию без лишней воды;</li><li>проверять задания, ответы и объяснения;</li><li>оценивать, что важно именно для ЕГЭ;</li><li>делать разборы и похожие варианты.</li></ul><p class="mod-ai-tip">AI не публикует и не сохраняет изменения автоматически. Сначала модератор проверяет предложение, затем сам вносит правку.</p><p class="mod-ai-tip">Последние сообщения чата передаются AI как контекст, поэтому можно продолжать разговор с прошлого ответа.</p></aside></div>`,'AI-помощник модератора');
  ensureTab();window.OsnovaModeratorToolTabs?.sync?.();
  const send=document.querySelector('#mod-ai-send'),stateEl=document.querySelector('#mod-ai-state'),input=document.querySelector('#mod-ai-input'),copy=document.querySelector('#mod-ai-copy-last');
  renderChat(history);
  input.oninput=()=>saveDraft({mode:selected,text:input.value});
  document.querySelectorAll('[data-mod-ai-mode]').forEach(btn=>btn.onclick=()=>{selected=btn.dataset.modAiMode;document.querySelectorAll('[data-mod-ai-mode]').forEach(x=>x.classList.toggle('active',x===btn));saveDraft({mode:selected,text:input.value})});
  const clear=document.querySelector('#mod-ai-clear');if(clear)clear.onclick=()=>{pendingTarget=null;renderAi()};
  document.querySelector('#mod-ai-clear-chat').onclick=()=>{if(!history.length||confirm('Очистить историю AI-помощника?')){history=[];clearSavedChat();input.value='';selected='audit';renderAi()}};
  copy.onclick=async()=>{const last=[...history].reverse().find(x=>x.role==='assistant');if(!last)return;try{await navigator.clipboard.writeText(last.text);notify('Ответ скопирован')}catch{notify('Не удалось скопировать')}};
  send.onclick=async()=>{
    const message=input.value.trim();
    if(!target&&!message)return notify('Добавь текст или открой AI из конкретного материала');
    const userMessage=message||`Проверь прикреплённый материал: ${target?.title||'#'+target?.id}`;
    const context=history.slice(-8).map(x=>({role:x.role,text:x.text}));
    history.push({role:'user',text:userMessage,mode:selected,targetTitle:target?.title||'',ts:Date.now()});history=history.slice(-CHAT_LIMIT);saveChat(history);renderChat(history);
    send.disabled=true;send.textContent='AI отвечает…';stateEl.textContent='Анализируем материал…';input.value='';saveDraft({mode:selected,text:''});
    const host=document.querySelector('#mod-ai-chat');if(host){const loading=document.createElement('div');loading.className='mod-ai-msg assistant loading';loading.id='mod-ai-loading';loading.innerHTML='<small>AI-помощник</small>Проверяю материал…';host.appendChild(loading);host.scrollTop=host.scrollHeight}
    try{
      const data=await requestAi({action:selected,message,targetType:target?.type||'',targetId:target?.id||null,history:context});
      document.querySelector('#mod-ai-loading')?.remove();
      history.push({role:'assistant',text:data.answer||'Нет ответа',mode:selected,targetTitle:target?.title||'',ts:Date.now()});history=history.slice(-CHAT_LIMIT);saveChat(history);renderChat(history);stateEl.textContent=`Готово · осталось ${Number(data.remaining)||0} запросов сегодня`;
    }catch(e){document.querySelector('#mod-ai-loading')?.remove();stateEl.textContent=e.name==='AbortError'?'AI отвечает слишком долго. Можно повторить.':(e.message||'Не удалось получить ответ');toast?.(stateEl.textContent)}
    finally{send.disabled=false;send.textContent='Отправить AI'}
  };
}

const previousAdmin=window.admin;
window.admin=async function(){
  if(typeof adminTab!=='undefined'&&adminTab===AI_TAB)return renderAi();
  const out=await previousAdmin?.();
  queueMicrotask(()=>{ensureTab();enhanceRows()});
  return out;
};

const observer=new MutationObserver(()=>{const admin=document.querySelector('.admin-console');if(!admin)return;ensureTab();enhanceRows()});
const root=document.querySelector('#app');if(root)observer.observe(root,{childList:true,subtree:true});
setTimeout(()=>{ensureTab();enhanceRows()},700);
})();