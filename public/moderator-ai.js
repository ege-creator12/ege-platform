(()=>{
'use strict';

const AI_TAB='moderator-ai';
let statusCache=null,statusAt=0,pendingTarget=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const labels={subjects:'Предмет',sections:'Раздел',topics:'Тема',lessons:'Урок',questions:'Задание'};

const style=document.createElement('style');
style.textContent=`
.mod-ai-wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,.42fr);gap:16px;align-items:start}
.mod-ai-card{padding:22px}.mod-ai-title{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.mod-ai-title h2{margin:4px 0 5px}.mod-ai-badge{border:1px solid rgba(113,255,174,.24);background:rgba(51,214,120,.08);padding:8px 11px;border-radius:12px;font-size:12px}.mod-ai-actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:15px 0}.mod-ai-mode{padding:11px 10px;border:1px solid rgba(154,255,197,.16);border-radius:12px;background:rgba(3,28,18,.66);color:inherit;text-align:left;cursor:pointer}.mod-ai-mode.active{border-color:#56ec98;background:rgba(45,216,116,.16);box-shadow:0 0 0 1px rgba(86,236,152,.12) inset}.mod-ai-mode b{display:block;font-size:13px;margin-bottom:3px}.mod-ai-mode span{display:block;font-size:11px;opacity:.65}.mod-ai-textarea{width:100%;min-height:160px;resize:vertical}.mod-ai-source{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid rgba(154,255,197,.14);border-radius:12px;padding:11px 12px;margin-bottom:12px;background:rgba(7,31,22,.55)}.mod-ai-source small{display:block;opacity:.62;margin-top:2px}.mod-ai-result{white-space:pre-wrap;line-height:1.62;font-size:14px;margin-top:14px;border-top:1px solid rgba(255,255,255,.08);padding-top:17px}.mod-ai-side h3{margin-top:0}.mod-ai-side ul{padding-left:18px;line-height:1.65;opacity:.82}.mod-ai-tip{font-size:12px;opacity:.62;line-height:1.5}.mod-ai-row{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:13px}.mod-ai-target-link{margin-left:7px!important}.mod-ai-loading{opacity:.7}.mod-ai-copy{display:none}.mod-ai-copy.show{display:inline-flex}@media(max-width:900px){.mod-ai-wrap{grid-template-columns:1fr}.mod-ai-actions{grid-template-columns:1fr 1fr}}
`;
document.head.appendChild(style);

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
    const tabs=document.querySelector('.admin-tabs');
    if(!tabs||tabs.querySelector(`[data-admin-tab="${AI_TAB}"]`))return;
    const btn=document.createElement('button');
    btn.type='button';btn.dataset.adminTab=AI_TAB;btn.textContent='AI-помощник';
    if(typeof adminTab!=='undefined'&&adminTab===AI_TAB)btn.classList.add('active');
    btn.onclick=()=>{adminTab=AI_TAB;window.admin?.()};
    tabs.appendChild(btn);
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

const modes=[
  ['audit','Проверить ошибки','Факты, пропуски, двусмысленности'],
  ['improve','Улучшить текст','Точнее и понятнее для ученика'],
  ['ege','Проверить для ЕГЭ','Что важно, лишнее и чего не хватает'],
  ['question','Проверить задание','Условие, ответ и объяснение'],
  ['explanation','Сделать разбор','Готовое объяснение по шагам'],
  ['variants','Создать варианты','3 новых задания по той же идее'],
];

async function requestAi(payload){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);
  try{
    const r=await fetch('/api/moderator-ai',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Не удалось получить ответ AI');return d;
  }finally{clearTimeout(timer)}
}

async function renderAi(){
  const s=await status();
  if(!s.moderator&&!s.admin){adminTab='overview';return window.admin?.()}
  let selected='audit';
  const target=pendingTarget;
  adminFrame(`<div class="mod-ai-wrap"><section class="card mod-ai-card"><div class="mod-ai-title"><div><div class="eyebrow">ОСНОВА · AI</div><h2>Помощник модератора</h2><p class="subtitle">Проверяет и улучшает контент. Ничего на сайте сам не изменяет.</p></div><span class="mod-ai-badge">только контент</span></div>${target?`<div class="mod-ai-source"><div><b>${esc(labels[target.type]||'Материал')}: ${esc(target.title||('#'+target.id))}</b><small>Источник с сайта · ID ${target.id}</small></div><button type="button" class="link" id="mod-ai-clear">Убрать</button></div>`:''}<div class="mod-ai-actions">${modes.map(([id,title,sub],i)=>`<button type="button" class="mod-ai-mode ${i===0?'active':''}" data-mod-ai-mode="${id}"><b>${title}</b><span>${sub}</span></button>`).join('')}</div><div class="field"><label>ЧТО НУЖНО СДЕЛАТЬ / ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ</label><textarea id="mod-ai-input" class="mod-ai-textarea" maxlength="12000" placeholder="Например: проверь, достаточно ли этого для линии 23 ЕГЭ, и укажи, что добавить."></textarea></div><div class="mod-ai-row"><small id="mod-ai-state" class="subtitle">${target?'Материал с сайта уже прикреплён.':'Можно вставить сюда теорию или задание вручную.'}</small><div class="actions"><button type="button" class="btn ghost mod-ai-copy" id="mod-ai-copy">Копировать ответ</button><button type="button" class="btn" id="mod-ai-send">Проверить с AI</button></div></div><div id="mod-ai-result" class="mod-ai-result" hidden></div></section><aside class="card mod-ai-card mod-ai-side"><h3>Что умеет</h3><ul><li>искать фактические и методические ошибки;</li><li>улучшать теорию без лишней воды;</li><li>проверять задания, ответы и объяснения;</li><li>оценивать, что важно именно для ЕГЭ;</li><li>делать разборы и похожие варианты.</li></ul><p class="mod-ai-tip">AI не публикует и не сохраняет изменения автоматически. Сначала модератор проверяет предложение, затем сам вносит правку.</p><p class="mod-ai-tip">Для требований ФИПИ, которые могли измениться, AI должен просить ручную сверку, а не придумывать актуальные данные.</p></aside></div>`,'AI-помощник модератора');
  ensureTab();
  const result=document.querySelector('#mod-ai-result'),send=document.querySelector('#mod-ai-send'),stateEl=document.querySelector('#mod-ai-state'),copy=document.querySelector('#mod-ai-copy');
  document.querySelectorAll('[data-mod-ai-mode]').forEach(btn=>btn.onclick=()=>{selected=btn.dataset.modAiMode;document.querySelectorAll('[data-mod-ai-mode]').forEach(x=>x.classList.toggle('active',x===btn))});
  const clear=document.querySelector('#mod-ai-clear');if(clear)clear.onclick=()=>{pendingTarget=null;renderAi()};
  send.onclick=async()=>{
    const message=document.querySelector('#mod-ai-input').value.trim();
    if(!target&&!message)return notify('Добавь текст или открой AI из конкретного материала');
    send.disabled=true;send.textContent='AI проверяет…';stateEl.textContent='Анализируем материал…';result.hidden=false;result.classList.add('mod-ai-loading');result.textContent='Проверяю факты, формулировки и структуру…';copy.classList.remove('show');
    try{
      const data=await requestAi({action:selected,message,targetType:target?.type||'',targetId:target?.id||null});
      result.classList.remove('mod-ai-loading');result.textContent=data.answer||'Нет ответа';copy.classList.add('show');stateEl.textContent=`Готово · осталось ${Number(data.remaining)||0} запросов сегодня`;
      copy.onclick=async()=>{try{await navigator.clipboard.writeText(result.textContent);notify('Ответ скопирован')}catch{notify('Не удалось скопировать')}};
    }catch(e){result.classList.remove('mod-ai-loading');result.textContent=`Не удалось получить ответ: ${e.name==='AbortError'?'AI отвечает слишком долго':e.message}`;stateEl.textContent='Можно повторить запрос.'}
    finally{send.disabled=false;send.textContent='Проверить с AI'}
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
