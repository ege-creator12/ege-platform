(()=>{
'use strict';
const toastMessage=message=>{if(typeof window.notify==='function')return window.notify(message);const toast=document.querySelector('#toast');if(toast){toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3200)}};
const clearStrict=()=>{sessionStorage.removeItem('trainingExamLine');sessionStorage.removeItem('trainingBankVersion')};

async function startStrictLine(line,count,mode='adaptive'){
  line=Number(line);count=Math.max(1,Number(count)||10);
  if(!Number.isInteger(line)||line<1||line>28)return toastMessage('Некорректный номер линии');
  const response=await fetch('/api/training/sessions',{
    method:'POST',credentials:'same-origin',headers:{'content-type':'application/json','accept':'application/json'},
    body:JSON.stringify({subjectSlug:'biology',examLine:line,mode,targetQuestions:count})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Не удалось открыть линию ${line}`);
  if(Number(data.examLine)!==line||Number(data.bankVersion)!==6||data.strictLinePool!==true){
    throw new Error(`Защита линии ${line}: сервер не подтвердил строгий банк`);
  }
  if(!data.session?.id)throw new Error('Сервер не создал тренировку');
  sessionStorage.trainingSession=String(data.session.id);
  sessionStorage.trainingSubject='biology';
  sessionStorage.trainingExamLine=String(line);
  sessionStorage.trainingBankVersion='6';
  location.hash='training';
}

// Capture before legacy onclick handlers, so line buttons can never use the old launcher.
document.addEventListener('click',event=>{
  const train=event.target.closest?.('[data-line-train]');
  if(train){
    event.preventDefault();event.stopImmediatePropagation();
    const line=Number(train.dataset.lineTrain),count=Number(train.dataset.count)||10;
    train.disabled=true;
    const old=train.textContent;train.textContent='Подбираем линию…';
    startStrictLine(line,count,'adaptive').catch(error=>{toastMessage(error.message);train.disabled=false;train.textContent=old});
    return;
  }
  const errors=event.target.closest?.('[data-line-errors]');
  if(errors){
    event.preventDefault();event.stopImmediatePropagation();
    const line=Number(errors.dataset.lineErrors);errors.disabled=true;
    const old=errors.textContent;errors.textContent='Собираем ошибки…';
    startStrictLine(line,100,'mistakes').catch(error=>{toastMessage(error.message);errors.disabled=false;errors.textContent=old});
    return;
  }
  if(event.target.closest?.('[data-train],[data-mode]'))clearStrict();
},true);

function decorateTraining(){
  if(location.hash!=='#training')return;
  const meta=document.querySelector('.question-card .q-meta');

  // Generic training renderer historically falls back to “Биология” when a
  // question has no topic label. Chemistry line sessions explicitly store
  // their subject in sessionStorage, so keep the visible subject badge in sync.
  if(meta&&sessionStorage.trainingSubject==='chemistry'){
    const wrongSubject=[...meta.querySelectorAll('.pill')].find(badge=>badge.textContent.trim()==='Биология');
    if(wrongSubject)wrongSubject.textContent='Химия';
  }

  const line=Number(sessionStorage.trainingExamLine||0),version=Number(sessionStorage.trainingBankVersion||0);
  if(!line||version!==6)return;
  if(meta&&!meta.querySelector('[data-strict-line-badge]')){
    const badge=document.createElement('span');badge.className='pill';badge.dataset.strictLineBadge='1';badge.textContent=`Линия ${line} · строгий банк`;meta.prepend(badge);
  }
  const top=document.querySelector('.training .train-top');
  if(top&&!top.querySelector('[data-strict-line-top]')){
    const tag=document.createElement('span');tag.className='pill';tag.dataset.strictLineTop='1';tag.textContent=`Задание ЕГЭ №${line}`;top.appendChild(tag);
  }
}

new MutationObserver(decorateTraining).observe(document.documentElement,{childList:true,subtree:true});
addEventListener('hashchange',()=>{if(location.hash!=='#training'&&!location.hash.startsWith('#biology/line/'))clearStrict();setTimeout(decorateTraining,0)});
addEventListener('pageshow',decorateTraining);
decorateTraining();
})();
