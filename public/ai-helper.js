(()=>{
 const $=(selector,root=document)=>root.querySelector(selector);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const request=async(path,payload)=>{const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});let data={};try{data=await response.json();}catch{}if(!response.ok)throw new Error(data.error||'Не удалось получить ответ ИИ');return data;};
 const showToast=message=>{const toast=$('#toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),2600);};

 function attachExplainButton(){
   const card=$('.training .question-card');
   const result=card?.querySelector('.result');
   const actions=card?.querySelector('.actions');
   if(!card||!result||!actions||!$('#next-question',card)||$('#ai-explain-btn',card))return;
   const button=document.createElement('button');button.id='ai-explain-btn';button.className='btn ghost ai-explain-btn';button.type='button';button.textContent='✦ Объяснить с ИИ';actions.prepend(button);
   button.onclick=async()=>{
     const sessionId=Number(sessionStorage.trainingSession);if(!sessionId)return showToast('Не удалось определить тренировку');
     button.disabled=true;button.textContent='✦ ИИ разбирает…';
     let panel=$('.ai-explanation',card);if(!panel){panel=document.createElement('section');panel.className='ai-explanation';result.insertAdjacentElement('afterend',panel);}panel.innerHTML='<b>ИИ-репетитор</b><p class="ai-loading">Разбираю именно это задание…</p>';
     try{const data=await request('/api/ai/explain',{sessionId});panel.innerHTML=`<div class="ai-panel-head"><b>✦ Разбор ИИ</b><span>${data.remaining} запросов осталось сегодня</span></div><div class="ai-answer">${esc(data.answer)}</div>`;}catch(error){panel.innerHTML=`<b>Не удалось получить разбор</b><p>${esc(error.message)}</p>`;}finally{button.disabled=false;button.textContent='✦ Объяснить с ИИ';}
   };
 }

 function ensureTutorButton(){
   if(!$('.app')||$('#ai-tutor-fab'))return;
   const button=document.createElement('button');button.id='ai-tutor-fab';button.className='ai-tutor-fab';button.type='button';button.setAttribute('aria-label','Открыть ИИ-репетитора');button.innerHTML='<span>✦</span><b>ИИ-репетитор</b>';document.body.appendChild(button);button.onclick=openTutor;
 }
 function openTutor(){
   if($('#ai-tutor-modal'))return;
   const wrap=document.createElement('div');wrap.id='ai-tutor-modal';wrap.className='ai-tutor-modal';wrap.innerHTML=`<section class="ai-tutor-card" role="dialog" aria-modal="true" aria-labelledby="ai-tutor-title"><div class="ai-tutor-head"><div><span>ОСНОВА · AI</span><h2 id="ai-tutor-title">ИИ-репетитор</h2></div><button class="icon-btn" id="ai-tutor-close" aria-label="Закрыть">×</button></div><div class="ai-tutor-chat" id="ai-tutor-chat"><div class="ai-msg assistant">Спроси меня по биологии или химии ЕГЭ. Могу объяснить тему, дать алгоритм или подсказать ход решения.</div></div><form id="ai-tutor-form"><textarea id="ai-tutor-input" maxlength="2000" rows="3" placeholder="Например: объясни, как отличать окислитель от восстановителя" required></textarea><div class="ai-tutor-actions"><small>ИИ может ошибаться — важные ответы сверяй с теорией сайта.</small><button class="btn" type="submit">Отправить</button></div></form></section>`;document.body.appendChild(wrap);
   const close=()=>wrap.remove();$('#ai-tutor-close',wrap).onclick=close;wrap.onclick=e=>{if(e.target===wrap)close();};
   const form=$('#ai-tutor-form',wrap),input=$('#ai-tutor-input',wrap),chat=$('#ai-tutor-chat',wrap),submit=$('button[type=submit]',form);input.focus();
   form.onsubmit=async e=>{e.preventDefault();const message=input.value.trim();if(!message)return;const user=document.createElement('div');user.className='ai-msg user';user.textContent=message;chat.appendChild(user);input.value='';submit.disabled=true;const loading=document.createElement('div');loading.className='ai-msg assistant loading';loading.textContent='Думаю…';chat.appendChild(loading);chat.scrollTop=chat.scrollHeight;
     try{const data=await request('/api/ai/tutor',{message});loading.classList.remove('loading');loading.textContent=data.answer;const meta=document.createElement('small');meta.className='ai-msg-meta';meta.textContent=`Осталось AI-запросов сегодня: ${data.remaining}`;loading.appendChild(meta);}catch(error){loading.classList.remove('loading');loading.textContent=error.message;}finally{submit.disabled=false;input.focus();chat.scrollTop=chat.scrollHeight;}
   };
 }
 function cleanup(){if(!$('.app')){$('#ai-tutor-fab')?.remove();$('#ai-tutor-modal')?.remove();}}
 function refresh(){attachExplainButton();ensureTutorButton();cleanup();}
 let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});});observer.observe(document.documentElement,{childList:true,subtree:true});refresh();
})();
