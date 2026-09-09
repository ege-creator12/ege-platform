(()=>{
 'use strict';
 const ROOT='premium-dashboard-v2';
 let mounting=false;
 const $=(s,r=document)=>r.querySelector(s);
 const route=()=>location.hash.slice(1)||'dashboard';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
 const api=async path=>{
  if(window.OsnovaData)return window.OsnovaData.request('/api'+path);
  const r=await fetch('/api'+path,{credentials:'same-origin',headers:{accept:'application/json'}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'Не удалось загрузить данные');
  return d;
 };
 const plural=(n,a,b,c)=>{n=Math.abs(Number(n)||0)%100;const n1=n%10;return n>10&&n<20?c:n1>1&&n1<5?b:n1===1?a:c};
 function goTo(hash){location.hash=hash;}
 function icon(type){return ({book:'▤',target:'◎',chart:'▥',crown:'♛',flame:'◉',task:'✓',days:'↗',learned:'▦'})[type]||'•';}
 function calendarHtml(){
  const now=new Date(),year=now.getFullYear(),month=now.getMonth(),today=now.getDate();
  const first=new Date(year,month,1),days=new Date(year,month+1,0).getDate(),lead=(first.getDay()+6)%7;
  const title=now.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase());
  const cells=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(x=>`<span>${x}</span>`);
  for(let i=0;i<lead;i++)cells.push('<span></span>');
  for(let d=1;d<=days;d++)cells.push(`<span class="day ${d===today?'today':''}">${d}</span>`);
  return `<section class="premium-calendar"><div class="premium-cal-head"><b>${esc(title)}</b><span>← →</span></div><div class="premium-cal-grid">${cells.join('')}</div></section>`;
 }
 function weekHtml(weak){
  const labels=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const tasks=[];
  const names=weak.length?weak.map(x=>x.title):['Биология','Химия'];
  tasks.push(names[0]||'Повторение слабой темы');
  tasks.push(names[1]||'Задания первой части');
  tasks.push('Разбор ошибок');
  tasks.push(names[2]||'Теория и закрепление');
  tasks.push('Пробник ЕГЭ');
  tasks.push(names[3]||'Повторение формул и терминов');
  tasks.push('Отдых и лёгкое повторение');
  return `<section class="premium-week"><div class="premium-week-head"><h3>Мой план на неделю</h3><small>7 дней</small></div><div class="premium-week-list">${tasks.map((t,i)=>`<div class="premium-week-item ${i<2?'done':''}"><span class="premium-week-day">${labels[i]}</span><span>${esc(t)}</span><span class="premium-week-check">${i<2?'✓':''}</span></div>`).join('')}</div></section>`;
 }
 function quickCard(kind,title,text,hash){return `<button class="premium-quick-card" data-premium-nav="${esc(hash)}"><span class="premium-quick-icon">${icon(kind)}</span><span><b>${esc(title)}</b><small>${esc(text)}</small></span><span class="premium-quick-arrow">→</span></button>`;}
 function metric(kind,label,value,sub=''){return `<article class="premium-metric"><div class="premium-metric-top"><span class="premium-metric-icon">${icon(kind)}</span>${sub?`<small>${esc(sub)}</small>`:''}</div><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;}
 function dashboardHtml(data){
  const user=data.user||{},stats=data.stats||{};
  const progress=Array.isArray(stats.progress)?[...stats.progress]:[];
  const weak=progress.sort((a,b)=>(Number(a.mastery)||0)-(Number(b.mastery)||0));
  const current=weak[0]||{id:0,title:'Биология',mastery:0};
  const examDate=data.examDate?new Date(data.examDate):null;
  const days=examDate&&!Number.isNaN(examDate.getTime())?Math.max(0,Math.ceil((examDate-new Date())/86400000)):0;
  const mastered=progress.filter(x=>(Number(x.mastery)||0)>=80).length;
  const total=Math.max(progress.length,28);
  const pct=Math.max(0,Math.min(100,Number(current.mastery)||0));
  return `<section id="${ROOT}" class="premium-dashboard-v2">
    <section class="premium-hero">
      <div class="premium-hero-copy">
        <div class="premium-kicker">Знания · дисциплина · результат</div>
        <h1>Больше, чем<br>подготовка <em>к ЕГЭ</em></h1>
        <p>Понятная теория. Реальные задания. Твой результат — в одном спокойном и красивом пространстве.</p>
        <div class="premium-hero-actions"><button class="btn" data-premium-train="${Number(current.id)||0}">Продолжить обучение →</button><button class="btn ghost" data-premium-nav="progress-map/biology">К карте ЕГЭ</button></div>
      </div>
      <aside class="premium-hero-note"><span>ОСНОВА · ЕГЭ</span><strong>Маленькие шаги к большим результатам</strong><small>${esc(user.name||'Ученик')}, главное — продолжать регулярно.</small></aside>
    </section>
    <div class="premium-quick-grid">
      ${quickCard('book','Вся теория в одном месте','Структурированные уроки, схемы и разборы','biology')}
      ${quickCard('target','Реальные задания ЕГЭ','Линии, практика и работа над ошибками','progress-map/biology')}
      ${quickCard('chart','Пробники как на экзамене','Проверяй уровень и следи за прогрессом','mocks')}
      ${quickCard('crown','ОСНОВА PRO','Личный план, AI-репетитор и аналитика','pro')}
    </div>
    <div class="premium-main-grid">
      <div class="premium-left-stack">
        <section class="premium-continue">
          <div class="premium-section-title"><h2>Продолжить обучение</h2><span>→</span></div>
          <div class="premium-continue-body">
            <div class="premium-cover" aria-hidden="true"></div>
            <div class="premium-course-copy"><div class="premium-course-meta">Биология · слабая тема</div><h3>${esc(current.title||'Биология')}</h3><p>Продолжи с места, где сейчас можно быстрее всего поднять результат.</p><div class="premium-progress-row"><div class="progress"><i style="width:${pct}%"></i></div><b>${pct}%</b></div></div>
            <button class="btn" data-premium-train="${Number(current.id)||0}">Продолжить →</button>
          </div>
        </section>
        <div class="premium-results">
          ${metric('learned','Изучено тем',`${mastered} / ${total}`)}
          ${metric('target','Средний результат',`${Number(stats.accuracy)||0}%`,Number(stats.accuracy)>=70?'хороший темп':'есть запас')}
          ${metric('task','Решено заданий',Number(stats.solved)||0,'всего')}
          ${metric('flame','Серия дней',Number(stats.streak)||0,`${plural(stats.streak,'день','дня','дней')} подряд`)}
        </div>
        <aside class="premium-quote"><strong>«Дисциплина превращает цели в реальность»</strong><span></span></aside>
      </div>
      <div class="premium-side-stack">${weekHtml(weak)}${calendarHtml()}</div>
    </div>
  </section>`;
 }
 function sidePro(){
  const side=$('.sidebar .side-bottom');
  if(!side||$('.premium-side-pro'))return;
  const box=document.createElement('div');box.className='premium-side-pro';
  box.innerHTML='<b>Стань лучше с ОСНОВОЙ PRO</b><p>Личный план, аналитика и AI-репетитор для твоего роста.</p><button type="button">Перейти в PRO →</button>';
  box.querySelector('button').onclick=()=>goTo('pro');
  side.parentNode.insertBefore(box,side);
 }
 function bind(root){
  root.querySelectorAll('[data-premium-nav]').forEach(b=>b.onclick=()=>goTo(b.dataset.premiumNav));
  root.querySelectorAll('[data-premium-train]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.premiumTrain)||0;
    if(typeof window.startTraining==='function')window.startTraining(id,'topic');
    else goTo(id?`topic/${id}`:'biology');
  });
 }
 async function mount(){
  if(mounting||route()!=='dashboard'||document.getElementById(ROOT))return;
  const main=$('main[data-page="dashboard"]');if(!main)return;
  mounting=true;
  try{
    const data=await api('/me');
    if(route()!=='dashboard'||!main.isConnected)return;
    const holder=document.createElement('div');holder.innerHTML=dashboardHtml(data);const node=holder.firstElementChild;
    const top=$('.topbar',main);if(top)top.insertAdjacentElement('afterend',node);else main.prepend(node);
    bind(node);sidePro();
  }catch(error){console.warn('premium-dashboard-v2',error?.message||error)}finally{mounting=false;}
 }
 const app=$('#app');if(app)new MutationObserver(()=>{if(route()==='dashboard')queueMicrotask(mount);sidePro();}).observe(app,{childList:true,subtree:true});
 addEventListener('hashchange',()=>setTimeout(mount,0));
 setTimeout(()=>{mount();sidePro()},0);
})();
