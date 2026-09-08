(()=>{
  'use strict';

  const ROOT_ID='osnova-daily-mission';
  let mounting=false;
  let lastMountKey='';
  const $=(selector,root=document)=>root.querySelector(selector);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const route=()=>location.hash.slice(1)||'dashboard';
  const isDashboard=()=>route()==='dashboard';
  const api=async(path,opts={})=>{
    const response=await fetch(path,{credentials:'same-origin',headers:{'content-type':'application/json'},...opts});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Не удалось выполнить запрос');
    return data;
  };
  const notify=message=>{
    const toast=$('#toast');if(!toast)return;
    toast.textContent=message;toast.classList.add('show');
    clearTimeout(notify.timer);notify.timer=setTimeout(()=>toast.classList.remove('show'),2800);
  };
  const localDateKey=()=>{
    const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };
  const subjectLabel=slug=>slug==='chemistry'?'Химия':'Биология';

  function newestPlan(plans){
    return [plans.biology,plans.chemistry].filter(Boolean).sort((a,b)=>Date.parse(b.generatedAt||0)-Date.parse(a.generatedAt||0))[0]||null;
  }

  function todayMission(plan){
    if(!plan)return null;
    const schedule=Array.isArray(plan.schedule)?plan.schedule:[];
    const today=localDateKey();
    return schedule.find(day=>day.date===today)||schedule.find(day=>!day.rest&&String(day.date||'')>=today)||schedule.find(day=>!day.rest)||schedule[0]||null;
  }

  function scoreLabel(plan){
    if(plan?.scoreEstimate==null)return 'мало данных';
    if(plan?.scoreRange?.low!=null&&plan?.scoreRange?.high!=null)return `${plan.scoreRange.low}–${plan.scoreRange.high}`;
    return String(plan.scoreEstimate);
  }

  function missionHtml(plan){
    if(!plan)return `<section id="${ROOT_ID}" class="daily-mission empty"><div><span class="eyebrow">Сегодня</span><h2>Сначала настрой цель</h2><p>AI PRO сможет сам выбирать тему, объём практики и время на повторение.</p></div><button class="btn" data-daily-setup>Настроить AI PRO</button></section>`;
    const mission=todayMission(plan);
    const score=scoreLabel(plan);
    const gap=plan.scoreEstimate==null?null:Math.max(0,Number(plan.targetScore)-Number(plan.scoreEstimate));
    const readiness=Number(plan.readiness)||0,coverage=Number(plan.coverage)||0;
    if(!mission||mission.rest){
      return `<section id="${ROOT_ID}" class="daily-mission rest"><div class="daily-mission-main"><div class="daily-mission-top"><span class="eyebrow">Сегодня · ${esc(subjectLabel(plan.subjectSlug))}</span><span class="daily-goal">Цель ${esc(plan.targetScore)}+</span></div><h2>Лёгкий день: восстановление и повторение</h2><p>${esc(plan.coachNote||'Можно отдохнуть или коротко повторить ошибки без новой тяжёлой темы.')}</p><div class="daily-score"><span>Прогноз <b>${esc(score)}</b></span><span>Готовность <b>${readiness}%</b></span><span>Покрытие <b>${coverage}%</b></span>${gap!=null?`<span>До цели <b>${gap}</b></span>`:''}</div></div><div class="daily-mission-actions"><button class="btn" data-daily-map>Открыть карту ЕГЭ</button><button class="btn ghost" data-daily-plan>Открыть план</button></div></section>`;
    }
    return `<section id="${ROOT_ID}" class="daily-mission"><div class="daily-mission-main"><div class="daily-mission-top"><span class="eyebrow">Сегодня · ${esc(subjectLabel(plan.subjectSlug))}</span><span class="daily-goal">Цель ${esc(plan.targetScore)}+</span></div><h2>${esc(mission.title||`Линия ${mission.line}`)}</h2><p>${esc(mission.reason||'Один готовый блок на сегодня: без выбора темы и без лишнего планирования.')}</p><div class="daily-breakdown"><span><b>${esc(mission.theoryMinutes||0)}</b> мин теория</span><span><b>${esc(mission.practiceMinutes||0)}</b> мин практика</span><span><b>${esc(mission.reviewMinutes||0)}</b> мин повторение</span><span><b>${esc(mission.questions||0)}</b> заданий</span></div><div class="daily-score"><span>Прогноз <b>${esc(score)}</b></span><span>Готовность <b>${readiness}%</b></span><span>Покрытие <b>${coverage}%</b></span><span>Нагрузка <b>${esc(plan.minutesPerDay)} мин</b></span></div></div><div class="daily-mission-actions"><button class="btn daily-start" data-daily-start data-subject="${esc(plan.subjectSlug)}" data-line="${esc(mission.line)}" data-count="${esc(mission.questions||8)}">Начать занятие →</button><button class="btn ghost" data-daily-map>Карта линий</button><button class="btn ghost" data-daily-plan>Весь план</button></div></section>`;
  }

  async function startLine(button){
    const subject=button.dataset.subject||'biology',line=Number(button.dataset.line),count=Math.max(1,Math.min(40,Number(button.dataset.count)||8));
    if(!line)return notify('Сначала обновите персональный план');
    const original=button.textContent;button.disabled=true;button.textContent='Подбираем…';
    try{
      const path=subject==='chemistry'?'/api/subjects/chemistry/training/sessions':'/api/training/sessions';
      const body=subject==='chemistry'?{examLine:line,mode:'adaptive',targetQuestions:count}:{subjectSlug:'biology',examLine:line,topicId:0,mode:'adaptive',targetQuestions:count};
      const data=await api(path,{method:'POST',body:JSON.stringify(body)});
      if(!data.session?.id)throw new Error('Не удалось создать тренировку');
      sessionStorage.trainingSession=data.session.id;sessionStorage.trainingSubject=subject;location.hash='training';
    }catch(error){notify(error.message);button.disabled=false;button.textContent=original;}
  }

  function openAiPro(){
    const button=$('#ai-pro-planner [data-ai-pro-open]');
    if(button)button.click();else notify('AI PRO ещё загружается');
  }

  function bindMission(host,plan){
    $('[data-daily-start]',host)?.addEventListener('click',e=>startLine(e.currentTarget));
    $('[data-daily-map]',host)?.addEventListener('click',()=>{location.hash=`progress-map/${plan?.subjectSlug||'biology'}`;});
    $('[data-daily-plan]',host)?.addEventListener('click',openAiPro);
    $('[data-daily-setup]',host)?.addEventListener('click',openAiPro);
  }

  function promoteAiPro(main){
    const pro=$('#ai-pro-planner',main),header=$(':scope > header',main)||$('header',main);
    if(pro&&header&&header.nextElementSibling!==pro){header.insertAdjacentElement('afterend',pro);pro.classList.add('ai-pro-primary');}
  }

  function hideLegacyPlan(main){
    const headings=[...main.querySelectorAll('.section-head h2')].filter(h=>h.textContent.trim()==='План на сегодня');
    for(const heading of headings){
      if(heading.closest('#learning-coach')||heading.closest('#ai-pro-planner')||heading.closest('#'+ROOT_ID))continue;
      const section=heading.closest('section');
      if(section)section.classList.add('osnova-legacy-plan-hidden');
    }
  }

  async function mount(){
    if(mounting||!isDashboard())return;
    const main=$('.app main');
    if(!main||!main.querySelector('header .eyebrow')?.textContent.includes('учебный центр'))return;
    promoteAiPro(main);hideLegacyPlan(main);
    if($('#'+ROOT_ID,main))return;
    mounting=true;
    try{
      const [bio,chem]=await Promise.all([api('/api/ai-pro/plan?subject=biology'),api('/api/ai-pro/plan?subject=chemistry')]);
      if(!isDashboard())return;
      const plans={biology:bio.plan||null,chemistry:chem.plan||null},plan=newestPlan(plans);
      promoteAiPro(main);
      const host=document.createElement('div');host.innerHTML=missionHtml(plan);const mission=host.firstElementChild;
      const pro=$('#ai-pro-planner',main),hero=$('.hero-row',main);
      if(pro)pro.insertAdjacentElement('afterend',mission);else if(hero)hero.insertAdjacentElement('beforebegin',mission);else main.appendChild(mission);
      bindMission(mission,plan);
      lastMountKey=`${plan?.subjectSlug||'none'}:${plan?.generatedAt||''}`;
    }catch(error){console.warn('dashboard-focus',error?.message||error);}
    finally{mounting=false;}
  }

  const observer=new MutationObserver(()=>{if(isDashboard())queueMicrotask(()=>{const main=$('.app main');if(main){promoteAiPro(main);hideLegacyPlan(main);}mount();});});
  const app=$('#app');if(app)observer.observe(app,{childList:true,subtree:true});
  addEventListener('hashchange',()=>setTimeout(mount,0));
  addEventListener('focus',()=>{if(isDashboard()&&!$('#'+ROOT_ID))mount();});
  setTimeout(mount,0);
})();
