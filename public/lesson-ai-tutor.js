(()=>{
'use strict';

const ROOT_ID='lesson-ai-tutor';
const MAX_HISTORY=12;
const MAX_CONTEXT=1050;
const MAX_SELECTION=520;

const $=(selector,root=document)=>root.querySelector(selector);
const lessonId=()=>{const match=location.hash.match(/^#lesson\/(\d+)/);return match?Number(match[1]):0;};
const clean=value=>String(value??'')
  .replace(/\r\n?/g,'\n')
  .replace(/^#{1,6}\s+/gm,'')
  .replace(/\*\*([^*\n]+)\*\*/g,'$1')
  .replace(/__([^_\n]+)__/g,'$1')
  .replace(/`([^`]+)`/g,'$1')
  .replace(/\${1,2}/g,'')
  .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}/g,'$1')
  .replace(/\\ce\{([^{}]*)\}/g,'$1')
  .replace(/\\rightarrow|\\to/g,'→')
  .replace(/\\rightleftharpoons/g,'⇌')
  .replace(/\\[a-zA-Z]+/g,'')
  .replace(/[{}]/g,'')
  .replace(/\n{3,}/g,'\n\n')
  .trim();

function subjectLabel(){
  const page=$('main[data-page]')?.dataset.page||'';
  if(page==='chemistry')return 'химии';
  if(page==='biology')return 'биологии';
  const text=($('.breadcrumbs')?.innerText||'').toLowerCase();
  return text.includes('хими')?'химии':'биологии';
}

function contextOf(card){
  const title=$('h1',card)?.textContent?.trim()||'урок';
  const summary=$(':scope > .subtitle',card)?.textContent?.trim()||'';
  const content=$('.lesson-content',card)?.innerText?.replace(/\s+/g,' ').trim()||'';
  const compact=[summary,content].filter(Boolean).join(' ');
  return {title,subject:subjectLabel(),text:compact.slice(0,MAX_CONTEXT)};
}

function historyKey(id){return `osnova-lesson-ai-v1-${id}`;}
function loadHistory(id){
  try{
    const value=JSON.parse(sessionStorage.getItem(historyKey(id))||'[]');
    if(!Array.isArray(value))return[];
    return value.filter(x=>(x?.role==='user'||x?.role==='assistant')&&typeof x?.text==='string')
      .map(x=>({role:x.role,text:x.text.slice(0,4500)})).slice(-MAX_HISTORY);
  }catch{return[];}
}
function saveHistory(id,history){
  try{sessionStorage.setItem(historyKey(id),JSON.stringify(history.slice(-MAX_HISTORY)));}catch{}
}

function friendlyError(error){
  if(error?.code==='AI_DAILY_LIMIT')return 'Лимит ИИ на сегодня закончился.';
  if(error?.code==='AI_MINUTE_LIMIT')return 'Слишком много запросов подряд. Подожди немного.';
  if(error?.code==='AI_AUTH_REQUIRED')return 'Нужно снова войти в аккаунт.';
  if(error?.code==='AI_TIMEOUT')return 'ИИ отвечает дольше обычного. Попробуй ещё раз.';
  return 'Не удалось получить ответ. Попробуй ещё раз.';
}

async function ask(message){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),60000);
  try{
    const response=await fetch('/api/ai/tutor',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({message:message.slice(0,1950)}),signal:controller.signal,
    });
    let data={};
    try{data=await response.json();}catch{}
    if(!response.ok)throw Object.assign(new Error(data.error||'AI error'),{code:data.code||'',status:response.status});
    return data;
  }catch(error){
    if(error?.name==='AbortError')throw Object.assign(new Error('timeout'),{code:'AI_TIMEOUT'});
    throw error;
  }finally{clearTimeout(timer);}
}

function lastAssistant(history){
  for(let i=history.length-1;i>=0;i--)if(history[i].role==='assistant')return history[i].text;
  return'';
}

function buildPrompt(ctx,mode,userText,selection,history){
  const modeText={
    simple:'Объясни материал этого урока максимально просто. Сохрани точность, но разложи всё по шагам и дай одну понятную аналогию.',
    ege:'Выдели, что из этого урока обязательно знать для ЕГЭ: ключевые факты, алгоритм решения, типичные ловушки и что стоит запомнить.',
    example:'Дай один новый пример по теме этого урока и подробно разберись с ним по шагам. Не повторяй пример из урока дословно.',
    quiz:'Задай мне ОДИН вопрос по теме этого урока уровня ЕГЭ. Не давай ответ и подсказку — дождись моего ответа.',
    selection:'Объясни простыми словами именно выделенный фрагмент. Раскрой причинно-следственную связь и, если полезно, приведи короткий пример.',
    chat:'Ответь на вопрос ученика только в контексте этого урока. Если вопрос продолжает предыдущий диалог, учитывай последний ответ репетитора.'
  }[mode]||'';
  const parts=[
    `Вопрос по уроку ${ctx.subject} ЕГЭ «${ctx.title}».`,
    `Контекст урока: ${ctx.text}`,
    modeText,
  ];
  if(selection)parts.push(`Выделенный фрагмент: «${selection.slice(0,MAX_SELECTION)}»`);
  const previous=lastAssistant(history);
  if(mode==='chat'&&previous)parts.push(`Последний ответ репетитора: ${previous.replace(/\s+/g,' ').slice(0,360)}`);
  if(userText)parts.push(`Сообщение ученика: ${String(userText).trim().slice(0,650)}`);
  return parts.join('\n\n').slice(0,1950);
}

function renderMessage(chat,role,text){
  const item=document.createElement('div');
  item.className=`lesson-ai-msg ${role}`;
  item.textContent=clean(text);
  chat.appendChild(item);
  chat.scrollTop=chat.scrollHeight;
  return item;
}

function selectedInside(content){
  const selection=window.getSelection?.();
  if(!selection||selection.isCollapsed||!selection.rangeCount)return'';
  const text=selection.toString().replace(/\s+/g,' ').trim();
  if(text.length<4)return'';
  const range=selection.getRangeAt(0);
  const node=range.commonAncestorContainer.nodeType===1?range.commonAncestorContainer:range.commonAncestorContainer.parentElement;
  if(!node||!content.contains(node))return'';
  return text.slice(0,MAX_SELECTION);
}

function mount(){
  const id=lessonId();
  const card=$('.card.lesson');
  if(!id||!card||document.getElementById(ROOT_ID))return;

  const ctx=contextOf(card);
  const panel=document.createElement('section');
  panel.id=ROOT_ID;
  panel.className='lesson-ai-tutor';
  panel.innerHTML=`
    <div class="lesson-ai-head">
      <div class="lesson-ai-brand"><span class="lesson-ai-spark">✦</span><div><span>ОСНОВА · AI</span><h2>AI-репетитор по этому уроку</h2><p>Я уже вижу тему урока. Спроси непонятное или выбери быстрый режим.</p></div></div>
      <span class="lesson-ai-status">контекст урока подключён</span>
    </div>
    <div class="lesson-ai-quick" aria-label="Быстрые действия AI-репетитора">
      <button type="button" data-lesson-ai-mode="simple">🧠 Объясни проще</button>
      <button type="button" data-lesson-ai-mode="ege">🎓 Что важно на ЕГЭ</button>
      <button type="button" data-lesson-ai-mode="example">🧪 Дай пример</button>
      <button type="button" data-lesson-ai-mode="quiz">🎯 Спроси меня</button>
      <button type="button" class="lesson-ai-selection-btn" data-lesson-ai-mode="selection" hidden>✦ Объясни выделенное</button>
    </div>
    <div class="lesson-ai-selection" hidden><span>Выделено в уроке:</span><b></b><button type="button" aria-label="Убрать выделение">×</button></div>
    <div class="lesson-ai-chat" aria-live="polite"></div>
    <form class="lesson-ai-form">
      <textarea rows="2" maxlength="650" placeholder="Спроси что угодно по этому уроку…" aria-label="Вопрос AI-репетитору"></textarea>
      <div class="lesson-ai-form-foot"><small>Ответ строится по теме открытого урока. ИИ может ошибаться — важные формулировки сверяй с теорией.</small><button class="btn" type="submit">Спросить →</button></div>
    </form>`;

  const toc=$('.lesson-toc',card);
  if(toc)toc.insertAdjacentElement('beforebegin',panel);
  else $('.lesson-content',card)?.insertAdjacentElement('beforebegin',panel);

  const chat=$('.lesson-ai-chat',panel);
  const form=$('.lesson-ai-form',panel);
  const input=$('textarea',form);
  const submit=$('button[type="submit"]',form);
  const quick=[...panel.querySelectorAll('[data-lesson-ai-mode]')];
  const selectionBox=$('.lesson-ai-selection',panel);
  const selectionText=$('b',selectionBox);
  const selectionButton=$('.lesson-ai-selection-btn',panel);
  const content=$('.lesson-content',card);
  let currentSelection='';
  let history=loadHistory(id);
  let busy=false;

  if(history.length)history.forEach(item=>renderMessage(chat,item.role,item.text));
  else renderMessage(chat,'assistant',`Я готов помочь с уроком «${ctx.title}». Могу объяснить сложное проще, выделить главное для ЕГЭ или проверить тебя вопросом.`);

  const remember=(role,text)=>{
    history.push({role,text:clean(text)});
    history=history.slice(-MAX_HISTORY);
    saveHistory(id,history);
  };
  const setBusy=value=>{
    busy=value;submit.disabled=value;quick.forEach(button=>button.disabled=value);
    panel.classList.toggle('is-busy',value);
  };
  const clearSelection=()=>{
    currentSelection='';selectionBox.hidden=true;selectionButton.hidden=true;
  };
  const refreshSelection=()=>{
    const text=selectedInside(content);
    if(!text)return;
    currentSelection=text;
    selectionText.textContent=text.length>150?`${text.slice(0,150)}…`:text;
    selectionBox.hidden=false;selectionButton.hidden=false;
  };
  content?.addEventListener('mouseup',()=>setTimeout(refreshSelection,0));
  content?.addEventListener('keyup',()=>setTimeout(refreshSelection,0));
  $('button',selectionBox).onclick=clearSelection;

  const run=async(mode,userText='')=>{
    if(busy)return;
    if(mode==='chat'&&userText.trim().length<2)return;
    if(mode==='selection'&&!currentSelection)return;
    const visibleUser=mode==='chat'?userText:{simple:'Объясни проще',ege:'Что важно на ЕГЭ?',example:'Дай пример',quiz:'Спроси меня',selection:'Объясни выделенный фрагмент'}[mode];
    renderMessage(chat,'user',visibleUser);
    remember('user',visibleUser);
    setBusy(true);
    const loading=renderMessage(chat,'assistant','Думаю над этим уроком…');
    loading.classList.add('loading');
    try{
      const data=await ask(buildPrompt(ctx,mode,userText,currentSelection,history.slice(0,-1)));
      loading.remove();
      const answer=clean(data.answer||'');
      renderMessage(chat,'assistant',answer);
      remember('assistant',answer);
      const status=$('.lesson-ai-status',panel);
      if(status&&Number.isFinite(Number(data.remaining)))status.textContent=`осталось ${data.remaining} AI-запросов сегодня`;
      if(mode==='selection')clearSelection();
    }catch(error){
      loading.remove();
      renderMessage(chat,'assistant',friendlyError(error));
    }finally{setBusy(false);input.focus({preventScroll:true});}
  };

  quick.forEach(button=>button.onclick=()=>run(button.dataset.lessonAiMode));
  form.onsubmit=event=>{
    event.preventDefault();
    const text=input.value.trim();
    if(text.length<2)return;
    input.value='';
    run('chat',text);
  };
  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();form.requestSubmit();}
  });
}

let scheduled=false;
function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;mount();});
}

const app=$('#app');
if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
addEventListener('hashchange',()=>setTimeout(schedule,0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
