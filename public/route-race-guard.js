(()=>{
  'use strict';

  const route=()=>location.hash.slice(1)||'dashboard';
  let repairing=false;

  function repairIfNeeded(){
    if(repairing||route()!=='dashboard')return;
    const main=document.querySelector('main[data-page="dashboard"]');
    if(!main)return;
    const leakedBiology=main.querySelector('.course-page,.bio-sections,.view-switch');
    if(!leakedBiology)return;
    if(typeof render!=='function'||typeof state==='undefined')return;
    repairing=true;
    try{
      state.route='dashboard';
      render();
    }finally{
      queueMicrotask(()=>{repairing=false});
    }
  }

  // subject() is async. If a user leaves Biology before its request finishes,
  // the old response used to repaint the new route (for example Dashboard).
  // Wrap it so stale responses are immediately discarded before the next paint.
  if(typeof window.subject==='function'){
    const originalSubject=window.subject;
    window.subject=async function(slug){
      const expectedRoute=String(slug);
      try{
        return await originalSubject.apply(this,arguments);
      }finally{
        const current=route();
        if(current!==expectedRoute&&typeof state!=='undefined'&&state.user&&typeof render==='function'){
          state.route=current;
          render();
        }
      }
    };
  }

  const root=document.querySelector('#app');
  if(root)new MutationObserver(repairIfNeeded).observe(root,{childList:true,subtree:true});
  addEventListener('hashchange',()=>queueMicrotask(repairIfNeeded));
  queueMicrotask(repairIfNeeded);
})();
