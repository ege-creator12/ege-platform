(function(){
  'use strict';
  let settings={},scheduled=false;
  const legacyTitle='Знания, которые остаются с тобой.';
  const safeUrl=value=>{try{const u=new URL(String(value));return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}};
  const setText=(el,value)=>{value=String(value??'');if(el&&el.textContent!==value)el.textContent=value};
  const setProperty=(root,key,value)=>{if(root.style.getPropertyValue(key)!==value){if(value)root.style.setProperty(key,value);else root.style.removeProperty(key)}};
  function paint(s){
    settings={...settings,...(s||{})};
    const root=document.documentElement;
    // The previous shipped defaults inherit the new palette; explicit admin overrides remain editable.
    const customAccent=/^#[0-9a-f]{6}$/i.test(settings.accent||'')&&settings.accent.toLowerCase()!=='#8fd0ae';
    setProperty(root,'--accent',customAccent?settings.accent:'');
    if(customAccent){
      const rgb=settings.accent.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
      const luminance=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
      setProperty(root,'--on-accent',luminance>.179?'#101b14':'#ffffff');
    }else setProperty(root,'--on-accent','');
    const bg=safeUrl(settings.backgroundUrl);
    const legacyBackground=bg&&new URL(bg).hostname==='images.unsplash.com'&&new URL(bg).pathname==='/photo-1704494941230-ddd0175eb3fd';
    setProperty(root,'--forest',bg&&!legacyBackground?`url("${bg.replace(/"/g,'%22')}")`:'');
    const opacity=Math.min(.94,Math.max(.35,Number(settings.overlayOpacity)||.78));
    setProperty(root,'--forest-visibility',opacity!==.78?String(1-opacity):'');
    if(settings.pageTitle&&document.title!==String(settings.pageTitle))document.title=String(settings.pageTitle);
    document.querySelectorAll('[data-brand-name]').forEach(el=>setText(el,settings.siteName||'ОСНОВА'));
    document.querySelectorAll('[data-brand-suffix]').forEach(el=>setText(el,settings.siteSuffix||'ЕГЭ'));
    // Compatibility with older shells loaded by an extension.
    document.querySelectorAll('.brand,.logo').forEach(el=>{
      if(!el.querySelector('[data-brand-name]'))setText(el,`${settings.siteName||'ОСНОВА'} · ${settings.siteSuffix||'ЕГЭ'}`);
    });
    const title=document.querySelector('.auth-art h1');
    if(title&&settings.authTitle&&settings.authTitle!==legacyTitle)setText(title,settings.authTitle);
    const subtitle=document.querySelector('.auth-art p');if(subtitle&&settings.authSubtitle)setText(subtitle,settings.authSubtitle);
    const color=root.classList.contains('dark')?'#091411':'#edf2ee';
    document.querySelectorAll('meta[name="theme-color"]').forEach(el=>{if(el.content!==color)el.content=color});
  }
  function repaintSoon(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;paint(settings)})}
  window.applySiteSettings=paint;
  fetch('/api/site-settings',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>d?.settings&&paint(d.settings)).catch(()=>{});
  new MutationObserver(repaintSoon).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});
  new MutationObserver(repaintSoon).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
})();
