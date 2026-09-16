(()=>{
  'use strict';
  if(window.__OSNOVA_ADMIN_SUBSCRIPTION_STABILITY__)return;
  window.__OSNOVA_ADMIN_SUBSCRIPTION_STABILITY__=true;

  let cache=null,cacheAt=0,busy=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const isAdmin=()=>typeof state!=='undefined'&&state?.user?.role==='admin';

  async function request(path,opts={}){
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json','accept':'application/json',...(opts.headers||{})},...opts});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||`Ошибка ${response.status}`);
    return data;
  }
  async function subscriptions(force=false){
    if(!force&&cache&&Date.now()-cacheAt<10000)return cache;
    const data=await request('/api/subscription-admin/list');
    cache=new Map((data.subscriptions||[]).map(item=>[Number(item.userId),item]));
    cacheAt=Date.now();
    return cache;
  }
  function invalidate(){cache=null;cacheAt=0}
  function statusHtml(sub,admin=false){
    if(admin)return '<span class="admin-sub-badge">✦ AI PRO · админ</span>';
    if(!sub?.active)return '<span class="admin-sub-badge off">Без AI PRO</span>';
    if(sub.permanent||!sub.expiresAt)return '<span class="admin-sub-badge">✦ AI PRO · навсегда</span>';
    const date=new Date(sub.expiresAt);
    const text=Number.isFinite(date.getTime())?date.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—';
    return `<span class="admin-sub-badge">✦ AI PRO · до ${text}</span>`;
  }
  async function setSubscription(userId,payload){
    const data=await request(`/api/subscription-admin/users/${Number(userId)}`,{method:'PATCH',body:JSON.stringify(payload)});
    invalidate();
    return data;
  }

  function ensureStyles(){
    if(document.querySelector('#admin-subscription-stability-style'))return;
    const style=document.createElement('style');
    style.id='admin-subscription-stability-style';
    style.textContent=`
      .admin-sub-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(75,190,121,.12);color:#9de2b8;white-space:nowrap}
      .admin-sub-badge.off{background:rgba(255,255,255,.05);color:var(--muted)}
      .admin-sub-cell{min-width:170px}.admin-sub-cell>div{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.admin-sub-cell .link{font-size:11px}
      .admin-sub-load-error{font-size:11px;color:#ffb0b0}
      .admin-subscription-box{margin:16px 0;padding:18px;border-radius:16px;border:1px solid rgba(93,196,137,.16);background:linear-gradient(135deg,rgba(48,137,87,.09),rgba(74,81,166,.06))}
      .admin-subscription-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.admin-subscription-head h3{margin:0}.admin-subscription-head small{display:block;color:var(--muted);margin-top:3px}
      .admin-subscription-actions{display:flex;gap:8px;flex-wrap:wrap}.admin-subscription-actions .btn{min-height:36px;padding:8px 11px}
      .admin-subscription-date{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-top:12px}.admin-subscription-date .field{margin:0;min-width:210px;flex:1}.admin-subscription-off{color:#ffabab!important;border-color:rgba(255,120,120,.2)!important;background:rgba(180,65,65,.08)!important}
    `;
    document.head.appendChild(style);
  }

  async function enhanceUsersTable(){
    if(!isAdmin()||busy)return;
    const table=[...document.querySelectorAll('.admin-console .admin-table')].find(node=>node.querySelector('[data-edit-user]'));
    if(!table)return;
    busy=true;
    try{
      const head=table.querySelector('thead tr');
      if(head&&!head.querySelector('[data-subscription-col]')){
        const th=document.createElement('th');th.dataset.subscriptionCol='1';th.textContent='AI PRO';
        head.insertBefore(th,head.lastElementChild||null);
      }
      let map,error=null;
      try{map=await subscriptions()}catch(e){error=e}
      table.querySelectorAll('tbody tr').forEach(row=>{
        const edit=row.querySelector('[data-edit-user]');
        if(!edit)return;
        let cell=row.querySelector('[data-subscription-cell]');
        if(!cell){
          cell=document.createElement('td');cell.className='admin-sub-cell';cell.dataset.subscriptionCell='1';
          row.insertBefore(cell,row.lastElementChild||null);
        }
        if(error){cell.innerHTML='<span class="admin-sub-load-error">Не загрузилась · обновить</span>';return}
        const id=Number(edit.dataset.editUser),sub=map.get(id);
        const adminRole=String(row.children?.[1]?.textContent||'').includes('Администратор');
        if(adminRole){cell.innerHTML=`<div>${statusHtml(null,true)}</div>`;return}
        if(sub?.active&&sub?.permanent){cell.innerHTML=`<div>${statusHtml(sub)}</div>`;return}
        const active=Boolean(sub?.active);
        cell.innerHTML=`<div>${statusHtml(sub)}<button type="button" class="link" data-sub-stable-quick="${id}">${active?'+30 дней':'Выдать 30 дней'}</button></div>`;
      });
      table.querySelectorAll('[data-sub-stable-quick]').forEach(button=>{
        button.onclick=async()=>{
          if(button.disabled)return;
          button.disabled=true;const old=button.textContent;button.textContent='…';
          try{
            await setSubscription(button.dataset.subStableQuick,{enabled:true,days:30});
            if(typeof notify==='function')notify(old.includes('+')?'AI PRO продлён на 30 дней':'AI PRO выдан на 30 дней');
            await enhanceUsersTable();
          }catch(e){if(typeof notify==='function')notify(e.message);button.disabled=false;button.textContent=old}
        };
      });
    }finally{busy=false}
  }

  async function enhanceEditForm(user){
    if(!isAdmin())return;
    const form=document.querySelector('#user-edit');
    if(!form||form.querySelector('[data-stable-subscription-box]')||form.querySelector('.admin-subscription-box'))return;
    let map;
    try{map=await subscriptions()}catch(e){
      const note=document.createElement('div');note.className='admin-note';note.dataset.stableSubscriptionBox='1';note.textContent=`AI PRO: ${e.message}`;
      form.appendChild(note);return;
    }
    const sub=map.get(Number(user.id));
    const box=document.createElement('section');
    box.className='admin-subscription-box';box.dataset.stableSubscriptionBox='1';
    if(user.role==='admin'){
      box.innerHTML=`<div class="admin-subscription-head"><div><h3>AI PRO</h3><small>Администратор имеет полный доступ автоматически.</small></div>${statusHtml(null,true)}</div>`;
    }else{
      box.innerHTML=`<div class="admin-subscription-head"><div><h3>AI PRO</h3><small>Ручное управление подпиской пользователя.</small></div>${statusHtml(sub)}</div>
        <div class="admin-subscription-actions">
          <button type="button" class="btn ghost" data-stable-sub-days="7">+7 дней</button>
          <button type="button" class="btn ghost" data-stable-sub-days="30">+30 дней</button>
          <button type="button" class="btn ghost" data-stable-sub-days="90">+90 дней</button>
          <button type="button" class="btn ghost" data-stable-sub-days="365">+1 год</button>
          <button type="button" class="btn" data-stable-sub-permanent>Выдать навсегда</button>
          ${sub?.active?'<button type="button" class="btn ghost admin-subscription-off" data-stable-sub-off>Отключить AI PRO</button>':''}
        </div>
        <div class="admin-subscription-date"><div class="field"><label>ИЛИ ДО КОНКРЕТНОЙ ДАТЫ</label><input type="date" data-stable-sub-date></div><button type="button" class="btn ghost" data-stable-sub-until>Выдать до даты</button></div>`;
    }
    const save=[...form.querySelectorAll(':scope > button.btn')].find(button=>button.type!=='button')||form.querySelector('button.btn');
    if(save)form.insertBefore(box,save);else form.appendChild(box);
    const disable=()=>box.querySelectorAll('button').forEach(button=>button.disabled=true);
    const refresh=async message=>{invalidate();if(typeof notify==='function')notify(message);if(typeof window.editUser==='function')await window.editUser(user)};
    box.querySelectorAll('[data-stable-sub-days]').forEach(button=>button.onclick=async()=>{disable();try{await setSubscription(user.id,{enabled:true,days:Number(button.dataset.stableSubDays)});await refresh(`AI PRO продлён на ${button.dataset.stableSubDays} дней`)}catch(e){if(typeof notify==='function')notify(e.message);location.reload()}});
    box.querySelector('[data-stable-sub-permanent]')?.addEventListener('click',async()=>{disable();try{await setSubscription(user.id,{enabled:true,permanent:true});await refresh('AI PRO выдан навсегда')}catch(e){if(typeof notify==='function')notify(e.message);location.reload()}});
    box.querySelector('[data-stable-sub-off]')?.addEventListener('click',async()=>{disable();try{await setSubscription(user.id,{enabled:false});await refresh('AI PRO отключён')}catch(e){if(typeof notify==='function')notify(e.message);location.reload()}});
    box.querySelector('[data-stable-sub-until]')?.addEventListener('click',async()=>{const input=box.querySelector('[data-stable-sub-date]');if(!input?.value)return typeof notify==='function'&&notify('Выбери дату окончания');disable();try{const end=new Date(`${input.value}T23:59:59`);await setSubscription(user.id,{enabled:true,expiresAt:end.toISOString()});await refresh('Срок AI PRO установлен')}catch(e){if(typeof notify==='function')notify(e.message);location.reload()}});
  }

  ensureStyles();

  const baseUsers=window.adminUsers;
  if(typeof baseUsers==='function')window.adminUsers=async function(){
    const result=await baseUsers.apply(this,arguments);
    await enhanceUsersTable();
    return result;
  };

  const baseEdit=window.editUser;
  if(typeof baseEdit==='function')window.editUser=async function(user){
    const result=await baseEdit.apply(this,arguments);
    await enhanceEditForm(user);
    return result;
  };

  const baseAdmin=window.admin;
  if(typeof baseAdmin==='function')window.admin=async function(){
    if((location.hash.slice(1)||'dashboard')==='admin')window.scrollTo({top:0,left:0,behavior:'auto'});
    const result=await baseAdmin.apply(this,arguments);
    if((location.hash.slice(1)||'dashboard')==='admin')requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:'auto'}));
    return result;
  };

  let scheduled=false;
  const schedule=()=>{
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;enhanceUsersTable().catch(()=>{})});
  };
  const root=document.querySelector('#app');
  if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
  addEventListener('hashchange',()=>{if((location.hash.slice(1)||'dashboard')==='admin')setTimeout(()=>window.scrollTo(0,0),0);schedule()});
  setTimeout(schedule,250);
})();
