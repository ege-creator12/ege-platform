(()=>{
'use strict';

const $=(s,r=document)=>r.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
let checkedUserId=null,analyticsSubject='all',analyticsOpen=false,onboardingOpen=false;

async function api(path,opts={}){
  if(window.OsnovaData)return window.OsnovaData.request(path,opts);
  const response=await fetch(path,{credentials:'same-origin',headers:{'content-type':'application/json'},...opts});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Не удалось выполнить запрос');
  return data;
}
function currentUser(){try{return typeof state!=='undefined'?state?.user:null}catch{return null}}
function toast(text){try{if(typeof notify==='function')return notify(text)}catch{};console.info(text)}
function defaultExamDate(){const now=new Date(),year=now.getMonth()>=6?now.getFullYear()+1:now.getFullYear();return `${year}-06-01`}
function removeOnboarding(){document.querySelector('.product-onboarding')?.remove();onboardingOpen=false}
function removeAnalytics(){document.querySelector('.product-analytics')?.remove();analyticsOpen=false;document.querySelectorAll('[data-product-analytics]').forEach(b=>b.classList.remove('active'))}

function stepBar(step){return `<div class="product-stepbar">${[1,2,3,4].map(n=>`<i class="${n<step?'done':n===step?'active':''}"></i>`).join('')}</div>`}
function onboardingShell(step,body){return `<div class="product-onboarding-card"><div class="product-onboarding-top"><div class="product-onboarding-brand">ОСНОВА <b>START</b></div><div class="product-onboarding-count">${step}/4</div></div>${stepBar(step)}<div class="product-onboarding-body">${body}</div></div>`}

function openOnboarding(status={},manual=false){
  removeOnboarding();onboardingOpen=true;
  const existing=status.onboarding||{};
  const model={
    subjectSlug:existing.subjectSlug||'biology',currentScore:Number(existing.currentScore||40),targetScore:Number(existing.targetScore||80),
    examDate:String(existing.examDate||defaultExamDate()).slice(0,10),daysPerWeek:Number(existing.daysPerWeek||5),minutesPerDay:Number(existing.minutesPerDay||60),
  };
  let step=(existing.subjectSlug||status.diagnostic)?4:1,savedPlan=null;
  const overlay=document.createElement('div');overlay.className='product-onboarding';document.body.appendChild(overlay);

  function render(){
    if(step===1){overlay.innerHTML=onboardingShell(1,`<div class="product-kicker">Персональная подготовка</div><h1>С чего начинаем?</h1><p class="product-onboarding-lead">Выбери основной предмет. Это займёт меньше двух минут, а после сайт сразу соберёт подготовку под твою цель.</p><div class="product-subjects"><button class="product-subject ${model.subjectSlug==='biology'?'active':''}" data-subject="biology"><span class="product-subject-icon">⌬</span><b>Биология</b><span>28 линий ЕГЭ · теория, практика и пробники</span></button><button class="product-subject ${model.subjectSlug==='chemistry'?'active':''}" data-subject="chemistry"><span class="product-subject-icon">⚗</span><b>Химия</b><span>34 линии ЕГЭ · расчёты, реакции и теория</span></button></div><div class="product-onboarding-actions"><span></span><button class="btn" data-next>Продолжить →</button></div>`);
      overlay.querySelectorAll('[data-subject]').forEach(button=>button.onclick=()=>{model.subjectSlug=button.dataset.subject;render()});$('[data-next]',overlay).onclick=()=>{step=2;render()};return;
    }
    if(step===2){overlay.innerHTML=onboardingShell(2,`<div class="product-kicker">Цель</div><h1>Где ты сейчас и куда хочешь прийти?</h1><p class="product-onboarding-lead">Это не официальный прогноз — стартовую оценку указываешь сам. После практики сайт заменит её реальными данными.</p><div class="product-form-grid"><div class="product-field"><label>Примерный текущий балл</label><input data-current type="number" min="0" max="100" value="${model.currentScore}"><small>Если не знаешь — оставь 40</small></div><div class="product-field"><label>Цель на ЕГЭ</label><input data-target type="number" min="40" max="100" value="${model.targetScore}"><small>Например, 85+</small></div><div class="product-field full"><label>Ориентировочная дата экзамена</label><input data-exam type="date" value="${esc(model.examDate)}"><small>Это дата для расчёта темпа, её можно потом изменить.</small></div></div><div class="product-onboarding-actions"><button class="btn ghost" data-back>← Назад</button><button class="btn" data-next>Продолжить →</button></div>`);
      $('[data-back]',overlay).onclick=()=>{model.currentScore=Number($('[data-current]',overlay).value)||40;model.targetScore=Number($('[data-target]',overlay).value)||80;model.examDate=$('[data-exam]',overlay).value;step=1;render()};$('[data-next]',overlay).onclick=()=>{model.currentScore=Math.max(0,Math.min(100,Number($('[data-current]',overlay).value)||40));model.targetScore=Math.max(40,Math.min(100,Number($('[data-target]',overlay).value)||80));model.examDate=$('[data-exam]',overlay).value;if(!model.examDate)return toast('Укажи дату экзамена');step=3;render()};return;
    }
    if(step===3){overlay.innerHTML=onboardingShell(3,`<div class="product-kicker">Реальная нагрузка</div><h1>Сколько ты реально готов заниматься?</h1><p class="product-onboarding-lead">Лучше честные 45 минут четыре раза в неделю, чем план на три часа, который бросишь через два дня.</p><div class="product-load-choice"><button data-load="35"><b>35 мин</b><small>Лёгкий темп</small></button><button data-load="60" class="active"><b>60 мин</b><small>Оптимально</small></button><button data-load="90"><b>90 мин</b><small>Интенсивно</small></button></div><div class="product-form-grid"><div class="product-field"><label>Дней в неделю</label><input data-days type="number" min="1" max="7" value="${model.daysPerWeek}"></div><div class="product-field"><label>Минут в день</label><input data-minutes type="number" min="20" max="300" value="${model.minutesPerDay}"></div></div><div class="product-onboarding-actions"><button class="btn ghost" data-back>← Назад</button><button class="btn" data-build>Собрать мой план</button></div>`);
      overlay.querySelectorAll('[data-load]').forEach(button=>{button.classList.toggle('active',Number(button.dataset.load)===model.minutesPerDay);button.onclick=()=>{model.minutesPerDay=Number(button.dataset.load);$('[data-minutes]',overlay).value=model.minutesPerDay;overlay.querySelectorAll('[data-load]').forEach(x=>x.classList.toggle('active',x===button))}});$('[data-back]',overlay).onclick=()=>{step=2;render()};$('[data-build]',overlay).onclick=async()=>{model.daysPerWeek=Math.max(1,Math.min(7,Number($('[data-days]',overlay).value)||5));model.minutesPerDay=Math.max(20,Math.min(300,Number($('[data-minutes]',overlay).value)||60));const btn=$('[data-build]',overlay);btn.disabled=true;btn.textContent='Собираю план…';try{const result=await api('/api/product/onboarding',{method:'POST',body:JSON.stringify(model)});savedPlan=result.plan;status.onboarding=result.onboarding;step=4;render()}catch(error){toast(error.message);btn.disabled=false;btn.textContent='Собрать мой план'}};return;
    }
    const plan=savedPlan||{};const diagnostic=status.diagnostic;const goal=Number(plan.targetScore||model.targetScore||existing.targetScore||80);const days=Number(plan.daysPerWeek||model.daysPerWeek||existing.daysPerWeek||5);const minutes=Number(plan.minutesPerDay||model.minutesPerDay||existing.minutesPerDay||60);const subject=(plan.subjectSlug||model.subjectSlug||existing.subjectSlug)==='chemistry'?'Химия':'Биология';
    overlay.innerHTML=onboardingShell(4,`<div class="product-kicker">Готово</div><h1>${diagnostic?.status==='active'?'Продолжи диагностику':'Твой стартовый план готов'}</h1><p class="product-onboarding-lead">${diagnostic?.status==='active'?`Ты уже ответил на ${diagnostic.answered||0} из ${diagnostic.target||8}. Закончи короткую проверку — после неё аналитика начнёт опираться на реальные ответы.`:'План уже сохранён в PRO. Остался короткий тест на реальных заданиях, чтобы сайт понял твои сильные и слабые линии.'}</p><div class="product-plan-ready"><div class="product-plan-stat"><span>Предмет</span><b>${subject}</b></div><div class="product-plan-stat"><span>Цель</span><b>${goal}+ баллов</b></div><div class="product-plan-stat"><span>Режим</span><b>${days} дн. × ${minutes} мин</b></div><div class="product-plan-stat"><span>Старт</span><b>${plan.coverage?`Покрытие ${plan.coverage}%`:'Диагностика'}</b></div></div><div class="product-diagnostic-box"><h3>8 заданий · примерно 10–15 минут</h3><p>Вопросы берутся из разных частей программы и идут от базовых к более сложным. Во время диагностики подсказок не будет, а понятный результат появится в конце.</p><button class="btn block" data-diagnostic>${diagnostic?.status==='active'?'Продолжить диагностику →':'Начать диагностику →'}</button></div><div class="product-onboarding-actions"><button class="product-onboarding-skip" data-later>${manual?'Сохранить без диагностики':'Сделать диагностику позже'}</button><span></span></div>`);
    $('[data-diagnostic]',overlay).onclick=async()=>{
      const btn=$('[data-diagnostic]',overlay);btn.disabled=true;btn.textContent='Запускаю…';
      try{
        let session=diagnostic;const currentTarget=Number(session?.target||session?.targetQuestions||0);
        if(!session||session.status!=='active'||currentTarget!==8){
          const result=await api('/api/product/onboarding/diagnostic',{method:'POST',body:JSON.stringify({restart:Boolean(session?.status==='active')})});session=result.session;
        }
        return openDiagnostic(session,session.subjectSlug||model.subjectSlug||existing.subjectSlug||'biology');
      }catch(error){toast(error.message);btn.disabled=false;btn.textContent='Начать диагностику →'}
    };
    $('[data-later]',overlay).onclick=async()=>{try{await api('/api/product/onboarding/complete',{method:'POST',body:JSON.stringify({skippedDiagnostic:true})});removeOnboarding();toast('План сохранён — диагностику можно пройти позже')}catch(error){toast(error.message)}};
  }
  render();
}

function diagnosticLevel(accuracy){
  if(accuracy>=75)return {title:'Уверенный старт',tone:'high',text:'База уже крепкая. План начнёт с точечной работы над ошибками и более сложных линий.'};
  if(accuracy>=45)return {title:'Базовый уровень',tone:'mid',text:'Основа есть. Сайт поставит первыми темы, где сейчас теряются самые быстрые баллы.'};
  return {title:'Начальный уровень',tone:'low',text:'Начнём спокойно с фундамента и коротких тренировок — без прыжка в сложные темы.'};
}
async function openDiagnostic(session={},subjectSlug='biology'){
  removeOnboarding();onboardingOpen=true;
  const overlay=document.createElement('div');overlay.className='product-onboarding product-diagnostic-flow';document.body.appendChild(overlay);
  const sessionId=Number(session.id||0),fallbackTotal=Math.max(1,Number(session.targetQuestions||session.target||8));
  const subjectName=subjectSlug==='chemistry'?'Химия':'Биология';
  let startedAt=Date.now(),busy=false;

  const frame=(answered,total,body)=>`<div class="product-onboarding-card product-diagnostic-card"><div class="product-diagnostic-head"><div><div class="product-onboarding-brand">ОСНОВА <b>ДИАГНОСТИКА</b></div><span>${subjectName}</span></div><strong>${Math.min(answered+1,total)} / ${total}</strong></div><div class="product-diagnostic-progress" aria-label="Прогресс диагностики"><i style="width:${Math.round(answered/Math.max(1,total)*100)}%"></i></div>${body}</div>`;

  async function finish(summary={}){
    const answered=Number(summary.answered_count??summary.answeredCount??fallbackTotal);
    const correct=Number(summary.correct_count??summary.correctCount??0);
    const accuracy=answered?Math.round(correct/answered*100):0;
    overlay.innerHTML=frame(answered,Math.max(answered,fallbackTotal),'<div class="product-diagnostic-loading"><span></span><b>Собираю результат…</b><small>Обновляю стартовый план по твоим ответам</small></div>');
    let completed={};
    try{completed=await api('/api/product/onboarding/complete',{method:'POST',body:JSON.stringify({skippedDiagnostic:false})})}
    catch(error){toast(error.message)}
    const level=diagnosticLevel(accuracy),plan=completed.plan||{};
    overlay.innerHTML=frame(fallbackTotal,fallbackTotal,`<div class="product-diagnostic-result ${level.tone}"><div class="product-kicker">Диагностика завершена</div><div class="product-diagnostic-score">${accuracy}<small>%</small></div><h1>${level.title}</h1><p>${level.text}</p><div class="product-diagnostic-stats"><div><span>Верно</span><b>${correct} из ${answered}</b></div><div><span>Предмет</span><b>${subjectName}</b></div><div><span>План</span><b>${plan.priorityLines?.length?'Обновлён':'Готов'}</b></div></div><div class="product-diagnostic-note">Это стартовый срез, а не прогноз балла ЕГЭ. Он станет точнее после обычных тренировок.</div><button class="btn block" data-diagnostic-finish>Перейти на главную →</button></div>`);
    $('[data-diagnostic-finish]',overlay).onclick=()=>{removeOnboarding();checkedUserId=null;if(typeof boot==='function')boot();else if(typeof go==='function')go('dashboard')};
  }

  async function loadNext(){
    if(!sessionId){toast('Не удалось открыть диагностику');removeOnboarding();return}
    overlay.innerHTML=frame(Number(session.answered||0),fallbackTotal,'<div class="product-diagnostic-loading"><span></span><b>Загружаю задание…</b></div>');
    try{
      const data=await api(`/api/training/sessions/${sessionId}/next`);
      if(data.done)return finish(data.session);
      const q=data.question;q.options=data.options||[];
      if(q.manualReview){
        const skipped=await api(`/api/training/sessions/${sessionId}/reveal`,{method:'POST',body:JSON.stringify({questionId:q.id,duration:0})});
        return skipped.done?finish(skipped.session):loadNext();
      }
      const answered=Number(data.session.answeredCount||0),total=Number(data.session.targetQuestions||fallbackTotal);
      const controls=window.QuestionControls?.render(q,[],'diagnostic')||'<div class="product-diagnostic-error">Не удалось показать варианты ответа</div>';
      overlay.innerHTML=frame(answered,total,`<div class="product-diagnostic-question"><div class="product-diagnostic-meta"><span>Вопрос ${answered+1} из ${total}</span><span>${esc(q.topic||subjectName)}</span></div>${q.instruction?`<p class="question-instruction">${esc(q.instruction)}</p>`:''}<h2>${esc(q.prompt)}</h2><div class="product-diagnostic-controls">${controls}</div><p class="product-diagnostic-hint">Правильность покажем только в конце — так результат будет честным.</p><div class="product-diagnostic-actions"><button class="btn ghost" data-diagnostic-skip>Не знаю</button><button class="btn" data-diagnostic-answer>Ответить →</button></div><button class="product-diagnostic-later" data-diagnostic-later>Выйти и продолжить позже</button></div>`);
      overlay.querySelectorAll('.option').forEach(option=>option.onclick=()=>setTimeout(()=>option.classList.toggle('selected',option.querySelector('input')?.checked),0));
      const setBusy=value=>{busy=value;overlay.querySelectorAll('[data-diagnostic-answer],[data-diagnostic-skip]').forEach(button=>button.disabled=value)};
      const advance=async result=>{try{if(result.stats&&typeof state!=='undefined')state.stats=result.stats}catch{};if(result.done)return finish(result.session);session.answered=answered+1;startedAt=Date.now();return loadNext()};
      $('[data-diagnostic-answer]',overlay).onclick=async()=>{
        if(busy)return;
        const answer=window.QuestionControls?.read($('.product-diagnostic-question',overlay),q)||[];
        if(!answer.length||answer.some(value=>!String(value).trim()||value==='invalid'))return toast('Сначала заполни ответ');
        setBusy(true);
        try{await advance(await api(`/api/training/sessions/${sessionId}/answer`,{method:'POST',body:JSON.stringify({questionId:q.id,answer,duration:Math.round((Date.now()-startedAt)/1000)})}))}
        catch(error){toast(error.message);setBusy(false)}
      };
      $('[data-diagnostic-skip]',overlay).onclick=async()=>{
        if(busy)return;setBusy(true);
        try{await advance(await api(`/api/training/sessions/${sessionId}/reveal`,{method:'POST',body:JSON.stringify({questionId:q.id,duration:Math.round((Date.now()-startedAt)/1000)})}))}
        catch(error){toast(error.message);setBusy(false)}
      };
      $('[data-diagnostic-later]',overlay).onclick=()=>{removeOnboarding();toast('Диагностика сохранена — продолжишь с этого вопроса')};
    }catch(error){
      overlay.innerHTML=frame(Number(session.answered||0),fallbackTotal,`<div class="product-diagnostic-error"><h2>Не удалось загрузить вопрос</h2><p>${esc(error.message)}</p><button class="btn" data-diagnostic-retry>Попробовать ещё раз</button><button class="product-diagnostic-later" data-diagnostic-later>Вернуться на сайт</button></div>`);
      $('[data-diagnostic-retry]',overlay).onclick=loadNext;$('[data-diagnostic-later]',overlay).onclick=removeOnboarding;
    }
  }
  loadNext();
}

function deltaHtml(value,suffix=''){const n=Number(value||0);if(!n)return '<small>без изменений</small>';return `<small class="${n<0?'down':''}">${n>0?'+':''}${n}${suffix} к прошлой неделе</small>`}
function chartHtml(days=[]){const max=Math.max(1,...days.map(d=>Number(d.attempts||0)));return `<div class="product-chart">${days.map(day=>{const h=Math.max(day.attempts?5:1,Math.round(Number(day.attempts||0)/max*100));const label=new Date(`${day.day}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'short'});return `<div class="product-chart-col" style="--h:${h}%"><div class="product-chart-tip">${day.attempts} заданий · ${day.accuracy}%</div><div class="product-chart-bar" style="height:${h}%"></div><small>${label}</small></div>`}).join('')}</div>`}
function weakHtml(items=[]){if(!items.length)return '<div class="product-empty">Реши хотя бы несколько заданий по линиям — здесь появятся реальные слабые места.</div>';return `<div class="product-weak-list">${items.map(item=>`<div class="product-weak"><div class="product-weak-line">${item.line}</div><div><b>${item.subjectSlug==='chemistry'?'Химия':'Биология'} · задание ${item.line}</b><small>${item.attempted} попыток · среднее время ${item.avgSeconds||0} сек</small></div><div class="product-weak-accuracy ${item.accuracy<55?'bad':item.accuracy<75?'mid':''}">${item.accuracy}%</div></div>`).join('')}</div>`}
function analyticsLoading(subject){return `<div class="product-analytics-inner"><div class="product-analytics-head"><div><div class="product-kicker">Твоя статистика</div><h1>Аналитика</h1><p>Собираю реальные данные по подготовке…</p></div><div class="product-analytics-actions">${tabs(subject)}<button class="product-analytics-close" data-close-analytics>Закрыть</button></div></div><div class="product-panel"><div class="product-empty">Загрузка аналитики…</div></div></div>`}
function tabs(subject){return `<div class="product-subject-tabs"><button data-analytics-subject="all" class="${subject==='all'?'active':''}">Все</button><button data-analytics-subject="biology" class="${subject==='biology'?'active':''}">Биология</button><button data-analytics-subject="chemistry" class="${subject==='chemistry'?'active':''}">Химия</button></div>`}
function bindAnalyticsControls(shell){$('[data-close-analytics]',shell)?.addEventListener('click',removeAnalytics);$('[data-analytics-settings]',shell)?.addEventListener('click',async()=>{try{const status=await api('/api/product/onboarding');openOnboarding(status,true)}catch(error){toast(error.message)}});shell.querySelectorAll('[data-analytics-subject]').forEach(button=>button.onclick=()=>loadAnalytics(button.dataset.analyticsSubject))}
function renderAnalytics(shell,data,subject){const s=data.summary||{},w7=s.last7||{},w30=s.last30||{},sessions=data.sessions||{},completion=sessions.started?Math.round((sessions.completed||0)/sessions.started*100):0,forecast=data.forecast,forecastText=forecast?.scoreRange?`${forecast.scoreRange.low}–${forecast.scoreRange.high}`:forecast?.scoreEstimate!=null?String(forecast.scoreEstimate):'—';shell.innerHTML=`<div class="product-analytics-inner"><div class="product-analytics-head"><div><div class="product-kicker">Твоя статистика</div><h1>Аналитика подготовки</h1><p>Не мотивационные цифры — только реальные ответы и активность.</p></div><div class="product-analytics-actions">${tabs(subject)}<button class="product-analytics-settings" data-analytics-settings>⚙ Цель и режим</button><button class="product-analytics-close" data-close-analytics>Закрыть</button></div></div><div class="product-analytics-grid"><article class="product-analytics-card"><span>Точность · 7 дней</span><strong>${w7.accuracy||0}%</strong>${deltaHtml(s.accuracyDelta7,'%')}</article><article class="product-analytics-card"><span>Решено · 7 дней</span><strong>${w7.attempts||0}</strong>${deltaHtml(s.attemptsDelta7)}</article><article class="product-analytics-card"><span>Учёба · 30 дней</span><strong>${w30.minutes||0} мин</strong><small>${s.activeDays||0} активных дней</small></article><article class="product-analytics-card"><span>Серия</span><strong>${s.streak||0} дн.</strong><small>занятия без пропуска</small></article><article class="product-analytics-card"><span>Средний ответ</span><strong>${w30.avgSeconds||0} сек</strong><small>по решённым заданиям</small></article><article class="product-analytics-card"><span>Регулярность</span><strong>${s.consistency||0}%</strong><small>${s.avgAttemptsPerActiveDay||0} заданий / активный день</small></article><article class="product-analytics-card"><span>Тренировки завершены</span><strong>${completion}%</strong><small>${sessions.completed||0} из ${sessions.started||0}</small></article><article class="product-analytics-card"><span>Прогноз</span><strong>${forecastText}</strong><small>${forecast?`цель ${forecast.targetScore}+ · уверенность ${esc(forecast.confidence)}`:'нужно больше данных'}</small></article></div><div class="product-analytics-main"><section class="product-panel"><div class="product-panel-head"><h2>Последние 14 дней</h2><span>высота = количество заданий</span></div>${chartHtml(data.daily||[])}</section><section class="product-panel"><div class="product-panel-head"><h2>Слабые линии</h2><span>за 30 дней</span></div>${weakHtml(data.weakLines||[])}</section></div><div class="product-forecast"><section class="product-forecast-main"><div class="product-kicker">Персональный прогноз</div><div class="product-forecast-score">${forecastText}</div><h2>${forecast?'Текущий модельный диапазон':'Пока недостаточно данных'}</h2><p>${forecast?.coachNote?esc(forecast.coachNote):'Продолжай решать задания разных линий. Когда будет достаточно покрытия, PRO-план построит диапазон и приоритеты.'}</p></section><section class="product-panel"><div class="product-panel-head"><h2>Тренировки за 30 дней</h2><span>воронка занятий</span></div><div class="product-session-grid"><div class="product-session"><strong>${sessions.started||0}</strong><span>начато</span></div><div class="product-session"><strong>${sessions.completed||0}</strong><span>завершено</span></div><div class="product-session"><strong>${sessions.abandoned||0}</strong><span>брошено</span></div></div></section></div></div>`;bindAnalyticsControls(shell)}
async function loadAnalytics(subject='all'){analyticsSubject=subject;let shell=$('.product-analytics');if(!shell){shell=document.createElement('section');shell.className='product-analytics';document.body.appendChild(shell)}analyticsOpen=true;document.querySelectorAll('[data-product-analytics]').forEach(b=>b.classList.add('active'));shell.innerHTML=analyticsLoading(subject);bindAnalyticsControls(shell);try{const query=subject==='all'?'':'?subject='+encodeURIComponent(subject);const data=await api('/api/product/analytics'+query);renderAnalytics(shell,data,subject)}catch(error){shell.innerHTML=`<div class="product-analytics-inner"><div class="product-panel"><div class="product-empty">${esc(error.message)}</div><button class="btn" data-close-analytics>Закрыть</button></div></div>`;bindAnalyticsControls(shell)}}

function addAnalyticsNav(){const user=currentUser();if(!user)return;document.querySelectorAll('.sidebar nav,.mobile-nav').forEach(nav=>{if(nav.querySelector('[data-product-analytics]'))return;const button=document.createElement('button');button.dataset.productAnalytics='1';button.className='product-analytics-nav';button.innerHTML='<span class="nav-icon">⌁</span>Аналитика';const profile=nav.querySelector('[data-nav="profile"]');if(profile)nav.insertBefore(button,profile);else nav.appendChild(button);button.onclick=()=>loadAnalytics(analyticsSubject)});}
async function checkOnboarding(){const user=currentUser();if(!user){checkedUserId=null;removeOnboarding();return}addAnalyticsNav();if(checkedUserId===user.id||onboardingOpen)return;checkedUserId=user.id;try{const status=await api('/api/product/onboarding');if(status.needsOnboarding)openOnboarding(status,false)}catch(error){if(!/Войдите/.test(error.message))console.warn('onboarding',error)}}
let timer=null;const observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(checkOnboarding,80)});observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});setTimeout(checkOnboarding,120);setTimeout(checkOnboarding,900);
})();
