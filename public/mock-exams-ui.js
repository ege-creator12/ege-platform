/* Mock exams v2: resilient UI, unlimited variants, checks, hints and reveal flow. */
const M2cache=new Map();
const M2json=value=>{try{return typeof value==='string'?JSON.parse(value):value}catch{return value}};
const M2answerText=value=>{const v=M2json(value);if(Array.isArray(v))return v.join(', ');if(v&&typeof v==='object')return Object.values(v).join(', ');return String(v??'—')};
const M2isAnswered=item=>Array.isArray(item.answer)&&item.answer.some(v=>String(v??'').trim());

async function M2api(path,opts={}){
  const response=await fetch('/api'+path,{headers:{'content-type':'application/json'},...opts});
  const raw=await response.text();let data={};
  try{data=raw?JSON.parse(raw):{}}catch{
    const looksHtml=/^\s*</.test(raw);
    throw new Error(looksHtml?'Сервер пробников вернул страницу вместо API. Обновите страницу через Ctrl+F5; если ошибка останется — сервер ещё не обновился.':'Сервер вернул некорректный ответ. Попробуйте ещё раз.');
  }
  if(!response.ok)throw new Error(data.error||`Ошибка ${response.status}`);
  return data;
}

function M2media(q){
  let src=q.imageUrl||'';const media=M2json(q.mediaJson);
  if(!src&&media&&typeof media==='object')src=media.src||media.path||media.url||media.imageUrl||'';
  return src?`<figure class="m2-media"><img src="${esc(src)}" alt="Схема к заданию" loading="lazy"></figure>`:'';
}

function M2controls(item){
  const q=item.question||{},kind=String(q.questionType||q.type||''),type=String(q.type||''),answer=Array.isArray(item.answer)?item.answer:[],options=Array.isArray(q.options)?q.options:[];
  if(type==='matching'||type==='sequence'){
    return `<div class="m2-order"><div class="m2-order-options">${options.map((o,n)=>`<div><b>${esc(o.value??n+1)}</b><span>${esc(o.label)}</span></div>`).join('')}</div><label><span>${type==='sequence'?'Введите последовательность':'Введите соответствие'} значений через пробел</span><input id="m2-order-input" class="answer-input" value="${esc(answer.join(' '))}" placeholder="Например: 3 1 4 2" autocomplete="off"></label></div>`;
  }
  if(type==='text'||kind==='extended_answer'||!options.length){
    return `<textarea id="m2-text" class="answer-input mock-text" placeholder="${kind==='extended_answer'?'Введите полный развёрнутый ответ':'Введите ответ'}">${esc(answer[0]||'')}</textarea>`;
  }
  const multi=type==='multiple'||kind==='multiple_answer';
  return `<div class="options">${options.map((o,n)=>{const value=String(o.value),checked=answer.map(String).includes(value);return `<label class="option ${checked?'selected':''}"><input name="m2-answer" type="${multi?'checkbox':'radio'}" value="${esc(value)}" ${checked?'checked':''}><b>${n+1}</b><span>${esc(o.label)}</span></label>`}).join('')}</div>`;
}

function M2readAnswer(){
  const text=document.querySelector('#m2-text');if(text)return [text.value];
  const order=document.querySelector('#m2-order-input');if(order)return order.value.split(/[\s,;]+/).map(x=>x.trim()).filter(Boolean);
  return [...document.querySelectorAll('[name=m2-answer]:checked')].map(x=>x.value);
}

function M2reviewHtml(review){
  if(!review)return '';
  const steps=Array.isArray(review.solutionSteps)?review.solutionSteps.filter(Boolean):[];
  const points=Array.isArray(review.scoringPoints)?review.scoringPoints.filter(Boolean):[];
  const mistakes=Array.isArray(review.commonMistakes)?review.commonMistakes.filter(Boolean):[];
  return `<div class="m2-review"><h3>Разбор</h3><p><b>Правильный ответ:</b> ${esc(M2answerText(review.answer))}</p>${review.explanation?`<p>${esc(review.explanation)}</p>`:''}${steps.length?`<h4>Решение по шагам</h4><ol>${steps.map(x=>`<li>${esc(typeof x==='string'?x:x.text||x.description||JSON.stringify(x))}</li>`).join('')}</ol>`:''}${points.length?`<h4>Критерии</h4><ul>${points.map(x=>`<li>${esc(typeof x==='string'?x:x.text||JSON.stringify(x))}</li>`).join('')}</ul>`:''}${mistakes.length?`<p><b>Типичные ошибки:</b> ${esc(mistakes.map(x=>typeof x==='string'?x:x.text||JSON.stringify(x)).join('; '))}</p>`:''}</div>`;
}

