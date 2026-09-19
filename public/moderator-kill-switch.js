(()=>{
  'use strict';

  const ID='moderator-kill-switch';
  let checking=false;
  let lastCheck=0;

  function removeButton(){
    document.getElementById(ID)?.remove();
  }

  function makeButton(text,kind,onClick){
    let btn=document.getElementById(ID);
    if(!btn){
      btn=document.createElement('button');
      btn.id=ID;
      btn.type='button';
      btn.style.cssText=[
        'position:fixed',
        'right:max(14px,env(safe-area-inset-right))',
        'bottom:max(14px,env(safe-area-inset-bottom))',
        'z-index:2147483000',
        'border:1px solid rgba(255,255,255,.15)',
        'border-radius:14px',
        'padding:11px 15px',
        'font:800 12px/1.1 Manrope,Inter,system-ui,sans-serif',
        'letter-spacing:.04em',
        'box-shadow:0 14px 35px rgba(0,0,0,.35)',
        'cursor:pointer',
        'backdrop-filter:blur(12px)',
        '-webkit-backdrop-filter:blur(12px)',
        'transition:transform .12s ease,opacity .12s ease'
      ].join(';');
      btn.onpointerdown=()=>{btn.style.transform='scale(.97)'};
      btn.onpointerup=btn.onpointercancel=()=>{btn.style.transform=''};
      document.body.appendChild(btn);
    }
    btn.textContent=text;
    if(kind==='danger'){
      btn.style.background='linear-gradient(135deg,#8d1717,#cf2d2d)';
      btn.style.color='#fff';
    }else{
      btn.style.background='linear-gradient(135deg,#1b7b4c,#2fc778)';
      btn.style.color='#04160d';
    }
    btn.onclick=onClick;
    btn.disabled=false;
    btn.style.opacity='1';
    return btn;
  }

  async function deactivate(){
    const btn=document.getElementById(ID);
    if(btn){btn.disabled=true;btn.style.opacity='.6';btn.textContent='Включаю…'}
    try{
      const r=await fetch('/api/site-maintenance/deactivate',{method:'POST',credentials:'same-origin',headers:{accept:'application/json'}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(d.error||'Не удалось вернуть сайт');
      alert('Сайт снова доступен.');
      sync(true);
    }catch(error){
      alert(error.message||'Не удалось вернуть сайт');
      sync(true);
    }
  }

  async function sync(force=false){
    const now=Date.now();
    if(checking||(!force&&now-lastCheck<3000))return;
    checking=true;lastCheck=now;
    try{
      const r=await fetch('/api/site-maintenance/status',{credentials:'same-origin',headers:{accept:'application/json'}});
      if(!r.ok){removeButton();return}
      const d=await r.json();
      if(d.admin&&d.active){
        makeButton('✓ ВКЛЮЧИТЬ САЙТ','success',deactivate);
        return;
      }
      removeButton();
    }catch{
      removeButton();
    }finally{
      checking=false;
    }
  }

  addEventListener('hashchange',()=>sync(true));
  addEventListener('pageshow',()=>sync(true));
  addEventListener('focus',()=>sync());
  setInterval(()=>sync(),10000);
  sync(true);
})();