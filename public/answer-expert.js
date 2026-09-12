(()=>{
  'use strict';

  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  const style=document.createElement('style');
  style.textContent=`
    .answer-expert-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}
    .answer-expert-btn{background:linear-gradient(135deg,rgba(88,181,126,.2),rgba(89,125,255,.16))!important;border:1px solid rgba(116,214,157,.24)!important}
    .answer-expert-panel{margin:12px 0;padding:16px;border-radius:16px;background:rgba(61,139,94,.08);border:1px solid rgba(111,206,151,.16)}
    .answer-expert-top{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.answer-expert-score{font-size:24px;font-weight:900}.answer-expert-confidence{font-size:12px;opacity:.62}
    .answer-expert-panel h4{margin:14px 0 6px}.answer-expert-panel p{margin:6px 0;line-height:1.55}.answer-expert-panel ul{margin:6px 0;padding-left:20px;line-height:1.5}.answer-expert-panel .improved{padding:11px 12px;border-radius:12px;background:rgba(255,255,255,.04);white-space:pre-wrap}
    .answer-expert-loading{opacity:.7;pointer-events:none}.answer-expert-error{color:#ffaaa3}
  `;
  document.head.appendChild(style);

  function text(el){return String(el?.textContent||'').trim()}
  function listHtml(title,items){
    if(!Array.isArray(items)||!items.length)return'';
    return `<h4>${safe(title)}</h4><ul>${items.map(x=>`<li>${safe(x)}</li>`).join('')}</ul>`;
  }
  function detectSubject(){
    const hash=location.hash||'';
    return hash.includes('chemistry')?'chemistry':'biology';
  }
  function extract(details){
    const input=details.querySelector('[data-analysis-self-score]');
    const answerBoxes=details.querySelectorAll('.mock-review-answer>div');
    const question=text(details.querySelector('.mock-review-body h3'));
    const answer=text(answerBoxes[0]?.querySelector('b'));
    const referenceAnswer=text(answerBoxes[1]?.querySelector('b'));
    const criteriaHeading=[...details.querySelectorAll('.mock-review-body p')].find(p=>/^Критерии:/i.test(text(p)));
    let criteria='';
    if(criteriaHeading){
      const next=criteriaHeading.nextElementSibling;
      if(next?.tagName==='UL')criteria=[...next.querySelectorAll('li')].map(text).filter(Boolean).join('\n');
    }
    return {input,question,answer,referenceAnswer,criteria,maxScore:Number(input?.max)||3,subject:detectSubject()};
  }

  async function check(details,button){
    const payload=extract(details);
    let panel=details.querySelector('.answer-expert-panel');
    if(!payload.answer||payload.answer==='—'){
      if(panel)panel.innerHTML='<div class="answer-expert-error">Сначала нужен ответ ученика.</div>';
      return;
    }
    button.disabled=true;button.classList.add('answer-expert-loading');button.textContent='AI проверяет…';
    if(!panel){panel=document.createElement('div');panel.className='answer-expert-panel';details.querySelector('.mock-review-body')?.appendChild(panel)}
    panel.innerHTML='<div style="opacity:.68">Сверяю смысловые элементы и критерии…</div>';
    try{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
      const response=await fetch('/api/answer-expert/check',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      clearTimeout(timer);
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||`Ошибка ${response.status}`);
      const r=data.result||{};
      const conf={high:'высокая',medium:'средняя',low:'низкая'}[r.confidence]||r.confidence||'—';
      panel.innerHTML=`<div class="answer-expert-top"><div><div class="answer-expert-score">${r.score==null?'—':safe(r.score)} / ${safe(r.maxScore??payload.maxScore)}</div><div class="answer-expert-confidence">Уверенность проверки: ${safe(conf)}</div></div><button type="button" class="btn ghost" data-answer-expert-apply ${r.score==null?'disabled':''}>Поставить этот балл</button></div>${r.verdict?`<p><b>Вердикт:</b> ${safe(r.verdict)}</p>`:''}${listHtml('Что засчитано',r.found)}${listHtml('Чего не хватает',r.missing)}${listHtml('Ошибки и неточности',r.mistakes)}${r.improvedAnswer?`<h4>Как можно ответить лучше</h4><div class="improved">${safe(r.improvedAnswer)}</div>`:''}`;
      const apply=panel.querySelector('[data-answer-expert-apply]');
      apply?.addEventListener('click',()=>{
        if(!payload.input||r.score==null)return;
        payload.input.value=String(r.score);
        payload.input.dispatchEvent(new Event('change',{bubbles:true}));
        payload.input.dispatchEvent(new Event('input',{bubbles:true}));
      },{once:true});
    }catch(error){
      panel.innerHTML=`<div class="answer-expert-error">${safe(error?.name==='AbortError'?'AI отвечает слишком долго. Попробуй ещё раз.':error?.message||'Не удалось проверить ответ')}</div>`;
    }finally{
      button.disabled=false;button.classList.remove('answer-expert-loading');button.textContent='✦ Проверить AI';
    }
  }

  function enhance(){
    document.querySelectorAll('.mock-review details').forEach(details=>{
      const input=details.querySelector('[data-analysis-self-score]');
      if(!input||details.querySelector('[data-answer-expert-check]'))return;
      const row=document.createElement('div');row.className='answer-expert-actions';
      row.innerHTML='<button type="button" class="btn answer-expert-btn" data-answer-expert-check>✦ Проверить AI</button><small style="opacity:.58">Отдельный эксперт Cerebras проверит развёрнутый ответ по критериям</small>';
      input.closest('.mock-self-score-row')?.insertAdjacentElement('afterend',row);
    });
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-answer-expert-check]');
    if(!button)return;
    const details=button.closest('details');
    if(details)check(details,button);
  });

  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance()})};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
  schedule();
})();
