(()=>{
  'use strict';

  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const style=document.createElement('style');
  style.textContent=`
    .sidebar nav [data-ai-tools-nav]{margin-top:13px!important;position:relative}
    .sidebar nav [data-ai-tools-nav]::before{content:"AI";position:absolute;left:8px;top:-15px;font-size:9px;font-weight:800;letter-spacing:.16em;opacity:.42;pointer-events:none}
    .aihub{max-width:1180px;margin:0 auto 48px}.aihub-hero{padding:26px!important;overflow:hidden;position:relative;background:linear-gradient(135deg,rgba(27,104,69,.16),rgba(75,79,178,.12))!important}.aihub-hero:after{content:"✦";position:absolute;right:28px;top:2px;font-size:120px;line-height:1;opacity:.04;pointer-events:none}.aihub-hero h1{font-size:clamp(30px,4vw,48px);margin:7px 0 10px}.aihub-hero p{max-width:760px;line-height:1.6;margin:0;color:var(--muted)}
    .aihub-split{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0 24px}.aihub-split .card{padding:17px!important}.aihub-split b{display:block;margin-bottom:5px}.aihub-split small{line-height:1.45;opacity:.66}.aihub-free{border-color:rgba(117,190,146,.13)!important}.aihub-ai{border-color:rgba(125,139,234,.18)!important}
    .aihub-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:25px 0 12px}.aihub-head h2{margin:0}.aihub-head p{margin:3px 0 0;color:var(--muted)}
    .aihub-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.aihub-card{padding:19px!important;display:flex;flex-direction:column;min-height:218px;position:relative;overflow:hidden}.aihub-card:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 90% 5%,rgba(86,135,222,.09),transparent 38%);pointer-events:none}.aihub-card-top{display:flex;align-items:center;justify-content:space-between;gap:9px}.aihub-icon{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:rgba(72,151,105,.13);font-size:20px}.aihub-status{font-size:10px;font-weight:800;padding:5px 8px;border-radius:999px;background:rgba(82,176,119,.12);color:#9ce0b9}.aihub-status.soon{background:rgba(255,255,255,.06);color:inherit;opacity:.55}.aihub-card h3{font-size:19px;margin:15px 0 7px}.aihub-card p{font-size:13px;line-height:1.55;color:var(--muted);margin:0 0 15px}.aihub-card footer{margin-top:auto;display:flex;align-items:center;justify-content:flex-end;gap:8px}.aihub-card .btn{min-height:38px;padding:8px 12px}
    .aihub-expert{grid-column:span 2}.aihub-expert footer{justify-content:flex-start;flex-wrap:wrap}.aihub-note{margin-top:16px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.025);font-size:12px;line-height:1.5;color:var(--muted)}
    @media(max-width:900px){.aihub-grid{grid-template-columns:1fr 1fr}.aihub-expert{grid-column:span 2}}
    @media(max-width:620px){.aihub-split,.aihub-grid{grid-template-columns:1fr}.aihub-expert{grid-column:auto}.aihub-hero{padding:20px!important}.aihub-card{min-height:190px}.mobile-nav [data-ai-tools-nav] .nav-icon{font-size:17px}}
  `;
  document.head.appendChild(style);

  function navButton(){
    if(typeof state==='undefined'||!state?.user)return;
    document.querySelectorAll('.sidebar nav,.mobile-nav').forEach(nav=>{
      let button=nav.querySelector('[data-ai-tools-nav]');
      if(!button){
        button=document.createElement('button');
        button.type='button';button.dataset.aiToolsNav='1';button.dataset.nav='ai-tools';
        button.innerHTML='<span class="nav-icon">✦</span><span>AI-инструменты</span>';
        const profile=nav.querySelector('[data-nav="profile"]');
        if(profile)nav.insertBefore(button,profile);else nav.appendChild(button);
        button.onclick=()=>go('ai-tools');
      }
      const active=String(state.route||'')==='ai-tools';
      button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
  }

  function card(icon,title,text,status,buttons,wide=false){
    return `<article class="card aihub-card ${wide?'aihub-expert':''}"><div class="aihub-card-top"><span class="aihub-icon">${icon}</span><span class="aihub-status ${status==='Скоро'?'soon':''}">${safe(status)}</span></div><h3>${safe(title)}</h3><p>${safe(text)}</p><footer>${buttons}</footer></article>`;
  }

  function renderHub(){
    const html=`<div class="aihub"><section class="card aihub-hero"><span class="eyebrow">ОСНОВА · AI</span><h1>AI-инструменты</h1><p>Нейросети собраны отдельно от обычной подготовки. Теория, задания, пробники, статистика и прогресс работают без AI; здесь находятся только функции, которые обращаются к нейросетям.</p></section>
      <div class="aihub-split"><div class="card aihub-free"><b>Без нейросети</b><small>Биология, химия, теория, задания по линиям, обычный разбор пробника, статистика и прогресс. Эти функции не расходуют AI-запросы.</small></div><div class="card aihub-ai"><b>С нейросетью ✦</b><small>AI PRO, проверка второй части, анализ ошибок, фото заданий и персональный план. Здесь могут действовать отдельные AI-лимиты.</small></div></div>
      <div class="aihub-head"><div><h2>Рабочие AI-функции</h2><p>Каждый инструмент делает одну понятную задачу.</p></div></div>
      <div class="aihub-grid">
        ${card('✦','AI PRO','Персональный репетитор и куратор: объясняет темы, видит статистику, слабые линии и помогает выбрать следующий шаг.','Работает','<button class="btn" data-ai-route="pro">Открыть AI PRO</button>')}
        ${card('✓','Эксперт второй части','Проверяет развёрнутые ответы после пробника по критериям конкретного задания и поэлементной методике ФИПИ. Балл автоматически попадает в результат.','Работает','<button class="btn" data-ai-route="mocks">Биология</button><button class="btn ghost" data-ai-route="chemistry/mocks">Химия</button>',true)}
        ${card('⌁','Разбор ошибок AI','Находит повторяющиеся ошибки по статистике ученика и объясняет, что именно сейчас выгоднее исправить.','Работает','<button class="btn ghost" data-ai-route="pro">Разобрать ошибки</button>')}
        ${card('▧','Фото задания','Можно отправить фотографию задания в AI PRO и разобрать её вместе с репетитором.','Работает','<button class="btn ghost" data-ai-route="pro">Открыть</button>')}
        ${card('↗','AI-планировщик','Строит и перестраивает план подготовки по цели, сроку до ЕГЭ, ошибкам и фактическому темпу.','Работает','<button class="btn ghost" data-ai-route="pro">Мой план</button>')}
        ${card('◎','Глубокий AI-разбор пробника','Соберёт ошибки всего варианта в один вывод: почему потеряны баллы и какие 2–3 действия дадут лучший прирост.','Скоро','<button class="btn ghost" disabled>В разработке</button>')}
      </div>
      <div class="aihub-note"><b>Важно:</b> проверка второй части — автоматическая экспертная оценка ОСНОВЫ по критериям задания и методике ФИПИ. Она помогает тренироваться, но не является официальной проверкой экзаменационной комиссией.</div></div>`;
    app.innerHTML=shell(html);bindShell();navButton();
    document.querySelectorAll('[data-ai-route]').forEach(button=>button.onclick=()=>go(button.dataset.aiRoute));
  }

  if(typeof render==='function'){
    const previousRender=render;
    render=async function(){
      if(typeof state!=='undefined'&&state?.route==='ai-tools')return renderHub();
      const result=await previousRender.apply(this,arguments);navButton();return result;
    };
  }

  let queued=false;
  const schedule=()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;navButton()})};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
  schedule();
})();
