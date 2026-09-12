(()=>{
'use strict';

let scheduled=false;
function placeProblemButton(){
  const btn=document.querySelector('#problem-report-fab');
  if(!btn)return;
  const desktop=matchMedia('(min-width:901px)').matches;
  if(desktop){
    const sideBottom=document.querySelector('.sidebar .side-bottom');
    if(sideBottom&&btn.parentElement!==sideBottom){
      sideBottom.prepend(btn);
    }
  }else if(btn.parentElement!==document.body){
    document.body.appendChild(btn);
  }
}
function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;placeProblemButton()});
}

const root=document.querySelector('#app');
if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
addEventListener('hashchange',schedule);
addEventListener('resize',schedule,{passive:true});
setTimeout(schedule,0);
setTimeout(schedule,700);
})();
