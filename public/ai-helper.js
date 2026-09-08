(()=>{
 const $=(selector,root=document)=>root.querySelector(selector);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const request=async(path,payload)=>{
   let lastError;
   for(let attempt=0;attempt<2;attempt+=1){
     const controller=new AbortController();
     const timeout=setTimeout(()=>controller.abort(),45000);
     try{
       const response=await fetch(path,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
       let data={};try{data=await response.json();}catch{}
       if(!response.ok)throw Object.assign(new Error(data.error||`Ошибка ИИ (${response.status})`),{httpStatus:response.status});
       return data;
     }catch(error){
       lastError=error;
       if(error?.httpStatus)throw error;
       if(error?.name==='AbortError')throw new Error('ИИ не успел ответить. Попробуй ещё раз.');
       if(attempt===0){await sleep(700);continue;}
     }finally{clearTimeout(timeout);}
   }
   console.warn('AI request failed',lastError);
   throw new Error(navigator.onLine?'Не удалось связаться с ИИ. Повтори запрос через несколько секунд.':'Нет подключения к интернету. Проверь сеть и попробуй снова.');
 };
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
     try{const data=await request('/api/ai/explain',{sessionId});panel.innerHTML=`<div class="ai-panel-head"><b>✦ Разбор ИИ</b><span>${data.remaining} запросов осталось сегодня</span></div><div class="ai-answer">${esc(data.answer)}</div>`;}catch(error){panel.innerHTML='<b>Не удалось получить разбор</b><p>Попробуй ещё раз чуть позже.</p>';}finally{button.disabled=false;button.textContent='✦ Объяснить с ИИ';}
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
     try{const data=await request('/api/ai/tutor',{message});loading.classList.remove('loading');loading.textContent=data.answer;const meta=document.createElement('small');meta.className='ai-msg-meta';meta.textContent=`Осталось AI-запросов сегодня: ${data.remaining}`;loading.appendChild(meta);}catch(error){loading.remove();showToast('Не удалось получить ответ. Попробуй ещё раз чуть позже.');}finally{submit.disabled=false;input.focus();chat.scrollTop=chat.scrollHeight;}
   };
 }
 function cleanup(){if(!$('.app')){$('#ai-tutor-fab')?.remove();$('#ai-tutor-modal')?.remove();}}
 function refresh(){attachExplainButton();ensureTutorButton();cleanup();}
 let scheduled=false;const observer=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});});observer.observe(document.documentElement,{childList:true,subtree:true});refresh();
})();
