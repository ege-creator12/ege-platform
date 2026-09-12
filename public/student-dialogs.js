(()=>{
  'use strict';

  const style=document.createElement('style');
  style.textContent=`
    .student-confirm-backdrop{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:20px;background:rgba(2,8,6,.72);backdrop-filter:blur(8px)}
    .student-confirm{width:min(430px,100%);padding:22px;border:1px solid rgba(255,255,255,.1);border-radius:22px;background:linear-gradient(180deg,rgba(18,33,27,.98),rgba(8,18,14,.98));box-shadow:0 24px 80px rgba(0,0,0,.45);color:inherit}
    .student-confirm .eyebrow{margin-bottom:8px}.student-confirm h2{margin:0 0 8px;font-size:24px}.student-confirm p{margin:0;color:var(--muted);line-height:1.55}
    .student-confirm-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap}.student-confirm-actions .btn{min-height:42px}
    .student-confirm-busy{display:none;margin-top:14px;font-size:13px;opacity:.72}.student-confirm.is-busy .student-confirm-busy{display:block}.student-confirm.is-busy .student-confirm-actions{opacity:.55;pointer-events:none}
    @media(max-width:560px){.student-confirm{padding:18px;border-radius:18px}.student-confirm-actions .btn{flex:1 1 150px}}
  `;
  document.head.appendChild(style);

  let openDialog=null;

  function closeDialog(){
    openDialog?.remove();
    openDialog=null;
  }

  function showDialog({title,text,confirmText='Завершить',onConfirm}){
    closeDialog();
    const wrap=document.createElement('div');
    wrap.className='student-confirm-backdrop';
    wrap.innerHTML=`<section class="student-confirm" role="dialog" aria-modal="true" aria-labelledby="student-confirm-title"><div class="eyebrow">ОСНОВА</div><h2 id="student-confirm-title"></h2><p data-confirm-text></p><div class="student-confirm-busy">Сохраняем ответы…</div><div class="student-confirm-actions"><button type="button" class="btn ghost" data-confirm-cancel>Продолжить решать</button><button type="button" class="btn" data-confirm-ok></button></div></section>`;
    wrap.querySelector('#student-confirm-title').textContent=title;
    wrap.querySelector('[data-confirm-text]').textContent=text;
    wrap.querySelector('[data-confirm-ok]').textContent=confirmText;
    const cancel=wrap.querySelector('[data-confirm-cancel]');
    const ok=wrap.querySelector('[data-confirm-ok]');
    cancel.onclick=closeDialog;
    wrap.addEventListener('click',e=>{if(e.target===wrap)closeDialog()});
    ok.onclick=async()=>{
      const box=wrap.querySelector('.student-confirm');
      box.classList.add('is-busy');
      try{await onConfirm();closeDialog()}catch(error){box.classList.remove('is-busy');if(typeof notify==='function')notify(error?.message||'Не удалось выполнить действие')}
    };
    document.body.appendChild(wrap);
    openDialog=wrap;
    cancel.focus();
  }

  async function runWithoutNativeConfirm(handler,element,event){
    const original=window.confirm;
    window.confirm=()=>true;
    try{return await handler.call(element,event)}finally{window.confirm=original}
  }

  function interceptFinish(event,button){
    const isChem=button.id==='chem-finish';
    const isBio=button.id==='finish-exam';
    if(!isChem&&!isBio)return false;
    const handler=button.onclick;
    if(typeof handler!=='function')return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    showDialog({
      title:'Завершить пробник?',
      text:'После сдачи ответы изменить уже нельзя. Если не уверен, вернись к заданиям и проверь их ещё раз.',
      confirmText:'Завершить пробник',
      onConfirm:()=>runWithoutNativeConfirm(handler,button,event),
    });
    return true;
  }

  function interceptNewMock(event,button){
    const route=location.hash.slice(1);
    const chemistry=route==='chemistry/mocks'&&button.matches('[data-chem-variant]')&&document.querySelector('.quick-continue');
    const biology=route==='mocks'&&button.matches('[data-mode]')&&document.querySelector('.card.mock');
    if(!chemistry&&!biology)return false;
    const handler=button.onclick;
    if(typeof handler!=='function')return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    showDialog({
      title:'Начать новый пробник?',
      text:'Текущий незавершённый пробник будет закрыт. Сохранённые ответы в нём больше нельзя будет изменить.',
      confirmText:'Начать новый',
      onConfirm:()=>runWithoutNativeConfirm(handler,button,event),
    });
    return true;
  }

  document.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button||openDialog?.contains(button))return;
    if(interceptFinish(event,button))return;
    interceptNewMock(event,button);
  },true);

  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&openDialog)closeDialog()});
})();
