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

    if(/^\/biology\//i.test(path))add('/images'+path);
    if(/^\/phase\d+\//i.test(path))add('/images/biology'+path);
    if(/^\/images\/phase\d+\//i.test(path))add(path.replace(/^\/images\//i,'/images/biology/'));

    const match=path.match(/^\/images\/biology\/([^/]+)\.svg$/i);
    if(match){
      const key=match[1];
      const phase=key.match(/^(phase\d+)-(.+)$/i);
      if(phase)add(`/images/biology/${phase[1]}/${phase[2]}.svg`);

      const human=key.match(/^human-(.+)$/i);
      if(human)add(`/images/biology/phase3/${human[1]}.svg`);

      const zoo=key.match(/^zoo-(.+)$/i);
      if(zoo)add(`/images/biology/zoology/${zoo[1]}.svg`);

      const botany=key.match(/^botany-(.+)$/i);
      if(botany){
        const rest=botany[1];
        add(`/images/biology/task4/${key}.svg`);
        add(`/images/biology/task4/${rest}.svg`);
        if(rest==='ploidy')add('/images/biology/task4/plant-ploidy-cycle.svg');
      }

      // New content phases store assets in dedicated folders while asset keys may
      // keep editorial prefixes (for example ecology-food-web -> ecology/food-web.svg).
      // Try both the full key and common prefix-stripped filenames in every known
      // biology media folder so future phases do not silently render broken schemes.
      const variants=[];
      const addVariant=v=>{if(v&&!variants.includes(v))variants.push(v)};
      addVariant(key);
      addVariant(key.replace(/^(?:human|ecology|eco|phase3|phase4|phase5|zoo|zoology|botany)-/i,''));

      const dirs=['phase3','phase4','ecology','zoology','botany','phase2','task3','task4'];
      dirs.forEach(dir=>variants.forEach(name=>add(`/images/biology/${dir}/${name}.svg`)));

      // Older Phase 1/2 authored assets live in task3 and do not share one prefix.
      // Try the canonical filename and the historical "-task3" variant.
      add(`/images/biology/task3/${key}.svg`);
      add(`/images/biology/task3/${key}-task3.svg`);
    }
    return out;
  }

  function showMissing(img){
    const figure=img.closest('figure');
    if(!figure)return;
    figure.classList.add('visual-missing');
    img.style.display='none';
    if(!figure.querySelector('.visual-missing-note')){
      const note=document.createElement('div');
      note.className='visual-missing-note';
      note.textContent='Схема временно недоступна';
      figure.prepend(note);
    }
  }

  function repairImage(img){
    if(img.dataset.lessonRepairBound==='1')return;
    img.dataset.lessonRepairBound='1';
    const candidates=imageCandidates(img.getAttribute('src'));
    if(!candidates.length)return;

    let index=0;
    const current=img.getAttribute('src');
    if(candidates[0]===current)index=1;
    else{
      index=1;
      img.setAttribute('src',candidates[0]);
    }

    const tryNext=()=>{
      while(index<candidates.length){
        const candidate=candidates[index++];
        if(candidate===img.getAttribute('src'))continue;
        img.setAttribute('src',candidate);
        return;
      }
      showMissing(img);
    };

    img.addEventListener('error',tryNext);
    img.addEventListener('load',()=>{
      img.style.display='';
      const figure=img.closest('figure');
      figure?.classList.remove('visual-missing');
      figure?.querySelector('.visual-missing-note')?.remove();
    });

    if(img.complete&&img.naturalWidth===0)queueMicrotask(tryNext);
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
