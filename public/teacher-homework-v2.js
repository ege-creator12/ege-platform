(()=>{
  'use strict';

  const esc2=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const subjectName=slug=>slug==='chemistry'?'Химия':'Биология';
  const shortDate=value=>{if(!value)return 'без срока';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}):'без срока'};
  const statusText=status=>status==='completed'?'Выполнено':status==='active'?'В процессе':'Назначено';
  let statusCache=null,statusAt=0,statusPromise=null,statusUserId=0,homeworkCache=null,homeworkAt=0,homeworkUserId=0,enhanceBusy=false;

  async function getTeacherStatus(force=false){
    const id=Number(state?.user?.id||0);if(!id)return {teacher:false,admin:false};
    if(!force&&statusCache?.userId===id&&Date.now()-statusAt<30000)return statusCache;
    if(statusPromise&&statusUserId===id)return statusPromise;
    statusUserId=id;
    const role=state.user.role;
    const request=(async()=>{
      let status;
      try{const d=await api('/teacher/status');status={teacher:Boolean(d.teacher),admin:Boolean(d.admin),userId:id}}
      catch{status={teacher:statusCache?.userId===id?statusCache.teacher:false,admin:role==='admin',userId:id}}
      if(Number(state?.user?.id)===id){statusCache=status;statusAt=Date.now()}
      return status;
    })();
    statusPromise=request;
    try{return await request}finally{if(statusPromise===request)statusPromise=null}
  }

  async function getHomeworkCount(force=false){
    if(!state?.user||state.user.role==='admin')return 0;
    const id=Number(state.user.id);
    if(!force&&homeworkUserId===id&&homeworkCache!==null&&Date.now()-homeworkAt<30000)return homeworkCache;
    let count=0;
    try{const d=await api('/teacher/student');count=(d.assignments||[]).filter(a=>a.status!=='completed').length}catch{}
    if(Number(state?.user?.id)===id){homeworkCache=count;homeworkAt=Date.now();homeworkUserId=id}
    return count;
  }

  function navContent(label,icon,badge=0){return `<span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>${badge?`<span class="homework-nav-badge">${badge}</span>`:''}`}

  function upsertNav(nav,route,label,marker,icon,badge=0){
    const matches=[...nav.querySelectorAll(`[${marker}],[data-nav="${route}"]${route==='teacher'?', [data-teacher-nav]':''}`)];
    let button=matches.shift();
    matches.forEach(duplicate=>duplicate.remove());
    const content=navContent(label,icon,badge);
    if(!button){button=document.createElement('button');button.type='button';button.dataset.nav=route;button.setAttribute(marker,'1');button.innerHTML=content;nav.appendChild(button)}
    if(!button.hasAttribute(marker))button.setAttribute(marker,'1');
    button.removeAttribute('data-teacher-nav');
    if(button.dataset.nav!==route)button.dataset.nav=route;
    if(button.innerHTML!==content)button.innerHTML=content;
    const active=state.route===route||(route==='homework'&&state.route==='classroom');button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');button.onclick=()=>go(route);return button;
  }

  async function enhanceNavV2(){
    if(enhanceBusy||!state?.user)return;enhanceBusy=true;
    try{
      const id=Number(state.user.id);
      const status=await getTeacherStatus();
      if(Number(state?.user?.id)!==id)return;
      document.documentElement.classList.toggle('osnova-teacher',Boolean(status.teacher));
      document.querySelectorAll('[data-classroom-nav]').forEach(x=>x.remove());
      if(status.teacher){
        document.querySelectorAll('[data-homework-nav]').forEach(x=>x.remove());
        document.querySelectorAll('.sidebar nav,.mobile-nav').forEach(nav=>upsertNav(nav,'teacher','Кабинет учителя','data-teacher-v2-nav','▥',0));
        const chip=document.querySelector('.user-chip small');if(chip&&chip.textContent!=='Учитель')chip.textContent='Учитель';
      }else{
        document.querySelectorAll('[data-teacher-nav],[data-teacher-v2-nav],.sidebar nav [data-nav="teacher"],.mobile-nav [data-nav="teacher"]').forEach(x=>x.remove());
        if(!status.admin&&!document.documentElement.classList.contains('osnova-moderator')){
          const count=await getHomeworkCount();
          if(Number(state?.user?.id)!==id)return;
          document.querySelectorAll('.sidebar nav,.mobile-nav').forEach(nav=>upsertNav(nav,'homework','Домашние задания','data-homework-nav','▣',count));
        }else document.querySelectorAll('[data-homework-nav]').forEach(x=>x.remove());
      }
    }finally{enhanceBusy=false}
  }

  // Reuse the known role while rendering each shell so the item does not arrive late.
  function navigationHtml(){
    if(!state?.user||statusCache?.userId!==Number(state.user.id))return '';
    const teacher=statusCache.teacher;
    if(!teacher&&(statusCache.admin||document.documentElement.classList.contains('osnova-moderator')))return '';
    const route=teacher?'teacher':'homework',active=state.route===route||(!teacher&&state.route==='classroom');
    const badge=!teacher&&homeworkUserId===Number(state.user.id)?homeworkCache:0;
    return `<button type="button" data-nav="${route}" ${teacher?'data-teacher-v2-nav':'data-homework-nav'}="1" class="${active?'active':''}" ${active?'aria-current="page"':''}>${navContent(teacher?'Кабинет учителя':'Домашние задания',teacher?'▥':'▣',badge)}</button>`;
  }
  window.osnovaTeacherNavigation={refresh:enhanceNavV2,html:navigationHtml};

  function loadingV2(text){app.innerHTML=shell(`<div class="page-state" role="status"><div class="skeleton wide"></div><div class="skeleton"></div><span>${esc2(text)}</span></div>`);bindShell();enhanceNavV2().catch(()=>{})}

  function classOptions(classes,includeAll=false){return `${includeAll?'<option value="all">Все классы</option>':''}${classes.map(c=>`<option value="${c.id}">${esc2(c.name)} · ${Number(c.student_count||0)} уч.</option>`).join('')}`}

  function resultRows(results){
    if(!results.length)return '<tr><td colspan="8"><div class="teacher-empty">Результатов пока нет. Они появятся здесь после выдачи домашнего задания.</div></td></tr>';
    return results.map(r=>`<tr data-result-class="${r.class_id}" data-result-assignment="${r.assignment_id}"><td><b>${esc2(r.student_name)}</b><small>${esc2(r.student_email||'')}</small></td><td>${esc2(r.class_name)}</td><td><b>${esc2(r.title)}</b><small>${subjectName(r.subject_slug)} · линия ${Number(r.exam_line)}</small></td><td><span class="homework-state ${r.status}">${statusText(r.status)}</span></td><td>${Number(r.answered_count||0)}/${Number(r.question_count||0)}</td><td>${Number(r.correct_count||0)}</td><td><b>${Number(r.accuracy||0)}%</b></td><td>${r.finished_at?shortDate(r.finished_at):r.started_at?'Начато':'—'}</td></tr>`).join('');
  }

  async function renderTeacherV2(){
    loadingV2('Загружаем кабинет учителя…');
    const status=await getTeacherStatus(true);if(!status.teacher&&!status.admin){notify('Кабинет доступен только учителю');return go('dashboard')}
    try{
      const [d,resultData]=await Promise.all([api('/teacher/dashboard'),api('/teacher/results')]);
      const classes=d.classes||[],students=d.students||[],assignments=d.assignments||[],results=resultData.results||[],m=d.metrics||{};
      const classesWithStudents=classes.filter(c=>Number(c.student_count||0)>0);
      app.innerHTML=shell(`<div class="teacher-page teacher-v2-page">
        <section class="teacher-hero"><div class="eyebrow">ОСНОВА · кабинет учителя</div><h1>Ученики, домашние задания и результаты</h1><p>Добавьте учеников в класс по их почте, выдавайте им задания через AI-конструктор и смотрите результат каждого ученика в отдельной таблице.</p><span class="teacher-role-badge">▥ Роль: Учитель</span></section>
        <div class="teacher-metrics"><div class="card teacher-metric"><span>Классы</span><strong>${Number(m.classes||0)}</strong></div><div class="card teacher-metric"><span>Ученики</span><strong>${Number(m.students||0)}</strong></div><div class="card teacher-metric"><span>Домашних заданий</span><strong>${Number(m.assignments||0)}</strong></div><div class="card teacher-metric"><span>Средняя точность</span><strong>${Number(m.averageAccuracy||0)}%</strong></div></div>

        <div class="teacher-v2-grid">
          <section class="card teacher-section"><div class="section-head"><div><h2>Мои классы</h2><p class="subtitle">Код можно оставить как запасной способ вступления.</p></div></div><div class="teacher-class-list">${classes.length?classes.map(c=>`<article class="teacher-class-card"><div><b>${esc2(c.name)}</b><small>${Number(c.student_count||0)} учеников</small></div><span class="teacher-code">${esc2(c.join_code)}</span></article>`).join(''):'<div class="teacher-empty">Создайте первый класс.</div>'}</div><form class="teacher-create-class" id="teacher-v2-create-class"><input name="name" maxlength="80" placeholder="Например, 11А · Биология" required><button class="btn">+ Создать класс</button></form></section>

          <section class="card teacher-section"><h2>Добавить ученика</h2><p class="subtitle">Ученик должен сначала зарегистрироваться на ОСНОВЕ. Затем добавьте его по почте.</p>${classes.length?`<form id="teacher-add-student" class="teacher-add-student"><div class="field"><label>КЛАСС</label><select name="classId">${classOptions(classes)}</select></div><div class="field"><label>ПОЧТА УЧЕНИКА</label><input name="email" type="email" placeholder="student@example.ru" required></div><button class="btn">Добавить ученика</button></form>`:'<div class="teacher-empty">Сначала создайте класс.</div>'}</section>
        </div>

        <section class="card teacher-section teacher-roster"><div class="section-head"><div><h2>Ученики</h2><p class="subtitle">Здесь только ученики ваших классов.</p></div>${classes.length>1?`<select id="teacher-roster-filter">${classOptions(classes,true)}</select>`:''}</div><div class="teacher-table-wrap"><table class="teacher-table"><thead><tr><th>Ученик</th><th>Класс</th><th>Решено</th><th>Точность</th><th>Освоение</th><th>XP</th><th></th></tr></thead><tbody id="teacher-roster-body">${students.length?students.map(s=>`<tr data-class-id="${s.classId}"><td><b>${esc2(s.name)}</b></td><td>${esc2(s.className)}</td><td>${Number(s.solved||0)}</td><td>${Number(s.accuracy||0)}%</td><td>${Number(s.mastery||0)}%</td><td>${Number(s.xp||0)}</td><td><button class="link teacher-remove-student" data-class="${s.classId}" data-user="${s.id}" data-name="${esc2(s.name)}">Убрать</button></td></tr>`).join(''):'<tr><td colspan="7"><div class="teacher-empty">Пока ни одного ученика. Добавьте ученика по почте выше.</div></td></tr>'}</tbody></table></div></section>

        <section class="teacher-ai"><div class="teacher-ai-head"><div><div class="eyebrow">AI-конструктор домашнего задания</div><h2>Скажите AI, что выдать</h2><p class="subtitle">Например: «Дай 11А по биологии линию 4, 12 заданий до пятницы».</p></div><span class="teacher-ai-mark">AI</span></div>
          ${classes.length?`<textarea id="teacher-v2-ai-prompt" placeholder="Дай 10 сложных заданий по химии, линия 17…"></textarea><div class="teacher-ai-row"><div class="field"><label>КЛАСС</label><select id="teacher-v2-ai-class">${classOptions(classes)}</select></div><button class="btn" id="teacher-v2-ai-build">Собрать задание →</button></div><div id="teacher-v2-class-warning" class="teacher-class-warning"></div><div id="teacher-v2-ai-preview"></div>`:'<div class="teacher-empty">Сначала создайте класс и добавьте ученика.</div>'}
        </section>

        <section class="card teacher-section teacher-results-section"><div class="section-head"><div><h2>Результаты домашних заданий</h2><p class="subtitle">Отдельный результат каждого ученика: сколько решено, сколько верно и итоговая точность.</p></div>${classes.length>1?`<select id="teacher-results-filter">${classOptions(classes,true)}</select>`:''}</div><div class="teacher-table-wrap"><table class="teacher-table teacher-results-table"><thead><tr><th>Ученик</th><th>Класс</th><th>Задание</th><th>Статус</th><th>Решено</th><th>Верно</th><th>Результат</th><th>Завершено</th></tr></thead><tbody id="teacher-results-body">${resultRows(results)}</tbody></table></div></section>

        <section class="card teacher-section"><h2>Последние выданные задания</h2><div class="teacher-assignment-list">${assignments.length?assignments.slice(0,8).map(a=>`<article class="teacher-assignment"><div class="teacher-assignment-top"><div><b>${esc2(a.title)}</b><small>${esc2(a.class_name)} · ${subjectName(a.subject_slug)} · линия ${Number(a.exam_line)} · ${Number(a.question_count)} заданий</small></div><span class="teacher-assignment-stat">${Number(a.completed_count||0)}/${Number(a.student_count||0)} готово</span></div></article>`).join(''):'<div class="teacher-empty">Домашних заданий пока нет.</div>'}</div></section>
      </div>`);
      bindShell();enhanceNavV2().catch(()=>{});

      document.querySelector('#teacher-v2-create-class').onsubmit=async e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;try{await api('/teacher/classes',{method:'POST',body:JSON.stringify({name:new FormData(e.target).get('name')})});notify('Класс создан');await renderTeacherV2()}catch(err){notify(err.message);btn.disabled=false}};

      const addForm=document.querySelector('#teacher-add-student');if(addForm)addForm.onsubmit=async e=>{e.preventDefault();const fd=new FormData(e.target),classId=Number(fd.get('classId')),email=String(fd.get('email')||'').trim(),btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Добавляем…';try{const result=await api(`/teacher/classes/${classId}/students`,{method:'POST',body:JSON.stringify({email})});notify(`${result.student.name} добавлен в класс`);homeworkCache=null;await renderTeacherV2()}catch(err){notify(err.message);btn.disabled=false;btn.textContent='Добавить ученика'}};

      document.querySelectorAll('.teacher-remove-student').forEach(btn=>btn.onclick=async()=>{if(!confirm(`Убрать ученика «${btn.dataset.name}» из класса?`))return;btn.disabled=true;try{await api(`/teacher/classes/${btn.dataset.class}/students/${btn.dataset.user}`,{method:'DELETE'});notify('Ученик убран из класса');homeworkCache=null;await renderTeacherV2()}catch(err){notify(err.message);btn.disabled=false}});

      const rosterFilter=document.querySelector('#teacher-roster-filter');if(rosterFilter)rosterFilter.onchange=()=>document.querySelectorAll('#teacher-roster-body tr[data-class-id]').forEach(row=>row.hidden=rosterFilter.value!=='all'&&row.dataset.classId!==rosterFilter.value);
      const resultFilter=document.querySelector('#teacher-results-filter');if(resultFilter)resultFilter.onchange=()=>document.querySelectorAll('#teacher-results-body tr[data-result-class]').forEach(row=>row.hidden=resultFilter.value!=='all'&&row.dataset.resultClass!==resultFilter.value);

      const aiClass=document.querySelector('#teacher-v2-ai-class'),build=document.querySelector('#teacher-v2-ai-build'),warning=document.querySelector('#teacher-v2-class-warning');
      const syncAiClass=()=>{if(!aiClass||!build)return;const klass=classes.find(c=>Number(c.id)===Number(aiClass.value)),count=Number(klass?.student_count||0);build.disabled=count<1;warning.textContent=count?`Задание получат ${count} ${count===1?'ученик':'учеников'}.`:'В этом классе нет учеников. Сначала добавьте ученика — пустому классу задание выдать нельзя.'};
      if(aiClass){aiClass.onchange=syncAiClass;syncAiClass()}
      if(build)build.onclick=async()=>{const prompt=document.querySelector('#teacher-v2-ai-prompt').value.trim(),classId=Number(aiClass.value),klass=classes.find(c=>Number(c.id)===classId),count=Number(klass?.student_count||0),preview=document.querySelector('#teacher-v2-ai-preview');if(!count)return notify('Сначала добавьте ученика в этот класс');if(!prompt)return notify('Напишите, какое задание нужно выдать');build.disabled=true;build.textContent='AI собирает…';preview.innerHTML='<div class="teacher-ai-preview">Разбираем команду и подбираем задания…</div>';try{const result=await api('/teacher/assignments/preview',{method:'POST',body:JSON.stringify({classId,prompt})}),plan=result.plan||{};preview.innerHTML=`<div class="teacher-ai-preview"><div class="eyebrow">Готово к выдаче</div><h3>${esc2(plan.title)}</h3><div class="teacher-plan-chips"><span>${subjectName(plan.subject)}</span><span>Линия ${Number(plan.examLine)}</span><span>${Number(plan.count)} заданий</span><span>${plan.dueDate?'до '+esc2(plan.dueDate):'без дедлайна'}</span><span>${count} учеников</span></div><div class="teacher-samples">${(result.samples||[]).map((x,i)=>`<div class="teacher-sample"><b>Пример ${i+1}</b> · ${esc2(String(x.prompt||'').slice(0,200))}</div>`).join('')}</div><button class="btn" id="teacher-v2-publish">Выдать ${count} ${count===1?'ученику':'ученикам'} →</button></div>`;document.querySelector('#teacher-v2-publish').onclick=async e=>{const btn=e.currentTarget;btn.disabled=true;btn.textContent='Выдаём…';try{const published=await api('/teacher/assignments-v2',{method:'POST',body:JSON.stringify({classId,prompt,plan})});notify(`Домашнее задание выдано ${published.assignment.assignedStudents} ученикам`);homeworkCache=null;await renderTeacherV2()}catch(err){notify(err.message);btn.disabled=false;btn.textContent='Выдать ученикам →'}}}catch(err){preview.innerHTML='';notify(err.message)}finally{syncAiClass();build.textContent='Собрать задание →'}};
    }catch(err){app.innerHTML=shell(`<div class="card teacher-empty"><h2>Не удалось открыть кабинет учителя</h2><p>${esc2(err.message)}</p><button class="btn" id="teacher-v2-retry">Повторить</button></div>`);bindShell();document.querySelector('#teacher-v2-retry').onclick=renderTeacherV2;enhanceNavV2().catch(()=>{})}
  }

  function homeworkCard(a){const done=a.status==='completed',active=a.status==='active',answered=Number(a.answered_count||0),correct=Number(a.correct_count||0),accuracy=answered?Math.round(correct/answered*100):0;return `<article class="card homework-card ${done?'is-done':active?'is-active':''}"><div><div class="eyebrow">${esc2(a.class_name)} · ${esc2(a.teacher_name)}</div><h3>${esc2(a.title)}</h3><p>${subjectName(a.subject_slug)} · линия ${Number(a.exam_line)} · ${Number(a.question_count)} заданий · ${shortDate(a.due_at)}</p><div class="homework-card-meta"><span class="homework-state ${a.status}">${statusText(a.status)}</span>${active?`<span>${answered}/${Number(a.question_count)} решено</span>`:''}${done?`<span>${correct} верно · ${accuracy}%</span>`:''}</div></div><button class="btn ${done?'ghost':''}" data-homework-start="${a.id}" ${done?'disabled':''}>${done?'Выполнено ✓':active?'Продолжить →':'Начать →'}</button></article>`}

  async function renderHomeworkV2(){
    loadingV2('Загружаем домашние задания…');
    try{
      const d=await api('/teacher/student'),memberships=d.memberships||[],raw=d.assignments||[];
      const priority={assigned:0,active:1,completed:2},assignments=[...raw].sort((a,b)=>(priority[a.status]??3)-(priority[b.status]??3));
      homeworkCache=assignments.filter(a=>a.status!=='completed').length;homeworkAt=Date.now();
      const pending=assignments.filter(a=>a.status==='assigned').length,active=assignments.filter(a=>a.status==='active').length,done=assignments.filter(a=>a.status==='completed').length;
      app.innerHTML=shell(`<div class="classroom-page teacher-page homework-page"><section class="teacher-hero"><div class="eyebrow">ОСНОВА · домашние задания</div><h1>Домашние задания от учителя</h1><p>Все работы, которые назначил учитель, появляются здесь автоматически. Результат после выполнения сразу виден учителю.</p></section><div class="homework-summary"><div class="card"><span>Новые</span><strong>${pending}</strong></div><div class="card"><span>В процессе</span><strong>${active}</strong></div><div class="card"><span>Выполнено</span><strong>${done}</strong></div></div><section class="card teacher-section"><div class="section-head"><div><h2>Мои классы</h2><p class="subtitle">Учитель может добавить вас по почте. Код класса остаётся дополнительным способом.</p></div></div>${memberships.length?`<div class="classroom-memberships">${memberships.map(x=>`<span>${esc2(x.name)} · ${esc2(x.teacher_name)}</span>`).join('')}</div>`:'<p class="subtitle">Вы пока не добавлены ни в один класс.</p>'}<form class="classroom-join" id="homework-join"><input name="code" maxlength="16" placeholder="Код класса, если учитель его дал"><button class="btn">Вступить по коду</button></form></section><div class="section-head"><h2>Мои домашние задания</h2><span class="pill">${assignments.length}</span></div><div class="classroom-assignments homework-list">${assignments.length?assignments.map(homeworkCard).join(''):'<div class="card teacher-empty"><h3>Домашних заданий пока нет</h3><p>Когда учитель добавит вас в класс и выдаст работу, она появится в этой вкладке.</p></div>'}</div></div>`);
      bindShell();enhanceNavV2().catch(()=>{});
      const join=document.querySelector('#homework-join');if(join)join.onsubmit=async e=>{e.preventDefault();const code=String(new FormData(e.target).get('code')||'').trim();if(!code)return notify('Введите код класса');const btn=e.target.querySelector('button');btn.disabled=true;try{const result=await api('/teacher/join',{method:'POST',body:JSON.stringify({code})});notify(`Вы добавлены в класс ${result.class.name}`);homeworkCache=null;await renderHomeworkV2()}catch(err){notify(err.message);btn.disabled=false}};
      document.querySelectorAll('[data-homework-start]').forEach(btn=>btn.onclick=async()=>{btn.disabled=true;try{const result=await api(`/teacher/assignments/${btn.dataset.homeworkStart}/start`,{method:'POST'});if(result.completed){notify('Это домашнее задание уже выполнено');return renderHomeworkV2()}sessionStorage.trainingSession=result.sessionId;go('training')}catch(err){notify(err.message);btn.disabled=false}});
    }catch(err){app.innerHTML=shell(`<div class="card teacher-empty"><h2>Не удалось загрузить домашние задания</h2><p>${esc2(err.message)}</p><button class="btn" id="homework-retry">Повторить</button></div>`);bindShell();document.querySelector('#homework-retry').onclick=renderHomeworkV2;enhanceNavV2().catch(()=>{})}
  }

  if(typeof render==='function'){
    const oldRenderV2=render;
    render=async function(){
      if(state?.route==='teacher')return renderTeacherV2();
      if(state?.route==='homework'||state?.route==='classroom')return renderHomeworkV2();
      const out=await oldRenderV2();enhanceNavV2().catch(()=>{});return out;
    };
  }

  const appRoot=document.querySelector('#app');if(appRoot)new MutationObserver(()=>enhanceNavV2().catch(()=>{})).observe(appRoot,{childList:true,subtree:true});
  addEventListener('hashchange',()=>enhanceNavV2().catch(()=>{}));
  setTimeout(()=>enhanceNavV2().catch(()=>{}),500);
})();
