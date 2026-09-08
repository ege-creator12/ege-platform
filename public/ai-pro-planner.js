(()=>{
 'use strict';
 const ROOT_ID='ai-pro-planner';
 let mounting=false;
 const $=(s,r=document)=>r.querySelector(s);
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
 const dashboard=()=>((location.hash.slice(1)||'dashboard')==='dashboard');
 const api=async(path,opts={})=>{const response=await fetch(path,{credentials:'same-origin',headers:{'content-type':'application/json'},...opts});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'Не удалось выполнить запрос');return data;};
 const notify=message=>{const toast=$('#toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.remove('show'),3000);};
 const defaultExamDate=()=>{const d=new Date();d.setDate(d.getDate()+240);return d.toISOString().slice(0,10);};

 function scoreText(plan){return plan?.scoreEstimate==null?'Нужна диагностика':`≈ ${plan.scoreEstimate} баллов`;}
 function compactCard(plan){
  if(!plan)return `<div class="ai-pro-empty"><b>Персональный маршрут ещё не настроен</b><span>Цель → диагностика → недельный план → автоматическая адаптация.</span></div>`;
  return `<div class="ai-pro-current">
   <div><span>Сейчас</span><b>${esc(scoreText(plan))}</b></div><i>→</i><div><span>Цель</span><b>${esc(plan.targetScore)}+</b></div><i>·</i><div><span>До экзамена</span><b>${esc(plan.feasibility?.daysLeft||'—')} дн.</b></div><i>·</i><div><span>Режим</span><b>${esc(plan.daysPerWeek)}×${esc(plan.minutesPerDay)} мин</b></div>
  </div>`;
 }

 function renderRoot(host,plans){
  const active=plans.biology||plans.chemistry||null;
  host.innerHTML=`<div class="ai-pro-hero">
   <div class="ai-pro-copy"><div class="ai-pro-badges"><span>OSNOVA AI PRO</span><small>Бета · доступ открыт</small></div><h2>Персональный путь к нужному баллу</h2><p>ИИ учитывает цель, время до ЕГЭ и реальные ошибки. После новых тренировок план перестраивается автоматически.</p>${compactCard(active)}</div>
   <div class="ai-pro-actions"><button class="btn" data-ai-pro-open>${active?'Открыть мой план':'Настроить план'}</button><button class="btn ghost" data-ai-pro-diagnostic>Диагностика · 24 задания</button></div>
  </div>`;
  $('[data-ai-pro-open]',host).onclick=()=>openModal(plans,active?.subjectSlug||'biology');
  $('[data-ai-pro-diagnostic]',host).onclick=()=>openModal(plans,active?.subjectSlug||'biology',true);
 }

 function weakHtml(plan){
  const weak=Array.isArray(plan?.weakLines)?plan.weakLines:[];
  return weak.length?weak.map(item=>`<div class="ai-pro-weak"><span>Линия ${item.line}</span><b>${esc(item.title)}</b><small>${item.accuracy==null?'ещё не проверена':`точность ${item.accuracy}% · ${item.total} отв.`}</small></div>`).join(''):'<div class="ai-pro-muted">После диагностики здесь появятся конкретные слабые линии.</div>';
 }
 function weekHtml(plan){
  return (plan.schedule||[]).map(day=>day.rest
   ? `<div class="ai-pro-day rest"><div><b>${esc(day.label)}</b><span>${esc(day.title)}</span></div><small>восстановление</small></div>`
   : `<div class="ai-pro-day"><div><b>${esc(day.label)} · ${esc(day.title)}</b><span>${day.theoryMinutes} мин теория · ${day.practiceMinutes} мин практика · ${day.reviewMinutes} мин повторение</span></div><button class="btn ghost ai-pro-line-start" data-line="${day.line}" data-count="${day.questions}">${day.questions} заданий</button></div>`).join('');
 }
 function planHtml(plan){
  if(!plan)return `<div class="ai-pro-start"><h3>Сначала зададим цель</h3><p>После настройки можно пройти диагностику. Чем больше реальных ответов на сайте, тем точнее приоритеты.</p></div>`;
  const feasibility=plan.feasibility||{};
  return `<div class="ai-pro-plan-head">
    <div><span>Прогноз сейчас</span><b>${esc(scoreText(plan))}</b><small>ориентировочно, это не официальный перевод первичных баллов</small></div>
    <div><span>Цель</span><b>${plan.targetScore}+</b><small>${esc(feasibility.status||'')}</small></div>
    <div><span>Нагрузка</span><b>${esc(feasibility.weeklyHours||0)} ч/нед</b><small>${plan.daysPerWeek} дней × ${plan.minutesPerDay} мин</small></div>
    <div><span>Данных</span><b>${plan.attempts}</b><small>уверенность прогноза: ${esc(plan.confidence||'низкая')}</small></div>
   </div>
   <div class="ai-pro-note"><span>✦</span><p>${esc(plan.coachNote||'План готов.')}</p>${plan.aiPowered?'<small>приоритеты уточнены ИИ</small>':'<small>резервный алгоритм при недоступном ИИ</small>'}</div>
   <div class="ai-pro-section-head"><h3>Приоритеты</h3><span>Сначала закрываем то, где теряется больше баллов</span></div><div class="ai-pro-weak-grid">${weakHtml(plan)}</div>
   <div class="ai-pro-section-head"><h3>Ближайшие 7 дней</h3><span>План обновится после новых ответов</span></div><div class="ai-pro-week">${weekHtml(plan)}</div>`;
 }

 function formHtml(plan,subject){
  const p=plan||{};
  return `<form id="ai-pro-form">
   <div class="ai-pro-form-grid">
    <label><span>Предмет</span><select name="subjectSlug"><option value="biology" ${subject==='biology'?'selected':''}>Биология</option><option value="chemistry" ${subject==='chemistry'?'selected':''}>Химия</option></select></label>
    <label><span>Хочу набрать</span><div class="ai-pro-input-suffix"><input name="targetScore" type="number" min="40" max="100" value="${p.targetScore||85}"><b>баллов</b></div></label>
    <label><span>Дата экзамена</span><input name="examDate" type="date" value="${p.examDate||defaultExamDate()}" required></label>
    <label><span>Дней в неделю</span><input name="daysPerWeek" type="number" min="1" max="7" value="${p.daysPerWeek||5}"></label>
    <label><span>Минут за занятие</span><input name="minutesPerDay" type="number" min="20" max="300" step="10" value="${p.minutesPerDay||60}"></label>
   </div>
   <div class="ai-pro-form-actions"><button class="btn" type="submit">✦ Построить / обновить план</button><button class="btn ghost" type="button" data-ai-pro-run-diagnostic>Диагностика · 24 задания</button></div>
  </form>`;
 }

 function openModal(plans,subject='biology',diagnosticFirst=false){
  $('#ai-pro-modal')?.remove();
  const wrap=document.createElement('div');wrap.id='ai-pro-modal';wrap.className='ai-pro-modal';
  let currentSubject=subject,currentPlan=plans[currentSubject]||null;
  const render=()=>{
   wrap.innerHTML=`<section class="ai-pro-dialog" role="dialog" aria-modal="true"><div class="ai-pro-dialog-head"><div><span>OSNOVA AI PRO</span><h2>Персональный куратор ЕГЭ</h2></div><button class="icon-btn" data-ai-pro-close aria-label="Закрыть">×</button></div><div class="ai-pro-body">${formHtml(currentPlan,currentSubject)}<div id="ai-pro-plan-view">${planHtml(currentPlan)}</div></div></section>`;
   $('[data-ai-pro-close]',wrap).onclick=()=>wrap.remove();wrap.onclick=e=>{if(e.target===wrap)wrap.remove();};
   const form=$('#ai-pro-form',wrap),subjectSelect=$('[name=subjectSlug]',form);
   subjectSelect.onchange=()=>{currentSubject=subjectSelect.value;currentPlan=plans[currentSubject]||null;render();};
   form.onsubmit=async e=>{e.preventDefault();const button=$('button[type=submit]',form),fd=new FormData(form);button.disabled=true;button.textContent='ИИ строит план…';try{const payload={subjectSlug:fd.get('subjectSlug'),targetScore:Number(fd.get('targetScore')),examDate:fd.get('examDate'),daysPerWeek:Number(fd.get('daysPerWeek')),minutesPerDay:Number(fd.get('minutesPerDay'))};const data=await api('/api/ai-pro/plan',{method:'POST',body:JSON.stringify(payload)});currentSubject=payload.subjectSlug;currentPlan=data.plan;plans[currentSubject]=data.plan;render();const host=$('#'+ROOT_ID);if(host)renderRoot(host,plans);notify('Персональный план обновлён');}catch(error){notify(error.message);button.disabled=false;button.textContent='✦ Построить / обновить план';}};
   $('[data-ai-pro-run-diagnostic]',form).onclick=()=>startDiagnostic(currentSubject,wrap);
   wrap.querySelectorAll('.ai-pro-line-start').forEach(button=>button.onclick=()=>startLine(currentSubject,Number(button.dataset.line),Number(button.dataset.count),button,wrap));
  };
  document.body.appendChild(wrap);render();
  if(diagnosticFirst)setTimeout(()=>startDiagnostic(currentSubject,wrap),150);
 }

 async function startDiagnostic(subjectSlug,wrap){
  const button=$('[data-ai-pro-run-diagnostic]',wrap);if(button){button.disabled=true;button.textContent='Подбираем диагностику…';}
  try{const data=await api('/api/ai-pro/diagnostic',{method:'POST',body:JSON.stringify({subjectSlug,count:24})});if(!data.session?.id)throw new Error('Не удалось создать диагностику');sessionStorage.trainingSession=data.session.id;wrap.remove();location.hash='training';}
  catch(error){notify(error.message);if(button){button.disabled=false;button.textContent='Диагностика · 24 задания';}}
 }
 async function startLine(subjectSlug,line,count,button,wrap){
  const original=button.textContent;button.disabled=true;button.textContent='Подбираем…';
  try{const path=subjectSlug==='chemistry'?'/api/subjects/chemistry/training/sessions':'/api/training/sessions';const payload=subjectSlug==='chemistry'?{examLine:line,mode:'adaptive',targetQuestions:count}:{examLine:line,topicId:0,mode:'adaptive',targetQuestions:count};const data=await api(path,{method:'POST',body:JSON.stringify(payload)});if(!data.session?.id)throw new Error('Не удалось начать тренировку');sessionStorage.trainingSession=data.session.id;wrap.remove();location.hash='training';}catch(error){notify(error.message);button.disabled=false;button.textContent=original;}
 }

 async function mount(){
  if(mounting||!dashboard())return;const main=$('.app main');if(!main||!main.querySelector('header .eyebrow')?.textContent.includes('учебный центр')||$('#'+ROOT_ID,main))return;
  mounting=true;const host=document.createElement('section');host.id=ROOT_ID;host.className='ai-pro-planner';host.innerHTML='<div class="ai-pro-loading">AI PRO анализирует сохранённые цели…</div>';
  const coach=$('#learning-coach',main),recent=[...main.querySelectorAll('.section-head h2')].find(x=>x.textContent.trim()==='Последние результаты')?.closest('.section-head');if(coach)main.insertBefore(host,coach);else if(recent)main.insertBefore(host,recent);else main.appendChild(host);
  try{const [bio,chem]=await Promise.all([api('/api/ai-pro/plan?subject=biology'),api('/api/ai-pro/plan?subject=chemistry')]);if(host.isConnected)renderRoot(host,{biology:bio.plan||null,chemistry:chem.plan||null});}catch(error){if(host.isConnected)host.innerHTML='<div class="ai-pro-loading">AI PRO временно не загрузился. Остальные функции сайта работают.</div>';}
  finally{mounting=false;}
 }
 const observer=new MutationObserver(()=>{if(dashboard())queueMicrotask(mount);});const app=$('#app');if(app)observer.observe(app,{childList:true,subtree:true});addEventListener('hashchange',()=>setTimeout(mount,0));setTimeout(mount,0);
})();
