(()=>{
'use strict';

const ORDER=[
  ['moderator-ai','AI-помощник'],
  ['problem-journal','Журнал проблем'],
];
let syncing=false;

function makeButton(id,label){
  const btn=document.createElement('button');
  btn.type='button';
  btn.dataset.adminTab=id;
  btn.textContent=label;
  btn.onclick=()=>{adminTab=id;window.admin?.()};
  return btn;
}

function sync(){
  if(syncing)return;
  const tabs=document.querySelector('.admin-tabs');
  if(!tabs)return;
  syncing=true;
  try{
    const buttons=ORDER.map(([id,label])=>{
      let btn=tabs.querySelector(`[data-admin-tab="${id}"]`);
      if(!btn){btn=makeButton(id,label);tabs.appendChild(btn)}
      if(btn.textContent!==label)btn.textContent=label;
      btn.classList.toggle('active',typeof adminTab!=='undefined'&&adminTab===id);
      return btn;
    });
    const [ai,journal]=buttons;
    if(ai.nextElementSibling!==journal)tabs.insertBefore(ai,journal);
  }finally{syncing=false}
}

window.OsnovaModeratorToolTabs={sync};

if(typeof adminFrame==='function'){
  const baseAdminFrame=adminFrame;
  adminFrame=function(...args){
    const out=baseAdminFrame(...args);
    sync();
    return out;
  };
}

let queued=false;
function schedule(){
  if(queued)return;
  queued=true;
  queueMicrotask(()=>{queued=false;if(document.querySelector('.admin-console'))sync()});
}
const root=document.querySelector('#app');
if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
addEventListener('hashchange',schedule);
setTimeout(sync,500);
})();