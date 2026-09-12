(()=>{
'use strict';

const JOURNAL_TAB='problem-journal';
let statusCache=null,statusAt=0,filter='open',reportsCache=[];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const categories={question:'Ошибка в задании',theory:'Ошибка в теории',image:'Картинка / схема',technical:'Техническая ошибка',other:'Другое'};
const statusNames={new:'Новое',in_progress:'В работе',resolved:'Исправлено',dismissed:'Отклонено'};

const style=document.createElement('style');
style.textContent=`
.problem-report-fab{position:fixed;right:22px;bottom:76px;z-index:69;border:1px solid rgba(143,208,174,.3);background:rgba(7,16,12,.88);color:#eaf8f0;border-radius:999px;padding:9px 13px;font:inherit;font-size:12px;cursor:pointer;backdrop-filter:blur(12px);box-shadow:0 10px 30px rgba(0,0,0,.2)}
.problem-report-fab:hover{border-color:rgba(143,208,174,.58)}
.problem-modal{position:fixed;inset:0;z-index:1200;background:rgba(0,0,0,.58);display:grid;place-items:center;padding:18px;backdrop-filter:blur(8px)}
.problem-modal-card{width:min(520px,100%);background:var(--panel,#0c1712);border:1px solid rgba(143,208,174,.22);border-radius:20px;padding:21px;box-shadow:0 24px 70px rgba(0,0,0,.45)}
.problem-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:15px;margin-bottom:14px}.problem-modal-head h2{margin:2px 0 4px;font-size:21px}.problem-modal-head p{margin:0;opacity:.65;font-size:12px}.problem-close{border:0;background:transparent;color:inherit;font-size:26px;cursor:pointer;line-height:1}
.problem-modal-card select,.problem-modal-card textarea,.problem-note{width:100%;box-sizing:border-box}.problem-modal-card textarea{min-height:120px;resize:vertical}.problem-modal-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}.problem-modal-actions small{font-size:11px;opacity:.55;max-width:290px}
.problem-journal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:16px}.problem-journal-head h2{margin:4px 0}.problem-filters{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 15px}.problem-filter{border:1px solid rgba(143,208,174,.17);background:rgba(0,0,0,.12);color:inherit;border-radius:999px;padding:8px 11px;font:inherit;font-size:12px;cursor:pointer}.problem-filter.active{border-color:#58e99a;background:rgba(61,220,127,.13)}
.problem-list{display:grid;gap:12px}.problem-item{padding:17px}.problem-item-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.problem-meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.problem-tag{font-size:11px;border:1px solid rgba(143,208,174,.18);border-radius:999px;padding:5px 8px;background:rgba(143,208,174,.06)}.problem-status-new{border-color:rgba(255,206,92,.35)}.problem-status-in_progress{border-color:rgba(106,185,255,.4)}.problem-status-resolved{border-color:rgba(93,236,151,.42)}.problem-status-dismissed{opacity:.6}.problem-date{font-size:11px;opacity:.52;white-space:nowrap}.problem-message{font-size:14px;line-height:1.55;margin:13px 0;white-space:pre-wrap}.problem-context{padding:10px 11px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(0,0,0,.1);font-size:12px;line-height:1.45;opacity:.82}.problem-context b{display:block;margin-bottom:4px}.problem-note{min-height:62px;resize:vertical;margin-top:11px}.problem-item-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.problem-empty{padding:30px;text-align:center;opacity:.65}.problem-overview-card{cursor:pointer}
@media(max-width:720px){.problem-report-fab{right:14px;bottom:132px;padding:9px 11px}.problem-report-fab span{display:none}.problem-modal{padding:10px}.problem-modal-card{border-radius:17px;padding:17px}.problem-modal-actions{align-items:flex-end}.problem-journal-head{flex-direction:column}.problem-item-top{flex-direction:column}.problem-date{white-space:normal}}
`;
document.head.appendChild(style);

async function staffStatus(force=false){
  if(!force&&statusCache&&Date.now()-statusAt<30000)return statusCache;
  try{
    const r=await fetch('/api/moderator/status',{credentials:'same-origin',cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    statusCache={moderator:Boolean(d.moderator),admin:Boolean(d.admin)};
  }catch{statusCache={moderator:false,admin:typeof state!=='undefined'&&state.user?.role==='admin'}}
  statusAt=Date.now();return statusCache;
}

function loggedIn(){return typeof state!=='undefined'&&Boolean(state?.user)}
function toast(message){if(typeof notify==='function')return notify(message);const t=document.querySelector('#toast');if(t){t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}}

function pageContext(){
  const card=document.querySelector('.training .question-card,.question-card');
  const preferred=card?.querySelector('.question-prompt,.prompt,.task-text,[data-question-prompt]');
  const heading=document.querySelector('.main h1,.content h1,.page h1,.admin-console h1,h1,h2');
  const questionText=(preferred?.innerText||card?.innerText||'').replace(/\s+/g,' ').trim().slice(0,900);
  const questionId=Number(card?.dataset?.questionId||document.querySelector('[data-question-id]')?.dataset?.questionId||0)||undefined;
  return {
    pageTitle:document.title.slice(0,180),
    heading:(heading?.innerText||'').replace(/\s+/g,' ').trim().slice(0,180),
    questionText,
    questionId,
  };
}

function closeReportModal(){document.querySelector('#problem-report-modal')?.remove()}
function openReportModal(){
  if(document.querySelector('#problem-report-modal'))return;
  const modal=document.createElement('div');modal.id='problem-report-modal';modal.className='problem-modal';
  modal.innerHTML=`<section class="problem-modal-card" role="dialog" aria-modal="true" aria-labelledby="problem-title"><div class="problem-modal-head"><div><div class="eyebrow">ОСНОВА</div><h2 id="problem-title">Сообщить о проблеме</h2><p>Страница и контекст прикрепятся автоматически.</p></div><button type="button" class="problem-close" aria-label="Закрыть">×</button></div><form id="problem-report-form"><div class="field"><label>ТИП ПРОБЛЕМЫ</label><select name="category"><option value="question">Ошибка в задании</option><option value="theory">Ошибка в теории</option><option value="image">Картинка / схема</option><option value="technical">Техническая ошибка</option><option value="other">Другое</option></select></div><div class="field"><label>ЧТО НЕ ТАК?</label><textarea name="message" maxlength="2000" placeholder="Например: правильный ответ не совпадает с объяснением…" required></textarea></div><div class="problem-modal-actions"><small>Сообщение попадёт в журнал модератора. Имя и почта ученика там не показываются.</small><button class="btn" type="submit">Отправить</button></div></form></section>`;
  document.body.appendChild(modal);
  modal.querySelector('.problem-close').onclick=closeReportModal;
  modal.addEventListener('click',e=>{if(e.target===modal)closeReportModal()});
  const form=modal.querySelector('#problem-report-form');
  form.onsubmit=async e=>{
    e.preventDefault();const button=form.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Отправляем…';
    try{
      const data=Object.fromEntries(new FormData(form));
      const r=await fetch('/api/problem-reports',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({category:data.category,message:data.message,route:location.hash||'#dashboard',context:pageContext()})});
      const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Не удалось отправить');
      closeReportModal();toast(d.duplicate?'Такое сообщение уже есть в журнале':'Отправлено модератору');
    }catch(err){toast(err.message||'Не удалось отправить');button.disabled=false;button.textContent='Отправить'}
  };
  setTimeout(()=>form.message?.focus(),30);
}

function ensureReportButton(){
  const existing=document.querySelector('#problem-report-fab');
  if(!loggedIn()){existing?.remove();return}
  if(existing)return;
  const btn=document.createElement('button');btn.id='problem-report-fab';btn.className='problem-report-fab';btn.type='button';btn.innerHTML='⚑ <span>Сообщить о проблеме</span>';btn.onclick=openReportModal;document.body.appendChild(btn);
}

function ensureJournalTab(){
  staffStatus().then(s=>{
    if(!s.moderator&&!s.admin)return;
    const tabs=document.querySelector('.admin-tabs');if(!tabs||tabs.querySelector(`[data-admin-tab="${JOURNAL_TAB}"]`))return;
    const btn=document.createElement('button');btn.type='button';btn.dataset.adminTab=JOURNAL_TAB;btn.textContent='Журнал проблем';if(typeof adminTab!=='undefined'&&adminTab===JOURNAL_TAB)btn.classList.add('active');
    btn.onclick=()=>{adminTab=JOURNAL_TAB;window.admin?.()};tabs.appendChild(btn);
  }).catch(()=>{});
}

function ensureOverviewCard(){
  staffStatus().then(s=>{
    if(!s.moderator&&!s.admin)return;
    if(typeof adminTab==='undefined'||adminTab!=='overview')return;
    const grid=document.querySelector('.admin-grid');if(!grid||grid.querySelector('[data-problem-open]'))return;
    const btn=document.createElement('button');btn.type='button';btn.className='card admin-action problem-overview-card';btn.dataset.problemOpen='1';btn.innerHTML='<b>Журнал проблем</b><span>Ошибки и замечания, которые прислали ученики</span>';btn.onclick=()=>{adminTab=JOURNAL_TAB;window.admin?.()};grid.appendChild(btn);
  }).catch(()=>{});
}

const fmtDate=value=>{try{return new Date(value).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch{return String(value||'')}};
function contextHtml(report){
  const c=report.context||{};const bits=[];
  if(c.heading)bits.push(`<b>${esc(c.heading)}</b>`);
  if(c.questionText)bits.push(`<span>${esc(c.questionText.slice(0,420))}${c.questionText.length>420?'…':''}</span>`);
  if(!bits.length&&report.route)bits.push(`<span>Страница: ${esc(report.route)}</span>`);
  return bits.length?`<div class="problem-context">${bits.join('')}</div>`:'';
}
function visibleReports(){
  if(filter==='open')return reportsCache.filter(r=>r.status==='new'||r.status==='in_progress');
  if(filter==='all')return reportsCache;
  return reportsCache.filter(r=>r.status===filter);
}
function counts(){return {all:reportsCache.length,open:reportsCache.filter(r=>r.status==='new'||r.status==='in_progress').length,new:reportsCache.filter(r=>r.status==='new').length,in_progress:reportsCache.filter(r=>r.status==='in_progress').length,resolved:reportsCache.filter(r=>r.status==='resolved').length,dismissed:reportsCache.filter(r=>r.status==='dismissed').length}}

async function patchReport(id,status,note){
  const r=await fetch(`/api/problem-reports/${id}`,{method:'PATCH',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({status,note})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Не удалось обновить');return d.report;
}

function bindReportActions(){
  document.querySelectorAll('[data-problem-status]').forEach(btn=>btn.onclick=async()=>{
    const card=btn.closest('[data-problem-id]'),id=Number(card.dataset.problemId),note=card.querySelector('[data-problem-note]')?.value||'';btn.disabled=true;
    try{const updated=await patchReport(id,btn.dataset.problemStatus,note);reportsCache=reportsCache.map(x=>x.id===id?updated:x);renderJournalBody();toast('Журнал обновлён')}catch(e){toast(e.message)}
  });
  document.querySelectorAll('[data-problem-save-note]').forEach(btn=>btn.onclick=async()=>{
    const card=btn.closest('[data-problem-id]'),id=Number(card.dataset.problemId),current=reportsCache.find(x=>x.id===id),note=card.querySelector('[data-problem-note]')?.value||'';btn.disabled=true;
    try{const updated=await patchReport(id,current?.status||'new',note);reportsCache=reportsCache.map(x=>x.id===id?updated:x);renderJournalBody();toast('Заметка сохранена')}catch(e){toast(e.message)}
  });
  document.querySelectorAll('[data-problem-route]').forEach(btn=>btn.onclick=()=>{const route=btn.dataset.problemRoute;if(route&&route.startsWith('#'))location.hash=route});
}

function renderJournalBody(){
  const host=document.querySelector('#problem-journal-body');if(!host)return;const c=counts();const list=visibleReports();
  host.innerHTML=`<div class="problem-filters">${[['open','Открытые',c.open],['new','Новые',c.new],['in_progress','В работе',c.in_progress],['resolved','Исправлено',c.resolved],['dismissed','Отклонено',c.dismissed],['all','Все',c.all]].map(([id,label,n])=>`<button type="button" class="problem-filter ${filter===id?'active':''}" data-problem-filter="${id}">${label} · ${n}</button>`).join('')}</div><div class="problem-list">${list.map(r=>`<article class="card problem-item" data-problem-id="${r.id}"><div class="problem-item-top"><div class="problem-meta"><span class="problem-tag">${esc(categories[r.category]||'Другое')}</span><span class="problem-tag problem-status-${esc(r.status)}">${esc(statusNames[r.status]||r.status)}</span><span class="problem-tag">От ученика · без личных данных</span></div><span class="problem-date">${esc(fmtDate(r.createdAt))}</span></div><div class="problem-message">${esc(r.message)}</div>${contextHtml(r)}<div class="field"><label>ЗАМЕТКА МОДЕРАТОРА</label><textarea class="problem-note" data-problem-note maxlength="2000" placeholder="Что проверили / что нужно исправить…">${esc(r.moderatorNote||'')}</textarea></div><div class="problem-item-actions">${r.route&&r.route.startsWith('#')?`<button type="button" class="btn ghost" data-problem-route="${esc(r.route)}">Открыть страницу</button>`:''}<button type="button" class="btn ghost" data-problem-save-note>Сохранить заметку</button>${r.status!=='in_progress'?'<button type="button" class="btn ghost" data-problem-status="in_progress">В работу</button>':''}${r.status!=='resolved'?'<button type="button" class="btn" data-problem-status="resolved">Исправлено</button>':''}${r.status!=='dismissed'?'<button type="button" class="btn ghost" data-problem-status="dismissed">Отклонить</button>':''}${r.status!=='new'?'<button type="button" class="link" data-problem-status="new">Вернуть в новые</button>':''}</div></article>`).join('')||'<div class="card problem-empty">Здесь пока ничего нет.</div>'}</div>`;
  host.querySelectorAll('[data-problem-filter]').forEach(btn=>btn.onclick=()=>{filter=btn.dataset.problemFilter;renderJournalBody()});bindReportActions();
}

async function renderJournal(){
  const s=await staffStatus();if(!s.moderator&&!s.admin){adminTab='overview';return window.admin?.()}
  adminFrame(`<div class="problem-journal-head"><div><div class="eyebrow">МОДЕРАЦИЯ</div><h2>Журнал проблем</h2><p class="subtitle">Замечания учеников по заданиям, теории, картинкам и работе сайта.</p></div><button type="button" class="btn ghost" id="problem-refresh">Обновить</button></div><div id="problem-journal-body"><div class="card admin-loading">Загружаем сообщения…</div></div>`,'Журнал проблем');
  ensureJournalTab();
  document.querySelector('#problem-refresh').onclick=()=>loadReports(true);
  await loadReports(false);
}

async function loadReports(manual){
  const host=document.querySelector('#problem-journal-body');if(manual&&host)host.innerHTML='<div class="card admin-loading">Обновляем журнал…</div>';
  try{
    const r=await fetch('/api/problem-reports',{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Не удалось загрузить журнал');reportsCache=Array.isArray(d.reports)?d.reports:[];renderJournalBody();
  }catch(e){if(host)host.innerHTML=`<div class="card problem-empty">${esc(e.message)}</div>`}
}

const previousAdmin=window.admin;
window.admin=async function(){
  if(typeof adminTab!=='undefined'&&adminTab===JOURNAL_TAB)return renderJournal();
  const result=await previousAdmin?.();
  queueMicrotask(()=>{ensureJournalTab();ensureOverviewCard()});
  return result;
};

let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;ensureReportButton();if(document.querySelector('.admin-console')){ensureJournalTab();ensureOverviewCard()}})}
const root=document.querySelector('#app');if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
addEventListener('hashchange',schedule);setTimeout(schedule,600);
})();
