(()=>{
'use strict';

const $=(selector,root=document)=>root.querySelector(selector);
const lessonId=()=>{const match=location.hash.match(/^#lesson\/(\d+)/);return match?Number(match[1]):0;};

async function startLessonPractice(button){
  const id=lessonId();
  const topicId=Number(button?.dataset?.train||0);
  if(!id||!topicId)return;
  if(button.dataset.busy==='1')return;
  button.dataset.busy='1';
  button.disabled=true;
  const original=button.textContent;
  button.textContent='Подбираю 5 заданий…';
  try{
    const response=await fetch('/api/training/sessions',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify({lessonId:id,topicId,mode:'topic',targetQuestions:5}),
    });
    let data={};
    try{data=await response.json();}catch{}
    if(!response.ok)throw new Error(data.error||'Не удалось начать практику');
    sessionStorage.trainingSession=data.session.id;
    if(data.subjectSlug)sessionStorage.trainingSubject=data.subjectSlug;
    location.hash='training';
  }catch(error){
    const toast=$('#toast');
    if(toast){toast.textContent=error.message||'Не удалось начать практику';toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3000);}
    button.disabled=false;
    button.textContent=original;
    button.dataset.busy='0';
  }
}

function decorate(){
  const id=lessonId();
  if(!id)return;
  const lesson=$('.card.lesson');
  if(!lesson)return;
  const callout=$('.practice-callout',lesson);
  const button=callout?.querySelector('[data-train]');
  if(!button||button.dataset.lessonPractice==='1')return;
  button.dataset.lessonPractice='1';
  button.textContent='Начать практику · 5 заданий →';
  const copy=callout.querySelector('span');
  if(copy)copy.textContent='5 заданий по материалу этого урока — от прямых вопросов к ближайшим по теме.';
  button.onclick=event=>{event.preventDefault();event.stopPropagation();startLessonPractice(button);};
}

let queued=false;
function schedule(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;decorate();});
}

const app=$('#app');
if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
addEventListener('hashchange',()=>setTimeout(schedule,0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
})();
