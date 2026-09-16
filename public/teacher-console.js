(()=>{
  'use strict';

  const htmlEsc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const subjectLabel=slug=>slug==='chemistry'?'Химия':'Биология';
  const roleLabel=role=>role==='admin'?'Администратор':role==='teacher'?'Учитель':role==='moderator'?'Модератор':'Ученик';
  const dateLabel=value=>{if(!value)return 'без срока';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}):'без срока'};
  let statusCache=null,statusAt=0,statusPromise=null;
  let enhanceQueued=false;

  async function teacherStatus(force=false){
    const userId=typeof state!=='undefined'&&state.user?Number(state.user.id):0;
    if(!userId)return {teacher:false,admin:false};
    if(!force&&statusCache&&Date.now()-statusAt<30000)return statusCache;
    if(!force&&statusPromise)return statusPromise;
    statusPromise=(async()=>{
      try{
        const d=await api('/teacher/status');
        statusCache={teacher:Boolean(d.teacher),admin:Boolean(d.admin),userId};
      }catch{statusCache={teacher:false,admin:state.user?.role==='admin',userId}}
      statusAt=Date.now();statusPromise=null;return statusCache;
    })();
    return statusPromise;
  }

  function insertNav(nav,route,label,marker,icon){
    let button=nav.querySelector(`[${marker}]`);
    if(!button){
      button=document.createElement('button');button.type='button';button.setAttribute(marker,'1');button.dataset.nav=route;
      const profile=nav.querySelector('[data-nav="profile"]');if(profile)nav.insertBefore(button,profile);else nav.appendChild(button);
    }
    const content=`<span class="nav-icon" aria-hidden="true">${icon}</span><span>${label}</span>`;
    if(button.innerHTML!==content)button.innerHTML=content;
    button.dataset.nav=route;
    const active=String(state.route||'')===route;
    button.classList.toggle('active',active);
    if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    button.onclick=()=>go(route);
    return button;
  }

  async function enhanceShell(){
    // The current homework module owns teacher/student navigation.
    if(window.osnovaTeacherNavigation)return window.osnovaTeacherNavigation.refresh();
    if(typeof state==='undefined'||!state?.user)return;
    const status=await teacherStatus();
    if(window.osnovaTeacherNavigation)return window.osnovaTeacherNavigation.refresh();
    const teacher=Boolean(status.teacher);
    document.documentElement.classList.toggle('osnova-teacher',teacher);
    document.querySelectorAll('.sidebar nav,.mobile-nav').forEach(nav=>{
      const existingTeacher=nav.querySelector('[data-teacher-nav]');
      const existingClassroom=nav.querySelector('[data-classroom-nav]');
      if(teacher){
        existingClassroom?.remove();
        insertNav(nav,'teacher','Кабинет учителя','data-teacher-nav','▥');
      }else{
        existingTeacher?.remove();
        if(state.user.role!=='admin'&&!document.documentElement.classList.contains('osnova-moderator'))insertNav(nav,'classroom','Мой класс','data-classroom-nav','▣');
        else existingClassroom?.remove();
      }
    });
    if(teacher){const chip=document.querySelector('.user-chip small');if(chip&&chip.textContent!=='Учитель')chip.textContent='Учитель'}
  }

  function scheduleEnhance(){
    if(enhanceQueued)return;enhanceQueued=true;
    requestAnimationFrame(()=>{enhanceQueued=false;enhanceShell().catch(()=>{})});
  }

  function loadingPage(title='Загружаем кабинет…'){
    app.innerHTML=shell(`<div class="page-state" role="status"><div class="skeleton wide"></div><div class="skeleton"></div><span>${htmlEsc(title)}</span></div>`);bindShell();scheduleEnhance();
  }

  function teacherAssignmentCard(a){
    const done=Number(a.completed_count||0),total=Number(a.student_count||0),active=Number(a.active_count||0);
    return `<article class="teacher-assignment"><div class="teacher-assignment-top"><div><b>${htmlEsc(a.title)}</b><small>${htmlEsc(a.class_name)} · ${subjectLabel(a.subject_slug)}, линия ${Number(a.exam_line)} · ${Number(a.question_count)} заданий · ${dateLabel(a.due_at)}</small></div><span class="teacher-assignment-stat">${done}/${total} готово</span></div>${active?`<small>${active} выполняют сейчас</small>`:''}</article>`;
  }

  async function renderTeacher(){
    loadingPage('Загружаем данные классов…');
    const status=await teacherStatus(true);
    if(!status.teacher&&!status.admin){notify('Кабинет доступен только учителю');return go('dashboard')}
    try{
      const d=await api('/teacher/dashboard');
      const classes=d.classes||[],students=d.students||[],assignments=d.assignments||[],m=d.metrics||{};
      const classOptions=classes.map(c=>`<option value="${c.id}">${htmlEsc(c.name)} · ${Number(c.student_count||0)} уч.</option>`).join('');
      app.innerHTML=shell(`<div class="teacher-page">
        <section class="teacher-hero"><div class="eyebrow">ОСНОВА · кабинет учителя</div><h1>Класс, задания и прогресс — в одном месте</h1><p>Следите за подготовкой учеников и формулируйте домашнюю работу обычным языком. AI понимает предмет, линию ЕГЭ и количество, а задания берутся из проверенной базы ОСНОВЫ.</p><span class="teacher-role-badge">▥ Роль: Учитель</span></section>
        <div class="teacher-metrics"><div class="card teacher-metric"><span>Мои классы</span><strong>${Number(m.classes||0)}</strong></div><div class="card teacher-metric"><span>Ученики</span><strong>${Number(m.students||0)}</strong></div><div class="card teacher-metric"><span>Выдано заданий</span><strong>${Number(m.assignments||0)}</strong></div><div class="card teacher-metric"><span>Средняя точность</span><strong>${Number(m.averageAccuracy||0)}%</strong></div></div>
        <div class="teacher-layout">
          <section class="card teacher-section"><h2>Мои классы</h2><p class="subtitle">Создайте класс и дайте ученикам код для вступления.</p><div class="teacher-class-list">${classes.length?classes.map(c=>`<article class="teacher-class-card"><div><b>${htmlEsc(c.name)}</b><small>${Number(c.student_count||0)} учеников</small></div><span class="teacher-code" title="Код для учеников">${htmlEsc(c.join_code)}</span></article>`).join(''):'<div class="teacher-empty">Пока нет классов. Создайте первый — например, 11А.</div>'}</div><form class="teacher-create-class" id="teacher-create-class"><input name="name" maxlength="80" placeholder="Например, 11А · Биология" required><button class="btn">+ Создать класс</button></form></section>
          <section class="card teacher-section"><h2>Последние задания</h2><p class="subtitle">Сколько учеников уже выполнили работу.</p><div class="teacher-assignment-list">${assignments.length?assignments.slice(0,6).map(teacherAssignmentCard).join(''):'<div class="teacher-empty">Заданий ещё нет.</div>'}</div></section>
        </div>
        <section class="teacher-ai"><div class="teacher-ai-head"><div><div class="eyebrow">AI-конструктор задания</div><h2>Напишите, что выдать ученикам</h2><p class="subtitle">Например: «Дай по биологии линию 4, 12 заданий, срок до пятницы».</p></div><span class="teacher-ai-mark">AI</span></div>
          ${classes.length?`<textarea id="teacher-ai-prompt" placeholder="Дай этому классу 10 сложных заданий по химии, линия 17…"></textarea><div class="teacher-ai-row"><div class="field"><label>КЛАСС</label><select id="teacher-ai-class">${classOptions}</select></div><button class="btn" id="teacher-ai-build">Собрать задание →</button></div><div id="teacher-ai-preview"></div>`:'<div class="teacher-empty">Сначала создайте класс — после этого AI сможет собрать и назначить работу.</div>'}
        </section>
        <section class="card teacher-section" style="margin-top:16px"><div class="section-head"><div><h2>Прогресс учеников</h2><p class="subtitle">Решённые задания, точность и среднее освоение тем.</p></div>${classes.length>1?`<select id="teacher-progress-class"><option value="all">Все классы</option>${classOptions}</select>`:''}</div><div class="teacher-table-wrap"><table class="teacher-table"><thead><tr><th>Ученик</th><th>Класс</th><th>Решено</th><th>Точность</th><th>Освоение</th><th>XP</th></tr></thead><tbody id="teacher-students-body">${students.length?students.map(s=>`<tr data-class-id="${s.classId}"><td><b>${htmlEsc(s.name)}</b></td><td>${htmlEsc(s.className)}</td><td>${Number(s.solved||0)}</td><td><span class="teacher-progress"><b>${Number(s.accuracy||0)}%</b><i style="--teacher-progress:${Math.max(0,Math.min(100,Number(s.accuracy||0)))}%"></i></span></td><td>${Number(s.mastery||0)}%</td><td>${Number(s.xp||0)}</td></tr>`).join(''):'<tr><td colspan="6"><div class="teacher-empty">Ученики появятся после вступления по коду класса.</div></td></tr>'}</tbody></table></div></section>
      </div>`);
      bindShell();scheduleEnhance();

      document.querySelector('#teacher-create-class').onsubmit=async e=>{e.preventDefault();const name=new FormData(e.target).get('name');const button=e.target.querySelector('button');button.disabled=true;try{await api('/teacher/classes',{method:'POST',body:JSON.stringify({name})});notify('Класс создан');await renderTeacher()}catch(err){notify(err.message);button.disabled=false}};
      const progressSelect=document.querySelector('#teacher-progress-class');if(progressSelect)progressSelect.onchange=()=>document.querySelectorAll('#teacher-students-body tr[data-class-id]').forEach(row=>row.hidden=progressSelect.value!=='all'&&row.dataset.classId!==progressSelect.value);
      const build=document.querySelector('#teacher-ai-build');if(build)build.onclick=async()=>{
        const prompt=document.querySelector('#teacher-ai-prompt').value.trim(),classId=Number(document.querySelector('#teacher-ai-class').value),preview=document.querySelector('#teacher-ai-preview');
        if(!prompt)return notify('Напишите, какое задание нужно выдать');
        build.disabled=true;build.textContent='AI собирает…';preview.innerHTML='<div class="teacher-ai-preview">Разбираем команду и подбираем задания из базы…</div>';
        try{
          const result=await api('/teacher/assignments/preview',{method:'POST',body:JSON.stringify({classId,prompt})}),plan=result.plan||{};
          preview.innerHTML=`<div class="teacher-ai-preview"><div class="eyebrow">${plan.interpretedByAi?'AI понял команду':'Команда распознана резервным алгоритмом'}</div><h3>${htmlEsc(plan.title)}</h3><div class="teacher-plan-chips"><span>${subjectLabel(plan.subject)}</span><span>Линия ${Number(plan.examLine)}</span><span>${Number(plan.count)} заданий</span><span>${plan.dueDate?'до '+htmlEsc(plan.dueDate):'без дедлайна'}</span></div>${Number(plan.requestedCount)>Number(plan.count)?`<p class="subtitle">В базе доступно ${Number(plan.count)} из запрошенных ${Number(plan.requestedCount)} уникальных заданий.</p>`:''}<div class="teacher-samples">${(result.samples||[]).map((x,i)=>`<div class="teacher-sample"><b>Пример ${i+1}</b> · ${htmlEsc(String(x.prompt||'').slice(0,220))}<small>${htmlEsc(x.topic||'')} · сложность ${Number(x.difficulty||1)}</small></div>`).join('')}</div><button class="btn" id="teacher-ai-publish">Выдать классу →</button></div>`;
          document.querySelector('#teacher-ai-publish').onclick=async e=>{const btn=e.currentTarget;btn.disabled=true;btn.textContent='Выдаём…';try{await api('/teacher/assignments',{method:'POST',body:JSON.stringify({classId,prompt,plan})});notify('Задание выдано ученикам');await renderTeacher()}catch(err){notify(err.message);btn.disabled=false;btn.textContent='Выдать классу →'}};
        }catch(err){preview.innerHTML='';notify(err.message)}finally{build.disabled=false;build.textContent='Собрать задание →'}
      };
    }catch(err){app.innerHTML=shell(`<div class="card teacher-empty"><h2>Не удалось открыть кабинет учителя</h2><p>${htmlEsc(err.message)}</p><button class="btn" id="teacher-retry">Повторить</button></div>`);bindShell();document.querySelector('#teacher-retry').onclick=renderTeacher;scheduleEnhance()}
  }

  function classroomAssignmentCard(a){
    const done=a.status==='completed',active=a.status==='active';
    const accuracy=Number(a.answered_count||0)?Math.round(Number(a.correct_count||0)/Number(a.answered_count||1)*100):0;
    return `<article class="card classroom-assignment"><div><div class="eyebrow">${htmlEsc(a.class_name)} · ${htmlEsc(a.teacher_name)}</div><h3>${htmlEsc(a.title)}</h3><p>${subjectLabel(a.subject_slug)} · линия ${Number(a.exam_line)} · ${Number(a.question_count)} заданий · ${dateLabel(a.due_at)}</p><span class="classroom-status ${done?'done':active?'active':''}">${done?`Выполнено · ${accuracy}%`:active?`В процессе · ${Number(a.answered_count||0)}/${Number(a.question_count)}`:'Назначено'}</span></div><button class="btn ${done?'ghost':''}" data-start-assignment="${a.id}" ${done?'disabled':''}>${done?'Готово ✓':active?'Продолжить →':'Начать →'}</button></article>`;
  }

  async function renderClassroom(){
    loadingPage('Загружаем задания учителя…');
    try{
      const d=await api('/teacher/student'),memberships=d.memberships||[],assignments=d.assignments||[];
      app.innerHTML=shell(`<div class="classroom-page teacher-page"><section class="teacher-hero"><div class="eyebrow">ОСНОВА · мой класс</div><h1>Задания от учителя</h1><p>Вступите в класс по коду и выполняйте назначенные работы в привычном тренажёре ОСНОВЫ. Результаты автоматически появятся у учителя.</p></section><section class="card teacher-section"><h2>Код класса</h2><p class="subtitle">Код выдаёт учитель. Его достаточно ввести один раз.</p><form class="classroom-join" id="classroom-join"><input name="code" maxlength="16" placeholder="Например, A7K9M2Q" required><button class="btn">Вступить в класс</button></form>${memberships.length?`<div class="classroom-memberships">${memberships.map(x=>`<span>${htmlEsc(x.name)} · ${htmlEsc(x.teacher_name)}</span>`).join('')}</div>`:''}</section><div class="section-head"><h2>Мои задания</h2><span class="pill">${assignments.length}</span></div><div class="classroom-assignments">${assignments.length?assignments.map(classroomAssignmentCard).join(''):'<div class="card teacher-empty">Пока заданий нет. Если учитель уже создал класс, введите его код выше.</div>'}</div></div>`);
      bindShell();scheduleEnhance();
      document.querySelector('#classroom-join').onsubmit=async e=>{e.preventDefault();const code=new FormData(e.target).get('code');const button=e.target.querySelector('button');button.disabled=true;try{const result=await api('/teacher/join',{method:'POST',body:JSON.stringify({code})});notify(`Вы вступили в класс ${result.class.name}`);await renderClassroom()}catch(err){notify(err.message);button.disabled=false}};
      document.querySelectorAll('[data-start-assignment]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{const result=await api(`/teacher/assignments/${button.dataset.startAssignment}/start`,{method:'POST'});if(result.completed){notify('Это задание уже выполнено');return renderClassroom()}sessionStorage.trainingSession=result.sessionId;go('training')}catch(err){notify(err.message);button.disabled=false}});
    }catch(err){app.innerHTML=shell(`<div class="card teacher-empty"><h2>Не удалось загрузить класс</h2><p>${htmlEsc(err.message)}</p><button class="btn" id="classroom-retry">Повторить</button></div>`);bindShell();document.querySelector('#classroom-retry').onclick=renderClassroom;scheduleEnhance()}
  }

  function installAdminTeacherRole(){
    if(typeof window.adminUsers!=='function'||typeof window.editUser!=='function')return;

    window.deleteUserAccount=async function(u,trigger){
      if(!u)return;const currentId=Number(state?.user?.id)||0;if(Number(u.id)===currentId)return notify('Текущий аккаунт администратора удалить нельзя');
      const role=roleLabel(u.role).toLowerCase();if(!confirm(`Удалить аккаунт: ${role} «${u.name}» (${u.email})?\n\nАккаунт, сессии, прогресс и связанные данные будут удалены. Отменить действие нельзя.`))return;
      if(trigger){trigger.disabled=true;trigger.textContent='Удаляем…'}
      try{const result=await adminApi(`/users/${u.id}`,{method:'DELETE'});adminCache.overview=null;notify(`Аккаунт ${result?.deleted?.name||u.name} удалён`);adminTab='users';await adminUsers()}catch(e){notify(e.message||'Не удалось удалить аккаунт');if(trigger){trigger.disabled=false;trigger.textContent='Удалить'}}
    };

    window.adminUsers=async function(){
      try{
        const [d,mods,teachers]=await Promise.all([adminApi('/overview'),api('/moderator-admin/list'),api('/teacher-admin/list')]);
        const moderatorIds=new Set((mods.userIds||[]).map(Number)),teacherIds=new Set((teachers.userIds||[]).map(Number));
        const users=(d.users||[]).map(u=>({...u,role:u.role==='admin'?'admin':teacherIds.has(Number(u.id))?'teacher':moderatorIds.has(Number(u.id))?'moderator':'student'}));
        const currentId=Number(state?.user?.id)||0;
        adminFrame(`<div class="admin-note">Роли разделены: ученик учится, учитель видит свои классы и выдаёт задания, модератор работает с контентом, администратор управляет платформой.</div><div class="card admin-table-wrap"><table class="admin-table"><thead><tr><th>Пользователь</th><th>Роль</th><th>XP</th><th>Решено</th><th></th></tr></thead><tbody>${users.map(u=>`<tr><td><b>${htmlEsc(u.name)}</b><small>${htmlEsc(u.email)}</small></td><td>${roleLabel(u.role)}</td><td>${Number(u.xp)||0}</td><td>${u.solved??0}</td><td><div class="admin-user-actions"><button class="link" data-edit-user="${u.id}">Изменить</button>${Number(u.id)!==currentId?`<button class="link admin-user-delete" data-delete-user="${u.id}">Удалить</button>`:'<small>Текущий аккаунт</small>'}</div></td></tr>`).join('')}</tbody></table></div>`,'Пользователи');
        document.querySelectorAll('[data-edit-user]').forEach(x=>x.onclick=()=>window.editUser(users.find(u=>Number(u.id)===Number(x.dataset.editUser))));
        document.querySelectorAll('[data-delete-user]').forEach(x=>x.onclick=()=>window.deleteUserAccount(users.find(u=>Number(u.id)===Number(x.dataset.deleteUser)),x));
      }catch(e){adminFrame(`<div class="card"><h2>Не удалось загрузить пользователей</h2><p class="subtitle">${htmlEsc(e.message)}</p><button class="btn" id="users-retry">Повторить</button></div>`,'Пользователи');document.querySelector('#users-retry').onclick=()=>adminUsers()}
    };

    window.editUser=function(u){
      const currentId=Number(state?.user?.id)||0;
      const danger=Number(u.id)!==currentId?`<div class="admin-danger-zone"><div><strong>Удалить аккаунт</strong><small>Удалит пользователя и связанные данные из базы.</small></div><button type="button" class="btn admin-delete-account" id="admin-delete-account">Удалить аккаунт</button></div>`:'';
      adminFrame(`<button class="back" id="admin-back">← Пользователи</button><form class="card admin-editor" id="user-edit"><h2>${htmlEsc(u.name)}</h2><p class="subtitle">${htmlEsc(u.email)}</p><div class="field"><label>ИМЯ</label><input name="name" value="${htmlEsc(u.name)}"></div><div class="field"><label>XP</label><input name="xp" type="number" min="0" value="${Number(u.xp)||0}"></div><div class="field"><label>РОЛЬ</label><select name="role"><option value="student" ${u.role==='student'?'selected':''}>Ученик</option><option value="teacher" ${u.role==='teacher'?'selected':''}>Учитель</option><option value="moderator" ${u.role==='moderator'?'selected':''}>Модератор</option><option value="admin" ${u.role==='admin'?'selected':''}>Администратор</option></select></div><div class="admin-note"><b>Учитель</b>: свои классы, прогресс учеников и выдача заданий через AI. Без доступа к админке и чужим ученикам.<br><b>Модератор</b>: учебный контент и база заданий.</div><button class="btn">Сохранить</button>${danger}</form>`,'Пользователь');
      document.querySelector('#admin-back').onclick=()=>{adminTab='users';admin()};const del=document.querySelector('#admin-delete-account');if(del)del.onclick=()=>window.deleteUserAccount(u,del);
      document.querySelector('#user-edit').onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),selected=b.role;const submit=e.target.querySelector('button[type="submit"],button.btn');submit.disabled=true;try{
        await adminApi(`/users/${u.id}`,{method:'PATCH',body:JSON.stringify({name:b.name,xp:b.xp,role:selected==='admin'?'admin':'student'})});
        if(selected==='teacher'){await api(`/moderator-admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify({enabled:false})});await api(`/teacher-admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify({enabled:true})})}
        else if(selected==='moderator'){await api(`/teacher-admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify({enabled:false})});await api(`/moderator-admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify({enabled:true})})}
        else{await api(`/teacher-admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify({enabled:false})});await api(`/moderator-admin/users/${u.id}`,{method:'PATCH',body:JSON.stringify({enabled:false})})}
        adminCache.overview=null;statusCache=null;notify(selected==='teacher'?'Роль учителя выдана':'Пользователь обновлён');adminTab='users';admin();
      }catch(err){notify(err.message);submit.disabled=false}}
    };
  }

  if(typeof render==='function'){
    const previousRender=render;
    render=async function(){
      if(typeof state!=='undefined'&&state?.route==='teacher')return renderTeacher();
      if(typeof state!=='undefined'&&state?.route==='classroom')return renderClassroom();
      const result=await previousRender();scheduleEnhance();return result;
    };
  }

  installAdminTeacherRole();
  const root=document.querySelector('#app');if(root)new MutationObserver(scheduleEnhance).observe(root,{childList:true,subtree:true});
  addEventListener('hashchange',scheduleEnhance);
  setTimeout(scheduleEnhance,350);
})();
