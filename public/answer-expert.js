(()=>{
  'use strict';

  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const confLabel={high:'высокая',medium:'средняя',low:'низкая'};

  const style=document.createElement('style');
  style.textContent=`
    .answer-expert-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}
    .answer-expert-btn,.answer-expert-all{background:linear-gradient(135deg,rgba(88,181,126,.2),rgba(89,125,255,.16))!important;border:1px solid rgba(116,214,157,.24)!important}
    .answer-expert-panel{margin:12px 0;padding:16px;border-radius:16px;background:rgba(61,139,94,.08);border:1px solid rgba(111,206,151,.16)}
    .answer-expert-top{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.answer-expert-score{font-size:24px;font-weight:900}.answer-expert-confidence{font-size:12px;opacity:.62}.answer-expert-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:rgba(86,175,124,.12);font-size:11px;font-weight:800;letter-spacing:.02em}
    .answer-expert-panel h4{margin:14px 0 6px}.answer-expert-panel p{margin:6px 0;line-height:1.55}.answer-expert-panel ul{margin:6px 0;padding-left:20px;line-height:1.5}.answer-expert-panel .improved{padding:11px 12px;border-radius:12px;background:rgba(255,255,255,.04);white-space:pre-wrap}
    .answer-expert-loading{opacity:.7;pointer-events:none}.answer-expert-error{color:#ffaaa3}
    .answer-expert-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:15px 16px;margin:10px 0 18px;border-radius:16px;background:linear-gradient(135deg,rgba(32,117,76,.11),rgba(67,83,173,.08));border:1px solid rgba(100,190,137,.14)}
    .answer-expert-toolbar b{display:block}.answer-expert-toolbar small{display:block;opacity:.63;margin-top:4px;max-width:650px;line-height:1.4}.answer-expert-progress{font-size:12px;opacity:.7;margin-left:6px}
    @media(max-width:620px){.answer-expert-toolbar .btn{width:100%}.answer-expert-actions small{width:100%}}
  `;
  document.head.appendChild(style);

  function routeInfo(){
    const route=String(location.hash||'').replace(/^#/,'');
    let m=route.match(/^chemistry\/mocks\/result\/(\d+)/);
    if(m)return{subject:'chemistry',attemptId:Number(m[1])};
    m=route.match(/^mocks\/result\/(\d+)/);
    if(m)return{subject:'biology',attemptId:Number(m[1])};
    return null;
  }
  function detailsItemId(details){return Number(details.querySelector('[data-analysis-self-score]')?.dataset.item)||0}
  function hasStudentAnswer(details){
    const first=details.querySelector('.mock-review-answer>div:first-child b');
    const value=String(first?.textContent||'').trim();
    return Boolean(value&&value!=='—');
  }
  function listHtml(title,items){
    if(!Array.isArray(items)||!items.length)return'';
    return `<h4>${safe(title)}</h4><ul>${items.map(x=>`<li>${safe(x)}</li>`).join('')}</ul>`;
  }
  function panelHtml(r,maxScore){
    const conf=confLabel[r.confidence]||r.confidence||'—';
    return `<div class="answer-expert-top"><div><span class="answer-expert-badge">AI-проверка · методика ФИПИ</span><div class="answer-expert-score">${r.score==null?'—':safe(r.score)} / ${safe(r.maxScore??maxScore)}</div><div class="answer-expert-confidence">Уверенность: ${safe(conf)} · балл уже учтён в результате</div></div></div>${r.verdict?`<p><b>Вердикт:</b> ${safe(r.verdict)}</p>`:''}${listHtml('Что засчитано',r.found)}${listHtml('Чего не хватает',r.missing)}${listHtml('Ошибки и неточности',r.mistakes)}${r.improvedAnswer?`<h4>Как можно ответить лучше</h4><div class="improved">${safe(r.improvedAnswer)}</div>`:''}`;
  }

  async function post(path,body,timeout=35000){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||`Ошибка ${response.status}`);
      return data;
    }finally{clearTimeout(timer)}
  }

  async function checkOne(details,button,force=false){
    const info=routeInfo(),itemId=detailsItemId(details),input=details.querySelector('[data-analysis-self-score]');
    if(!info||!itemId)return;
    let panel=details.querySelector('.answer-expert-panel');
    if(!hasStudentAnswer(details)){
      if(!panel){panel=document.createElement('div');panel.className='answer-expert-panel';details.querySelector('.mock-review-body')?.appendChild(panel)}
      panel.innerHTML='<div class="answer-expert-error">В этом задании нет ответа для AI-проверки.</div>';return;
    }
    button.disabled=true;button.classList.add('answer-expert-loading');button.textContent='AI проверяет…';
    if(!panel){panel=document.createElement('div');panel.className='answer-expert-panel';details.querySelector('.mock-review-body')?.appendChild(panel)}
    panel.innerHTML='<div style="opacity:.68">Сопоставляю ответ с критериями задания поэлементно…</div>';
    try{
      const data=await post('/api/answer-expert/mock-check',{subject:info.subject,attemptId:info.attemptId,itemId,force});
      const r=data.result||{};
      if(input&&r.score!=null)input.value=String(r.score);
      panel.innerHTML=panelHtml(r,Number(input?.max)||r.maxScore||0);
      button.textContent='✓ Проверено AI';
    }catch(error){
      panel.innerHTML=`<div class="answer-expert-error">${safe(error?.name==='AbortError'?'AI отвечает слишком долго. Попробуй ещё раз.':error?.message||'Не удалось проверить ответ')}</div>`;
      button.textContent='✦ Проверить AI';
    }finally{button.disabled=false;button.classList.remove('answer-expert-loading')}
  }

  async function checkAll(button){
    const info=routeInfo();if(!info)return;
    const status=button.parentElement?.querySelector('[data-answer-expert-progress]');
    button.disabled=true;button.textContent='Проверяю вторую часть…';if(status)status.textContent='AI сверяет все заполненные развёрнутые ответы';
    try{
      const data=await post('/api/answer-expert/mock-check-all',{subject:info.subject,attemptId:info.attemptId},70000);
      if(status)status.textContent=`Проверено ${data.checked} из ${data.total}. Баллы уже добавлены к результату.`;
      button.textContent='✓ Вторая часть проверена';
      setTimeout(()=>{if(typeof window.render==='function')window.render();else location.reload()},900);
    }catch(error){
      if(status)status.textContent=error?.name==='AbortError'?'Проверка заняла слишком много времени. Можно проверить задания по одному.':(error?.message||'Не удалось проверить вторую часть');
      button.disabled=false;button.textContent='✦ Проверить вторую часть AI';
    }
  }

  function enhance(){
    const info=routeInfo();
    if(!info)return;
    const review=document.querySelector('.mock-review');
    if(!review)return;
    const extended=[...review.querySelectorAll('details')].filter(details=>details.querySelector('[data-analysis-self-score]'));
    if(!extended.length)return;

    extended.forEach(details=>{
      const input=details.querySelector('[data-analysis-self-score]');
      if(details.querySelector('[data-answer-expert-check]'))return;
      const row=document.createElement('div');row.className='answer-expert-actions';
      const already=input.value!=='';
      row.innerHTML=`<button type="button" class="btn answer-expert-btn" data-answer-expert-check>${already?'✦ Посмотреть AI-проверку':'✦ Проверить AI'}</button><small style="opacity:.58">Поэлементная проверка по критериям задания и методике ФИПИ · Cerebras</small>`;
      input.closest('.mock-self-score-row')?.insertAdjacentElement('afterend',row);
    });

    if(!document.querySelector('[data-answer-expert-all]')){
      const toolbar=document.createElement('div');toolbar.className='answer-expert-toolbar';
      const pending=extended.filter(d=>hasStudentAnswer(d)&&d.querySelector('[data-analysis-self-score]')?.value==='').length;
      toolbar.innerHTML=`<div><b>AI-проверка второй части</b><small>ОСНОВА берёт условие, эталон и критерии прямо из пробника на сервере. AI оценивает ответ поэлементно; это автоматическая оценка по методике ФИПИ, а не официальная проверка ФИПИ.</small><span class="answer-expert-progress" data-answer-expert-progress>${pending?`Ждут проверки: ${pending}`:'Баллы второй части уже выставлены'}</span></div><button type="button" class="btn answer-expert-all" data-answer-expert-all ${pending?'':'disabled'}>${pending?'✦ Проверить вторую часть AI':'✓ Вторая часть оценена'}</button>`;
      const target=document.querySelector('.mock-review-toolbar')||review;
      if(target===review)review.insertAdjacentElement('beforebegin',toolbar);else target.insertAdjacentElement('afterend',toolbar);
    }
  }

  document.addEventListener('click',event=>{
    const one=event.target.closest('[data-answer-expert-check]');
    if(one){const details=one.closest('details');if(details)checkOne(details,one);return}
    const all=event.target.closest('[data-answer-expert-all]');if(all)checkAll(all);
  });

  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance()})};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
  schedule();
})();
