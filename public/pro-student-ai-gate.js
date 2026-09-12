(()=>{
'use strict';

const style=document.createElement('style');
style.textContent=`
  html:not(.osnova-pro-enabled) #ai-tutor-fab,
  html:not(.osnova-pro-enabled) .ai-review-tools,
  html:not(.osnova-pro-enabled) .ai-explanation,
  html:not(.osnova-pro-enabled) #ai-explain-btn{display:none!important}
  #ai-pro-planner{display:none!important}
`;
document.head.appendChild(style);

let syncing=false;
async function sync(){
  if(syncing)return;
  syncing=true;
  try{
    const access=window.OsnovaSubscription;
    if(!access?.getStatus)return;
    const status=await access.getStatus();
    document.documentElement.classList.toggle('osnova-pro-enabled',Boolean(status?.active));
  }catch{
    document.documentElement.classList.remove('osnova-pro-enabled');
  }finally{syncing=false}
}

addEventListener('hashchange',sync);
addEventListener('focus',sync);
new MutationObserver(()=>{if(document.querySelector('#ai-tutor-fab,.ai-review-tools,#ai-explain-btn'))sync()})
  .observe(document.documentElement,{childList:true,subtree:true});
setTimeout(sync,0);
})();
