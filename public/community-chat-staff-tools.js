(()=>{
'use strict';

const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
const toast=message=>{if(typeof notify==='function')return notify(message);const t=document.querySelector('#toast');if(t){t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2600)}};

const style=document.createElement('style');
style.textContent=`
.community-chat-staff-divider{width:100%;height:1px;background:rgba(255,255,255,.07);margin:2px 0}
.community-chat-mute-menu .community-chat-delete{border-color:rgba(255,92,92,.24);color:#ffb4b4;background:rgba(255,80,80,.06)}
.community-chat-mute-menu .community-chat-prefix{border-color:rgba(105,224,157,.22);color:#b8f3d0}
.community-chat-prefix-editor{width:100%;display:grid;grid-template-columns:1fr auto auto;gap:6px;margin-top:4px}
.community-chat-prefix-editor input{min-width:0;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:inherit;border-radius:9px;padding:7px 9px;font:inherit;font-size:11px;outline:none}
.community-chat-prefix-editor input:focus{border-color:rgba(105,224,157,.4)}
.community-chat-prefix-editor button{white-space:nowrap}
@media(max-width:560px){.community-chat-prefix-editor{grid-template-columns:1fr 1fr}.community-chat-prefix-editor input{grid-column:1/-1}}
`;
document.head.appendChild(style);

function currentPrefix(card){
  const name=card?.querySelector('.community-chat-name')?.textContent||'';
  const match=name.match(/^\[([^\]]{1,24})\]\s*/);
  return match?match[1]:'';
}

async function deleteMessage(card,id,button){
  if(button.dataset.busy==='1')return;
  button.dataset.busy='1';button.disabled=true;const old=button.textContent;button.textContent='Удаляем…';
  try{
    const r=await fetch(`/api/community-chat/messages/${id}`,{method:'DELETE',credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Не удалось удалить сообщение');
    card.remove();
    toast('Сообщение удалено');
  }catch(e){button.disabled=false;button.textContent=old;button.dataset.busy='0';toast(e.message||'Не удалось удалить сообщение')}
}

async function savePrefix(card,id,input,button,prefix){
  if(button.dataset.busy==='1')return;
  button.dataset.busy='1';button.disabled=true;
  try{
    const r=await fetch(`/api/community-chat/messages/${id}/prefix`,{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'content-type':'application/json',accept:'application/json'},
      body:JSON.stringify({prefix})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.error||'Не удалось изменить префикс');
    const nameEl=card.querySelector('.community-chat-name');
    if(nameEl){
      const base=nameEl.textContent.replace(/^\[[^\]]{1,24}\]\s*/, '');
      nameEl.textContent=d.prefix?`[${d.prefix}] ${base}`:base;
    }
    toast(d.prefix?`Префикс «${d.prefix}» установлен`:'Префикс снят');
    card.querySelector('.community-chat-prefix-editor')?.remove();
  }catch(e){button.disabled=false;button.dataset.busy='0';toast(e.message||'Не удалось изменить префикс')}
}

function openPrefixEditor(card,id){
  const menu=card.querySelector('.community-chat-mute-menu');
  if(!menu)return;
  const old=menu.querySelector('.community-chat-prefix-editor');
  if(old){old.remove();return}
  const editor=document.createElement('div');
  editor.className='community-chat-prefix-editor';
  editor.innerHTML=`<input maxlength="24" placeholder="Например: Отличник" value="${esc(currentPrefix(card))}"><button type="button" data-prefix-save>Сохранить</button><button type="button" class="danger" data-prefix-clear>Снять</button>`;
  const input=editor.querySelector('input');
  editor.querySelector('[data-prefix-save]').onclick=e=>savePrefix(card,id,input,e.currentTarget,input.value.trim());
  editor.querySelector('[data-prefix-clear]').onclick=e=>savePrefix(card,id,input,e.currentTarget,'');
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();editor.querySelector('[data-prefix-save]').click()}});
  menu.appendChild(editor);
  input.focus();input.select();
}

function enhanceMenu(menu){
  if(!menu||menu.dataset.staffTools==='1')return;
  const card=menu.closest('[data-chat-message]');
  const id=Number(card?.dataset.chatMessage);
  if(!card||!Number.isSafeInteger(id)||id<1)return;
  menu.dataset.staffTools='1';
  const divider=document.createElement('div');divider.className='community-chat-staff-divider';menu.appendChild(divider);
  const prefix=document.createElement('button');prefix.type='button';prefix.className='community-chat-prefix';prefix.textContent='Префикс';prefix.onclick=()=>openPrefixEditor(card,id);menu.appendChild(prefix);
  const del=document.createElement('button');del.type='button';del.className='community-chat-delete';del.textContent='Удалить сообщение';del.onclick=()=>deleteMessage(card,id,del);menu.appendChild(del);
}

function enhance(){document.querySelectorAll('.community-chat-mute-menu').forEach(enhanceMenu)}
const observer=new MutationObserver(enhance);
observer.observe(document.documentElement,{childList:true,subtree:true});
enhance();
})();
