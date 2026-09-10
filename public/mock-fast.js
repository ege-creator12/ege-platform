(() => {
  const attemptCache = { biology: new Map(), chemistry: new Map() };
  const saveChains = new Map();
  const lastQueued = new Map();
  let activeRuntime = null;

  const api = async (path, opts = {}) => {
    const response = await fetch('/api' + path, { headers: { 'content-type': 'application/json' }, ...opts });
    const text = await response.text(); let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { throw new Error('Сервер временно вернул некорректный ответ'); }
    if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
    return data;
  };

  const configs = {
    biology: { key:'biology',label:'Биология',base:'/subjects/biology/mock-exams',listRoute:'mocks',examPrefix:'mocks/exam/',resultPrefix:'mocks/result/',itemCount:28,maxScore:57,timedMinutes:235,saveId:'fast-bio-save-state',paletteLabel:'Задания по биологии' },
    chemistry: { key:'chemistry',label:'Химия',base:'/subjects/chemistry/mock-exams',listRoute:'chemistry/mocks',examPrefix:'chemistry/mocks/exam/',resultPrefix:'chemistry/mocks/result/',itemCount:34,maxScore:56,timedMinutes:210,saveId:'fast-chem-save-state',paletteLabel:'Задания по химии' },
  };

  const style = document.createElement('style');
  style.textContent = `
    .fast-mock-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:18px 0 28px}
    .fast-variant-card{display:flex;flex-direction:column;gap:9px;padding:15px!important;min-height:0!important;box-shadow:none!important;backdrop-filter:none!important}
    .fast-variant-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.fast-variant-number{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;background:var(--accent,#176a4b);color:#fff;font-weight:800;flex:0 0 auto}
    .fast-variant-card h3{margin:0;font-size:16px}.fast-variant-card p{margin:0;font-size:13px;line-height:1.45;opacity:.72}.fast-variant-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:3px}.fast-variant-actions .btn{min-height:38px;padding:8px 11px;font-size:13px;flex:1 1 auto}
    .fast-exam-root,.fast-exam-root *{animation:none!important;transition:none!important}.fast-exam-root .card,.fast-question-pane{box-shadow:none!important;backdrop-filter:none!important}.fast-exam-root .mock-head{gap:10px;flex-wrap:wrap}.fast-exam-root .mock-head b{margin-left:auto}
    .fast-exam-layout{display:grid;grid-template-columns:minmax(170px,220px) minmax(0,1fr);gap:14px;align-items:start}.fast-palette{display:grid;grid-template-columns:repeat(5,minmax(34px,1fr));gap:6px;padding:10px!important;position:sticky;top:12px}.fast-palette button{min-height:36px;border:1px solid var(--line,#dfe4df);border-radius:8px;background:var(--card,#fff);color:inherit;cursor:pointer;font:inherit}.fast-palette button.current{outline:2px solid var(--accent,#176a4b);outline-offset:0}.fast-palette button.answered{background:rgba(23,106,75,.11)}.fast-palette button.flagged{box-shadow:inset 0 -3px 0 #b07b12!important}
    .fast-question-pane{padding:18px!important;min-height:360px}.fast-question-meta{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px}.fast-question-pane h2{font-size:clamp(18px,2.1vw,26px);line-height:1.38;margin:0 0 12px}.fast-question-instruction{margin:0 0 14px;opacity:.75}.fast-question-media{text-align:center;margin:12px 0}.fast-question-media img{max-width:100%;max-height:380px;border-radius:10px}.fast-question-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.fast-question-actions .btn{min-height:40px}.fast-help-actions{display:flex;gap:7px;flex-wrap:wrap;margin:14px 0 8px}.fast-help-actions .btn{min-height:38px;padding:8px 12px}.fast-help-box{margin:10px 0;padding:13px;border:1px solid rgba(23,106,75,.18);border-radius:10px;background:rgba(23,106,75,.06)}.fast-help-box.good{background:rgba(23,106,75,.1)}.fast-help-box.bad{background:rgba(170,57,57,.07);border-color:rgba(170,57,57,.2)}.fast-help-box h3{margin:0 0 7px}.fast-help-box p{line-height:1.55}.fast-help-box ul,.fast-help-box ol{padding-left:20px}.fast-save-state{font-size:13px;opacity:.72;min-width:92px}.fast-source-note{font-size:12px;opacity:.66;margin-top:14px}
    @media(max-width:1000px){.fast-mock-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:760px){.fast-mock-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.fast-exam-layout{grid-template-columns:1fr}.fast-palette{position:static;grid-template-columns:repeat(9,minmax(30px,1fr));order:2}.fast-question-pane{order:1;padding:14px!important}}@media(max-width:480px){.fast-mock-grid{grid-template-columns:1fr 1fr;gap:8px}.fast-variant-card{padding:12px!important}.fast-variant-card p{display:none}.fast-palette{grid-template-columns:repeat(7,minmax(29px,1fr))}.fast-question-actions .btn,.fast-help-actions .btn{flex:1 1 135px}}
  `;
  document.head.appendChild(style);

  const hasAnswer = item => Array.isArray(item?.answer) && item.answer.some(v => String(v ?? '').trim());
  const clock = seconds => { seconds=Math.max(0,Number(seconds)||0); return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds%3600/60)).padStart(2,'0')}:${String(Math.floor(seconds%60)).padStart(2,'0')}`; };
  const parseMaybe = (value,fallback={}) => { try { return value==null?fallback:typeof value==='string'?JSON.parse(value):value; } catch { return fallback; } };
  const answerText = value => { const v=value?.examAnswer??value; if(Array.isArray(v))return v.join(', '); if(v&&typeof v==='object')return Object.values(v).filter(Boolean).join(', '); return String(v??''); };
  const reviewHtml = review => { if(!review)return''; const expected=answerText(review.reviewAnswer)||answerText(review.answer); return `${expected?`<p><b>${review.extended?'Эталон / ориентир':'Правильный ответ'}:</b> ${esc(expected)}</p>`:''}${review.reviewAnswer?.items?.length?`<ul>${review.reviewAnswer.items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${review.explanation?`<p><b>Объяснение:</b> ${esc(review.explanation)}</p>`:''}${review.solutionSteps?.length?`<ol>${review.solutionSteps.map(x=>`<li>${esc(typeof x==='string'?x:(x.text||x.description||''))}</li>`).join('')}</ol>`:''}${review.scoringPoints?.length?`<p><b>Критерии:</b></p><ul>${review.scoringPoints.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}`; };
  const questionMedia = q => { const media=parseMaybe(q.mediaJson,{}),src=q.imageUrl||media.path||media.src||media.url||''; return src?`<div class="fast-question-media"><img src="${esc(src)}" alt="Схема к заданию" loading="lazy" decoding="async"></div>`:''; };
  const cacheAttempt = (cfg,attempt) => { if(attempt?.id)attemptCache[cfg.key].set(Number(attempt.id),attempt); return attempt; };
  const loadAttempt = async (cfg,id) => { id=Number(id); const cached=attemptCache[cfg.key].get(id); if(cached)return cached; loading(); const data=await api(`${cfg.base}/${id}`); return cacheAttempt(cfg,data.attempt); };
  const setSaveState = (cfg,text) => { const label=document.getElementById(cfg.saveId); if(label)label.textContent=text; };
  const chainKey = (cfg,id) => `${cfg.key}:${id}`;
  const signatureOf = snapshot => JSON.stringify([snapshot.answer,Boolean(snapshot.flagged)]);

  const queueSave = (cfg,id,item,snapshot) => {
    const key=chainKey(cfg,id),sigKey=`${key}:${item.id}`,signature=signatureOf(snapshot);
    if(lastQueued.get(sigKey)===signature)return saveChains.get(key)||Promise.resolve();
    lastQueued.set(sigKey,signature); setSaveState(cfg,'Сохраняем…');
    const previous=saveChains.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{
      try{
        await api(`${cfg.base}/${id}/answers`,{method:'PATCH',keepalive:true,body:JSON.stringify({itemId:item.id,answer:snapshot.answer,flagged:snapshot.flagged})});
        if(signatureOf({answer:item.answer||[],flagged:item.flagged})===signature){try{sessionStorage.removeItem(`${cfg.key}-mock-draft:${id}:${item.id}`)}catch{}}
        setSaveState(cfg,'Сохранено');
      }catch(error){if(lastQueued.get(sigKey)===signature)lastQueued.delete(sigKey);setSaveState(cfg,'Не сохранено');notify(error.message);throw error;}
    });
    saveChains.set(key,next); return next;
  };

  function createRuntime(cfg,attempt,id){
    let currentPos=null,debounce=null,timer=null,destroyed=false,finishing=false;
    const draftKey=item=>`${cfg.key}-mock-draft:${id}:${item.id}`;
    const pane=()=>document.getElementById(`fast-question-${cfg.key}`);
    const restoreDraft=item=>{try{const draft=JSON.parse(sessionStorage.getItem(draftKey(item))||'null');if(draft){item.answer=Array.isArray(draft.answer)?draft.answer:item.answer;item.flagged=Boolean(draft.flagged)}}catch{}};
    attempt.items.forEach(restoreDraft);

    const updatePalette=()=>{document.querySelectorAll(`[data-fast-${cfg.key}-pos]`).forEach(button=>{const n=Number(button.getAttribute(`data-fast-${cfg.key}-pos`)),item=attempt.items[n];button.classList.toggle('current',n===currentPos);button.classList.toggle('answered',hasAnswer(item));button.classList.toggle('flagged',Boolean(item?.flagged));if(n===currentPos)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current')})};
    const capture=()=>{if(currentPos==null)return null;const target=pane(),item=attempt.items[currentPos];if(!target||!item)return null;const answer=QuestionControls.read(target,item.question),flag=target.querySelector('[data-fast-flag]');item.answer=Array.isArray(answer)?answer:[];item.flagged=Boolean(flag?.checked);const snapshot={answer:item.answer,flagged:item.flagged};try{sessionStorage.setItem(draftKey(item),JSON.stringify(snapshot))}catch{}updatePalette();return{item,snapshot}};
    const saveCurrent=()=>{const current=capture();return current?queueSave(cfg,id,current.item,current.snapshot):Promise.resolve()};
    const scheduleSave=()=>{const current=capture();if(!current)return;setSaveState(cfg,'Не сохранено');clearTimeout(debounce);debounce=setTimeout(()=>queueSave(cfg,id,current.item,current.snapshot).catch(()=>{}),350)};
    const showHelp=(data,kind)=>{const box=document.getElementById(`fast-help-${cfg.key}`);if(!box)return;const good=data.correct===true,bad=data.correct===false;box.className=`fast-help-box ${good?'good':bad?'bad':''}`;box.innerHTML=`<h3>${kind==='hint'?'Подсказка':data.manual?'Сверка по критериям':good?'Верно ✓':bad?'Есть ошибка':'Разбор'}</h3>${data.hint?`<p>${esc(data.hint)}</p>`:''}${kind==='hint'&&data.strategy?.length?`<ol>${data.strategy.slice(0,4).map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''}${reviewHtml(data.review)}${data.commonTraps?.length?`<p><b>Ловушки:</b> ${esc(data.commonTraps.slice(0,3).join(' · '))}</p>`:''}`};
    const requestHelp=async action=>{clearTimeout(debounce);const current=capture();if(!current)return;try{await queueSave(cfg,id,current.item,current.snapshot);const data=await api(`${cfg.base}/${id}/help`,{method:'POST',body:JSON.stringify({itemId:current.item.id,action})});showHelp(data,action)}catch(error){notify(error.message)}};

    const open=nextPos=>{
      if(destroyed||finishing)return;nextPos=Math.max(0,Math.min(Number(nextPos)||0,attempt.items.length-1));
      if(currentPos!=null&&currentPos!==nextPos){clearTimeout(debounce);saveCurrent().catch(()=>{})}
      currentPos=nextPos;const item=attempt.items[currentPos];restoreDraft(item);const q=item.question,target=pane();if(!target)return;
      target.innerHTML=`<div class="fast-question-meta"><span class="pill">Задание ${item.position} из ${attempt.items.length}</span><span class="pill">Часть ${item.part}</span><span class="pill">Линия ${item.line}</span><span class="pill">${item.maxScore} ${Number(item.maxScore)===1?'балл':Number(item.maxScore)<5?'балла':'баллов'}</span></div><h2>${esc(q.prompt)}</h2>${q.instruction?`<p class="fast-question-instruction">${esc(q.instruction)}</p>`:''}${questionMedia(q)}<div data-fast-controls>${QuestionControls.render(q,item.answer||[],'mock')}</div><label class="return-flag"><input data-fast-flag type="checkbox" ${item.flagged?'checked':''}> Вернуться позже</label><div class="fast-help-actions"><button class="btn ghost" data-fast-help="check">Проверить</button><button class="btn ghost" data-fast-help="hint">Подсказка</button><button class="btn ghost" data-fast-help="reveal">Показать разбор</button></div><div id="fast-help-${cfg.key}"></div><div class="fast-question-actions"><button class="btn ghost" data-fast-prev ${currentPos===0?'disabled':''}>← Назад</button><button class="btn" data-fast-next ${currentPos===attempt.items.length-1?'disabled':''}>Следующее задание →</button></div><p class="fast-source-note">${esc(q.source||'Проверенный учебный банк')} · переход между заданиями выполняется без повторной загрузки всего пробника.</p>`;
      target.querySelectorAll('input,textarea,select').forEach(control=>{control.addEventListener('input',scheduleSave);control.addEventListener('change',scheduleSave)});
      target.querySelectorAll('.option').forEach(option=>{const input=option.querySelector('input');if(!input)return;option.classList.toggle('selected',input.checked);input.addEventListener('change',()=>option.classList.toggle('selected',input.checked))});
      target.querySelector('[data-fast-prev]')?.addEventListener('click',()=>open(currentPos-1));target.querySelector('[data-fast-next]')?.addEventListener('click',()=>open(currentPos+1));target.querySelectorAll('[data-fast-help]').forEach(button=>button.addEventListener('click',()=>requestHelp(button.dataset.fastHelp)));updatePalette();setSaveState(cfg,'Сохранено');target.scrollIntoView({block:'start',behavior:'auto'});
    };

    const destroy=(save=true)=>{if(destroyed)return;if(save){clearTimeout(debounce);saveCurrent().catch(()=>{})}destroyed=true;clearTimeout(debounce);if(timer)clearInterval(timer);if(activeRuntime?.cfg===cfg&&activeRuntime?.id===id)activeRuntime=null};
    const finish=async(expired=false)=>{if(finishing)return;clearTimeout(debounce);const current=capture(),empty=attempt.items.filter(item=>!hasAnswer(item)).length;if(!expired&&!confirm(`Завершить вариант ${attempt.variant||1}? Незаполненных заданий: ${empty}.`))return;finishing=true;const finishButton=document.querySelector('[data-fast-finish]');if(finishButton){finishButton.disabled=true;finishButton.textContent='Завершаем…'}try{if(current)await queueSave(cfg,id,current.item,current.snapshot);await(saveChains.get(chainKey(cfg,id))||Promise.resolve());await api(`${cfg.base}/${id}/submit`,{method:'POST'});attemptCache[cfg.key].delete(Number(id));destroy(false);go(cfg.resultPrefix+id)}catch(error){finishing=false;if(finishButton){finishButton.disabled=false;finishButton.textContent='Завершить пробник'}notify(error.message)}};
    const startTimer=()=>{if(attempt.mode!=='timed')return;const started=Date.now(),initial=Number(attempt.remainingSeconds??attempt.durationSeconds??cfg.timedMinutes*60);const tick=()=>{const left=Math.max(0,initial-Math.floor((Date.now()-started)/1000)),node=document.getElementById(`fast-timer-${cfg.key}`);if(node)node.textContent=clock(left);if(left<=0){clearInterval(timer);finish(true)}};tick();timer=setInterval(tick,1000)};
    const mount=()=>{app.innerHTML=shell(`<div class="mock-exam fast-exam-root" data-fast-exam-root="${cfg.key}:${id}"><div class="mock-head"><button class="back" data-fast-exit>← Пробники</button><span class="fast-save-state" id="${cfg.saveId}" role="status" aria-live="polite">Сохранено</span><b>${cfg.label} · вариант ${attempt.variant||1}${attempt.mode==='timed'?` · <span id="fast-timer-${cfg.key}">${clock(attempt.remainingSeconds)}</span>`:' · без таймера'}</b><button class="btn ghost" data-fast-finish>Завершить пробник</button></div><div class="fast-exam-layout"><aside class="card fast-palette" aria-label="${cfg.paletteLabel}">${attempt.items.map((item,n)=>`<button type="button" data-fast-${cfg.key}-pos="${n}" aria-label="Задание ${item.position}">${item.position}</button>`).join('')}</aside><section class="card question-card fast-question-pane" id="fast-question-${cfg.key}"></section></div></div>`);bindShell();document.querySelectorAll(`[data-fast-${cfg.key}-pos]`).forEach(button=>button.addEventListener('click',()=>open(Number(button.getAttribute(`data-fast-${cfg.key}-pos`)))));document.querySelector('[data-fast-exit]')?.addEventListener('click',()=>{clearTimeout(debounce);saveCurrent().catch(()=>{});destroy(false);go(cfg.listRoute)});document.querySelector('[data-fast-finish]')?.addEventListener('click',()=>finish(false));startTimer()};
    return{cfg,id,attempt,mount,open,destroy,saveCurrent};
  }

  const launchExam=async(cfg,id,pos=0)=>{try{id=Number(id);if(activeRuntime&&(activeRuntime.cfg!==cfg||activeRuntime.id!==id))activeRuntime.destroy(true);if(!activeRuntime){const attempt=await loadAttempt(cfg,id);if(!attempt||attempt.status!=='in_progress')return go(cfg.resultPrefix+id);activeRuntime=createRuntime(cfg,attempt,id);activeRuntime.mount()}activeRuntime.open(pos)}catch(error){notify(error.message);go(cfg.listRoute)}};
  const variantCards=(cfg,count,allowTimed)=>Array.from({length:count},(_,idx)=>{const n=idx+1;return `<article class="card fast-variant-card"><div class="fast-variant-top"><div class="fast-variant-number">${n}</div><h3>Вариант ${n}</h3></div><p>${cfg.itemCount} заданий · ${cfg.maxScore} первичных баллов${n>3?' · смешанный из проверенного банка':''}</p><div class="fast-variant-actions"><button class="btn" data-fast-start="${cfg.key}" data-variant="${n}" data-mode="untimed">Начать</button>${allowTimed?`<button class="btn ghost" data-fast-start="${cfg.key}" data-variant="${n}" data-mode="timed">${cfg.timedMinutes} мин</button>`:''}</div></article>`}).join('');
  const historyHtml=(cfg,attempts)=>attempts?.length?attempts.map(a=>`<button class="mock-row" data-fast-history="${cfg.key}" data-id="${a.id}" data-status="${a.status}"><span>${new Date(a.started_at).toLocaleDateString('ru-RU')} · вариант ${a.variant||1} · ${a.mode==='timed'?`${cfg.timedMinutes} минут`:'без таймера'}</span><b>${a.status==='in_progress'?'Продолжить':`${a.primary_score_total??a.auto_primary_score??0} / ${a.primary_score_max}`}</b></button>`).join(''):'<div class="empty">История пока пуста</div>';
  const bindList=(cfg,data)=>{document.querySelectorAll(`[data-fast-start="${cfg.key}"]`).forEach(button=>button.addEventListener('click',async()=>{if(data.activeAttempt&&!confirm(`Завершить текущий пробник ${cfg.label.toLowerCase()} и открыть новый?`))return;try{const created=await api(cfg.base,{method:'POST',body:JSON.stringify({mode:button.dataset.mode||'untimed',variant:Number(button.dataset.variant),confirmNew:Boolean(data.activeAttempt)})});cacheAttempt(cfg,created.attempt);go(cfg.examPrefix+created.attempt.id)}catch(error){notify(error.message)}}));document.querySelectorAll(`[data-fast-continue="${cfg.key}"]`).forEach(button=>button.addEventListener('click',()=>go(cfg.examPrefix+button.dataset.id)));document.querySelectorAll(`[data-fast-history="${cfg.key}"]`).forEach(button=>button.addEventListener('click',()=>go((button.dataset.status==='in_progress'?cfg.examPrefix:cfg.resultPrefix)+button.dataset.id)))};
  const renderList=async cfg=>{loading();try{const data=await api(cfg.base);if(data.activeAttempt)cacheAttempt(cfg,data.activeAttempt);const count=Math.max(3,Number(data.config?.variantCount)||3),allowTimed=cfg.key==='chemistry',subtitle=cfg.key==='biology'?'28 заданий. Интерфейс пробника облегчён: следующее задание открывается из памяти, а ответ сохраняется в фоне.':'34 задания. Следующее задание открывается без повторной загрузки всего варианта; ответы сохраняются в фоне.';app.innerHTML=shell(`<div class="course-page"><header><div class="eyebrow">Пробники · ${cfg.label}</div><h1>Полные варианты ЕГЭ</h1><p class="subtitle">${subtitle}</p></header>${data.activeAttempt?`<aside class="quick-continue"><div><span class="eyebrow">Незавершённый пробник</span><b>Вариант ${data.activeAttempt.variant||1}</b><small>Ответы сохраняются автоматически</small></div><button class="btn" data-fast-continue="${cfg.key}" data-id="${data.activeAttempt.id}">Продолжить</button></aside>`:''}<div class="fast-mock-grid">${variantCards(cfg,count,allowTimed)}</div><p class="fast-source-note">${esc(data.config?.sourceLabel||'Авторские учебные задания по структуре ЕГЭ.')}</p><div class="section-head"><h2>История</h2></div><div class="card">${historyHtml(cfg,data.attempts||[])}</div></div>`);bindShell();bindList(cfg,data)}catch(error){notify(error.message);errorState(()=>renderList(cfg))}};

  const previousRender=render;
  render=async function fastMockRender(){
    if(state.user){
      if(state.route===configs.biology.listRoute){if(activeRuntime)activeRuntime.destroy(true);return renderList(configs.biology)}
      let match=state.route.match(/^mocks\/exam\/(\d+)$/);if(match)return launchExam(configs.biology,Number(match[1]));
      if(state.route===configs.chemistry.listRoute){if(activeRuntime)activeRuntime.destroy(true);return renderList(configs.chemistry)}
      match=state.route.match(/^chemistry\/mocks\/exam\/(\d+)$/);if(match)return launchExam(configs.chemistry,Number(match[1]));
    }
    if(activeRuntime)activeRuntime.destroy(true);
    return previousRender();
  };
})();
