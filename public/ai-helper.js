(()=>{
 const $=(selector,root=document)=>root.querySelector(selector);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
 const cleanAiText=value=>{
  let s=String(value??'').replace(/\r\n?/g,'\n').trim();
  const subDigits={'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋'};
  s=s
   .replace(/\\\[|\\\]|\\\(|\\\)/g,'')
   .replace(/\${1,2}/g,'')
   .replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\{([^{}]*)\}/g,'$1')
   .replace(/\\ce\{([^{}]*)\}/g,'$1')
   .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g,'$1/$2')
   .replace(/\\rightleftharpoons/g,'⇌')
   .replace(/\\leftrightarrow/g,'↔')
   .replace(/\\rightarrow|\\to/g,'→')
   .replace(/\\leftarrow/g,'←')
   .replace(/\\uparrow/g,'↑')
   .replace(/\\downarrow/g,'↓')
   .replace(/\\cdot|\\times/g,'·')
   .replace(/\\Delta/g,'Δ')
   .replace(/_\s*(\([^\n)]*\))/g,'$1')
   .replace(/_\{?([0-9+\-]+)\}?/g,(_,digits)=>[...digits].map(ch=>subDigits[ch]||ch).join(''))
   .replace(/\^\{?([0-9+\-]+)\}?/g,'^$1')
   .replace(/\\[a-zA-Z]+/g,'')
   .replace(/[{}]/g,'')
   .replace(/^#{1,6}\s+/gm,'')
   .replace(/\*\*([^*\n]+)\*\*/g,'$1')
   .replace(/__([^_\n]+)__/g,'$1')
   .replace(/`([^`]+)`/g,'$1')
   .replace(/^\s*[-*]\s+/gm,'• ')
   .replace(/[ \t]+\n/g,'\n')
   .replace(/\n{3,}/g,'\n\n');
  return s.trim();
 };
 const friendlyError=error=>error?.code==='AI_DAILY_LIMIT'?'Лимит запросов на сегодня закончился.':error?.code==='AI_MINUTE_LIMIT'?'Слишком много запросов подряд. Подожди немного.':error?.code==='AI_AUTH_REQUIRED'?'Войди в аккаунт заново.':error?.code==='AI_OFFLINE'?'Нет подключения к интернету. Проверь сеть.':'Не удалось получить ответ. Попробуй ещё раз чуть позже.';
 const request=async(path,payload)=>{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),60000);try{const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),signal:controller.signal});let data={};try{data=await response.json();}catch{}if(!response.ok)throw Object.assign(new Error(data.error||`Ошибка ИИ (${response.status})`),{httpStatus:response.status,code:data.code||''});return data;}catch(error){if(error?.httpStatus)throw error;if(error?.name==='AbortError')throw Object.assign(new Error('timeout'),{code:'AI_TIMEOUT'});console.warn('AI request failed',error);throw Object.assign(new Error('network'),{code:navigator.onLine?'AI_NETWORK_ERROR':'AI_OFFLINE'});}finally{clearTimeout(timeout);}};
 const showToast=message=>{const toast=$('#toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3000);};
 const reviewActions=[['full','✦ Полный разбор'],['hint','💡 Дай подсказку'],['simplify','🧠 Объясни проще'],['why_wrong','🔎 Почему мой ответ неверный?'],['similar','📝 Дай похожее задание'],['harder','🔥 Дай сложнее'],['check_explanation','✅ Проверь моё объяснение']];
 const tutorModes=[
  ['simple','🧠 Совсем просто','Объясни предыдущую тему совсем простыми словами, как ученику, который впервые её видит. Избегай лишних терминов; если термин нужен — сразу объясни его. Дай одну бытовую или очень понятную аналогию и короткий пример.'],
  ['ege','🎓 Как на ЕГЭ','Разбери предыдущую тему именно с точки зрения ЕГЭ: что нужно знать для задания, какой алгоритм применять, какие формулировки и ловушки встречаются, и что обязательно запомнить.'],
  ['example','🧪 Дай пример','Дай один новый понятный пример по предыдущей теме и полностью объясни его по шагам. Пример должен соответствовать школьной программе и формату ЕГЭ.'],
  ['check','✅ Проверь меня','Проверь моё объяснение предыдущей темы. Сначала назови, что я понял правильно, затем укажи неточности и чего не хватает, после этого дай короткий улучшенный вариант.'],
  ['quiz','🎯 Спроси меня','Проверь меня по предыдущей теме: задай ОДИН вопрос уровня ЕГЭ без ответа и без подсказки. Дождись моего ответа, а уже следующим сообщением оцени его и объясни ошибки.']
 ];
 const TUTOR_HISTORY_KEY='osnova-ai-tutor-history-v1';
 const MAX_TUTOR_HISTORY=24;
 const loadTutorHistory=()=>{try{const raw=JSON.parse(localStorage.getItem(TUTOR_HISTORY_KEY)||'[]');if(!Array.isArray(raw))return[];return raw.filter(item=>(item?.role==='user'||item?.role==='assistant')&&typeof item?.text==='string'&&item.text.trim()).map(item=>({role:item.role,text:item.text.trim().slice(0,5000)})).slice(-MAX_TUTOR_HISTORY);}catch{return[];}};
 const saveTutorHistory=history=>{try{localStorage.setItem(TUTOR_HISTORY_KEY,JSON.stringify(history.slice(-MAX_TUTOR_HISTORY)));}catch{}};
 const buildTutorRequestMessage=(message,history)=>{
  const current=String(message||'').trim();
  if(!current||!Array.isArray(history)||!history.length||current.length>1500)return current;
  const header='Контекст предыдущего диалога по биологии/химии ЕГЭ. Учитывай его, чтобы понять продолжение вопроса:\n';
  const footer=`\n\nТекущая реплика ученика: ${current}`;
  const budget=Math.max(0,1950-header.length-footer.length);
  const lines=[];let used=0;
  for(let i=history.length-1;i>=0;i--){
   const item=history[i];
   if(!item?.text)continue;
   const label=item.role==='assistant'?'Репетитор':'Ученик';
   const text=String(item.text).replace(/\s+/g,' ').trim().slice(0,420);
   const line=`${label}: ${text}`;
   if(used+line.length+1>budget)break;
   lines.unshift(line);used+=line.length+1;
   if(lines.length>=8)break;
  }
  return lines.length?`${header}${lines.join('\n')}${footer}`:current;
 };

 function addReviewResult(panel,data,label){const history=$('.ai-review-history',panel);const card=document.createElement('article');card.className='ai-review-response';card.innerHTML=`<div class="ai-panel-head"><b>${esc(label||data.title||'Разбор')}</b><span>${data.reviewCharged?'Разбор открыт · ':''}осталось ${data.remaining} запросов</span></div><div class="ai-answer">${esc(cleanAiText(data.answer))}</div>`;history.prepend(card);}
 async function runReviewAction(panel,action,studentText=''){if(panel.dataset.busy==='1')return;const sessionId=Number(sessionStorage.trainingSession);if(!sessionId)return showToast('Не удалось определить тренировку');panel.dataset.busy='1';panel.querySelectorAll('button').forEach(b=>b.disabled=true);const loading=document.createElement('div');loading.className='ai-review-loading';loading.textContent='ИИ разбирает именно это задание…';$('.ai-review-history',panel).prepend(loading);try{const data=await request('/api/ai/action',{sessionId,action,studentText});loading.remove();const label=reviewActions.find(x=>x[0]===action)?.[1]?.replace(/^[^\p{L}]+/u,'')||data.title;addReviewResult(panel,data,label);if(action==='check_explanation'){const area=$('.ai-review-composer',panel);area.hidden=true;$('textarea',area).value='';}}catch(error){loading.remove();showToast(friendlyError(error));}finally{panel.dataset.busy='0';panel.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 function attachMistakeReview(){const card=$('.training .question-card');const result=card?.querySelector('.result.wrong');if(!card||!result||!$('#next-question',card)||$('.ai-review-tools',card))return;const panel=document.createElement('section');panel.className='ai-review-tools';panel.innerHTML=`<div class="ai-review-head"><div><span>ОСНОВА · AI</span><h3>Разобрать ошибку с ИИ</h3><p>Подсказка, объяснение, похожее задание и проверка твоего понимания.</p></div><small>Один разбор = 1 запрос на ${20} минут</small></div><div class="ai-review-buttons">${reviewActions.map(([action,label])=>`<button type="button" class="ai-review-btn" data-ai-action="${action}">${label}</button>`).join('')}</div><div class="ai-review-composer" hidden><textarea maxlength="2000" rows="4" placeholder="Объясни своими словами, почему правильный ответ именно такой…"></textarea><div><button type="button" class="btn" data-ai-check>Проверить объяснение</button><button type="button" class="btn ghost" data-ai-cancel>Отмена</button></div></div><div class="ai-review-history"></div>`;result.insertAdjacentElement('afterend',panel);panel.querySelectorAll('[data-ai-action]').forEach(button=>button.onclick=()=>{const action=button.dataset.aiAction;if(action==='check_explanation'){const composer=$('.ai-review-composer',panel);composer.hidden=false;$('textarea',composer).focus();return;}runReviewAction(panel,action);});$('[data-ai-check]',panel).onclick=()=>{const text=$('textarea',panel).value.trim();if(text.length<3)return showToast('Сначала напиши своё объяснение');runReviewAction(panel,'check_explanation',text);};$('[data-ai-cancel]',panel).onclick=()=>{$('.ai-review-composer',panel).hidden=true;};}
 function attachExplainButton(){const card=$('.training .question-card');const result=card?.querySelector('.result');const actions=card?.querySelector('.actions');if(!card||!result||result.classList.contains('wrong')||!actions||!$('#next-question',card)||$('#ai-explain-btn',card))return;const button=document.createElement('button');button.id='ai-explain-btn';button.className='btn ghost ai-explain-btn';button.type='button';button.textContent='✦ Объяснить с ИИ';actions.prepend(button);button.onclick=async()=>{const sessionId=Number(sessionStorage.trainingSession);if(!sessionId)return showToast('Не удалось определить тренировку');button.disabled=true;button.textContent='✦ ИИ разбирает…';let panel=$('.ai-explanation',card);if(!panel){panel=document.createElement('section');panel.className='ai-explanation';result.insertAdjacentElement('afterend',panel);}panel.innerHTML='<b>ИИ-репетитор</b><p class="ai-loading">Разбираю именно это задание…</p>';try{const data=await request('/api/ai/explain',{sessionId});panel.innerHTML=`<div class="ai-panel-head"><b>✦ Разбор ИИ</b><span>Осталось запросов на сайте сегодня: ${data.remaining}</span></div><div class="ai-answer">${esc(cleanAiText(data.answer))}</div>`;}catch(error){panel.remove();showToast(friendlyError(error));}finally{button.disabled=false;button.textContent='✦ Объяснить с ИИ';}};}
 function ensureTutorButton(){if(!$('.app')||$('#ai-tutor-fab'))return;const button=document.createElement('button');button.id='ai-tutor-fab';button.className='ai-tutor-fab';button.type='button';button.setAttribute('aria-label','Открыть ИИ-репетитора');button.innerHTML='<span>✦</span><b>ИИ-репетитор</b>';document.body.appendChild(button);button.onclick=openTutor;}
 function openTutor(){
  if($('#ai-tutor-modal'))return;
  const wrap=document.createElement('div');wrap.id='ai-tutor-modal';wrap.className='ai-tutor-modal';wrap.innerHTML=`<section class="ai-tutor-card" role="dialog" aria-modal="true" aria-labelledby="ai-tutor-title"><div class="ai-tutor-head"><div><span>ОСНОВА · AI</span><h2 id="ai-tutor-title">ИИ-репетитор</h2></div><button class="icon-btn" id="ai-tutor-close" aria-label="Закрыть">×</button></div><div class="ai-tutor-chat" id="ai-tutor-chat"></div><form id="ai-tutor-form"><div class="ai-tutor-modes" aria-label="Быстрые режимы ИИ">${tutorModes.map(([mode,label])=>`<button type="button" class="ai-tutor-mode" data-tutor-mode="${mode}">${label}</button>`).join('')}</div><textarea id="ai-tutor-input" maxlength="2000" rows="3" placeholder="Например: объясни, как отличать окислитель от восстановителя" required></textarea><div class="ai-tutor-actions"><small>Чат сохраняется на этом устройстве. ИИ может ошибаться — важные ответы сверяй с теорией сайта.</small><button class="btn" type="submit">Отправить</button></div></form></section>`;
  document.body.appendChild(wrap);
  const form=$('#ai-tutor-form',wrap),input=$('#ai-tutor-input',wrap),chat=$('#ai-tutor-chat',wrap),submit=$('button[type=submit]',form),modeButtons=[...wrap.querySelectorAll('[data-tutor-mode]')];
  let tutorHistory=loadTutorHistory();
  let busy=false;
  const renderMessage=(role,text)=>{const node=document.createElement('div');node.className=`ai-msg ${role}`;node.textContent=text;chat.appendChild(node);return node;};
  const setBusy=value=>{busy=value;submit.disabled=value;modeButtons.forEach(button=>button.disabled=value);};
  if(tutorHistory.length){tutorHistory.forEach(item=>renderMessage(item.role,item.text));}
  else renderMessage('assistant','Спроси меня по биологии или химии ЕГЭ. После ответа можешь использовать быстрые режимы: объяснить проще, разобрать как на ЕГЭ, получить пример или проверить себя.');
  chat.scrollTop=chat.scrollHeight;
  const close=()=>wrap.remove();
  $('#ai-tutor-close',wrap).onclick=close;wrap.onclick=e=>{if(e.target===wrap)close();};
  const sendTutorMessage=async(message,{displayMessage=message,clearInput=true}={})=>{
   if(busy)return;
   const requestMessage=String(message||'').trim(),visibleMessage=String(displayMessage||'').trim();
   if(!requestMessage||!visibleMessage)return;
   const previous=tutorHistory.slice();
   renderMessage('user',visibleMessage);tutorHistory.push({role:'user',text:visibleMessage});tutorHistory=tutorHistory.slice(-MAX_TUTOR_HISTORY);saveTutorHistory(tutorHistory);
   if(clearInput)input.value='';setBusy(true);
   const loading=document.createElement('div');loading.className='ai-msg assistant loading';loading.textContent='Думаю…';chat.appendChild(loading);chat.scrollTop=chat.scrollHeight;
   try{
    const data=await request('/api/ai/tutor',{message:buildTutorRequestMessage(requestMessage,previous)});
    const answer=cleanAiText(data.answer);
    loading.classList.remove('loading');loading.textContent=answer;
    tutorHistory.push({role:'assistant',text:answer});tutorHistory=tutorHistory.slice(-MAX_TUTOR_HISTORY);saveTutorHistory(tutorHistory);
    const meta=document.createElement('small');meta.className='ai-msg-meta';meta.textContent=`Осталось запросов на сайте сегодня: ${data.remaining}`;loading.appendChild(meta);
   }catch(error){
    loading.remove();tutorHistory=previous;saveTutorHistory(tutorHistory);if(clearInput&&!input.value.trim())input.value=visibleMessage;showToast(friendlyError(error));
   }finally{setBusy(false);input.focus();chat.scrollTop=chat.scrollHeight;}
  };
  modeButtons.forEach(button=>button.onclick=()=>{
   const mode=tutorModes.find(item=>item[0]===button.dataset.tutorMode);if(!mode)return;
   const [,label,instruction]=mode;
   const typed=input.value.trim();
   const hasTopic=tutorHistory.some(item=>item.role==='user');
   if(button.dataset.tutorMode==='check'){
    if(!typed){showToast('Напиши в поле, как ты понял тему, и нажми «Проверь меня»');input.focus();return;}
    return sendTutorMessage(`${instruction}\n\nОбъяснение ученика: ${typed}`,{displayMessage:`${label}: ${typed}`});
   }
   if(!hasTopic&&!typed){showToast('Сначала напиши тему или вопрос');input.focus();return;}
   if(typed)return sendTutorMessage(`${instruction}\n\nТема или уточнение ученика: ${typed}`,{displayMessage:`${label}: ${typed}`});
   return sendTutorMessage(instruction,{displayMessage:label});
  });
  input.focus();
  form.onsubmit=e=>{e.preventDefault();const message=input.value.trim();if(message)sendTutorMessage(message);};
 }
 function cleanup(){if(!$('.app')){$('#ai-tutor-fab')?.remove();$('#ai-tutor-modal')?.remove();}}
 function refresh(){attachMistakeReview();attachExplainButton();ensureTutorButton();cleanup();}
 let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});});observer.observe(document.documentElement,{childList:true,subtree:true});refresh();
})();