function M2helpState(item){
  if(item.help?.revealed&&item.review)return `<div class="m2-feedback revealed"><b>Ответ открыт — 0 баллов за это задание</b>${M2reviewHtml(item.review)}</div>`;
  if(item.help?.checkCorrect===true)return '<div class="m2-feedback good"><b>Верно ✓</b><span>Ответ сохранён. Можно переходить дальше.</span></div>';
  if(item.help?.checkCorrect===false)return '<div class="m2-feedback bad"><b>Пока неверно</b><span>Попробуйте ещё раз, возьмите подсказку или откройте разбор.</span></div>';
  return '<div class="m2-feedback" id="m2-feedback" hidden></div>';
}

async function M2home(){
  loading();
  try{
    const d=await M2api('/subjects/biology/mock-exams'),variants=d.config.variants||[{number:1,title:'Вариант 1'},{number:2,title:'Вариант 2'},{number:3,title:'Вариант 3'}];
    app.innerHTML=shell(`<div class="m2-home"><header><div class="eyebrow">Пробники · Биология</div><h1>Пробные варианты ЕГЭ</h1><p class="subtitle">${d.config.lineCount} заданий по линиям ЕГЭ. <b>Без ограничения времени.</b> В учебном режиме можно проверить ответ, взять подсказку или открыть разбор.</p></header>${d.activeAttempt?`<aside class="card m2-active"><div><span class="eyebrow">Незавершённый</span><h2>Вариант ${d.activeAttempt.variantNumber||1}</h2><p>Продолжите с сохранёнными ответами.</p></div><button class="btn" data-m2-exam="${d.activeAttempt.id}">Продолжить →</button></aside>`:''}<div class="m2-variants">${variants.map(v=>`<article class="card m2-variant"><span class="m2-variant-no">${String(v.number).padStart(2,'0')}</span><h2>${esc(v.title||`Вариант ${v.number}`)}</h2><p>${d.config.lineCount} заданий · без таймера · проверка и подсказки</p><button class="btn" data-m2-variant="${v.number}">Начать вариант</button></article>`).join('')}</div><div class="section-head"><h2>История пробников</h2></div><div class="card">${d.attempts?.length?d.attempts.map(a=>`<button class="mock-row" data-${a.status==='in_progress'?'m2-exam':'m2-result'}="${a.id}"><span>Вариант ${a.variantNumber||1} · ${new Date(a.started_at).toLocaleDateString('ru-RU')}</span><b>${a.status==='in_progress'?'Продолжить':`${a.primary_score_total??a.auto_primary_score??0} / ${a.primary_score_max}`}</b></button>`).join(''):'<div class="empty">История пока пуста</div>'}</div></div>`);
    bindShell();
    document.querySelectorAll('[data-m2-variant]').forEach(x=>x.onclick=()=>M2start(+x.dataset.m2Variant,Boolean(d.activeAttempt)));
    document.querySelectorAll('[data-m2-exam]').forEach(x=>x.onclick=()=>go('mocks/exam/'+x.dataset.m2Exam));
    document.querySelectorAll('[data-m2-result]').forEach(x=>x.onclick=()=>go('mocks/result/'+x.dataset.m2Result));
  }catch(e){notify(e.message);errorState(M2home)}
}

async function M2start(variant,active){
  if(active&&!confirm('Завершить текущий пробник и начать другой вариант?'))return;
  try{const d=await M2api('/subjects/biology/mock-exams',{method:'POST',body:JSON.stringify({mode:'untimed',variant,confirmNew:active})});sessionStorage.setItem('m2pos:'+d.attempt.id,'0');go('mocks/exam/'+d.attempt.id)}catch(e){notify(e.message)}
}

function M2backupKey(id,itemId){return `m2backup:${id}:${itemId}`}
function M2applyBackups(id,a){
  a.items.forEach(item=>{try{const saved=JSON.parse(localStorage.getItem(M2backupKey(id,item.id))||'null');if(saved){if(!M2isAnswered(item)&&Array.isArray(saved.answer))item.answer=saved.answer;if(saved.flagged!=null)item.flagged=Boolean(saved.flagged)}}catch{}});return a;
}

async function M2save(id,item,silent=false){
  const answer=M2readAnswer(),flagged=Boolean(document.querySelector('#m2-flag')?.checked);item.answer=answer;item.flagged=flagged;
  localStorage.setItem(M2backupKey(id,item.id),JSON.stringify({answer,flagged,at:Date.now()}));
  const label=document.querySelector('#m2-save');if(label&&!silent)label.textContent='Сохраняем…';
  try{await M2api(`/subjects/biology/mock-exams/${id}/answers`,{method:'PATCH',body:JSON.stringify({itemId:item.id,answer,flagged})});localStorage.removeItem(M2backupKey(id,item.id));if(label)label.textContent='Сохранено ✓';return true}catch(e){if(label)label.textContent='Сохранено локально';if(!silent)notify(e.message);return false}
}

