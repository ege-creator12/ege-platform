(() => {
  const mockApi=async(path,opts={})=>{
    const response=await fetch('/api'+path,{headers:{'content-type':'application/json'},...opts});
    const text=await response.text();let data={};
    try{data=text?JSON.parse(text):{}}catch{throw new Error('Сервер пробника временно вернул некорректный ответ')}
    if(!response.ok)throw new Error(data.error||`Ошибка ${response.status}`);
    return data;
  };
  const parseMaybe=(value,fallback={})=>{try{return value==null?fallback:typeof value==='string'?JSON.parse(value):value}catch{return fallback}};
  const answerText=value=>{
    const v=value?.examAnswer??value;
    if(Array.isArray(v))return v.join(', ');
    if(v&&typeof v==='object')return Object.values(v).filter(Boolean).join(', ');
    return String(v??'');
  };
  const clock=s=>{s=Math.max(0,Number(s)||0);return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};
  const routeId=()=>Number(state.route.split('/').pop());

  const style=document.createElement('style');
  style.textContent=`
    .chem-mock-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:22px 0 30px}.chem-mock-card{display:flex;flex-direction:column;gap:12px;min-height:245px}.chem-mock-card .variant-number{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:var(--accent,#176a4b);color:#fff;font-weight:800}.chem-mock-tags{display:flex;gap:8px;flex-wrap:wrap}.chem-mock-card .actions{margin-top:auto}.chem-mock-source{font-size:13px;opacity:.72;line-height:1.55}.chem-mock-palette{display:grid;grid-template-columns:repeat(5,minmax(38px,1fr));gap:7px;align-content:start}.chem-mock-palette button{min-height:38px;border:1px solid var(--line,#dfe4df);border-radius:9px;background:var(--card,#fff);color:inherit;cursor:pointer}.chem-mock-palette button.current{outline:2px solid var(--accent,#176a4b)}.chem-mock-palette button.answered{background:rgba(23,106,75,.12)}.chem-mock-palette button.flagged{box-shadow:inset 0 -3px 0 #b07b12}.chem-mock-help{margin:12px 0;padding:16px;border:1px solid rgba(23,106,75,.2);border-radius:14px;background:rgba(23,106,75,.07)}.chem-mock-help.good{background:rgba(23,106,75,.11)}.chem-mock-help.bad{background:rgba(170,57,57,.08);border-color:rgba(170,57,57,.22)}.chem-mock-help ul,.chem-mock-help ol{padding-left:20px}.chem-mock-result details summary{display:flex;justify-content:space-between;gap:12px;cursor:pointer}.chem-mock-result details{margin-bottom:10px}.chem-self-score{width:80px;margin-left:8px}.chem-mock-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.chem-mock-actions .btn{flex:0 0 auto}
    @media(max-width:900px){.chem-mock-grid{grid-template-columns:1fr}.mock-layout{grid-template-columns:1fr!important}.chem-mock-palette{grid-template-columns:repeat(9,minmax(32px,1fr));order:2}.chem-mock-actions .btn{flex:1 1 140px}}
    @media(max-width:520px){.chem-mock-palette{grid-template-columns:repeat(6,minmax(32px,1fr))}}
  `;
  document.head.appendChild(style);

  const baseSubject=subject;
  subject=async function(slug){
    await baseSubject(slug);
    if(slug!=='chemistry')return;
    const actions=document.querySelector('.chem-actions');
    if(actions&&!actions.querySelector('[data-chem-mocks]')){
      const b=document.createElement('button');b.type='button';b.className='btn ghost';b.dataset.chemMocks='1';b.textContent='◷ Пробники ЕГЭ';b.onclick=()=>go('chemistry/mocks');actions.appendChild(b);
    }
  };

  const reviewHtml=review=>{
    if(!review)return'';
    const expected=answerText(review.reviewAnswer)||answerText(review.answer);
    return `${expected?`<p><b>${review.extended?'Эталон / ориентир':'Правильный ответ'}:</b> ${esc(expected)}</p>`:''}${review.explanation?`<p><b>Объяснение:</b> ${esc(review.explanation)}</p>`:''}${review.solutionSteps?.length?`<ol>${review.solutionSteps.map(x=>`<li>${esc(typeof x==='string'?x:(x.text||x.description||''))}</li>`).join('')}</ol>`:''}${review.scoringPoints?.length?`<p><b>Критерии:</b></p><ul>${review.scoringPoints.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}`;
  };

  async function chemistryMocks(){
    loading();
    try{
      const d=await mockApi('/subjects/chemistry/mock-exams');
      const variants=[1,2,3].map(n=>({n,title:`Вариант ${n}`,text:n===1?'Сбалансированный полный вариант по всем 34 линиям.':n===2?'Новый набор условий по всем разделам и расчётам.':'Третий независимый полный вариант с развёрнутой частью.'}));
      app.innerHTML=shell(`<div class="course-page"><nav class="breadcrumbs"><button data-nav="chemistry">Химия</button><span>›</span><span>Пробники</span></nav><header><div class="eyebrow">Химия · ЕГЭ-2027</div><h1>Полные пробники ЕГЭ</h1><p class="subtitle">34 задания · 56 первичных баллов · 210 минут в режиме с таймером. Задания авторские и собраны по структуре проекта КИМ ФИПИ.</p></header>${d.activeAttempt?`<aside class="quick-continue"><div><span class="eyebrow">Незавершённый пробник</span><b>Вариант ${d.activeAttempt.variant||1}</b><small>Ответы сохранены автоматически</small></div><button class="btn" data-chem-exam="${d.activeAttempt.id}">Продолжить</button></aside>`:''}<div class="chem-mock-grid">${variants.map(v=>`<article class="card chem-mock-card"><div class="variant-number">${v.n}</div><div class="chem-mock-tags"><span class="pill">34 задания</span><span class="pill">56 баллов</span></div><h2>${v.title}</h2><p class="subtitle">${v.text}</p><div class="actions"><button class="btn" data-chem-variant="${v.n}" data-mode="untimed">Без таймера</button><button class="btn ghost" data-chem-variant="${v.n}" data-mode="timed">210 минут</button></div></article>`).join('')}</div><p class="chem-mock-source">${esc(d.config.sourceLabel)}</p><div class="section-head"><h2>История</h2></div><div class="card">${d.attempts.length?d.attempts.map(a=>`<button class="mock-row" data-${a.status==='in_progress'?'chem-exam':'chem-result'}="${a.id}"><span>${new Date(a.started_at).toLocaleDateString('ru-RU')} · вариант ${a.variant||1} · ${a.mode==='timed'?'210 минут':'без таймера'}</span><b>${a.status==='in_progress'?'Продолжить':`${a.primary_score_total??a.auto_primary_score??0} / ${a.primary_score_max}`}</b></button>`).join(''):'<div class="empty">История пока пуста</div>'}</div></div>`);
      bindShell();
      document.querySelectorAll('[data-chem-variant]').forEach(x=>x.onclick=()=>startChemMock(x.dataset.mode,!!d.activeAttempt,+x.dataset.chemVariant));
      document.querySelectorAll('[data-chem-exam]').forEach(x=>x.onclick=()=>go('chemistry/mocks/exam/'+x.dataset.chemExam));
      document.querySelectorAll('[data-chem-result]').forEach(x=>x.onclick=()=>go('chemistry/mocks/result/'+x.dataset.chemResult));
    }catch(e){notify(e.message);errorState(chemistryMocks)}
  }

  async function startChemMock(mode,active,variant){
    if(active&&!confirm('Завершить текущий пробник химии и открыть новый?'))return;
    try{const d=await mockApi('/subjects/chemistry/mock-exams',{method:'POST',body:JSON.stringify({mode,variant,confirmNew:active})});go('chemistry/mocks/exam/'+d.attempt.id)}catch(e){notify(e.message)}
  }

  async function chemistryMockExam(id,pos=0){
    loading();
    try{
      const {attempt:a}=await mockApi('/subjects/chemistry/mock-exams/'+id);if(a.status!=='in_progress')return go('chemistry/mocks/result/'+id);
      pos=Math.max(0,Math.min(pos,a.items.length-1));const i=a.items[pos],q=i.question,draftKey=`chemistry-mock-draft:${id}:${i.id}`;let restored=false;
      try{const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(draft){i.answer=draft.answer;i.flagged=draft.flagged;restored=true}}catch{}
      app.innerHTML=shell(`<div class="mock-exam"><div class="mock-head"><button class="back" id="chem-exam-exit">← Пробники химии</button><span id="chem-save-state" role="status" aria-live="polite">Сохранено</span><b>Вариант ${a.variant||1}${a.mode==='timed'?` · <span id="chem-exam-timer">${clock(a.remainingSeconds)}</span>`:' · без таймера'}</b></div><div class="mock-layout"><aside class="card chem-mock-palette">${a.items.map((x,n)=>`<button data-chem-pos="${n}" aria-label="Задание ${x.position}" class="${n===pos?'current':''} ${x.answer?.some(v=>String(v??'').trim())?'answered':''} ${x.flagged?'flagged':''}">${x.position}</button>`).join('')}</aside><section class="card question-card"><div class="q-meta"><span class="pill">Задание ${i.position} из 34</span><span class="pill">Часть ${i.part}</span><span class="pill">Линия ${i.line}</span><span class="pill">${i.maxScore} ${i.maxScore===1?'балл':i.maxScore<5?'балла':'баллов'}</span></div><h2>${esc(q.prompt)}</h2>${q.instruction?`<p class="subtitle question-instruction">${esc(q.instruction)}</p>`:''}<div id="chem-answer-controls">${QuestionControls.render(q,i.answer||[],'mock')}</div><label class="return-flag"><input id="chem-mock-flag" type="checkbox" ${i.flagged?'checked':''}> Вернуться позже</label><div class="chem-mock-actions"><button class="btn ghost" id="chem-check-answer">Проверить</button><button class="btn ghost" id="chem-get-hint">Подсказка</button><button class="btn ghost" id="chem-show-review">Показать разбор</button></div><div id="chem-mock-help"></div><div class="actions"><button class="btn ghost" id="chem-prev" ${!pos?'disabled':''}>← Назад</button><button class="btn" id="chem-next" ${pos===a.items.length-1?'disabled':''}>Далее →</button><button class="btn ghost" id="chem-finish">Завершить</button></div><p class="chem-mock-source">${esc(q.source||'Авторский вариант ОСНОВЫ')} · часть 2 после сдачи оценивается по критериям самопроверки.</p></section></div></div>`);
      bindShell();
      const card=document.querySelector('.question-card'),label=document.querySelector('#chem-save-state');let dirty=restored,revision=0,wait,navigating=false;
      const readAnswer=()=>QuestionControls.read(card,q);
      const queue=SaveQueue.create(async snapshot=>{
        await mockApi(`/subjects/chemistry/mock-exams/${id}/answers`,{method:'PATCH',body:JSON.stringify({itemId:i.id,answer:snapshot.answer,flagged:snapshot.flagged})});
        if(snapshot.revision===revision){dirty=false;try{sessionStorage.removeItem(draftKey)}catch{}label.textContent='Сохранено';}
      });
      const save=()=>{const snapshot={answer:readAnswer(),flagged:card.querySelector('#chem-mock-flag').checked,revision};label.textContent='Сохраняем…';return queue(snapshot)};
      const edited=()=>{dirty=true;revision++;try{sessionStorage.setItem(draftKey,JSON.stringify({answer:readAnswer(),flagged:card.querySelector('#chem-mock-flag').checked}))}catch{}label.textContent='Не сохранено';clearTimeout(wait);wait=setTimeout(()=>save().catch(e=>{label.textContent='Не сохранено';notify(e.message)}),250)};
      card.querySelectorAll('input,textarea,select').forEach(x=>{x.addEventListener('input',edited);x.addEventListener('change',edited)});
      const beforeLeave=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',beforeLeave);
      const cleanup=()=>{clearTimeout(wait);window.removeEventListener('beforeunload',beforeLeave);window.removeEventListener('hashchange',routeLeft);if(timer)clearInterval(timer)};
      const routeLeft=()=>{if(dirty)save().catch(()=>{});cleanup()};window.addEventListener('hashchange',routeLeft,{once:true});
      if(restored){label.textContent='Восстановлен черновик';wait=setTimeout(()=>save().catch(e=>notify(e.message)),250)}
      const saveLatest=async()=>{do{await save()}while(dirty);clearTimeout(wait)};
      const move=async n=>{if(navigating)return;navigating=true;try{await saveLatest();cleanup();return chemistryMockExam(id,n)}catch(e){notify(e.message);navigating=false}};
      document.querySelectorAll('[data-chem-pos]').forEach(x=>x.onclick=()=>move(+x.dataset.chemPos));document.querySelector('#chem-prev').onclick=()=>move(pos-1);document.querySelector('#chem-next').onclick=()=>move(pos+1);document.querySelector('#chem-exam-exit').onclick=async()=>{try{await saveLatest();cleanup();go('chemistry/mocks')}catch(e){notify(e.message)}};
      const help=document.querySelector('#chem-mock-help');
      const showHelp=(data,kind)=>{const good=data.correct===true,bad=data.correct===false;help.className=`chem-mock-help ${good?'good':bad?'bad':''}`;help.innerHTML=`<h3>${kind==='hint'?'Подсказка':data.manual?'Сверка по критериям':good?'Верно ✓':bad?'Есть ошибка':'Разбор'}</h3>${data.hint?`<p>${esc(data.hint)}</p>`:''}${kind==='hint'&&data.strategy?.length?`<ol>${data.strategy.slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}${reviewHtml(data.review)}${data.commonTraps?.length?`<p><b>Ловушки:</b> ${esc(data.commonTraps.slice(0,3).join(' · '))}</p>`:''}`;help.scrollIntoView({behavior:'smooth',block:'nearest'})};
      const requestHelp=async action=>{try{await save();const data=await mockApi(`/subjects/chemistry/mock-exams/${id}/help`,{method:'POST',body:JSON.stringify({itemId:i.id,action})});showHelp(data,action)}catch(e){notify(e.message)}};
      document.querySelector('#chem-check-answer').onclick=()=>requestHelp('check');document.querySelector('#chem-get-hint').onclick=()=>requestHelp('hint');document.querySelector('#chem-show-review').onclick=()=>requestHelp('reveal');
      document.querySelector('#chem-finish').onclick=async()=>{if(navigating)return;navigating=true;try{await saveLatest();const fresh=(await mockApi('/subjects/chemistry/mock-exams/'+id)).attempt,empty=fresh.items.filter(x=>!x.answer?.some(v=>String(v??'').trim())).length;if(confirm(`Завершить вариант ${a.variant||1}? Незаполненных заданий: ${empty}.`)){await mockApi(`/subjects/chemistry/mock-exams/${id}/submit`,{method:'POST'});cleanup();go('chemistry/mocks/result/'+id)}}catch(e){notify(e.message)}finally{navigating=false}};
      let timer=null;if(a.mode==='timed'){let left=Number(a.remainingSeconds||0);timer=setInterval(()=>{const el=document.querySelector('#chem-exam-timer');if(!el)return cleanup();left=Math.max(0,left-1);el.textContent=clock(left);if(left<=0){cleanup();go('chemistry/mocks/result/'+id)}},1000)}
    }catch(e){notify(e.message);go('chemistry/mocks')}
  }

  async function chemistryMockResult(id){
    loading();
    try{
      const {attempt:a}=await mockApi(`/subjects/chemistry/mock-exams/${id}/result`),score=a.items.reduce((s,x)=>s+Number(x.autoScore||0)+Number(x.selfScore||0),0),weak=[...new Set(a.items.filter(x=>!x.review?.extended&&Number(x.autoScore||0)<Number(x.maxScore)).map(x=>x.line))];
      app.innerHTML=shell(`<div class="course-page chem-mock-result"><nav class="breadcrumbs"><button data-nav="chemistry">Химия</button><span>›</span><button data-nav="chemistry/mocks">Пробники</button><span>›</span><span>Результат</span></nav><header><div class="eyebrow">Вариант ${a.variant||1} завершён</div><h1>${score} / ${a.primaryScoreMax}</h1><p class="subtitle">Первичный балл. Для заданий 29–34 выставьте баллы по критериям ниже — итог обновится автоматически.</p></header>${weak.length?`<div class="card weak-lines"><b>Нужно повторить:</b> ${weak.map(n=>`<button data-nav="chemistry/line/${n}">задание ${n}</button>`).join(' ')}</div>`:''}<div class="section-head"><h2>Полный разбор</h2><button class="btn" data-nav="chemistry/mocks">Другой вариант</button></div><div class="mock-review">${a.items.map(x=>{const expected=answerText(x.review?.reviewAnswer)||answerText(x.review?.answer),given=answerText(x.review?.givenAnswer)||answerText(x.answer);return`<details class="card"><summary><b>${x.position}. Задание ${x.line}</b><span>${x.review?.extended?'самопроверка':`${x.autoScore||0} / ${x.maxScore}`}</span></summary><h3>${esc(x.question.prompt)}</h3><p><b>Ваш ответ:</b> ${esc(given||'—')}</p><p><b>${x.review?.extended?'Эталон / ориентир':'Правильный ответ'}:</b> ${esc(expected||'—')}</p>${x.review?.explanation?`<p>${esc(x.review.explanation)}</p>`:''}${x.review?.solutionSteps?.length?`<ol>${x.review.solutionSteps.map(v=>`<li>${esc(typeof v==='string'?v:(v.text||v.description||''))}</li>`).join('')}</ol>`:''}${x.review?.scoringPoints?.length?`<p><b>Критерии:</b></p><ul>${x.review.scoringPoints.map(v=>`<li>${esc(v)}</li>`).join('')}</ul>`:''}${x.review?.extended?`<label><b>Баллы самопроверки:</b> <input class="chem-self-score" data-item="${x.id}" type="number" min="0" max="${x.maxScore}" value="${x.selfScore??''}"> из ${x.maxScore}</label>`:''}<div class="actions"><button class="btn ghost" data-nav="chemistry/line/${x.line}">Повторить задание ${x.line}</button></div></details>`}).join('')}</div></div>`);
      bindShell();document.querySelectorAll('.chem-self-score').forEach(x=>x.onchange=async()=>{try{await mockApi(`/subjects/chemistry/mock-exams/${id}/self-score`,{method:'PATCH',body:JSON.stringify({itemId:+x.dataset.item,score:+x.value})});chemistryMockResult(id)}catch(e){notify(e.message)}});
    }catch(e){notify(e.message);go('chemistry/mocks')}
  }

  const baseRender=render;
  render=async function(){
    if(state.user&&state.route==='chemistry/mocks')return chemistryMocks();
    if(state.user&&/^chemistry\/mocks\/exam\/\d+$/.test(state.route))return chemistryMockExam(routeId());
    if(state.user&&/^chemistry\/mocks\/result\/\d+$/.test(state.route))return chemistryMockResult(routeId());
    return baseRender();
  };
})();
