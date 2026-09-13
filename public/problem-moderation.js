(()=>{
'use strict';

let adminReady=false;
let adminAllowed=false;

function toast(message){
  if(typeof notify==='function') return notify(message);
  const t=document.querySelector('#toast');
  if(t){t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}
}

async function adminStatus(){
  if(adminReady)return adminAllowed;
  try{
    const r=await fetch('/api/moderator/status',{credentials:'same-origin',cache:'no-store'});
    const d=await r.json().catch(()=>({}));
    adminAllowed=Boolean(d.admin);
  }catch{adminAllowed=false}
  adminReady=true;
  return adminAllowed;
}

async function revoke(reportId,button){
  if(button.disabled||button.dataset.done==='1')return;
  button.disabled=true;
  const old=button.textContent;
  button.textContent='Снимаем PRO…';
  try{
    const r=await fetch(`/api/problem-reports/${reportId}/revoke-subscription`,{
      method:'POST',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Не удалось снять подписку');
    button.textContent=d.subscriptionRemoved?'PRO снят':'PRO уже не было';
    button.dataset.done='1';
    toast(button.textContent);
  }catch(e){
    button.disabled=false;
    button.textContent=old;
    toast(e.message||'Не удалось снять подписку');
  }
}

async function enhance(){
  if(!(await adminStatus()))return;
  document.querySelectorAll('.problem-item[data-problem-id]').forEach(card=>{
    const actions=card.querySelector('.problem-item-actions');
    if(!actions||actions.querySelector('[data-problem-revoke-pro]'))return;
    const id=Number(card.dataset.problemId);
    if(!Number.isSafeInteger(id)||id<1)return;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='btn ghost';
    btn.dataset.problemRevokePro='1';
    btn.textContent='Снять PRO у автора';
    btn.onclick=()=>revoke(id,btn);
    actions.appendChild(btn);
  });
}

const observer=new MutationObserver(()=>enhance());
observer.observe(document.documentElement,{childList:true,subtree:true});
addEventListener('hashchange',()=>setTimeout(enhance,50));
enhance();
})();
