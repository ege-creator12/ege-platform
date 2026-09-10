(()=>{
  'use strict';
  let biologyVariant=Math.max(1,Number(sessionStorage.getItem('osnova-biology-mock-variant')||1));
  let biologyActive=false;
  let enhancing=false;

  const api=async(path,opts={})=>{
    const response=await fetch('/api'+path,{credentials:'same-origin',headers:{'content-type':'application/json'},...opts});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Ошибка ${response.status}`);
    return data;
  };
  const route=()=>location.hash.slice(1)||'dashboard';
  const toast=message=>typeof notify==='function'?notify(message):console.warn(message);

  const style=document.createElement('style');
  style.textContent=`
    .mock-variant-picker{margin:18px 0 22px;padding:18px;border:1px solid var(--line);border-radius:18px;background:var(--panel)}
    .mock-variant-picker-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:13px}.mock-variant-picker-head h2{margin:0}.mock-variant-picker-head span{color:var(--muted);font-size:13px}
    .mock-variant-buttons{display:grid;grid-template-columns:repeat(12,minmax(42px,1fr));gap:8px}.mock-variant-buttons button{min-height:44px;border:1px solid var(--line);border-radius:12px;background:var(--soft);color:var(--text);font:inherit;font-weight:800;cursor:pointer;transition:.16s ease}.mock-variant-buttons button:hover{border-color:var(--accent);transform:translateY(-1px)}.mock-variant-buttons button.active{background:var(--accent);border-color:var(--accent);color:#082116}
    @media(max-width:900px){.mock-variant-buttons{grid-template-columns:repeat(6,1fr)}}@media(max-width:520px){.mock-variant-buttons{grid-template-columns:repeat(4,1fr)}.mock-variant-picker{padding:14px}}
  `;
  document.head.appendChild(style);

  async function startBiology(mode){
    if(biologyActive&&!confirm('Завершить текущий пробник и создать новый?'))return;
    try{
      const data=await api('/subjects/biology/mock-exams',{method:'POST',body:JSON.stringify({mode,variant:biologyVariant,confirmNew:biologyActive})});
      biologyActive=false;
      go('mocks/exam/'+data.attempt.id);
    }catch(error){toast(error.message)}
  }

  async function enhanceBiology(){
    if(route()!=='mocks'||document.querySelector('.mock-variant-picker'))return;
    const modes=document.querySelector('main[data-page="mocks"] .mock-modes');
    if(!modes)return;
    const data=await api('/subjects/biology/mock-exams');
    if(route()!=='mocks'||document.querySelector('.mock-variant-picker'))return;
    const count=Math.max(1,Number(data.config?.variantCount||3));
    biologyActive=Boolean(data.activeAttempt);
    biologyVariant=Math.min(count,Math.max(1,biologyVariant));
    const picker=document.createElement('section');
    picker.className='mock-variant-picker';
    picker.innerHTML=`<div class="mock-variant-picker-head"><div><div class="eyebrow">Набор заданий</div><h2>Выберите вариант</h2></div><span>${count} разных полных вариантов</span></div><div class="mock-variant-buttons">${Array.from({length:count},(_,i)=>i+1).map(n=>`<button type="button" data-bio-mock-variant="${n}" class="${n===biologyVariant?'active':''}">${n}</button>`).join('')}</div>`;
    modes.before(picker);
    picker.querySelectorAll('[data-bio-mock-variant]').forEach(button=>button.onclick=()=>{
      biologyVariant=Number(button.dataset.bioMockVariant);
      sessionStorage.setItem('osnova-biology-mock-variant',String(biologyVariant));
      picker.querySelectorAll('[data-bio-mock-variant]').forEach(x=>x.classList.toggle('active',x===button));
    });
  }

  async function startChemistry(mode,variant,active){
    if(active&&!confirm('Завершить текущий пробник химии и создать новый?'))return;
    try{
      const data=await api('/subjects/chemistry/mock-exams',{method:'POST',body:JSON.stringify({mode,variant,confirmNew:active})});
      go('chemistry/mocks/exam/'+data.attempt.id);
    }catch(error){toast(error.message)}
  }

  async function enhanceChemistry(){
    if(route()!=='chemistry/mocks')return;
    const grid=document.querySelector('.chem-mock-grid');
    if(!grid||grid.dataset.expandedVariants==='1')return;
    const data=await api('/subjects/chemistry/mock-exams');
    if(route()!=='chemistry/mocks'||!grid.isConnected)return;
    const count=Math.max(1,Number(data.config?.variantCount||3)),active=Boolean(data.activeAttempt);
    grid.dataset.expandedVariants='1';
    grid.innerHTML=Array.from({length:count},(_,i)=>i+1).map(n=>`<article class="card chem-mock-card"><div class="variant-number">${n}</div><div class="chem-mock-tags"><span class="pill">34 задания</span><span class="pill">56 баллов</span></div><h2>Вариант ${n}</h2><p class="subtitle">Независимый набор условий по всем линиям ЕГЭ по химии.</p><div class="actions"><button class="btn" data-expanded-chem-variant="${n}" data-mode="untimed">Без таймера</button><button class="btn ghost" data-expanded-chem-variant="${n}" data-mode="timed">210 минут</button></div></article>`).join('');
    grid.querySelectorAll('[data-expanded-chem-variant]').forEach(button=>button.onclick=()=>startChemistry(button.dataset.mode,Number(button.dataset.expandedChemVariant),active));
  }

  async function enhance(){
    if(enhancing)return;
    enhancing=true;
    try{
      if(route()==='mocks')await enhanceBiology();
      else if(route()==='chemistry/mocks')await enhanceChemistry();
    }catch(error){console.warn('mock-variant-enhancer',error.message)}
    finally{enhancing=false}
  }

  document.addEventListener('click',event=>{
    if(route()!=='mocks')return;
    const button=event.target instanceof Element?event.target.closest('main[data-page="mocks"] .mock-modes [data-mode]'):null;
    if(!button)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    startBiology(button.dataset.mode);
  },true);

  const observer=new MutationObserver(()=>queueMicrotask(enhance));
  const start=()=>{observer.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});enhance()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  addEventListener('hashchange',()=>setTimeout(enhance,0));
})();