function M2renderExam(id,a,pos){
  pos=Math.max(0,Math.min(Number(pos)||0,a.items.length-1));sessionStorage.setItem('m2pos:'+id,String(pos));const item=a.items[pos];
  app.innerHTML=shell(`<div class="mock-exam m2-exam"><div class="mock-head"><button class="back" id="m2-exit">← Пробники</button><span id="m2-save">Сохранено</span><b class="m2-unlimited">∞ Без ограничения времени</b></div><div class="mock-layout"><aside class="card mock-palette">${a.items.map((x,n)=>`<button data-m2-pos="${n}" title="Задание ${x.position}" class="${n===pos?'current':''} ${M2isAnswered(x)?'answered':''} ${x.flagged?'flagged':''} ${x.help?.revealed?'revealed':''}">${x.position}</button>`).join('')}</aside><section class="card question-card"><div class="q-meta"><span class="pill">Вариант ${a.variantNumber||1}</span><span class="pill">Задание ${item.position} из ${a.items.length}</span><span class="pill">Часть ${item.part}</span><span class="pill">Линия ${item.line}</span></div><h2>${esc(item.question.prompt)}</h2>${item.question.instruction?`<p class="m2-instruction">${esc(item.question.instruction)}</p>`:''}${M2media(item.question)}${M2controls(item)}<div class="m2-tools"><button class="btn ghost" id="m2-check" ${item.help?.revealed?'disabled':''}>Проверить ответ</button><button class="btn ghost" id="m2-hint" ${item.help?.revealed?'disabled':''}>Подсказка</button><button class="btn m2-reveal-btn" id="m2-reveal" ${item.help?.revealed?'disabled':''}>Не знаю — показать разбор</button></div><div id="m2-live-help">${M2helpState(item)}</div><label class="return-flag"><input id="m2-flag" type="checkbox" ${item.flagged?'checked':''}> Вернуться позже</label><div class="actions m2-navigation"><button class="btn ghost" id="m2-prev" ${!pos?'disabled':''}>← Назад</button><button class="btn" id="m2-next" ${pos===a.items.length-1?'disabled':''}>Далее →</button><button class="btn ghost" id="m2-finish">Завершить пробник</button></div></section></div></div>`);
  bindShell();
  let timer;document.querySelectorAll('[name=m2-answer],#m2-text,#m2-order-input,#m2-flag').forEach(el=>{const event=el.tagName==='TEXTAREA'||el.id==='m2-order-input'?'input':'change';el.addEventListener(event,()=>{clearTimeout(timer);timer=setTimeout(()=>M2save(id,item,true),450)})});
  const move=async next=>{await M2save(id,item,true);M2renderExam(id,a,next)};
  document.querySelectorAll('[data-m2-pos]').forEach(x=>x.onclick=()=>move(+x.dataset.m2Pos));
  document.querySelector('#m2-prev').onclick=()=>move(pos-1);document.querySelector('#m2-next').onclick=()=>move(pos+1);
  document.querySelector('#m2-exit').onclick=async()=>{await M2save(id,item,true);go('mocks')};
  document.querySelector('#m2-check').onclick=()=>M2check(id,a,item);
  document.querySelector('#m2-hint').onclick=()=>M2hint(id,item);
  document.querySelector('#m2-reveal').onclick=()=>M2reveal(id,a,item);
  document.querySelector('#m2-finish').onclick=()=>M2finish(id,a,item);
}

async function M2exam(id,pos=null){
  loading();
  try{
    let a=M2cache.get(Number(id));
    if(!a){const d=await M2api('/subjects/biology/mock-exams/'+id);a=M2applyBackups(id,d.attempt);M2cache.set(Number(id),a)}
    if(a.status!=='in_progress')return go('mocks/result/'+id);
    const chosen=pos==null?Number(sessionStorage.getItem('m2pos:'+id)||0):Number(pos);M2renderExam(id,a,chosen);
  }catch(e){notify(e.message);go('mocks')}
}

async function M2check(id,a,item){
  const button=document.querySelector('#m2-check');button.disabled=true;await M2save(id,item,true);
  try{const r=await M2api(`/subjects/biology/mock-exams/${id}/items/${item.id}/check`,{method:'POST',body:JSON.stringify({answer:item.answer})});if(r.checkable===false){document.querySelector('#m2-live-help').innerHTML=`<div class="m2-feedback"><b>Нужна самопроверка</b><span>${esc(r.message)}</span></div>`}else{item.help=item.help||{};item.help.checkCorrect=Boolean(r.correct);document.querySelector('#m2-live-help').innerHTML=`<div class="m2-feedback ${r.correct?'good':'bad'}"><b>${r.correct?'Верно ✓':r.score>0?'Частично верно':'Пока неверно'}</b><span>${esc(r.message)}</span></div>`}}catch(e){notify(e.message)}finally{button.disabled=Boolean(item.help?.revealed)}
}

