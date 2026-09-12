(()=>{
  'use strict';

  const configs={
    biology:{key:'biology',label:'Биология',base:'/subjects/biology/mock-exams',listRoute:'mocks',lineRoute:n=>`biology/line/${n}`,lineLabel:n=>`Линия ${n}`},
    chemistry:{key:'chemistry',label:'Химия',base:'/subjects/chemistry/mock-exams',listRoute:'chemistry/mocks',lineRoute:n=>`chemistry/line/${n}`,lineLabel:n=>`Задание ${n}`},
  };

  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const apiResult=async path=>{
    const r=await fetch('/api'+path,{credentials:'same-origin',headers:{accept:'application/json'}});
    const text=await r.text();let d={};
    try{d=text?JSON.parse(text):{}}catch{throw new Error('Сервер вернул некорректный ответ')}
    if(!r.ok)throw new Error(d.error||`Ошибка ${r.status}`);
    return d;
  };
  const patch=async(path,body)=>{
    const r=await fetch('/api'+path,{method:'PATCH',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const text=await r.text();let d={};try{d=text?JSON.parse(text):{}}catch{}
    if(!r.ok)throw new Error(d.error||`Ошибка ${r.status}`);return d;
  };
  const answerText=value=>{
    const v=value?.examAnswer??value;
    if(Array.isArray(v))return v.map(x=>String(x??'').trim()).filter(Boolean).join(', ');
    if(v&&typeof v==='object')return Object.values(v).flat().map(x=>String(x??'').trim()).filter(Boolean).join(', ');
    return String(v??'').trim();
  };
  const givenText=item=>answerText(item.review?.givenAnswer)||answerText(item.answer)||'—';
  const expectedText=item=>answerText(item.review?.reviewAnswer)||answerText(item.review?.answer)||'—';
  const hasAnswer=item=>answerText(item.answer).length>0||answerText(item.review?.givenAnswer).length>0;
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

  const style=document.createElement('style');
  style.textContent=`
    .mock-analysis{max-width:1180px;margin:0 auto 48px}.mock-analysis-hero{padding:26px!important;margin:0 0 16px;background:linear-gradient(135deg,rgba(35,128,85,.14),rgba(255,255,255,.03))!important}
    .mock-analysis-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;flex-wrap:wrap}.mock-analysis-score strong{display:block;font-size:clamp(42px,7vw,76px);line-height:.95;letter-spacing:-.05em}.mock-analysis-score span{display:block;margin-top:9px;opacity:.68;font-size:14px}.mock-analysis-verdict{max-width:610px}.mock-analysis-verdict h1{margin:5px 0 9px;font-size:clamp(25px,3.2vw,38px)}.mock-analysis-verdict p{margin:0;line-height:1.6;color:var(--muted)}
    .mock-analysis-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:14px 0 22px}.mock-analysis-metric{padding:16px!important}.mock-analysis-metric span{display:block;font-size:12px;opacity:.62;margin-bottom:6px}.mock-analysis-metric strong{font-size:24px}.mock-analysis-metric small{display:block;margin-top:5px;opacity:.62}
    .mock-analysis-grid{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(280px,.88fr);gap:14px;margin:14px 0}.mock-analysis-section{padding:20px!important}.mock-analysis-section h2{margin:0 0 4px}.mock-analysis-section>.subtitle{margin-bottom:14px}
    .mock-loss-list,.mock-plan-list,.mock-strong-list{display:flex;flex-direction:column;gap:8px}.mock-loss-row,.mock-plan-row,.mock-strong-row{display:flex;align-items:center;gap:12px;padding:12px;border-radius:13px;background:rgba(255,255,255,.035)}.mock-loss-line{min-width:82px;font-weight:800}.mock-loss-copy{min-width:0;flex:1}.mock-loss-copy b{display:block}.mock-loss-copy small{display:block;opacity:.62;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mock-loss-points{font-weight:800;color:#ffb1aa;white-space:nowrap}.mock-strong-row .mock-loss-points{color:#92deb6}
    .mock-plan-num{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:rgba(55,154,105,.15);font-weight:800;flex:0 0 auto}.mock-plan-row .btn{margin-left:auto;min-height:36px;padding:7px 11px}.mock-plan-row p{margin:2px 0 0;font-size:13px;opacity:.65}
    .mock-analysis-actions{display:flex;gap:9px;flex-wrap:wrap;margin:16px 0 4px}.mock-analysis-actions .btn{min-height:42px}
    .mock-review-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:24px 0 10px}.mock-review-filters{display:flex;gap:7px;flex-wrap:wrap}.mock-review-filters button{border:0;border-radius:999px;padding:8px 12px;background:rgba(255,255,255,.06);color:inherit;cursor:pointer}.mock-review-filters button.active{background:rgba(55,154,105,.2);color:#c9f6da}
    .mock-analysis .mock-review details{margin-bottom:9px;overflow:hidden}.mock-analysis .mock-review details[hidden]{display:none}.mock-analysis .mock-review summary{display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer}.mock-review-title{display:flex;align-items:center;gap:9px}.mock-review-state{width:10px;height:10px;border-radius:50%;background:#91d8b3}.mock-review-state.bad{background:#ff948b}.mock-review-state.pending{background:#e5bd72}.mock-review-score{font-weight:800;white-space:nowrap}.mock-review-body{padding-top:14px}.mock-review-body h3{line-height:1.45}.mock-review-body p{line-height:1.58}.mock-review-body ul,.mock-review-body ol{padding-left:22px;line-height:1.55}.mock-review-answer{display:grid;grid-template-columns:1fr 1fr;gap:9px}.mock-review-answer>div{padding:12px;border-radius:12px;background:rgba(255,255,255,.035)}.mock-review-answer small{display:block;opacity:.58;margin-bottom:5px}.mock-review-answer b{overflow-wrap:anywhere}.mock-self-score-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:12px 0}.mock-self-score-row input{width:86px}.mock-empty-analysis{padding:18px;text-align:center;opacity:.7}
    @media(max-width:820px){.mock-analysis-metrics{grid-template-columns:1fr 1fr}.mock-analysis-grid{grid-template-columns:1fr}.mock-review-answer{grid-template-columns:1fr}.mock-plan-row{align-items:flex-start;flex-wrap:wrap}.mock-plan-row .btn{margin-left:46px}}
    @media(max-width:480px){.mock-analysis-hero{padding:18px!important}.mock-analysis-metrics{gap:7px}.mock-analysis-metric{padding:13px!important}.mock-analysis-metric strong{font-size:20px}.mock-analysis-section{padding:15px!important}.mock-loss-line{min-width:68px}.mock-analysis-actions .btn{flex:1 1 150px}}
  `;
  document.head.appendChild(style);

  function itemState(item){
    const max=Math.max(0,Number(item.maxScore)||0),extended=Boolean(item.review?.extended),self=item.selfScore==null||item.selfScore===''?null:clamp(Number(item.selfScore)||0,0,max),auto=clamp(Number(item.autoScore)||0,0,max),pending=extended&&self===null,earned=extended?(self??0):auto,loss=Math.max(0,max-earned),answered=hasAnswer(item);
    return{item,max,extended,self,auto,pending,earned,loss,answered,perfect:!pending&&earned>=max};
  }

  function verdict(percent,lost,pending){
    if(pending)return{title:'Сначала оцени развёрнутые ответы',text:`Часть результата пока предварительная: ${pending} ${pending===1?'задание требует':'задания требуют'} самопроверки по критериям. После оценки план пересчитается автоматически.`};
    if(percent>=90)return{title:'Очень сильный пробник',text:lost?`До почти идеального результата осталось добрать ${lost} первичных баллов. Ниже — конкретные места, где они потерялись.`:'Ошибок по первичным баллам нет. Следующий шаг — удерживать результат на новых вариантах.'};
    if(percent>=75)return{title:'Хорошая база, есть что быстро добрать',text:`Большая часть варианта уже держится. Сейчас выгоднее не перечитывать всё, а точечно закрыть линии, где потеряны ${lost} первичных баллов.`};
    if(percent>=55)return{title:'Результат можно заметно поднять точечной работой',text:`Главное сейчас — не решать ещё один полный вариант подряд. Сначала закрой 2–3 самые дорогие ошибки из разбора ниже.`};
    return{title:'Пробник показал, с чего начинать',text:'Не распыляйся на весь курс. Сначала разберём самые слабые линии, затем закрепим их короткими тренировками и только потом вернёмся к полному варианту.'};
  }

  function reviewCard(cfg,state){
    const x=state.item,r=x.review||{},score=state.pending?'самопроверка':`${state.earned} / ${state.max}`,kind=state.pending?'pending':state.perfect?'good':'bad';
    const explanation=r.explanation?`<p><b>Почему так:</b> ${safe(r.explanation)}</p>`:'';
    const steps=Array.isArray(r.solutionSteps)&&r.solutionSteps.length?`<p><b>Решение по шагам:</b></p><ol>${r.solutionSteps.map(v=>`<li>${safe(typeof v==='string'?v:(v?.text||v?.description||''))}</li>`).join('')}</ol>`:'';
    const criteria=Array.isArray(r.scoringPoints)&&r.scoringPoints.length?`<p><b>Критерии:</b></p><ul>${r.scoringPoints.map(v=>`<li>${safe(v)}</li>`).join('')}</ul>`:'';
    const mistakes=Array.isArray(r.commonMistakes)&&r.commonMistakes.length?`<p><b>Типичные ошибки:</b> ${safe(r.commonMistakes.join('; '))}</p>`:'';
    const self=state.extended?`<label class="mock-self-score-row"><b>Баллы самопроверки:</b><input data-analysis-self-score data-item="${Number(x.id)}" type="number" min="0" max="${state.max}" value="${x.selfScore??''}"><span>из ${state.max}</span></label>`:'';
    return `<details class="card" data-review-kind="${kind}"><summary><span class="mock-review-title"><i class="mock-review-state ${kind==='good'?'':kind}"></i><b>${Number(x.position)}. ${safe(cfg.lineLabel(x.line))}</b></span><span class="mock-review-score">${score}</span></summary><div class="mock-review-body"><h3>${safe(x.question?.prompt||'Задание')}</h3><div class="mock-review-answer"><div><small>Твой ответ</small><b>${safe(givenText(x))}</b></div><div><small>${state.extended?'Эталон / ориентир':'Правильный ответ'}</small><b>${safe(expectedText(x))}</b></div></div>${explanation}${steps}${criteria}${mistakes}${self}<div class="actions"><button type="button" class="btn ghost" data-analysis-route="${safe(cfg.lineRoute(x.line))}">Потренировать ${safe(cfg.lineLabel(x.line).toLowerCase())}</button></div></div></details>`;
  }

  async function renderResult(cfg,id){
    if(typeof loading==='function')loading();
    try{
      const {attempt:a}=await apiResult(`${cfg.base}/${id}/result`);
      const states=(a.items||[]).map(itemState),max=Number(a.primaryScoreMax||a.primary_score_max)||states.reduce((s,x)=>s+x.max,0),score=states.reduce((s,x)=>s+x.earned,0),pending=states.filter(x=>x.pending).length,lost=Math.max(0,max-score),percent=max?Math.round(score/max*100):0;
      const wrong=states.filter(x=>!x.pending&&!x.perfect).sort((x,y)=>y.loss-x.loss||Number(x.item.position)-Number(y.item.position));
      const missing=states.filter(x=>!x.answered&&!x.pending).length,perfect=states.filter(x=>x.perfect),v=verdict(percent,lost,pending);
      const focus=(wrong.length?wrong:states.filter(x=>x.pending)).slice(0,3);
      const weakHtml=wrong.length?wrong.slice(0,7).map(s=>`<div class="mock-loss-row"><div class="mock-loss-line">${safe(cfg.lineLabel(s.item.line))}</div><div class="mock-loss-copy"><b>${s.answered?'Ошибка в ответе':'Нет ответа'}</b><small>${safe((s.item.question?.prompt||'').slice(0,115))}</small></div><div class="mock-loss-points">−${s.loss}</div></div>`).join(''):`<div class="mock-empty-analysis">В автоматически проверяемой части потерь нет.</div>`;
      const strongHtml=perfect.length?perfect.slice(0,6).map(s=>`<div class="mock-strong-row"><div class="mock-loss-line">${safe(cfg.lineLabel(s.item.line))}</div><div class="mock-loss-copy"><b>Полный балл</b><small>${safe((s.item.question?.prompt||'').slice(0,95))}</small></div><div class="mock-loss-points">${s.earned}/${s.max}</div></div>`).join(''):`<div class="mock-empty-analysis">Сильные линии появятся после первых полных баллов.</div>`;
      const planHtml=focus.length?focus.map((s,i)=>`<div class="mock-plan-row"><div class="mock-plan-num">${i+1}</div><div class="mock-loss-copy"><b>${safe(cfg.lineLabel(s.item.line))}</b><p>${s.pending?'Сверь развёрнутый ответ с критериями и выставь баллы.':s.answered?`Разбери ошибку и сразу закрепи линию короткой тренировкой.`:'Сначала повтори основу линии, затем реши несколько заданий.'}</p></div><button type="button" class="btn ghost" data-analysis-route="${safe(cfg.lineRoute(s.item.line))}">Открыть</button></div>`).join(''):`<div class="mock-empty-analysis">Сейчас нет критичных мест для отдельного плана.</div>`;
      const subjectBack=cfg.listRoute;
      app.innerHTML=shell(`<div class="mock-analysis"><button class="back" data-analysis-route="${safe(subjectBack)}">← К пробникам</button><section class="card mock-analysis-hero"><div class="mock-analysis-head"><div class="mock-analysis-score"><strong>${score}<small style="font-size:.38em;opacity:.6"> / ${max}</small></strong><span>${pending?'Предварительный первичный балл':'Первичный балл'} · ${percent}% от максимума</span></div><div class="mock-analysis-verdict"><div class="eyebrow">${safe(cfg.label)} · разбор пробника</div><h1>${safe(v.title)}</h1><p>${safe(v.text)}</p></div></div><div class="mock-analysis-actions">${focus[0]?`<button class="btn" data-analysis-route="${safe(cfg.lineRoute(focus[0].item.line))}">Начать с ${safe(cfg.lineLabel(focus[0].item.line).toLowerCase())}</button>`:''}<button class="btn ghost" data-analysis-route="${safe(subjectBack)}">Новый пробник</button></div></section><div class="mock-analysis-metrics"><div class="card mock-analysis-metric"><span>Набрано</span><strong>${score} / ${max}</strong><small>первичных баллов</small></div><div class="card mock-analysis-metric"><span>Потеряно сейчас</span><strong>${lost}</strong><small>${pending?'включая неоценённые':'первичных баллов'}</small></div><div class="card mock-analysis-metric"><span>Ошибки</span><strong>${wrong.length}</strong><small>${missing?`без ответа: ${missing}`:'проверяемых заданий'}</small></div><div class="card mock-analysis-metric"><span>Самопроверка</span><strong>${pending}</strong><small>${pending?'ещё нужно оценить':'всё оценено'}</small></div></div><div class="mock-analysis-grid"><section class="card mock-analysis-section"><h2>Где потеряны баллы</h2><p class="subtitle">Сначала самые дорогие ошибки — так быстрее всего растёт результат.</p><div class="mock-loss-list">${weakHtml}</div></section><section class="card mock-analysis-section"><h2>Что делать дальше</h2><p class="subtitle">Короткий план по этому конкретному пробнику.</p><div class="mock-plan-list">${planHtml}</div></section></div><div class="mock-analysis-grid"><section class="card mock-analysis-section"><h2>Что уже держится</h2><p class="subtitle">Линии, где сейчас взят полный балл.</p><div class="mock-strong-list">${strongHtml}</div></section><section class="card mock-analysis-section"><h2>Как читать результат</h2><p class="subtitle">Не гонись сразу за новым полным вариантом.</p><div class="mock-plan-list"><div class="mock-plan-row"><div class="mock-plan-num">1</div><div><b>Разобрать потери</b><p>Открой задания ниже и пойми причину каждой ошибки.</p></div></div><div class="mock-plan-row"><div class="mock-plan-num">2</div><div><b>Закрыть 2–3 слабые линии</b><p>Сделай короткую тренировку именно по ним.</p></div></div><div class="mock-plan-row"><div class="mock-plan-num">3</div><div><b>Повторить полный вариант позже</b><p>Так станет видно, реально ли ошибка исправлена.</p></div></div></div></section></div><div class="mock-review-toolbar"><div><h2 style="margin:0">Подробный разбор</h2><div class="subtitle">Все задания, ответы, объяснения и критерии.</div></div><div class="mock-review-filters"><button class="active" data-review-filter="all">Все</button><button data-review-filter="bad">Ошибки</button>${pending?'<button data-review-filter="pending">Самопроверка</button>':''}<button data-review-filter="good">Верно</button></div></div><div class="mock-review">${states.map(s=>reviewCard(cfg,s)).join('')}</div></div>`);
      if(typeof bindShell==='function')bindShell();
      document.querySelectorAll('[data-analysis-route]').forEach(b=>b.onclick=()=>go(b.dataset.analysisRoute));
      document.querySelectorAll('[data-review-filter]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-review-filter]').forEach(x=>x.classList.toggle('active',x===b));const filter=b.dataset.reviewFilter;document.querySelectorAll('[data-review-kind]').forEach(card=>card.hidden=filter!=='all'&&card.dataset.reviewKind!==filter)});
      document.querySelectorAll('[data-analysis-self-score]').forEach(input=>input.onchange=async()=>{try{input.disabled=true;await patch(`${cfg.base}/${id}/self-score`,{itemId:Number(input.dataset.item),score:Number(input.value)});await renderResult(cfg,id)}catch(e){input.disabled=false;notify(e.message)}});
    }catch(e){notify(e.message);go(cfg.listRoute)}
  }

  const baseRender=render;
  render=async function mockResultAnalysisRender(){
    if(state?.user){
      let m=String(state.route||'').match(/^mocks\/result\/(\d+)$/);if(m)return renderResult(configs.biology,Number(m[1]));
      m=String(state.route||'').match(/^chemistry\/mocks\/result\/(\d+)$/);if(m)return renderResult(configs.chemistry,Number(m[1]));
    }
    return baseRender();
  };
})();