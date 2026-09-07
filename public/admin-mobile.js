(function(){
  let scheduled=false;
  function attachAdminButton(){
    if(typeof state==='undefined'||state.user?.role!=='admin')return;
    const nav=document.querySelector('.mobile-nav');
    if(!nav||nav.querySelector('[data-mobile-admin]'))return;
    nav.classList.add('admin-enabled');
    const button=document.createElement('button');
    button.type='button';
    button.dataset.mobileAdmin='1';
    button.className=state.route==='admin'?'active':'';
    if(state.route==='admin')button.setAttribute('aria-current','page');
    button.innerHTML='<span aria-hidden="true">◇</span>Управление';
    button.onclick=()=>go('admin');
    nav.appendChild(button);
  }
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;attachAdminButton()})}
  const root=document.querySelector('#app');
  if(root)new MutationObserver(schedule).observe(root,{subtree:true,childList:true});
  schedule();
})();