async function M2hint(id,item){
  const button=document.querySelector('#m2-hint');button.disabled=true;
  try{const r=await M2api(`/subjects/biology/mock-exams/${id}/items/${item.id}/hint`,{method:'POST',body:'{}'});item.help=item.help||{};item.help.hintCount=r.hintCount;document.querySelector('#m2-live-help').innerHTML=`<div class="m2-feedback hint"><b>Подсказка ${r.hintCount}</b><span>${esc(r.hint)}</span></div>`}catch(e){notify(e.message)}finally{button.disabled=Boolean(item.help?.revealed)}
}

async function M2reveal(id,a,item){
  if(!confirm('Показать ответ и полный разбор? За это задание в пробнике будет 0 баллов.'))return;
  await M2save(id,item,true);const button=document.querySelector('#m2-reveal');button.disabled=true;
  try{const r=await M2api(`/subjects/biology/mock-exams/${id}/items/${item.id}/reveal`,{method:'POST',body:'{}'});item.help=item.help||{};item.help.revealed=true;item.review=r.review;document.querySelector('#m2-live-help').innerHTML=`<div class="m2-feedback revealed"><b>Ответ открыт — 0 баллов за это задание</b>${M2reviewHtml(r.review)}</div>`;document.querySelector('#m2-check').disabled=true;document.querySelector('#m2-hint').disabled=true}catch(e){button.disabled=false;notify(e.message)}
}

async function M2finish(id,a,item){
  await M2save(id,item,true);const empty=a.items.filter(x=>!M2isAnswered(x)&&!x.help?.revealed).length;
  if(!confirm(`Завершить пробник? Незаполненных заданий: ${empty}. После сдачи ответы нельзя будет менять.`))return;
  try{await M2api(`/subjects/biology/mock-exams/${id}/submit`,{method:'POST',body:'{}'});M2cache.delete(Number(id));go('mocks/result/'+id)}catch(e){notify(e.message)}
}

async function M2result(id){
  loading();
  try{
    const {attempt:a}=await M2api(`/subjects/biology/mock-exams/${id}/result`),score=a.items.reduce((s,x)=>s+Number(x.autoScore||0)+Number(x.selfScore||0),0),weak=[...new Set(a.items.filter(x=>!x.review?.extended&&Number(x.autoScore||0)<Number(x.maxScore)).map(x=>x.line))];
    app.innerHTML=shell(`<div class="mock-result m2-result"><header><div class="eyebrow">Вариант ${a.variantNumber||1} завершён</div><h1>${score} / ${a.primaryScoreMax}</h1><p class="subtitle">Первичный балл. Открытые через «Не знаю» задания получили 0. Развёрнутые ответы без открытия разбора оцениваются вами по критериям.</p></header>${weak.length?`<div class="card weak-lines"><b>Стоит повторить:</b> ${weak.map(n=>`<button data-nav="biology/line/${n}">линия ${n}</button>`).join(' ')}</div>`:''}<div class="section-head"><h2>Полный разбор</h2><button class="btn" id="m2-new">Другой вариант</button></div><div class="mock-review">${a.items.map(x=>`<details class="card ${x.help?.revealed?'m2-zero':''}"><summary><b>${x.position}. Линия ${x.line}</b><span>${x.help?.revealed?'0 · ответ был открыт':x.review?.extended?'самопроверка':`${x.autoScore||0} / ${x.maxScore}`}</span></summary><h3>${esc(x.question.prompt)}</h3><p><b>Ваш ответ:</b> ${esc((x.answer||[]).join(', ')||'—')}</p>${M2reviewHtml(x.review)}${x.review?.extended&&!x.help?.revealed?`<label class="m2-self">Баллы по критериям (0–${x.maxScore}) <input class="self-score" data-item="${x.id}" type="number" min="0" max="${x.maxScore}" value="${x.selfScore??''}"></label>`:''}<div class="actions"><button class="btn ghost" data-nav="biology/line/${x.line}">Потренировать линию ${x.line}</button></div></details>`).join('')}</div></div>`);
    bindShell();document.querySelector('#m2-new').onclick=()=>go('mocks');document.querySelectorAll('.self-score').forEach(x=>x.onchange=async()=>{try{await M2api(`/subjects/biology/mock-exams/${id}/self-score`,{method:'PATCH',body:JSON.stringify({itemId:+x.dataset.item,score:+x.value})});M2result(id)}catch(e){notify(e.message)}});
  }catch(e){notify(e.message);go('mocks')}
}

mocks=M2home;
startMock=(variant,active)=>M2start(Number(variant)||1,active);
mockExam=M2exam;
mockResult=M2result;
