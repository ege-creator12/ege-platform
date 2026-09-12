(()=>{
  'use strict';

  const states=new Map();
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  const style=document.createElement('style');
  style.textContent=`
    .answer-expert-auto{display:flex;align-items:center;gap:12px;padding:15px 16px;margin:10px 0 18px;border-radius:16px;background:linear-gradient(135deg,rgba(32,117,76,.12),rgba(67,83,173,.08));border:1px solid rgba(100,190,137,.15)}
    .answer-expert-auto-icon{width:38px;height:38px;flex:0 0 38px;border-radius:12px;display:grid;place-items:center;background:rgba(74,181,119,.14);font-weight:900}
    .answer-expert-auto b{display:block;margin-bottom:3px}.answer-expert-auto small{display:block;opacity:.66;line-height:1.45}
    .answer-expert-auto.checking .answer-expert-auto-icon{animation:answerExpertPulse 1.15s ease-in-out infinite}
    .answer-expert-auto.error{border-color:rgba(255,120,110,.18);background:rgba(135,51,48,.08)}
    .answer-expert-auto.error .answer-expert-auto-icon{background:rgba(255,120,110,.1)}
    .answer-expert-auto.locked{border-color:rgba(215,177,83,.18);background:linear-gradient(135deg,rgba(126,91,30,.09),rgba(71,68,137,.06))}.answer-expert-auto.locked .answer-expert-auto-icon{background:rgba(215,177,83,.11)}
    .answer-expert-ai-score{display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:rgba(74,181,119,.1);font-size:11px;font-weight:800;margin-left:8px;white-space:nowrap}
    .mock-self-score-row[data-ai-graded="1"]{opacity:.72}.mock-self-score-row[data-ai-graded="1"] input{pointer-events:none}
    @keyframes answerExpertPulse{0%,100%{transform:scale(1);opacity:.72}50%{transform:scale(1.08);opacity:1}}
    @media(max-width:620px){.answer-expert-auto{align-items:flex-start}.answer-expert-auto-icon{margin-top:1px}}
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

  function keyOf(info){return`${info.subject}:${info.attemptId}`}
  function reviewRoot(){return document.querySelector('.mock-review')}
  function extendedDetails(){
    const root=reviewRoot();
    if(!root)return[];
    return[...root.querySelectorAll('details')].filter(d=>d.querySelector('[data-analysis-self-score]'));
  }
  function hasAnswer(details){
    const first=details.querySelector('.mock-review-answer>div:first-child b');
    const value=String(first?.textContent||'').trim();
    return Boolean(value&&value!=='—');
  }
  function answeredDetails(){return extendedDetails().filter(hasAnswer)}
  function pendingDetails(){return answeredDetails().filter(d=>String(d.querySelector('[data-analysis-self-score]')?.value??'').trim()==='')}

  async function post(path,body,timeout=80000){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(path,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){const error=new Error(data.error||`Ошибка ${response.status}`);error.status=response.status;error.code=data.code;throw error}
      return data;
    }finally{clearTimeout(timer)}
  }

  function ensureBanner(){
    let banner=document.querySelector('[data-answer-expert-auto]');
    if(banner)return banner;
    const root=reviewRoot();if(!root)return null;
    banner=document.createElement('div');banner.className='answer-expert-auto';banner.dataset.answerExpertAuto='1';
    const target=document.querySelector('.mock-review-toolbar')||root;
    if(target===root)root.insertAdjacentElement('beforebegin',banner);else target.insertAdjacentElement('afterend',banner);
    return banner;
  }

  function setBanner(kind,title,text){
    const banner=ensureBanner();if(!banner)return;
    banner.className=`answer-expert-auto ${kind||''}`.trim();
    const icon=kind==='checking'?'✦':kind==='error'?'!':kind==='locked'?'✦':'✓';
    banner.innerHTML=`<span class="answer-expert-auto-icon">${icon}</span><div><b>${safe(title)}</b><small>${safe(text)}</small></div>`;
  }

  function markReadOnlyScores(){
    answeredDetails().forEach(details=>{
      const input=details.querySelector('[data-analysis-self-score]');
      if(!input||String(input.value).trim()==='')return;
      const row=input.closest('.mock-self-score-row');
      if(row){row.dataset.aiGraded='1';input.readOnly=true;input.setAttribute('aria-label','Балл выставлен AI-проверкой')}
      if(row&&!row.querySelector('.answer-expert-ai-score')){
        const badge=document.createElement('span');badge.className='answer-expert-ai-score';badge.textContent=`✓ AI: ${input.value}/${input.max||'—'}`;row.appendChild(badge);
      }
    });
  }

  function rerenderResult(){
    setTimeout(()=>{
      try{if(typeof window.render==='function')window.render();else location.reload()}catch{location.reload()}
    },550);
  }

  async function autoGrade(info){
    const key=keyOf(info);
    if(states.get(key)==='checking'||states.get(key)==='done')return;
    const answered=answeredDetails();
    const pending=pendingDetails();
    if(!answered.length){
      states.set(key,'done');
      setBanner('done','Вторая часть без ответов','Заполненных развёрнутых ответов нет — AI-проверка не требовалась.');
      return;
    }
    if(!pending.length){
      states.set(key,'done');markReadOnlyScores();
      setBanner('done','✓ Вторая часть проверена AI','Баллы за развёрнутые ответы уже учтены в результате пробника.');
      return;
    }

    states.set(key,'checking');
    setBanner('checking','AI проверяет вторую часть','Сверяем развёрнутые ответы с критериями заданий. Баллы появятся в результате автоматически.');
    try{
      const data=await post('/api/answer-expert/mock-check-all',{subject:info.subject,attemptId:info.attemptId});
      if(!data?.ok)throw new Error('Не удалось проверить вторую часть');
      states.set(key,'done');
      setBanner('done','✓ AI проверил вторую часть',`Проверено ответов: ${Number(data.checked||0)}. Баллы уже добавлены к результату.`);
      rerenderResult();
    }catch(error){
      const proRequired=error?.code==='PRO_REQUIRED'||error?.status===403||/подписк|PRO/i.test(error?.message||'');
      states.set(key,proRequired?'locked':'failed');
      if(proRequired){
        setBanner('locked','AI-проверка второй части доступна в ОСНОВА PRO','Без PRO результат остаётся доступным, а развёрнутые ответы можно оценить вручную по критериям.');
        return;
      }
      const message=error?.name==='AbortError'?'Проверка заняла слишком много времени. Обнови результаты чуть позже.':(error?.message||'Не удалось проверить вторую часть');
      setBanner('error','AI-проверка второй части временно не завершена',message);
    }
  }

  function enhance(){
    const info=routeInfo();
    if(!info)return;
    if(!reviewRoot()||!extendedDetails().length)return;
    const key=keyOf(info),state=states.get(key);
    if(state==='done'){
      markReadOnlyScores();
      setBanner('done','✓ Вторая часть проверена AI','Баллы за развёрнутые ответы уже учтены в результате пробника.');
      return;
    }
    if(state==='locked'){
      setBanner('locked','AI-проверка второй части доступна в ОСНОВА PRO','Без PRO результат остаётся доступным, а развёрнутые ответы можно оценить вручную по критериям.');
      return;
    }
    if(state==='failed')return;
    autoGrade(info);
  }

  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;enhance()})};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>{states.clear();schedule()});
  schedule();
})();
