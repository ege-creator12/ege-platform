(()=>{
'use strict';
const ROOT_ID='osnova-engagement-zone';
const STORAGE='osnova_daily_challenge_v1';
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const dayKey=()=>new Date().toISOString().slice(0,10);
const api=async(path)=>{
  if(window.OsnovaData)return window.OsnovaData.request('/api'+path);
  const r=await fetch('/api'+path,{credentials:'same-origin',headers:{accept:'application/json'}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||'Ошибка загрузки');
  return d;
};
const loadState=(solved)=>{
  let s={};
  try{s=JSON.parse(localStorage.getItem(STORAGE)||'{}')}catch{}
  const key=dayKey();
  if(s.day!==key)s={day:key,startSolved:Number(solved)||0,claimed:false};
  if(!Number.isFinite(Number(s.startSolved)))s.startSolved=Number(solved)||0;
  localStorage.setItem(STORAGE,JSON.stringify(s));
  return s;
};
const saveState=s=>localStorage.setItem(STORAGE,JSON.stringify(s));
const render=(data)=>{
  const stats=data.stats||{};
  const solved=Number(stats.solved)||0;
  const streak=Number(stats.streak)||0;
  const state=loadState(solved);
  const progress=Math.max(0,Math.min(5,solved-Number(state.startSolved||0)));
  const complete=progress>=5;
  return `<section id="${ROOT_ID}" class="engagement-zone">
    <article class="daily-challenge-card ${complete?'is-complete':''}">
      <div class="engagement-kicker">Ежедневный челлендж</div>
      <div class="daily-challenge-head">
        <div><h2>5 заданий сегодня</h2><p>Реши любые 5 заданий по биологии или химии. Прогресс считается автоматически.</p></div>
        <div class="daily-ring" style="--p:${progress/5*360}deg"><strong>${progress}/5</strong></div>
      </div>
      <div class="daily-progress"><i style="width:${progress/5*100}%"></i></div>
      <div class="daily-actions">
        <button type="button" class="btn" data-daily-go>${complete?'Челлендж выполнен ✓':'Начать челлендж →'}</button>
        <span>${complete?'Отлично. Серия дня засчитана.':`До цели осталось ${5-progress}`}</span>
      </div>
    </article>
    <article class="streak-card">
      <div class="streak-fire">🔥</div>
      <div><span>Текущая серия</span><strong>${streak} ${streak===1?'день':(streak>=2&&streak<=4?'дня':'дней')}</strong><small>Заходи и решай задания каждый день, чтобы не сбить ритм.</small></div>
    </article>
  </section>`;
};
async function mount(){
  if((location.hash.slice(1)||'dashboard')!=='dashboard')return;
  if(document.getElementById(ROOT_ID))return;
  const dash=document.getElementById('premium-dashboard-v2');
  if(!dash)return;
  try{
    const data=await api('/me');
    if(!dash.isConnected||document.getElementById(ROOT_ID))return;
    const holder=document.createElement('div');
    holder.innerHTML=render(data);
    const node=holder.firstElementChild;
    const subject=$('.premium-subject-menu',dash);
    if(subject)subject.insertAdjacentElement('afterend',node); else dash.prepend(node);
    const go=$('[data-daily-go]',node);
    if(go)go.onclick=()=>{ if(!go.textContent.includes('выполнен')) location.hash='biology'; };
  }catch(e){console.warn('engagement-zone',e?.message||e)}
}
const app=document.getElementById('app');
if(app)new MutationObserver(()=>queueMicrotask(mount)).observe(app,{childList:true,subtree:true});
addEventListener('hashchange',()=>setTimeout(mount,0));
setTimeout(mount,0);
})();