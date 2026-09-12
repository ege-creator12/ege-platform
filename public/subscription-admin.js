(()=>{
  'use strict';
  let cache=null,cacheAt=0;

  const style=document.createElement('style');
  style.textContent=`
    .admin-sub-badge{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:800;background:rgba(75,190,121,.12);color:#9de2b8;white-space:nowrap}
    .admin-sub-badge.off{background:rgba(255,255,255,.05);color:var(--muted)}
    .admin-sub-cell{min-width:150px}.admin-sub-cell>div{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.admin-sub-cell .link{font-size:11px}
    .admin-subscription-box{margin:16px 0;padding:18px;border-radius:16px;border:1px solid rgba(93,196,137,.16);background:linear-gradient(135deg,rgba(48,137,87,.09),rgba(74,81,166,.06))}
    .admin-subscription-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}.admin-subscription-head h3{margin:0}.admin-subscription-head small{display:block;color:var(--muted);margin-top:3px}
    .admin-subscription-actions{display:flex;gap:8px;flex-wrap:wrap}.admin-subscription-actions .btn{min-height:36px;padding:8px 11px}
    .admin-subscription-date{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin-top:12px}.admin-subscription-date .field{margin:0;min-width:210px;flex:1}.admin-subscription-off{color:#ffabab!important;border-color:rgba(255,120,120,.2)!important;background:rgba(180,65,65,.08)!important}
  `;
  document.head.appendChild(style);

  async function request(path,opts={}){
    const r=await fetch(path,{credentials:'same-origin',headers:{'content-type':'application/json',...(opts.headers||{})},...opts});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Не удалось изменить подписку');
    return d;
  }
  async function list(force=false){
    if(!force&&cache&&Date.now()-cacheAt<10000)return cache;
    const d=await request('/api/subscription-admin/list');
    cache=new Map((d.subscriptions||[]).map(s=>[Number(s.userId),s]));cacheAt=Date.now();return cache;
  }
  function invalidate(){cache=null;cacheAt=0}
  function asDate(value){if(!value)return null;const d=new Date(value);return Number.isFinite(d.getTime())?d:null}
  function label(s){
    if(!s||!s.active)return '<span class="admin-sub-badge off">Без PRO</span>';
    if(s.permanent||!s.expiresAt)return '<span class="admin-sub-badge">✦ PRO · навсегда</span>';
    const d=asDate(s.expiresAt);return `<span class="admin-sub-badge">✦ PRO · до ${d?d.toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit'}):'—'}</span>`;
  }
  async function setSub(userId,payload){
    const d=await request(`/api/subscription-admin/users/${Number(userId)}`,{method:'PATCH',body:JSON.stringify(payload)});invalidate();return d;
  }

  const baseAdminUsers=window.adminUsers;
  if(typeof baseAdminUsers==='function'){
    window.adminUsers=async function(){
      await baseAdminUsers.apply(this,arguments);
      if(typeof state==='undefined'||state?.user?.role!=='admin')return;
      let subs;try{subs=await list()}catch{return}
      const table=document.querySelector('.admin-table');if(!table)return;
      const head=table.querySelector('thead tr');
      if(head&&!head.querySelector('[data-subscription-col]')){
        const th=document.createElement('th');th.dataset.subscriptionCol='1';th.textContent='Подписка';
        const last=head.lastElementChild;head.insertBefore(th,last||null);
      }
      table.querySelectorAll('tbody tr').forEach(row=>{
        const edit=row.querySelector('[data-edit-user]');if(!edit||row.querySelector('[data-subscription-cell]'))return;
        const id=Number(edit.dataset.editUser),sub=subs.get(id),td=document.createElement('td');td.className='admin-sub-cell';td.dataset.subscriptionCell='1';
        const isAdmin=String(row.children?.[1]?.textContent||'').includes('Администратор');
        if(isAdmin){
          td.innerHTML='<div><span class="admin-sub-badge">✦ PRO · админ</span></div>';
        }else{
          const active=Boolean(sub?.active);
          td.innerHTML=`<div>${label(sub)}<button type="button" class="link" data-sub-quick="${id}">${active?'+30 дней':'Выдать 30 дней'}</button></div>`;
        }
        row.insertBefore(td,row.lastElementChild||null);
      });
      table.querySelectorAll('[data-sub-quick]').forEach(btn=>btn.onclick=async()=>{
        btn.disabled=true;const old=btn.textContent;btn.textContent='…';
        try{await setSub(btn.dataset.subQuick,{enabled:true,days:30});notify('PRO выдан на 30 дней');await window.adminUsers()}
        catch(e){notify(e.message);btn.disabled=false;btn.textContent=old}
      });
    };
  }

  const baseEditUser=window.editUser;
  if(typeof baseEditUser==='function'){
    window.editUser=async function(u){
      baseEditUser.call(this,u);
      if(typeof state==='undefined'||state?.user?.role!=='admin')return;
      const form=document.querySelector('#user-edit');if(!form)return;
      let subs;try{subs=await list()}catch{return}
      const sub=subs.get(Number(u.id));
      const box=document.createElement('section');box.className='admin-subscription-box';
      if(u.role==='admin'){
        box.innerHTML='<div class="admin-subscription-head"><div><h3>ОСНОВА PRO</h3><small>Администратор имеет полный PRO-доступ автоматически.</small></div><span class="admin-sub-badge">✦ PRO · навсегда</span></div>';
      }else{
        box.innerHTML=`<div class="admin-subscription-head"><div><h3>ОСНОВА PRO</h3><small>Выдаётся вручную. Никакой оплаты и привязки карты нет.</small></div>${label(sub)}</div>
          <div class="admin-subscription-actions">
            <button type="button" class="btn ghost" data-sub-days="7">+7 дней</button>
            <button type="button" class="btn ghost" data-sub-days="30">+30 дней</button>
            <button type="button" class="btn ghost" data-sub-days="90">+90 дней</button>
            <button type="button" class="btn ghost" data-sub-days="365">+1 год</button>
            <button type="button" class="btn" data-sub-permanent>Выдать навсегда</button>
            ${sub?.active?'<button type="button" class="btn ghost admin-subscription-off" data-sub-off>Отключить PRO</button>':''}
          </div>
          <div class="admin-subscription-date"><div class="field"><label>ИЛИ ДО КОНКРЕТНОЙ ДАТЫ</label><input type="date" data-sub-date></div><button type="button" class="btn ghost" data-sub-until>Выдать до даты</button></div>`;
      }
      const save=[...form.querySelectorAll(':scope > button.btn')].find(b=>b.type!=='button')||form.querySelector('button.btn');
      if(save)form.insertBefore(box,save);else form.appendChild(box);
      const busy=()=>box.querySelectorAll('button').forEach(b=>b.disabled=true);
      const done=async message=>{invalidate();notify(message);await window.editUser(u)};
      box.querySelectorAll('[data-sub-days]').forEach(btn=>btn.onclick=async()=>{busy();try{await setSub(u.id,{enabled:true,days:Number(btn.dataset.subDays)});await done(`PRO продлён на ${btn.dataset.subDays} дней`)}catch(e){notify(e.message);window.editUser(u)}});
      box.querySelector('[data-sub-permanent]')?.addEventListener('click',async()=>{busy();try{await setSub(u.id,{enabled:true,permanent:true});await done('PRO выдан навсегда')}catch(e){notify(e.message);window.editUser(u)}});
      box.querySelector('[data-sub-off]')?.addEventListener('click',async()=>{busy();try{await setSub(u.id,{enabled:false});await done('PRO отключён')}catch(e){notify(e.message);window.editUser(u)}});
      box.querySelector('[data-sub-until]')?.addEventListener('click',async()=>{const input=box.querySelector('[data-sub-date]');if(!input?.value)return notify('Выбери дату окончания');busy();try{const end=new Date(`${input.value}T23:59:59`);await setSub(u.id,{enabled:true,expiresAt:end.toISOString()});await done('Срок PRO установлен')}catch(e){notify(e.message);window.editUser(u)}});
    };
  }
})();
