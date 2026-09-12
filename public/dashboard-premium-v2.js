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
 function weekHtml(){
  const labels=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  const now=new Date();
  const currentDay=(now.getDay()+6)%7;
  const weekStart=new Date(now);weekStart.setHours(0,0,0,0);weekStart.setDate(weekStart.getDate()-currentDay);
  const tasks=['Биология','Практика по биологии','Разбор ошибок','Теория по биологии','Пробник ЕГЭ','Повторение по биологии','Отдых и лёгкое повторение'];
  const items=tasks.map((t,i)=>{
    const dayDate=new Date(weekStart);dayDate.setDate(weekStart.getDate()+i);
    const cls=i<currentDay?'done':i===currentDay?'today':'';
    const mark=i<currentDay?'✓':i===currentDay?'•':'';
    const date=dayDate.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit'});
    return `<div class="premium-week-item ${cls}" data-week-index="${i}" title="${esc(date)}"><span class="premium-week-day">${labels[i]}</span><span>${esc(t)}</span><span class="premium-week-check">${mark}</span></div>`;
  }).join('');
  return `<section class="premium-week"><div class="premium-week-head"><h3>Мой план на неделю</h3><small>Сегодня · ${labels[currentDay]}</small></div><div class="premium-week-list">${items}</div></section>`;
 }
 function focusHtml(stats){
  const accuracy=Math.max(0,Math.min(100,Number(stats.accuracy)||0));
  const solved=Math.max(0,Number(stats.solved)||0);
  const streak=Math.max(0,Number(stats.streak)||0);
  const count=accuracy<50?10:8;
  return `<section class="premium-focus">
    <div class="premium-focus-head"><div><span>Фокус на сегодня</span><h2>Биология</h2></div><b>≈ 35 мин</b></div>
    <p>Выбери тему по биологии, повтори теорию, реши ${count} заданий и разбери ошибки.</p>
    <div class="premium-focus-steps">
      <div><span>01</span><b>Теория</b><small>10–12 мин</small></div>
      <div><span>02</span><b>Практика</b><small>${count} заданий</small></div>
      <div><span>03</span><b>Разбор</b><small>ошибки + повтор</small></div>
    </div>
    <div class="premium-focus-stats"><span>Точность <b>${accuracy}%</b></span><span>Решено <b>${solved}</b></span><span>Серия <b>${streak} ${plural(streak,'день','дня','дней')}</b></span></div>
    <div class="premium-focus-actions"><button class="btn" data-premium-nav="biology">Выбрать тему →</button><button class="btn ghost" data-premium-nav="pro">Спросить AI-куратора</button></div>
  </section>`;
 }
 function subjectMenuHtml(){
  return `<section class="premium-subject-menu" aria-label="Главные разделы">
    <button type="button" class="premium-subject-card premium-subject-card--biology" data-premium-nav="biology">
      <span class="premium-subject-kicker">Основной предмет</span>
      <strong>Биология</strong>
      <small>Теория, темы, линии ЕГЭ и практика по биологии — всё в одном разделе.</small>
      <span class="premium-subject-arrow">Открыть биологию →</span>
    </button>
    <button type="button" class="premium-subject-card premium-subject-card--chemistry" data-premium-nav="chemistry">
      <span class="premium-subject-kicker">Подготовка к ЕГЭ</span>
      <strong>Химия</strong>
      <small>Теория, задания и подготовка по химии без переходов в чужие разделы.</small>
      <span class="premium-subject-arrow">Открыть химию →</span>
    </button>
    <button type="button" class="premium-subject-card premium-subject-card--pro" data-premium-nav="pro">
      <span class="premium-subject-kicker">Персональная подготовка</span>
      <strong>AI PRO</strong>
      <small>AI-куратор, личный план, аналитика и разбор ошибок.</small>
      <span class="premium-subject-arrow">Перейти к AI PRO →</span>
    </button>
  </section>`;
 }
 function metric(kind,label,value,sub=''){return `<article class="premium-metric"><div class="premium-metric-top"><span class="premium-metric-icon">${icon(kind)}</span>${sub?`<small>${esc(sub)}</small>`:''}</div><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`;}
 function leaderboardHtml(){
  return `<section class="premium-leaderboard" aria-labelledby="leaderboard-title">
    <div class="premium-leaderboard-head"><h2 id="leaderboard-title">Таблица лидеров</h2><span class="pill">Топ-5</span></div>
    <p class="premium-leaderboard-caption">По общему количеству XP за задания</p>
    <div data-leaderboard-content aria-live="polite" aria-busy="true"><p class="premium-leaderboard-message">Загружаем лидеров…</p></div>
  </section>`;
 }
 async function loadLeaderboard(root){
  const host=$('[data-leaderboard-content]',root);
  if(!host||host.dataset.loading==='true')return;
  host.dataset.loading='true';host.setAttribute('aria-busy','true');
  try{
    const data=await api('/leaderboard');
    if(!root.isConnected)return;
    if(!Array.isArray(data.leaders))throw new Error('Некорректный рейтинг');
    const leaders=data.leaders.slice(0,5);
    host.innerHTML=leaders.length?`<ol class="premium-leaderboard-list" aria-label="Пять лидеров по XP">${leaders.map((leader,index)=>`<li class="premium-leaderboard-row ${leader.isYou?'is-you':''}">
      <span class="premium-leaderboard-rank" aria-hidden="true">${index+1}</span>
      <span class="premium-leaderboard-name">${esc(leader.name||'Ученик')}${leader.isYou?'<small>Вы</small>':''}</span>
      <span class="premium-leaderboard-xp">${esc((Number(leader.xp)||0).toLocaleString('ru-RU'))}<small>XP</small></span>
    </li>`).join('')}</ol>`:'<p class="premium-leaderboard-message">Пока нет участников. Здесь появятся первые ученики.</p>';
  }catch{
    if(!root.isConnected)return;
    host.innerHTML='<p class="premium-leaderboard-message">Не удалось загрузить лидеров.</p><button type="button" class="btn ghost" data-leaderboard-retry>Повторить</button>';
    $('[data-leaderboard-retry]',host).onclick=()=>loadLeaderboard(root);
  }finally{host.dataset.loading='false';host.setAttribute('aria-busy','false');}
 }
 function dashboardHtml(data){
  const user=data.user||{},stats=data.stats||{};
  const progress=Array.isArray(stats.progress)?[...stats.progress]:[];
  const mastered=progress.filter(x=>(Number(x.mastery)||0)>=80).length;
  const total=Math.max(progress.length,28);
  return `<section id="${ROOT}" class="premium-dashboard-v2">
    <section class="premium-hero">
      <div class="premium-hero-copy">
        <div class="premium-kicker">Знания · дисциплина · результат</div>
        <h1>Больше, чем<br>подготовка <em>к ЕГЭ</em></h1>
        <p>Понятная теория. Реальные задания. Твой результат — в одном спокойном и красивом пространстве.</p>
        <div class="premium-hero-actions"><button class="btn" data-premium-nav="biology">Биология →</button><button class="btn ghost" data-premium-nav="chemistry">Химия →</button></div>
      </div>
      <aside class="premium-hero-note"><span>ОСНОВА · ЕГЭ</span><strong>Маленькие шаги к большим результатам</strong><small>${esc(user.name||'Ученик')}, главное — продолжать регулярно.</small></aside>
    </section>
    ${subjectMenuHtml()}
    <div class="premium-main-grid">
      <div class="premium-left-stack">
        <section class="premium-continue">
          <div class="premium-section-title"><h2>Продолжить обучение</h2><span>→</span></div>
          <div class="premium-continue-body">
            <div class="premium-cover" aria-hidden="true"></div>
            <div class="premium-course-copy"><div class="premium-course-meta">Подготовка к ЕГЭ</div><h3>Биология</h3><p>Открой темы по биологии, выбери урок и переходи к практике.</p></div>
            <button class="btn" data-premium-nav="biology">К темам →</button>
          </div>
        </section>
        <div class="premium-results">
          ${metric('learned','Изучено тем',`${mastered} / ${total}`)}
          ${metric('target','Средний результат',`${Number(stats.accuracy)||0}%`,Number(stats.accuracy)>=70?'хороший темп':'есть запас')}
          ${metric('task','Решено заданий',Number(stats.solved)||0,'всего')}
          ${metric('flame','Серия дней',Number(stats.streak)||0,`${plural(stats.streak,'день','дня','дней')} подряд`)}
        </div>
        ${focusHtml(stats)}
        <aside class="premium-quote"><strong>«Дисциплина превращает цели в реальность»</strong><span></span></aside>
      </div>
      <div class="premium-side-stack">${leaderboardHtml()}${weekHtml()}${calendarHtml()}</div>
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
    bind(node);sidePro();loadLeaderboard(node);
  }catch(error){console.warn('premium-dashboard-v2',error?.message||error)}finally{mounting=false;}
 }
 const app=$('#app');if(app)new MutationObserver(()=>{if(route()==='dashboard')queueMicrotask(mount);sidePro();}).observe(app,{childList:true,subtree:true});
 addEventListener('hashchange',()=>setTimeout(mount,0));
 setInterval(()=>{
  if(route()!=='dashboard')return;
  const root=document.getElementById(ROOT);if(!root)return;
  const old=$('.premium-week',root);if(!old)return;
  old.outerHTML=weekHtml();
 },60000);
 setTimeout(()=>{mount();sidePro()},0);
})();
