(() => {
  const safeApi=async(path,opts={})=>{
    const response=await fetch('/api'+path,{headers:{'content-type':'application/json'},...opts});
    const text=await response.text();let data={};
    try{data=text?JSON.parse(text):{}}catch{
      throw new Error(response.ok?'Сервер вернул некорректный ответ. Обновите страницу после завершения деплоя.':'Сервер временно недоступен. Попробуйте ещё раз через несколько секунд.');
    }
    if(!response.ok)throw new Error(data.error||`Ошибка ${response.status}`);
    return data;
  };
  const parseMaybe=(value,fallback={})=>{try{return value==null?fallback:typeof value==='string'?JSON.parse(value):value}catch{return fallback}};

  const style=document.createElement('style');
  style.textContent=`
    .mock-variant-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:22px 0 30px}.mock-variant-card{display:flex;flex-direction:column;gap:12px;min-height:230px}.mock-variant-card .variant-number{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:var(--accent,#176a4b);color:#fff;font-weight:800}.mock-variant-card .variant-tags{display:flex;gap:8px;flex-wrap:wrap}.mock-variant-card .btn{margin-top:auto}.mock-help-actions{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 8px}.mock-help-box{margin:12px 0;padding:16px;border-radius:14px;background:rgba(23,106,75,.07);border:1px solid rgba(23,106,75,.18)}.mock-help-box.bad{background:rgba(170,57,57,.07);border-color:rgba(170,57,57,.2)}.mock-help-box.good{background:rgba(23,106,75,.09)}.mock-help-box h3{margin:0 0 8px}.mock-help-box ul,.mock-help-box ol{margin:8px 0 0;padding-left:20px}.mock-source-note{font-size:13px;opacity:.72}.mock-ordered-wrap{margin:15px 0}.mock-ordered-wrap small{display:block;margin:0 0 8px;opacity:.7}.mock-ordered-input{width:100%;min-height:52px;border:1px solid var(--line,#dfe4df);border-radius:14px;padding:0 15px;background:var(--card,#fff);color:inherit;font:inherit}.mock-question-media{margin:14px 0;text-align:center}.mock-question-media img{max-width:100%;max-height:440px;border-radius:14px}.bio-search-page{max-width:1000px;margin:0 auto}.bio-search-form{display:flex;gap:10px;margin:22px 0}.bio-search-form input{flex:1;min-height:52px;border:1px solid var(--line,#dfe4df);border-radius:14px;padding:0 16px;background:var(--card,#fff);color:inherit;font:inherit}.bio-search-results{display:grid;gap:12px}.bio-search-hit{padding:18px}.bio-search-hit h3{margin:0 0 8px}.bio-search-hit p{line-height:1.65;margin:0 0 12px;white-space:pre-line}.bio-search-score{font-size:12px;opacity:.65}.bio-search-empty{padding:28px;text-align:center}.bio-search-loading{padding:24px}.bio-search-nav{display:flex!important;align-items:center;gap:10px;width:100%;padding:10px 12px;border:0;background:transparent;border-radius:10px;cursor:pointer;color:inherit;font:inherit;text-align:left}.bio-search-nav:hover,.bio-search-nav.active{background:rgba(23,106,75,.09)}.bio-search-nav .nav-icon{width:22px;text-align:center}.mock-exam .question-card h2{line-height:1.35}.mock-exam .question-instruction{margin-top:-4px;margin-bottom:16px}.mock-exam .actions{flex-wrap:wrap}
    @media(max-width:900px){.mock-variant-grid{grid-template-columns:1fr}.bio-search-form{flex-direction:column}.bio-search-nav{display:none!important}}
  `;
  document.head.appendChild(style);

  function ensureSearchNavigation(){
    const nav=document.querySelector('.sidebar nav');
    if(nav&&!nav.querySelector('[data-bio-search-nav]')){
      const biology=nav.querySelector('[data-nav="biology"]');
      const button=document.createElement('button');button.type='button';button.dataset.bioSearchNav='1';button.className='bio-search-nav'+(state?.route==='biology/search'?' active':'');button.innerHTML='<span class="nav-icon">⌕</span>Поиск по биологии';button.onclick=()=>go('biology/search');
      if(biology?.nextSibling)nav.insertBefore(button,biology.nextSibling);else nav.appendChild(button);
    }
    const current=nav?.querySelector('[data-bio-search-nav]');if(current)current.classList.toggle('active',state?.route==='biology/search');
  }
  new MutationObserver(()=>ensureSearchNavigation()).observe(document.body,{childList:true,subtree:true});

  const renderReview=(review)=>{
    if(!review)return '';
    const answer=review.reviewAnswer?.examAnswer||(Array.isArray(review.answer)?review.answer.join(' '):String(review.answer||''));
    return `${answer?`<p><b>Ответ / ориентир:</b> ${esc(answer)}</p>`:''}${review.reviewAnswer?.items?.length?`<ul>${review.reviewAnswer.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${review.explanation?`<p><b>Объяснение:</b> ${esc(review.explanation)}</p>`:''}${review.solutionSteps?.length?`<ol>${review.solutionSteps.map(x=>`<li>${esc(typeof x==='string'?x:(x.text||x.description||''))}</li>`).join('')}</ol>`:''}${review.scoringPoints?.length?`<p><b>Критерии:</b></p><ul>${review.scoringPoints.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}`;
  };
  const mockVisual=q=>{
    const media=parseMaybe(q.mediaJson,{}),src=q.imageUrl||media.path||media.src||media.url||'';
    return src?`<div class="mock-question-media"><img src="${esc(src)}" alt="Схема к заданию" loading="lazy"></div>`:'';
  };
  const mockAnswerControls=i=>QuestionControls.render(i.question,i.answer||[],'mock');

  mocks=async function(){
    loading();
    try{
      const d=await safeApi('/subjects/biology/mock-exams');
      const variants=[
        {n:1,title:'Вариант 1',text:'Клетка, фотосинтез, физиология и экология. Полная экзаменационная структура.',tag:'57 баллов'},
        {n:2,title:'Вариант 2',text:'Солевой стресс, цитология и сцепленное наследование. Новые условия и разборы.',tag:'57 баллов'},
        {n:3,title:'Вариант 3',text:'Ферменты, регуляция и популяционная генетика. Все 28 линий с критериями.',tag:'57 баллов'}
      ];
      app.innerHTML=shell(`<header><div class="eyebrow">Пробники · Биология</div><h1>Полные варианты ЕГЭ</h1><p class="subtitle">28 заданий, время не ограничено. Можно проверить короткий ответ, взять подсказку или открыть подробный разбор, если задание не получается.</p></header>${d.activeAttempt?`<div class="card mock"><div><b>Незавершённый вариант ${d.activeAttempt.variant||1}</b><p class="subtitle">Ответы сохранены автоматически</p></div><button class="btn" data-exam="${d.activeAttempt.id}">Продолжить</button></div>`:''}<div class="mock-variant-grid">${variants.map(v=>`<article class="card mock-variant-card"><div class="variant-number">${v.n}</div><div class="variant-tags"><span class="pill">${v.tag}</span><span class="pill">Без таймера</span></div><h2>${v.title}</h2><p class="subtitle">${v.text}</p><button class="btn ${v.n===1?'':'ghost'}" data-variant="${v.n}">Начать вариант ${v.n}</button></article>`).join('')}</div><p class="mock-source-note">${esc(d.config.sourceLabel||'Задания составлены по структуре и механикам актуальной модели ЕГЭ; это не копирование официального банка.')}</p><div class="section-head"><h2>История</h2></div><div class="card">${d.attempts.length?d.attempts.map(a=>`<button class="mock-row" data-${a.status==='in_progress'?'exam':'mock-result'}="${a.id}"><span>${new Date(a.started_at).toLocaleDateString('ru-RU')} · вариант ${a.variant||1} · ${a.mode==='timed'?'старый режим с таймером':'без таймера'}</span><b>${a.status==='in_progress'?'Продолжить':`${a.primary_score_total??a.auto_primary_score??0} / ${a.primary_score_max}`}</b></button>`).join(''):'<div class="empty">История пока пуста</div>'}</div>`);
      bindShell();ensureSearchNavigation();
      document.querySelectorAll('[data-variant]').forEach(x=>x.onclick=()=>startMock('untimed',!!d.activeAttempt,+x.dataset.variant));
      document.querySelectorAll('[data-exam]').forEach(x=>x.onclick=()=>go('mocks/exam/'+x.dataset.exam));
      document.querySelectorAll('[data-mock-result]').forEach(x=>x.onclick=()=>go('mocks/result/'+x.dataset.mockResult));
    }catch(e){notify(e.message);errorState(mocks)}
  };

  startMock=async function(mode='untimed',active=false,variant=1){
    if(active&&!confirm('Завершить текущий пробник и открыть новый вариант?'))return;
    try{const d=await safeApi('/subjects/biology/mock-exams',{method:'POST',body:JSON.stringify({mode:'untimed',variant:Number(variant)||1,confirmNew:active})});go('mocks/exam/'+d.attempt.id)}catch(e){notify(e.message)}
  };

  mockExam=async function(id,pos=0){
    loading();
    try{
      const {attempt:a}=await safeApi('/subjects/biology/mock-exams/'+id);if(a.status!=='in_progress')return go('mocks/result/'+id);
      pos=Math.max(0,Math.min(pos,a.items.length-1));const i=a.items[pos],q=i.question,draftKey=`biology-draft:${id}:${i.id}`;let restoredDraft=false;try{const draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(draft){i.answer=draft.answer;i.flagged=draft.flagged;restoredDraft=true}}catch{}
      app.innerHTML=shell(`<div class="mock-exam"><div class="mock-head"><button class="back" id="exam-exit">← Пробники</button><span id="save-state" role="status" aria-live="polite">Сохранено</span><b>Вариант ${a.variant||1} · ${a.mode==='timed'?'старый таймер':'без таймера'}</b></div><div class="mock-layout"><aside class="card mock-palette">${a.items.map((x,n)=>`<button data-pos="${n}" aria-label="Задание ${x.position}${x.flagged?', отмечено для повторения':''}" ${n===pos?'aria-current="step"':''} class="${n===pos?'current':''} ${x.answer?.some(Boolean)?'answered':''} ${x.flagged?'flagged':''}">${x.position}</button>`).join('')}</aside><section class="card question-card"><div class="q-meta"><span class="pill">Задание ${i.position} из ${a.items.length}</span><span class="pill">Часть ${i.part}</span><span class="pill">Линия ${i.line}</span>${q.difficulty?`<span class="pill">Сложность ${q.difficulty}/3</span>`:''}</div><h2>${esc(q.prompt)}</h2>${q.instruction?`<p class="subtitle question-instruction">${esc(q.instruction)}</p>`:''}${mockAnswerControls(i)}<label class="return-flag"><input id="mock-flag" type="checkbox" ${i.flagged?'checked':''}> Вернуться позже</label><div class="mock-help-actions"><button class="btn ghost" id="check-answer">Проверить ответ</button><button class="btn ghost" id="get-hint">Подсказка</button><button class="btn ghost" id="show-review">Не знаю — показать разбор</button></div><div id="mock-help"></div><div class="actions"><button class="btn ghost" id="prev" ${!pos?'disabled':''}>← Назад</button><button class="btn" id="next" ${pos===a.items.length-1?'disabled':''}>Следующее задание →</button><button class="btn ghost" id="finish-exam">Завершить пробник</button></div><p class="mock-source-note">${esc(q.source||'Проверенный банк ОСНОВЫ')} · помощь не блокирует переход дальше.</p></section></div></div>`);
      bindShell();ensureSearchNavigation();document.querySelectorAll('.option').forEach(x=>x.onclick=()=>setTimeout(()=>x.classList.toggle('selected',x.querySelector('input').checked),0));
      const card=document.querySelector('.question-card'),label=document.querySelector('#save-state');
      let dirty=restoredDraft,revision=0,wait,navigating=false;
      const readAnswer=()=>QuestionControls.read(card,q);
      const enqueue=SaveQueue.create(async snapshot=>{
        try{
          await safeApi(`/subjects/biology/mock-exams/${id}/answers`,{method:'PATCH',body:JSON.stringify({itemId:i.id,answer:snapshot.answer,flagged:snapshot.flagged})});
          if(snapshot.revision===revision){dirty=false;try{sessionStorage.removeItem(draftKey)}catch{}label.textContent='Сохранено';}
        }catch(e){label.textContent='Не сохранено — повторите';throw e;}
      });
      const save=()=>{const snapshot={answer:readAnswer(),flagged:card.querySelector('#mock-flag').checked,revision};label.textContent='Сохраняем…';return enqueue(snapshot)};
      const edited=()=>{dirty=true;revision++;try{sessionStorage.setItem(draftKey,JSON.stringify({answer:readAnswer(),flagged:card.querySelector('#mock-flag').checked}))}catch{}label.textContent='Не сохранено';clearTimeout(wait);wait=setTimeout(()=>save().catch(e=>notify(e.message)),250)};
      card.querySelectorAll('input,textarea,select').forEach(x=>{x.addEventListener('input',edited);x.addEventListener('change',edited)});
      const beforeLeave=e=>{if(dirty){e.preventDefault();e.returnValue='';}};
      window.addEventListener('beforeunload',beforeLeave);
      const cleanup=()=>{clearTimeout(wait);window.removeEventListener('beforeunload',beforeLeave);window.removeEventListener('hashchange',routeLeft)};
      const routeLeft=()=>{clearTimeout(wait);if(dirty)save().catch(e=>notify(e.message));cleanup()};
      window.addEventListener('hashchange',routeLeft,{once:true});
      if(restoredDraft){label.textContent='Восстановлен черновик';wait=setTimeout(()=>save().catch(e=>notify(e.message)),250);}
      const saveLatest=async()=>{do{await save()}while(dirty);clearTimeout(wait)};
      const move=async n=>{if(navigating)return;navigating=true;clearTimeout(wait);try{await saveLatest();cleanup();return mockExam(id,n)}catch(e){notify(e.message);navigating=false}};
      document.querySelectorAll('[data-pos]').forEach(x=>x.onclick=()=>move(+x.dataset.pos));document.querySelector('#prev').onclick=()=>move(pos-1);document.querySelector('#next').onclick=()=>move(pos+1);
      document.querySelector('#exam-exit').onclick=async()=>{clearTimeout(wait);try{await saveLatest();cleanup();go('mocks')}catch(e){notify(e.message)}};
      const helpBox=document.querySelector('#mock-help');
      const showHelp=(data,kind)=>{const good=data.correct===true,bad=data.correct===false;helpBox.className=`mock-help-box ${good?'good':bad?'bad':''}`;helpBox.innerHTML=`<h3>${kind==='hint'?'Подсказка':data.manual?'Сверка по критериям':good?'Верно ✓':bad?'Есть ошибка':'Разбор'}</h3>${data.hint?`<p>${esc(data.hint)}</p>`:''}${data.strategy?.length&&kind==='hint'?`<ol>${data.strategy.slice(0,3).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}${renderReview(data.review)}${data.commonTraps?.length?`<p><b>Осторожно:</b> ${esc(data.commonTraps.slice(0,3).join(' · '))}</p>`:''}`;helpBox.scrollIntoView({behavior:'smooth',block:'nearest'})};
      const requestHelp=async action=>{clearTimeout(wait);try{await save();const data=await safeApi(`/subjects/biology/mock-exams/${id}/help`,{method:'POST',body:JSON.stringify({itemId:i.id,action})});showHelp(data,action)}catch(e){notify(e.message)}};
      document.querySelector('#check-answer').onclick=()=>requestHelp('check');document.querySelector('#get-hint').onclick=()=>requestHelp('hint');document.querySelector('#show-review').onclick=()=>requestHelp('reveal');
      document.querySelector('#finish-exam').onclick=async()=>{if(navigating)return;navigating=true;clearTimeout(wait);try{await saveLatest();const fresh=(await safeApi('/subjects/biology/mock-exams/'+id)).attempt,empty=fresh.items.filter(x=>!x.answer?.some(v=>String(v||'').trim())).length;if(confirm(`Завершить вариант ${a.variant||1}? Незаполненных заданий: ${empty}.`)){await safeApi(`/subjects/biology/mock-exams/${id}/submit`,{method:'POST'});cleanup();go('mocks/result/'+id)}}catch(e){notify(e.message)}finally{navigating=false}};
    }catch(e){notify(e.message);go('mocks')}
  };

  const biologySearchRun=async query=>(await safeApi('/subjects/biology/search?q='+encodeURIComponent(query))).hits;

  async function biologySearchPage(initial=''){
    app.innerHTML=shell(`<div class="bio-search-page"><header><div class="eyebrow">Биология · поиск по базе ОСНОВЫ</div><h1>Найти ответ по биологии</h1><p class="subtitle">Напишите вопрос обычными словами. Поиск подберёт наиболее подходящее объяснение из полной теории курса и даст переход в исходный урок.</p></header><form class="bio-search-form" id="bio-search-form"><input id="bio-search-input" aria-label="Вопрос по биологии" maxlength="240" autocomplete="off" placeholder="Например: почему АДГ уменьшает объём мочи?" value="${esc(initial)}"><button class="btn">Найти ответ</button></form><div id="bio-search-results" class="bio-search-results">${initial?'<div class="card bio-search-loading">Ищу по материалам курса…</div>':'<div class="card bio-search-empty">Можно спрашивать про клетку, генетику, человека, растения, животных, эволюцию, экологию и другие темы ЕГЭ.</div>'}</div></div>`);bindShell();ensureSearchNavigation();
    let requestNumber=0;const form=document.querySelector('#bio-search-form'),input=document.querySelector('#bio-search-input'),results=document.querySelector('#bio-search-results');
    const run=async()=>{const request=++requestNumber;const q=input.value.trim();if(q.length<3){notify('Напишите вопрос чуть подробнее');return}results.innerHTML='<div class="card bio-search-loading">Ищу по подходящим урокам…</div>';try{const hits=await biologySearchRun(q);if(request!==requestNumber)return;if(!hits.length){results.innerHTML='<div class="card bio-search-empty"><b>Точного совпадения не нашёл.</b><p>Попробуйте оставить ключевые биологические термины: название органа, процесса, вещества или закона.</p></div>';return}results.innerHTML=`<div class="card bio-search-hit"><div class="eyebrow">Самое подходящее объяснение</div><h2>${esc(hits[0].title)}</h2><p>${esc(hits[0].text)}</p><button class="btn" data-lesson="${hits[0].lessonId}">Открыть полный урок →</button></div>${hits.slice(1).map(h=>`<article class="card bio-search-hit"><span class="bio-search-score">${esc(h.topic||'Биология')}</span><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p><button class="btn ghost" data-lesson="${h.lessonId}">Открыть урок</button></article>`).join('')}`;results.querySelectorAll('[data-lesson]').forEach(x=>x.onclick=()=>go('lesson/'+x.dataset.lesson))}catch(e){if(request!==requestNumber)return;results.innerHTML=`<div class="card bio-search-empty"><b>Поиск временно не сработал.</b><p>${esc(e.message)}</p></div>`}};form.onsubmit=e=>{e.preventDefault();run()};if(initial)run();if(window.innerWidth>900)input.focus();
  }

  const baseRender=render;render=async function(){if(state.user&&state.route==='biology/search')return biologySearchPage();return baseRender()};ensureSearchNavigation();
})();
