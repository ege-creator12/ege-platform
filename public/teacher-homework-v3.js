(()=>{
  'use strict';

  const esc3=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
  const metaCache=new Map();
  let patchBusy=false,lastTeacherPatch=0,lastStudentPatch=0;

  async function request(path,options={}){
    const response=await fetch('/api'+path,{credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(data.error||'Ошибка запроса');error.status=response.status;error.code=data.code;throw error}
    return data;
  }

  async function homeworkMeta(sessionId,force=false){
    const id=Number(sessionId||0);if(!id)return {homework:false};
    const cached=metaCache.get(id);if(!force&&cached&&Date.now()-cached.at<60000)return cached.data;
    try{const data=await request(`/teacher/homework/sessions/${id}/meta`);metaCache.set(id,{at:Date.now(),data});return data}
    catch{return {homework:false}}
  }

  function statusLabel(status){return status==='completed'?'Выполнено':status==='active'?'В процессе':'Назначено'}
  function dateLabel(value){if(!value)return 'без срока';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleDateString('ru-RU',{day:'2-digit',month:'short'}):'без срока'}

  async function secureTrainingQuestion(){
    if(typeof state==='undefined'||state.route!=='training')return;
    const sessionId=Number(sessionStorage.trainingSession||0);if(!sessionId)return;
    const meta=await homeworkMeta(sessionId);if(!meta.homework)return;
    const card=document.querySelector('.question-card');if(!card)return;
    const reveal=document.querySelector('#reveal');if(reveal){reveal.hidden=true;reveal.style.display='none'}
    const exit=document.querySelector('[data-exit]');if(exit){exit.textContent='← К домашним заданиям';exit.onclick=()=>go('homework')}
    if(!card.querySelector('.homework-secure-badge')){
      const badge=document.createElement('div');badge.className='homework-secure-badge';badge.innerHTML='<b>Домашняя работа</b><span>Ответ проверяет ОСНОВА. Правильные ответы откроются только после завершения.</span>';
      const metaRow=card.querySelector('.q-meta');if(metaRow)metaRow.after(badge);else card.prepend(badge);
    }
  }

  if(typeof trainingSelfReview==='function'){
    const originalSelfReview=trainingSelfReview;
    trainingSelfReview=async function(sessionId,q,answer,started){
      const meta=await homeworkMeta(sessionId);
      if(!meta.homework)return originalSelfReview(sessionId,q,answer,started);
      const submit=document.querySelector('#submit');if(submit){submit.disabled=true;submit.textContent='ОСНОВА проверяет…'}
      const result=await request(`/teacher/homework/sessions/${Number(sessionId)}/grade-extended`,{
        method:'POST',body:JSON.stringify({questionId:q.id,answer,duration:Math.round((Date.now()-started)/1000)})
      });
      if(typeof state!=='undefined'&&state.user)state.user.xp=Number(state.user.xp||0)+Number(result.xp||0);
      return trainingFeedback(sessionId,result);
    };
  }

  if(typeof trainingFeedback==='function'){
    const originalFeedback=trainingFeedback;
    trainingFeedback=async function(sessionId,result){
      const meta=result?.homework?{homework:true}:await homeworkMeta(sessionId);
      if(!meta.homework)return originalFeedback(sessionId,result);
      if(result?.done&&result?.session)return trainingSummary(result.session);
      const answered=Number(result?.session?.answered_count||0),total=Number(result?.session?.target_questions||0);
      app.innerHTML=shell(`<div class="training"><div class="card question-card homework-saved-card"><div class="eyebrow">Домашняя работа</div><h1>Ответ сохранён</h1><p class="subtitle">ОСНОВА уже проверила ответ. Результат и правильные решения будут доступны после завершения всей работы.</p><div class="homework-save-progress"><b>${answered}</b><span>из ${total||'—'} заданий выполнено</span></div><div class="actions"><button class="btn" id="homework-next">Следующее задание →</button><button class="btn ghost" id="homework-exit">Выйти и продолжить позже</button></div></div></div>`);
      bindShell();
      document.querySelector('#homework-next').onclick=()=>trainingQuestion(sessionId);
      document.querySelector('#homework-exit').onclick=()=>go('homework');
    };
  }

  if(typeof trainingSummary==='function'){
    const originalSummary=trainingSummary;
    trainingSummary=async function(session){
      const sessionId=Number(session?.id||0);if(!sessionId)return originalSummary(session);
      let data;
      try{data=await request(`/teacher/homework/sessions/${sessionId}/summary`)}catch(error){if(error.status===404)return originalSummary(session);throw error}
      sessionStorage.removeItem('trainingSession');metaCache.delete(sessionId);
      const items=data.items||[],assignment=data.assignment||{},percent=Number(data.percent||0),earned=Number(data.earnedPoints||0),maximum=Number(data.maxPoints||0);
      app.innerHTML=shell(`<div class="training homework-final"><div class="card question-card summary-card"><div class="eyebrow">Домашнее задание проверено</div><h1>${esc3(assignment.title||'Результат работы')}</h1><p class="subtitle">${esc3(assignment.teacherName||'Учитель')} · ${esc3(assignment.className||'Класс')}${assignment.dueAt?' · срок '+dateLabel(assignment.dueAt):''}</p><div class="homework-final-score"><strong>${percent}%</strong><span>${earned} из ${maximum} баллов</span>${data.late?'<em>Сдано после срока</em>':'<em class="on-time">Работа завершена</em>'}</div><div class="homework-result-items">${items.map(item=>`<article class="homework-result-item"><div><b>Задание ${Number(item.position)}</b><p>${esc3(String(item.prompt||'').slice(0,240))}</p></div><span class="${Number(item.score)>=Number(item.maxScore)?'full':''}">${Number(item.score)}/${Number(item.maxScore)}</span>${item.verdict?`<small>${esc3(item.verdict)}</small>`:''}${item.missing?.length?`<small><b>Не хватило:</b> ${item.missing.map(esc3).join('; ')}</small>`:''}</article>`).join('')}</div><div class="actions"><button class="btn" id="homework-back">К домашним заданиям</button><button class="btn ghost" id="homework-dashboard">На главную</button></div></div></div>`);
      bindShell();
      document.querySelector('#homework-back').onclick=()=>go('homework');
      document.querySelector('#homework-dashboard').onclick=()=>go('dashboard');
    };
  }

  function openDetailModal(result){
    document.querySelector('.homework-detail-overlay')?.remove();
    const overlay=document.createElement('div');overlay.className='homework-detail-overlay';
    overlay.innerHTML=`<div class="homework-detail-modal"><button class="homework-detail-close" aria-label="Закрыть">×</button><div class="eyebrow">Результат домашней работы</div><h2>${esc3(result.student_name||'Ученик')}</h2><p class="subtitle">${esc3(result.title||'')} · ${Number(result.earnedPoints||0)}/${Number(result.maxPoints||0)} баллов · ${Number(result.percent||0)}%</p>${result.late?'<div class="homework-late-note">Работа сдана после дедлайна.</div>':''}<div class="homework-detail-items">${(result.items||[]).map(item=>`<article><div class="homework-detail-head"><b>Задание ${Number(item.position)}</b><span>${Number(item.score)}/${Number(item.maxScore)}</span></div><p>${esc3(String(item.prompt||'').slice(0,420))}</p>${item.verdict?`<small>${esc3(item.verdict)}</small>`:''}${item.mistakes?.length?`<small><b>Ошибки:</b> ${item.mistakes.map(esc3).join('; ')}</small>`:''}${item.missing?.length?`<small><b>Не хватило:</b> ${item.missing.map(esc3).join('; ')}</small>`:''}</article>`).join('')||'<div class="teacher-empty">Ученик ещё не начал работу.</div>'}</div></div>`;
    document.body.appendChild(overlay);overlay.querySelector('.homework-detail-close').onclick=()=>overlay.remove();overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};
  }

  async function showTeacherDetail(assignmentId,userId){
    try{const data=await request(`/teacher/results/${Number(assignmentId)}/${Number(userId)}`);openDetailModal(data.result||{})}catch(error){notify(error.message)}
  }

  async function patchTeacherResults(force=false){
    if(typeof state==='undefined'||state.route!=='teacher')return;
    const tbody=document.querySelector('#teacher-results-body');if(!tbody)return;
    if(!force&&Date.now()-lastTeacherPatch<3500&&tbody.dataset.v3==='1')return;
    lastTeacherPatch=Date.now();
    try{
      const data=await request('/teacher/results'),results=data.results||[];
      const table=tbody.closest('table'),head=table?.querySelector('thead tr');
      if(head)head.innerHTML='<th>Ученик</th><th>Класс</th><th>Задание</th><th>Статус</th><th>Решено</th><th>Баллы</th><th>Результат</th><th>Срок</th><th></th>';
      tbody.innerHTML=results.length?results.map(r=>`<tr data-result-class="${Number(r.class_id)}"><td><b>${esc3(r.student_name)}</b><small>${esc3(r.student_email||'')}</small></td><td>${esc3(r.class_name)}</td><td><b>${esc3(r.title)}</b><small>${r.subject_slug==='chemistry'?'Химия':'Биология'} · линия ${Number(r.exam_line)}</small></td><td><span class="homework-state ${esc3(r.status)} ${r.late?'late':''}">${r.late&&r.status!=='completed'?'Просрочено':statusLabel(r.status)}</span></td><td>${Number(r.answered_count||0)}/${Number(r.question_count||0)}</td><td><b>${Number(r.score_points||0)}/${Number(r.max_points||0)}</b></td><td><b>${Number(r.accuracy||0)}%</b></td><td>${r.due_at?dateLabel(r.due_at):'—'}${r.late?'<small class="late-text">после срока</small>':''}</td><td><button class="link" data-homework-detail="${Number(r.assignment_id)}:${Number(r.user_id)}">Подробнее</button></td></tr>`).join(''):'<tr><td colspan="9"><div class="teacher-empty">Результатов пока нет.</div></td></tr>';
      tbody.dataset.v3='1';
      document.querySelectorAll('[data-homework-detail]').forEach(button=>button.onclick=()=>{const [assignmentId,userId]=button.dataset.homeworkDetail.split(':');showTeacherDetail(assignmentId,userId)});
      const section=tbody.closest('.teacher-results-section');if(section&&!section.querySelector('.homework-check-note')){const note=document.createElement('div');note.className='homework-check-note';note.innerHTML='<b>Проверяет ОСНОВА:</b> задания с точным ответом проверяются алгоритмом, развёрнутые ответы — автоматическим экспертом по критериям. Ученик не видит правильный ответ до завершения ДЗ.';section.querySelector('.section-head')?.after(note)}
    }catch{}
  }

  async function patchStudentHomework(force=false){
    if(typeof state==='undefined'||!['homework','classroom'].includes(state.route))return;
    if(!force&&Date.now()-lastStudentPatch<3500)return;lastStudentPatch=Date.now();
    try{
      const data=await request('/teacher/student');
      for(const item of data.assignments||[]){
        const button=document.querySelector(`[data-start-assignment="${Number(item.id)}"]`),card=button?.closest('.classroom-assignment');if(!card)continue;
        const status=card.querySelector('.classroom-status');if(status){
          if(item.status==='completed')status.textContent=`Выполнено · ${Number(item.grade_percent||0)}% · ${Number(item.score_points||0)}/${Number(item.max_points||0)} б.`;
          else if(item.late)status.textContent=`Просрочено · ${Number(item.answered_count||0)}/${Number(item.question_count||0)}`;
          else if(item.status==='active')status.textContent=`В процессе · ${Number(item.answered_count||0)}/${Number(item.question_count||0)}`;
          else status.textContent='Назначено';
          status.classList.toggle('late',Boolean(item.late&&item.status!=='completed'));
        }
        if(item.due_at&&!card.querySelector('.homework-due-chip')){const chip=document.createElement('span');chip.className='homework-due-chip';chip.textContent=`Срок: ${dateLabel(item.due_at)}`;card.querySelector('div')?.appendChild(chip)}
      }
    }catch{}
  }

  async function patchAll(force=false){
    if(patchBusy)return;patchBusy=true;
    try{await secureTrainingQuestion();await patchTeacherResults(force);await patchStudentHomework(force)}finally{patchBusy=false}
  }

  const root=document.querySelector('#app');if(root)new MutationObserver(()=>{setTimeout(()=>patchAll(false),0)}).observe(root,{childList:true,subtree:true});
  addEventListener('hashchange',()=>setTimeout(()=>patchAll(true),80));
  setInterval(()=>patchAll(false),8000);
  setTimeout(()=>patchAll(true),500);
})();
