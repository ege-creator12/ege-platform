(()=>{
  'use strict';

  const ROOT_ID='osnova-daily-mission';
  let mounting=false;
  const $=(selector,root=document)=>root.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const route=()=>location.hash.slice(1)||'dashboard';
  const isDashboard=()=>route()==='dashboard';
  const api=async(path,opts={})=>{
    if(window.OsnovaData)return window.OsnovaData.request(path,opts);
    const response=await fetch(path,{credentials:'same-origin',headers:{'content-type':'application/json'},...opts});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Не удалось выполнить запрос');
    return data;
  };
  const notify=message=>{const toast=$('#toast');if(!toast)return;toast.textContent=message;toast.classList.add('show');clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.remove('show'),2800);};
  const subjectLabel=slug=>slug==='chemistry'?'Химия':'Биология';
  const newestPlan=plans=>[plans.biology,plans.chemistry].filter(Boolean).sort((a,b)=>Date.parse(b.generatedAt||0)-Date.parse(a.generatedAt||0))[0]||null;

  function scoreLabel(plan){
    if(plan?.scoreEstimate==null)return 'мало данных';
    if(plan?.scoreRange?.low!=null&&plan?.scoreRange?.high!=null)return `${plan.scoreRange.low}–${plan.scoreRange.high}`;
    return String(plan.scoreEstimate);
  }

  function stepIcon(status){return status==='done'?'✓':status==='active'?'→':'·';}
  function stepHtml(step,index){
    const done=step.status==='done',active=step.status==='active';
    return `<button class="tutor-step ${done?'done':''} ${active?'active':''}" data-tutor-step="${esc(step.key)}" ${done?'disabled':''}>
      <span class="tutor-step-num">${stepIcon(step.status)}</span><span class="tutor-step-copy"><b>${index+1}. ${esc(step.title)}</b><small>${esc(step.description||'')}</small></span><span class="tutor-step-time">${esc(step.minutes||0)} мин</span>
    </button>`;
  }

  function missionHtml(plan,tutor){
    if(!plan)return `<section id="${ROOT_ID}" class="daily-mission empty"><div><span class="eyebrow">Цифровой репетитор</span><h2>Сначала настрой цель</h2><p>После этого ОСНОВА сама будет собирать занятие на каждый день.</p></div><button class="btn" data-daily-setup>Настроить AI PRO</button></section>`;
    if(!tutor)return `<section id="${ROOT_ID}" class="daily-mission empty"><div><span class="eyebrow">Цифровой репетитор · ${esc(subjectLabel(plan.subjectSlug))}</span><h2>Собираем занятие на сегодня</h2><p>План уже есть, но урок дня пока не удалось сформировать.</p></div><button class="btn ghost" data-daily-plan>Открыть план</button></section>`;
    const steps=Array.isArray(tutor.steps)?tutor.steps:[];
    const next=tutor.nextStep;
    const completed=Boolean(tutor.completed);
    const title=completed?'Занятие на сегодня выполнено':tutor.title;
    const actionLabel=completed?'Готово ✓':next?.status==='active'?'Продолжить занятие →':'Начать занятие →';
    return `<section id="${ROOT_ID}" class="daily-mission tutor-mission ${tutor.rest?'rest':''} ${completed?'completed':''}">
      <div class="daily-mission-main">
        <div class="daily-mission-top"><span class="eyebrow">Цифровой репетитор · ${esc(subjectLabel(plan.subjectSlug))}</span><span class="daily-goal">Цель ${esc(plan.targetScore)}+</span></div>
        <h2>${esc(title)}</h2><p>${esc(tutor.reason||plan.coachNote||'ОСНОВА выбрала следующий полезный шаг.')}</p>
        <div class="tutor-progress"><div><span>Занятие</span><b>${esc(tutor.progress||0)}%</b></div><div class="tutor-progress-track"><i style="width:${Math.max(0,Math.min(100,Number(tutor.progress)||0))}%"></i></div></div>
        <div class="tutor-steps">${steps.length?steps.map(stepHtml).join(''):'<div class="tutor-rest-note">Сегодня обязательных шагов нет.</div>'}</div>
        <div class="daily-score"><span>Прогноз <b>${esc(scoreLabel(plan))}</b></span><span>Готовность <b>${esc(plan.readiness||0)}%</b></span><span>Покрытие <b>${esc(plan.coverage||0)}%</b></span>${tutor.totalMinutes?`<span>Сегодня <b>${esc(tutor.totalMinutes)} мин</b></span>`:''}</div>
      </div>
      <div class="daily-mission-actions"><button class="btn daily-start" data-tutor-continue ${completed||!next?'disabled':''}>${actionLabel}</button><button class="btn ghost" data-daily-plan>Весь план</button><button class="btn ghost" data-daily-map>Карта линий</button></div>
    </section>`;
  }

  async function startPractice(subject,line,count,existingSession){
    if(existingSession){sessionStorage.trainingSession=existingSession;sessionStorage.trainingSubject=subject;location.hash='training';return;}
    const path=subject==='chemistry'?'/api/subjects/chemistry/training/sessions':'/api/training/sessions';
    const body=subject==='chemistry'?{examLine:line,mode:'adaptive',targetQuestions:count}:{subjectSlug:'biology',examLine:line,topicId:0,mode:'adaptive',targetQuestions:count};
    const data=await api(path,{method:'POST',body:JSON.stringify(body)});
    if(!data.session?.id)throw new Error('Не удалось создать тренировку');
    sessionStorage.trainingSession=data.session.id;sessionStorage.trainingSubject=subject;location.hash='training';
  }

  async function startReview(subject,count,existingSession){
    if(existingSession){sessionStorage.trainingSession=existingSession;sessionStorage.trainingSubject=subject;location.hash='training';return;}
    const data=await api('/api/ai-pro/smart-review',{method:'POST',body:JSON.stringify({subjectSlug:subject,count:count||10})});
    if(!data.session?.id)throw new Error('Не удалось создать повторение');
    sessionStorage.trainingSession=data.session.id;sessionStorage.trainingSubject=subject;location.hash='training';
  }

  async function runStep(step,plan,button){
    if(!step||step.status==='done')return;
    const original=button?.textContent;if(button){button.disabled=true;button.textContent='Открываем…';}
    try{
      if(step.key==='theory'){
        if(!step.lessonId)throw new Error('Урок по этой линии пока не найден');
        location.hash=`lesson/${step.lessonId}`;return;
      }
      if(step.key==='practice')return await startPractice(plan.subjectSlug,Number(step.line),Number(step.count)||8,step.sessionId);
      if(step.key==='review')return await startReview(plan.subjectSlug,Number(step.count)||10,step.sessionId);
    }catch(error){notify(error.message);if(button){button.disabled=false;button.textContent=original;}}
  }

  function openAiPro(){const button=$('#ai-pro-planner [data-ai-pro-open]');if(button)button.click();else notify('AI PRO ещё загружается');}

  function bindMission(host,plan,tutor){
    $('[data-tutor-continue]',host)?.addEventListener('click',e=>runStep(tutor?.nextStep,plan,e.currentTarget));
    host.querySelectorAll('[data-tutor-step]').forEach(button=>button.addEventListener('click',()=>{
      const step=tutor?.steps?.find(item=>item.key===button.dataset.tutorStep);runStep(step,plan,button);
    }));
    $('[data-daily-map]',host)?.addEventListener('click',()=>{location.hash=`progress-map/${plan?.subjectSlug||'biology'}`;});
    $('[data-daily-plan]',host)?.addEventListener('click',openAiPro);
    $('[data-daily-setup]',host)?.addEventListener('click',openAiPro);
  }

  function promoteAiPro(main){const pro=$('#ai-pro-planner',main),header=$(':scope > header',main)||$('header',main);if(pro&&header&&header.nextElementSibling!==pro){header.insertAdjacentElement('afterend',pro);pro.classList.add('ai-pro-primary');}}
  function hideLegacyPlan(main){for(const heading of [...main.querySelectorAll('.section-head h2')].filter(h=>h.textContent.trim()==='План на сегодня')){if(heading.closest('#learning-coach')||heading.closest('#ai-pro-planner')||heading.closest('#'+ROOT_ID))continue;heading.closest('section')?.classList.add('osnova-legacy-plan-hidden');}}

  async function mount(){
    if(mounting||!isDashboard())return;
    const main=$('.app main');if(!main||!main.querySelector('header .eyebrow')?.textContent.includes('учебный центр'))return;
    promoteAiPro(main);hideLegacyPlan(main);if($('#'+ROOT_ID,main))return;
    mounting=true;
    try{
      const [bio,chem]=await Promise.all([api('/api/ai-pro/plan?subject=biology'),api('/api/ai-pro/plan?subject=chemistry')]);
      if(!isDashboard())return;
      const plans={biology:bio.plan||null,chemistry:chem.plan||null},plan=newestPlan(plans);
      let tutor=null;if(plan){const result=await api(`/api/ai-pro/tutor/today?subject=${encodeURIComponent(plan.subjectSlug)}`);tutor=result.tutor||null;}
      if(!isDashboard())return;
      promoteAiPro(main);const holder=document.createElement('div');holder.innerHTML=missionHtml(plan,tutor);const mission=holder.firstElementChild;
      const pro=$('#ai-pro-planner',main),hero=$('.hero-row',main);if(pro)pro.insertAdjacentElement('afterend',mission);else if(hero)hero.insertAdjacentElement('beforebegin',mission);else main.appendChild(mission);
      bindMission(mission,plan,tutor);
    }catch(error){console.warn('dashboard-focus',error?.message||error);}
    finally{mounting=false;}
  }

  const observer=new MutationObserver(()=>{if(isDashboard())queueMicrotask(()=>{const main=$('.app main');if(main){promoteAiPro(main);hideLegacyPlan(main);}mount();});});
  const app=$('#app');if(app)observer.observe(app,{childList:true,subtree:true});
  addEventListener('hashchange',()=>setTimeout(mount,0));
  addEventListener('focus',()=>{if(isDashboard()&&!$('#'+ROOT_ID))mount();});
  setTimeout(mount,0);
})();
