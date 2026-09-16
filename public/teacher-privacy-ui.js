(()=>{
'use strict';
if(window.__OSNOVA_TEACHER_PRIVACY_UI__)return;
window.__OSNOVA_TEACHER_PRIVACY_UI__=true;

let queued=false;
function hardenTeacherPage(){
  queued=false;
  const page=document.querySelector('.teacher-page');
  if(!page)return;

  const emailForm=page.querySelector('#teacher-add-student');
  if(emailForm){
    const section=emailForm.closest('.teacher-section');
    if(section&&!section.dataset.teacherPrivacyPatched){
      section.dataset.teacherPrivacyPatched='1';
      section.innerHTML=`<h2>Добавить учеников</h2><p class="subtitle">Покажите ученикам код нужного класса. Они вступят сами из вкладки «Домашние задания» — почта ученика учителю не нужна.</p><div class="teacher-empty">Используйте код класса из блока «Мои классы».</div>`;
    }
  }

  page.querySelectorAll('.teacher-results-table tbody td:first-child small').forEach(node=>node.remove());
  page.querySelectorAll('small').forEach(node=>{
    if(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(node.textContent||''))node.remove();
  });
}
function schedule(){if(queued)return;queued=true;requestAnimationFrame(hardenTeacherPage)}

const app=document.querySelector('#app');
if(app)new MutationObserver(schedule).observe(app,{childList:true});
addEventListener('hashchange',schedule);
schedule();
})();
