(()=>{
  const ROOT_SELECTOR='.lesson-content';
  let scheduled=false;

  const normalize=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();

  function cleanVisibleText(s){
    return String(s||'')
      .replace(/\bEGE_REQUIRED\b\s*[.:—-]*\s*/gi,'')
      .replace(/\bDEEP_DIVE\b/gi,'Глубже ЕГЭ')
      .replace(/\bmanual\s+review\b/gi,'разбор')
      .replace(/\bручн(?:ой|ого)\s+review\b/gi,'разбор')
      .trim();
  }

  function cleanTechnicalLabels(root){
    root.querySelectorAll('h2,h3,.lesson-block>b,.lesson-prose>h3').forEach(node=>{
      const original=node.textContent||'';
      const key=normalize(original);
      if(!key)return;

      if(/^(после )?(ручного |ручной )?review$/.test(key)||/^(после )?manual review$/.test(key)){
        node.textContent='Разбор темы';
        return;
      }
      if(key==='механизм крупным планом'){
        node.textContent='Как работает механизм';
        return;
      }
      if(/^(contentstatus|manualcontentreview|statusafter|qualitybasis|editorial record|audit status|verified)\b/i.test(original.trim())){
        node.remove();
        return;
      }
      const cleaned=cleanVisibleText(original);
      if(cleaned&&cleaned!==original)node.textContent=cleaned;
    });

    root.querySelectorAll('p,small,figcaption').forEach(node=>{
      const text=node.textContent||'';
      if(/^\s*(contentStatus|manualContentReview|statusAfter|qualityBasis)\s*:/i.test(text)){
        node.remove();
        return;
      }
      const cleaned=cleanVisibleText(text);
      if(cleaned&&cleaned!==text)node.textContent=cleaned;
    });
  }

  function removeDuplicateParagraphs(root){
    let previous='';
    root.querySelectorAll('p').forEach(p=>{
      const current=normalize(p.textContent);
      if(current.length>=40&&current===previous){
        const parent=p.parentElement;
        p.remove();
        if(parent?.classList.contains('lesson-prose')&&!parent.textContent.trim())parent.remove();
        return;
      }
      if(current)previous=current;
    });

    let previousHeading='';
    root.querySelectorAll('h2,h3').forEach(h=>{
      const current=normalize(h.textContent);
      if(current&&current===previousHeading){h.remove();return;}
      if(current)previousHeading=current;
    });
  }

  function imageCandidates(raw){
    if(!raw)return[];
    let path=String(raw).trim();
    try{
      const u=new URL(path,location.origin);
      if(u.origin===location.origin)path=u.pathname;
    }catch{}
    path=path.split('?')[0].split('#')[0];
    path=path.replace(/^\/?public\//i,'/');
    if(!path.startsWith('/'))path='/'+path;
    path=path.replace(/^\/public\/images\//i,'/images/');

    const out=[];
    const add=v=>{if(v&&!out.includes(v))out.push(v)};
    add(path);

    if(/^\/images\/biology\/phase\d+-[^/]+\.svg$/i.test(path)){
      add(path.replace(/^\/images\/biology\/(phase\d+)-(.+)\.svg$/i,'/images/biology/$1/$2.svg'));
    }
    if(/^\/biology\//i.test(path))add('/images'+path);
    if(/^\/phase\d+\//i.test(path))add('/images/biology'+path);
    if(/^\/images\/phase\d+\//i.test(path))add(path.replace(/^\/images\//i,'/images/biology/'));
    return out;
  }

  function repairImage(img){
    if(img.dataset.lessonRepairBound==='1')return;
    img.dataset.lessonRepairBound='1';
    const candidates=imageCandidates(img.getAttribute('src'));
    if(!candidates.length)return;
    let index=0;

    const apply=()=>{
      if(index<candidates.length){
        const candidate=candidates[index++];
        if(img.getAttribute('src')!==candidate)img.setAttribute('src',candidate);
        else if(index<candidates.length)apply();
        return;
      }
      const figure=img.closest('figure');
      if(figure){
        figure.classList.add('visual-missing');
        img.style.display='none';
        if(!figure.querySelector('.visual-missing-note')){
          const note=document.createElement('div');
          note.className='visual-missing-note';
          note.textContent='Схема временно недоступна';
          figure.prepend(note);
        }
      }
    };

    img.addEventListener('error',apply);
    const first=candidates[0];
    if(img.getAttribute('src')!==first)img.setAttribute('src',first);
    if(img.complete&&img.naturalWidth===0)queueMicrotask(apply);
  }

  function sanitize(){
    scheduled=false;
    document.querySelectorAll(ROOT_SELECTOR).forEach(root=>{
      cleanTechnicalLabels(root);
      removeDuplicateParagraphs(root);
      root.querySelectorAll('img').forEach(repairImage);
    });
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(sanitize);
  }

  const observer=new MutationObserver(schedule);
  const app=document.querySelector('#app');
  if(app)observer.observe(app,{childList:true,subtree:true});
  schedule();
})();
