(()=>{
  'use strict';
  if(window.__OSNOVA_HOMEWORK_BATCH_AI_V2__)return;
  window.__OSNOVA_HOMEWORK_BATCH_AI_V2__=true;

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const originalTrainingQuestion=typeof trainingQuestion==='function'?trainingQuestion:null;
  const originalTrainingSummary=typeof trainingSummary==='function'?trainingSummary:null;
  const metaCache=new Map();
  const finalizing=new Map();

  const style=document.createElement('style');
  style.textContent=`
    .homework-batch-note{margin:14px 0;padding:12px 14px;border:1px solid rgba(91,232,151,.18);border-radius:13px;background:rgba(75,210,132,.07);font-size:12px;line-height:1.5;color:var(--muted)}
    .homework-batch-note b{color:var(--text)}
    .homework-batch-checking{text-align:center;padding:34px 20px}.homework-batch-checking .loader-dot{width:42px;height:42px;margin:0 auto 14px;border-radius:50%;border:3px solid rgba(255,255,255,.12);border-top-color:#68e79d;animation:hwBatchSpin .8s linear infinite}.homework-batch-checking h1{margin:8px 0}.homework-batch-checking p{max-width:620px;margin:0 auto;color:var(--muted);line-height:1.55}
    .homework-ai-overall{margin:18px 0;padding:18px;border-radius:16px;border:1px solid rgba(93,196,137,.2);background:linear-gradient(135deg,rgba(48,137,87,.10),rgba(74,81,166,.07))}
    .homework-ai-overall h3{margin:5px 0 8px}.homework-ai-overall p{margin:0;color:var(--muted);line-height:1.55}
    .homework-ai-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:14px}.homework-ai-columns>div{padding:12px;border-radius:12px;background:rgba(255,255,255,.035)}.homework-ai-columns b{display:block;margin-bottom:7px}.homework-ai-columns ul{margin:0;padding-left:17px;color:var(--muted);font-size:12px;line-height:1.5}
    @keyframes hwBatchSpin{to{transform:rotate(360deg)}}
    @media(max-width:760px){.homework-ai-columns{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  async function request(path,options={}){
    const response=await fetch('/api'+path,{credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(data.error||'Ошибка запроса');error.status=response.status;error.code=data.code;throw error}
    return data;
  }

  async function homeworkMeta(sessionId,force=false){
    const id=Number(sessionId||0);if(!id)return {homework:false};
    const cached=metaCache.get(id);if(!force&&cached&&Date.now()-cached.at<60000)return cached.data;
    try{const data=await request(`/teacher/homework/sessions/${id}/meta`);metaCache.set(id,{at:Date.now(),data});return data}catch{return {homework:false}}
  }

  function numberValue(obj,camel,snake){return Number(obj?.[camel]??obj?.[snake]??0)}
  function dateLabel(value){if(!value)return '';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}):''}
  function normalizeAnswer(raw){return (Array.isArray(raw)?raw:raw==null?[]:[raw]).map(x=>String(x??'').trim()).filter(x=>x&&x!=='invalid')}

  function checkingScreen(){
    app.innerHTML=shell(`<div class="training"><div class="card question-card homework-batch-checking"><div class="loader-dot"></div><div class="eyebrow">ОСНОВА AI · единая проверка</div><h1>Проверяем всю домашнюю работу…</h1><p>Пустые задания тоже учитываются: они будут проверены как «ответ не дан». После одного общего AI-запроса появятся баллы и разбор.</p></div></div>`);
    bindShell();
  }

  function listBlock(title,items){
    const list=Array.isArray(items)?items.filter(Boolean):[];
    if(!list.length)return '';
    return `<div><b>${esc(title)}</b><ul>${list.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`;
  }

  function renderBatchSummary(data){
    const items=data.items||[],assignment=data.assignment||{},overall=data.overallReview||{};
    const percent=Number(data.percent||0),earned=Number(data.earnedPoints||0),maximum=Number(data.maxPoints||0);
    sessionStorage.removeItem('trainingSession');
    const aiBlock=`<section class="homework-ai-overall"><div class="eyebrow">Общий разбор ОСНОВА AI</div><h3>${esc(overall.summary||'Работа проверена целиком')}</h3><p>Проверка выполнена после завершения всей домашней работы.</p><div class="homework-ai-columns">${listBlock('Что получилось',overall.strengths)}${listBlock('Что исправить',overall.weaknesses)}${listBlock('Что делать дальше',overall.nextSteps)}</div></section>`;
    app.innerHTML=shell(`<div class="training homework-final"><div class="card question-card summary-card"><div class="eyebrow">Домашнее задание проверено</div><h1>${esc(assignment.title||'Результат работы')}</h1><p class="subtitle">${esc(assignment.teacherName||'Учитель')} · ${esc(assignment.className||'Класс')}${assignment.dueAt?' · срок '+dateLabel(assignment.dueAt):''}</p><div class="homework-final-score"><strong>${percent}%</strong><span>${earned} из ${maximum} баллов</span>${data.late?'<em>Сдано после срока</em>':'<em class="on-time">Работа завершена</em>'}</div>${aiBlock}<div class="homework-result-items">${items.map(item=>`<article class="homework-result-item"><div><b>Задание ${Number(item.position)}</b><p>${esc(String(item.prompt||'').slice(0,420))}</p></div><span class="${Number(item.score)>=Number(item.maxScore)?'full':''}">${Number(item.score)}/${Number(item.maxScore)}</span>${item.verdict?`<small><b>Разбор:</b> ${esc(item.verdict)}</small>`:''}${item.mistakes?.length?`<small><b>Ошибки:</b> ${item.mistakes.map(esc).join('; ')}</small>`:''}${item.missing?.length?`<small><b>Не хватило:</b> ${item.missing.map(esc).join('; ')}</small>`:''}</article>`).join('')}</div><div class="actions"><button class="btn" id="homework-batch-back">К домашним заданиям</button><button class="btn ghost" id="homework-batch-dashboard">На главную</button></div></div></div>`);
    bindShell();
    document.querySelector('#homework-batch-back').onclick=()=>go('homework');
    document.querySelector('#homework-batch-dashboard').onclick=()=>go('dashboard');
  }

  async function showSummary(sessionId){
    const data=await request(`/teacher/homework/sessions/${Number(sessionId)}/summary`);
    metaCache.delete(Number(sessionId));
    return renderBatchSummary(data);
  }

  async function finalizeHomework(sessionId){
    const id=Number(sessionId);if(!id)return;
    if(finalizing.has(id))return finalizing.get(id);
    const work=(async()=>{
      checkingScreen();
      try{
        const result=await request(`/teacher/homework/sessions/${id}/finalize`,{method:'POST',body:'{}'});
        if(typeof state!=='undefined'&&state.user&&!result.alreadyGraded&&Number(result.xp||0)>0)state.user.xp=Number(state.user.xp||0)+Number(result.xp||0);
        return showSummary(id);
      }catch(error){
        app.innerHTML=shell(`<div class="training"><div class="card question-card"><div class="eyebrow">Домашняя работа сохранена</div><h1>Проверка не завершилась</h1><p class="subtitle">${esc(error.message)}</p><div class="homework-batch-note"><b>Ответы не потеряны.</b> В том числе пропущенные задания. Можно повторить только общую проверку.</div><div class="actions"><button class="btn" id="homework-batch-retry">Повторить проверку</button><button class="btn ghost" id="homework-batch-later">Вернуться к домашним</button></div></div></div>`);
        bindShell();
        document.querySelector('#homework-batch-retry').onclick=()=>finalizeHomework(id);
        document.querySelector('#homework-batch-later').onclick=()=>go('homework');
      }
    })().finally(()=>finalizing.delete(id));
    finalizing.set(id,work);return work;
  }

  async function renderHomeworkQuestion(sessionId,draft=[]){
    const id=Number(sessionId);let started=Date.now();
    try{
      const d=await request(`/training/sessions/${id}/next`);
      if(d.done)return finalizeHomework(id);
      const q=d.question||{};q.options=d.options;
      const answered=numberValue(d.session,'answeredCount','answered_count');
      const total=Math.max(1,numberValue(d.session,'targetQuestions','target_questions'));
      const progress=Math.round(answered/total*100);
      const extended=Boolean(q.manualReview||q.questionType==='extended_answer'||q.question_type==='extended_answer');
      const typeLabel=extended?'Развёрнутый ответ':({single:'Один ответ',multiple:'Несколько ответов',text:'Краткий ответ',sequence:'Последовательность',matching:'Соответствие'})[q.type]||'Ответ';
      const controls=QuestionControls.render(q,draft,'training');
      app.innerHTML=shell(`<div class="training"><div class="train-top"><button class="back" data-exit>← К домашним заданиям</button><span class="pill">${answered+1} из ${total}</span></div>${typeof pct==='function'?pct(progress):''}<div class="card question-card"><div class="q-meta"><span class="pill">${esc(typeLabel)}</span><span class="pill">${esc(q.topic||'Биология')}</span></div><div class="homework-secure-badge"><b>Домашняя работа</b><span>Ответы проверятся только после завершения всей работы.</span></div>${q.instruction?`<p class="question-instruction">${esc(q.instruction)}</p>`:''}<h2>${esc(q.prompt||'')}</h2>${controls}<div class="homework-batch-note"><b>Можно пропустить:</b> если ответа нет, просто нажмите «Далее». Такое задание попадёт в общую проверку как неотвеченное.</div><div class="actions training-actions"><button class="btn" id="homework-batch-submit">Далее →</button></div></div></div>`);
      bindShell();
      document.querySelector('[data-exit]').onclick=()=>go('homework');
      document.querySelectorAll('.option').forEach(x=>x.onclick=()=>setTimeout(()=>x.classList.toggle('selected',x.querySelector('input')?.checked),0));
      document.querySelector('#homework-batch-submit').onclick=async()=>{
        const button=document.querySelector('#homework-batch-submit');
        const raw=QuestionControls.read(document.querySelector('.question-card'),q);
        const answer=normalizeAnswer(raw);
        button.disabled=true;button.textContent='Далее…';
        try{
          const result=await request(`/teacher/homework/sessions/${id}/save`,{method:'POST',body:JSON.stringify({questionId:q.id,answer,duration:Math.round((Date.now()-started)/1000)})});
          if(result.done)return finalizeHomework(id);
          return renderHomeworkQuestion(id);
        }catch(error){
          if(error.status===409&&/сохранён/i.test(error.message))return renderHomeworkQuestion(id);
          notify(error.message);button.disabled=false;button.textContent='Далее →';
        }
      };
    }catch(error){
      notify(error.message);
      go('homework');
    }
  }

  if(originalTrainingQuestion){
    trainingQuestion=async function(sessionId,draft=[]){
      const meta=await homeworkMeta(sessionId);
      if(!meta.homework)return originalTrainingQuestion(sessionId,draft);
      return renderHomeworkQuestion(sessionId,draft);
    };
  }

  if(originalTrainingSummary){
    trainingSummary=async function(session){
      const sessionId=Number(session?.id||0);if(!sessionId)return originalTrainingSummary(session);
      const meta=await homeworkMeta(sessionId,true);
      if(!meta.homework)return originalTrainingSummary(session);
      try{return await showSummary(sessionId)}catch{return finalizeHomework(sessionId)}
    };
  }

  function patchTeacherCopy(){
    document.querySelectorAll('.homework-check-note').forEach(note=>{
      note.innerHTML='<b>Проверяет ОСНОВА AI:</b> ответы не оцениваются по одному. После последнего задания вся домашняя работа проверяется одним AI-запросом; пропущенные задания учитываются как «ответ не дан».';
    });
  }
  let queued=false;const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;patchTeacherCopy()})};
  const root=document.querySelector('#app');if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
  addEventListener('hashchange',schedule);setTimeout(schedule,300);
})();
