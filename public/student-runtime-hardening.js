(()=>{
  'use strict';

  const route=()=>String(location.hash||'').replace(/^#/,'');
  let configPromise=null;

  async function chemistryConfig(){
    if(configPromise)return configPromise;
    configPromise=fetch('/api/subjects/chemistry/mock-exams',{credentials:'same-origin',headers:{accept:'application/json'}})
      .then(async r=>{const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Не удалось загрузить пробники');return data})
      .finally(()=>{setTimeout(()=>{configPromise=null},30000)});
    return configPromise;
  }

  async function addMissingChemistryVariants(){
    if(route()!=='chemistry/mocks')return;
    const grid=document.querySelector('.chem-mock-grid');
    if(!grid||grid.dataset.fullVariantSet==='1')return;
    try{
      const data=await chemistryConfig();
      if(!grid.isConnected||route()!=='chemistry/mocks')return;
      const total=Math.max(1,Number(data?.config?.variantCount)||3);
      const existing=new Set([...grid.querySelectorAll('[data-chem-variant]')].map(x=>Number(x.dataset.chemVariant)));
      for(let n=1;n<=total;n++){
        if(existing.has(n))continue;
        const card=document.createElement('article');
        card.className='card chem-mock-card';
        card.innerHTML=`<div class="variant-number">${n}</div><div class="chem-mock-tags"><span class="pill">34 задания</span><span class="pill">56 баллов</span></div><h2>Вариант ${n}</h2><p class="subtitle">Полный независимый вариант по всем 34 линиям ЕГЭ.</p><div class="actions"><button class="btn" data-chem-variant="${n}" data-mode="untimed">Без таймера</button><button class="btn ghost" data-chem-variant="${n}" data-mode="timed">210 минут</button></div>`;
        grid.appendChild(card);
        card.querySelectorAll('[data-chem-variant]').forEach(button=>{
          button.onclick=async()=>{
            const active=Boolean(document.querySelector('.quick-continue'));
            try{
              const response=await fetch('/api/subjects/chemistry/mock-exams',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({mode:button.dataset.mode,variant:n,confirmNew:active})});
              const result=await response.json().catch(()=>({}));
              if(!response.ok)throw new Error(result.error||'Не удалось начать пробник');
              if(typeof go==='function')go('chemistry/mocks/exam/'+result.attempt.id);else location.hash='chemistry/mocks/exam/'+result.attempt.id;
            }catch(error){if(typeof notify==='function')notify(error.message||'Не удалось начать пробник')}
          };
        });
      }
      grid.dataset.fullVariantSet='1';
    }catch{}
  }

  function lockChemistryExamHelp(){
    if(!route().startsWith('chemistry/mocks/exam/'))return;
    document.querySelector('.chem-mock-actions')?.remove();
    document.querySelector('#chem-mock-help')?.remove();
    const note=document.querySelector('.question-card .chem-mock-source');
    const text='Во время пробника подсказки и разбор недоступны. Вторая часть проверяется после сдачи.';
    if(note&&note.textContent!==text)note.textContent=text;
  }

  document.addEventListener('click',event=>{
    if(!route().startsWith('chemistry/mocks/exam/'))return;
    const blocked=event.target.closest('#chem-check-answer,#chem-get-hint,#chem-show-review');
    if(!blocked)return;
    event.preventDefault();
    event.stopImmediatePropagation();
  },true);

  let queued=false;
  const schedule=()=>{
    if(queued)return;
    queued=true;
    queueMicrotask(()=>{
      queued=false;
      lockChemistryExamHelp();
      addMissingChemistryVariants();
    });
  };
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('hashchange',schedule);
  schedule();
})();
