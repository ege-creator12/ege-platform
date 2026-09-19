(()=>{
  'use strict';

  const TASK_REQUEST=/(?:дай|составь|создай|сгенерируй|подбери|хочу|нужны?|сделай)[\s\S]{0,90}(?:задан|вопрос|тест)|(?:задан|вопрос|тест)[\s\S]{0,90}(?:по|на|для|егэ|лини)/i;
  const MAX_TASKS=10;
  let activeModal=null;

  const clean=v=>String(v??'').replace(/\r\n?/g,'\n').trim();
  const normalize=v=>clean(v)
    .toLowerCase()
    .replace(/ё/g,'е')
    .replace(/[«»"'`]/g,'')
    .replace(/\s*[;,]\s*/g,' ')
    .replace(/\s+/g,' ')
    .trim();

  function requestedCount(text){
    const match=String(text||'').match(/\b(10|[1-9])\s*(?:задан|вопрос|тест)/i);
    return Math.min(MAX_TASKS,Math.max(1,Number(match?.[1]||5)));
  }

  function requestedLine(text){
    const raw=normalize(text);
    // Не используем \\b вокруг кириллицы: в JavaScript это ломает распознавание фраз
    // вроде «дай 3 задания по 18 линии егэ химия».
    let match=raw.match(/(?:лини(?:я|и|ю|е)?|номер\s+задани(?:я|е)|задани(?:е|я)\s*№?)\s*(\d{1,2})/i);
    if(!match)match=raw.match(/(\d{1,2})\s*(?:-?(?:я|й)\s*)?лини(?:я|и|ю|е)?/i);
    const line=Number(match?.[1]||0);
    return Number.isInteger(line)&&line>0?line:0;
  }

  function requestedSubject(text,line){
    const raw=normalize(text);
    const chemistry=/(?:^|[^а-яё])(?:химия|химии|химию|химический|химические|хим)(?=$|[^а-яё])/i;
    const biology=/(?:^|[^а-яё])(?:биология|биологии|биологию|биологический|биологические|био)(?=$|[^а-яё])/i;
    if(chemistry.test(raw))return 'chemistry';
    if(biology.test(raw))return 'biology';
    if(line>28&&line<=34)return 'chemistry';
    const route=String(globalThis.state?.route||'');
    if(route==='chemistry'||route.startsWith('chemistry/'))return 'chemistry';
    if(route==='biology'||route.startsWith('biology/'))return 'biology';
    return '';
  }

  function lineLimit(subject){return subject==='chemistry'?34:28;}

  async function startRealLinePractice(modal,userPrompt,line){
    const chat=modal.querySelector('#ai-tutor-chat');
    const input=modal.querySelector('#ai-tutor-input');
    const submit=modal.querySelector('#ai-tutor-form button[type="submit"]');
    if(!chat||!input||!submit)return;
    const count=requestedCount(userPrompt);
    const subject=requestedSubject(userPrompt,line);
    addBubble(chat,'user',userPrompt);

    if(!subject){
      addBubble(chat,'assistant',`Уточни предмет для линии ${line}: биология или химия? У них одинаковые номера линий означают разные задания, поэтому я не буду угадывать.`);
      input.value='';
      input.placeholder='Например: биология, линия 27';
      input.focus({preventScroll:true});
      return;
    }
    if(line>lineLimit(subject)){
      addBubble(chat,'assistant',subject==='biology'
        ? `В биологии ЕГЭ сейчас линии 1–28. Линии ${line} там нет.`
        : `В химии ЕГЭ сейчас линии 1–34. Линии ${line} там нет.`);
      input.focus({preventScroll:true});
      return;
    }

    const loading=addBubble(chat,'assistant',`Загружаю ${count} заданий линии ${line} из банка ОСНОВЫ…`,'loading');
    submit.disabled=true;
    input.disabled=true;
    try{
      const response=await fetch(`/api/ai-line-tasks?subject=${encodeURIComponent(subject)}&line=${line}&count=${count}`,{
        method:'GET',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'},
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||`Не удалось загрузить задания линии ${line}`);
      const tasks=(data.tasks||[]).map((task,index)=>({
        id:Number(task.id||index+1),
        prompt:clean(task.prompt),
        instruction:clean(task.instruction),
        options:Array.isArray(task.options)?task.options.map(clean).filter(Boolean):[],
        answer:clean(task.answer),
        accepted:Array.isArray(task.acceptedAnswers)?task.acceptedAnswers.map(clean).filter(Boolean):[clean(task.answer)].filter(Boolean),
        explanation:clean(task.explanation||'Сверь решение с правилом этой линии ЕГЭ.'),
        difficulty:clean(task.difficulty||''),
        manualReview:Boolean(task.manualReview),
      })).filter(task=>task.prompt&&task.answer);
      if(!tasks.length)throw new Error(`В банке линии ${line} пока нет готовых заданий. Повтори через минуту.`);

      loading.remove();
      const card=document.createElement('section');
      card.className='ai-practice-card';
      chat.appendChild(card);
      renderTask(card,{
        tasks,index:0,correct:0,originalPrompt:userPrompt,
        line,subject
      });
      chat.scrollTop=chat.scrollHeight;
    }catch(error){
      loading.classList.remove('loading');
      loading.textContent=error.message||'Не удалось загрузить задания этой линии.';
    }finally{
      submit.disabled=false;
      input.disabled=false;
      input.focus({preventScroll:true});
    }
  }

  function parseJson(text){
    const raw=clean(text).replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/i,'');
    try{return JSON.parse(raw)}catch{}
    const start=Math.min(...['{','['].map(ch=>{const i=raw.indexOf(ch);return i<0?Infinity:i}));
    const end=Math.max(raw.lastIndexOf('}'),raw.lastIndexOf(']'));
    if(!Number.isFinite(start)||end<=start)return null;
    try{return JSON.parse(raw.slice(start,end+1))}catch{return null}
  }

  function toTasks(payload){
    const list=Array.isArray(payload)?payload:Array.isArray(payload?.tasks)?payload.tasks:[];
    return list.slice(0,MAX_TASKS).map((item,index)=>{
      const prompt=clean(item?.prompt||item?.question||'');
      const answer=clean(item?.answer||item?.correctAnswer||'');
      const accepted=Array.isArray(item?.acceptedAnswers)?item.acceptedAnswers.map(clean).filter(Boolean):[];
      if(answer&&!accepted.includes(answer))accepted.unshift(answer);
      return {
        id:index+1,
        prompt,
        instruction:clean(item?.instruction||''),
        options:Array.isArray(item?.options)?item.options.map(clean).filter(Boolean).slice(0,8):[],
        answer,
        accepted,
        explanation:clean(item?.explanation||item?.solution||'Правильный ответ указан выше.'),
        difficulty:clean(item?.difficulty||''),
      };
    }).filter(task=>task.prompt&&task.answer);
  }

  function isCorrect(given,task){
    const value=normalize(given);
    if(!value)return false;
    return task.accepted.some(answer=>normalize(answer)===value);
  }

  function addBubble(chat,role,text,extra=''){
    const node=document.createElement('div');
    node.className=`ai-msg ${role} ${extra}`.trim();
    node.textContent=text;
    chat.appendChild(node);
    chat.scrollTop=chat.scrollHeight;
    return node;
  }

  function finishSession(card,state){
    card.innerHTML='';
    const title=document.createElement('div');
    title.className='ai-practice-finish';
    const strong=document.createElement('strong');
    strong.textContent=`Готово: ${state.correct} из ${state.tasks.length}`;
    const text=document.createElement('p');
    text.textContent=state.correct===state.tasks.length
      ? 'Все задания решены правильно.'
      : `Ошибок: ${state.tasks.length-state.correct}. Можно сразу создать ещё один набор по этой же теме.`;
    const again=document.createElement('button');
    again.type='button';
    again.className='btn';
    again.textContent='Ещё задания';
    again.addEventListener('click',()=>{
      const modal=card.closest('#ai-tutor-modal');
      const input=modal?.querySelector('#ai-tutor-input');
      if(input){input.value=state.originalPrompt;input.focus();}
      card.remove();
    });
    title.append(strong,text,again);
    card.appendChild(title);
  }

  function renderTask(card,state){
    const task=state.tasks[state.index];
    if(!task)return finishSession(card,state);
    card.innerHTML='';

    const head=document.createElement('div');
    head.className='ai-practice-head';
    const label=document.createElement('b');
    label.textContent=`Задание ${state.index+1} из ${state.tasks.length}`;
    const score=document.createElement('span');
    score.textContent=`Верно: ${state.correct}`;
    head.append(label,score);

    const bar=document.createElement('div');
    bar.className='ai-practice-bar';
    const fill=document.createElement('i');
    fill.style.width=`${Math.round((state.index/state.tasks.length)*100)}%`;
    bar.appendChild(fill);

    const prompt=document.createElement('div');
    prompt.className='ai-practice-prompt';
    if(task.instruction){
      const small=document.createElement('small');
      small.textContent=task.instruction;
      prompt.appendChild(small);
    }
    const p=document.createElement('p');
    p.textContent=task.prompt;
    prompt.appendChild(p);

    if(task.options.length){
      const options=document.createElement('ol');
      options.className='ai-practice-options';
      task.options.forEach(option=>{const li=document.createElement('li');li.textContent=option;options.appendChild(li)});
      prompt.appendChild(options);
    }

    const form=document.createElement('form');
    form.className='ai-practice-answer';
    const input=document.createElement('textarea');
    input.rows=2;
    input.maxLength=1200;
    input.placeholder='Твой ответ…';
    input.setAttribute('aria-label','Ответ на сгенерированное задание');
    const actions=document.createElement('div');
    actions.className='ai-practice-actions';
    const check=document.createElement('button');
    check.type='submit';
    check.className='btn';
    check.textContent=task.manualReview?'Показать эталон':'Проверить ответ';
    const skip=document.createElement('button');
    skip.type='button';
    skip.className='btn ghost';
    skip.textContent='Пропустить';
    actions.append(check,skip);
    form.append(input,actions);

    const feedback=document.createElement('div');
    feedback.className='ai-practice-feedback';
    feedback.hidden=true;

    const showResult=(given,skipped=false)=>{
      const manual=Boolean(task.manualReview);
      const correct=manual?!skipped:(!skipped&&isCorrect(given,task));
      if(correct)state.correct+=1;
      input.disabled=true;
      check.hidden=true;
      skip.hidden=true;
      feedback.hidden=false;
      feedback.classList.toggle('correct',correct);
      feedback.classList.toggle('wrong',!correct&&!manual);
      feedback.innerHTML='';
      const verdict=document.createElement('strong');
      verdict.textContent=manual?'Сверь свой ответ с эталоном':(correct?'✓ Верно':'✕ Неверно');
      const answer=document.createElement('p');
      answer.textContent=`Правильный ответ: ${task.answer}`;
      const explanation=document.createElement('p');
      explanation.textContent=task.explanation;
      const next=document.createElement('button');
      next.type='button';
      next.className='btn';
      next.textContent=state.index===state.tasks.length-1?'Показать результат':'Следующее →';
      next.addEventListener('click',()=>{state.index+=1;renderTask(card,state)});
      feedback.append(verdict,answer,explanation,next);
      card.scrollIntoView({block:'nearest'});
    };

    form.addEventListener('submit',event=>{
      event.preventDefault();
      showResult(input.value,false);
    });
    skip.addEventListener('click',()=>showResult('',true));
    input.addEventListener('keydown',event=>{
      if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();form.requestSubmit();}
    });

    card.append(head,bar,prompt,form,feedback);
    requestAnimationFrame(()=>input.focus({preventScroll:true}));
  }

  async function generatePractice(modal,userPrompt){
    const line=requestedLine(userPrompt);
    if(line)return startRealLinePractice(modal,userPrompt,line);
    if(/лини(?:я|и|ю|е)?/i.test(normalize(userPrompt))){
      const chat=modal.querySelector('#ai-tutor-chat');
      const input=modal.querySelector('#ai-tutor-input');
      if(chat)addBubble(chat,'assistant','Не смог распознать номер линии. Напиши, например: «дай 3 задания по 18 линии ЕГЭ, химия».');
      if(input)input.focus({preventScroll:true});
      return;
    }
    const chat=modal.querySelector('#ai-tutor-chat');
    const input=modal.querySelector('#ai-tutor-input');
    const submit=modal.querySelector('#ai-tutor-form button[type="submit"]');
    if(!chat||!input||!submit)return;

    const count=requestedCount(userPrompt);
    addBubble(chat,'user',userPrompt);
    const loading=addBubble(chat,'assistant','Создаю задания под твой запрос…','loading');
    submit.disabled=true;
    input.disabled=true;

    const instruction=`Создай ровно ${count} самостоятельных заданий по запросу ученика: «${clean(userPrompt).slice(0,700)}».\nЗадания должны соответствовать школьной программе и ЕГЭ по биологии или химии. Не повторяй один и тот же вопрос. Ответы должны быть однозначно проверяемыми и достаточно короткими для ввода учеником. Если уместно, можно дать варианты ответа, но не раскрывай правильный вариант в тексте задания.\nВерни ТОЛЬКО валидный JSON без markdown и без пояснений вокруг него строго такого вида:\n{"tasks":[{"prompt":"условие","instruction":"краткая инструкция или пустая строка","options":[],"answer":"эталонный ответ","acceptedAnswers":["эталонный ответ","допустимый вариант"],"explanation":"короткий разбор после проверки","difficulty":"ЕГЭ"}]}\nНе добавляй ответы внутрь prompt или options.`;

    try{
      const response=await fetch('/api/ai/tutor',{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json','accept':'application/json'},
        body:JSON.stringify({message:instruction}),
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(data.error||'Не удалось создать задания');
      const tasks=toTasks(parseJson(data.answer));
      if(!tasks.length)throw new Error('ИИ вернул задания в неподходящем формате. Повтори запрос.');
      loading.remove();
      const card=document.createElement('section');
      card.className='ai-practice-card';
      chat.appendChild(card);
      renderTask(card,{tasks,index:0,correct:0,originalPrompt:userPrompt});
      chat.scrollTop=chat.scrollHeight;
    }catch(error){
      loading.classList.remove('loading');
      loading.textContent=error.message||'Не удалось создать задания. Попробуй ещё раз.';
    }finally{
      submit.disabled=false;
      input.disabled=false;
      input.focus({preventScroll:true});
    }
  }

  function attach(modal){
    if(!modal||modal.dataset.practiceReady==='1')return;
    modal.dataset.practiceReady='1';
    activeModal=modal;
    const form=modal.querySelector('#ai-tutor-form');
    const input=modal.querySelector('#ai-tutor-input');
    const modes=modal.querySelector('.ai-tutor-modes');
    if(!form||!input||!modes)return;

    let armed=false;
    const mode=document.createElement('button');
    mode.type='button';
    mode.className='ai-tutor-mode ai-practice-mode';
    mode.textContent='📝 Задания';
    modes.appendChild(mode);
    mode.addEventListener('click',()=>{
      armed=!armed;
      mode.classList.toggle('active',armed);
      if(armed){
        input.placeholder='Например: дай 5 заданий по биологии, линия 27';
        input.focus();
      }else input.placeholder='Например: объясни, как отличать окислитель от восстановителя';
    });

    const originalSubmit=form.onsubmit;
    form.onsubmit=event=>{
      const text=input.value.trim();
      if(text&&(armed||TASK_REQUEST.test(text))){
        event.preventDefault();
        event.stopImmediatePropagation();
        input.value='';
        armed=false;
        mode.classList.remove('active');
        input.placeholder='Например: объясни, как отличать окислитель от восстановителя';
        generatePractice(modal,text);
        return false;
      }
      return typeof originalSubmit==='function'?originalSubmit.call(form,event):undefined;
    };

    globalThis.OsnovaAiPractice={
      isTaskRequest:text=>TASK_REQUEST.test(String(text||'')),
      requestedLine,
      requestedSubject,
      generatePractice:(text)=>generatePractice(modal,String(text||''))
    };
  }

  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(node?.nodeType===1&&node.id==='ai-tutor-modal')attach(node);
      }
    }
  });
  observer.observe(document.body,{childList:true});
  attach(document.querySelector('#ai-tutor-modal'));
})();