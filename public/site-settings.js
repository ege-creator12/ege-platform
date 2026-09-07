(function(){
  let settings={};
  const safeUrl=value=>{try{const u=new URL(String(value));return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}};
  function paint(s){
    settings={...settings,...(s||{})};
    const root=document.documentElement,body=document.body;
    if(settings.accent)root.style.setProperty('--accent',settings.accent);
    const opacity=Math.min(.94,Math.max(.35,Number(settings.overlayOpacity)||.78));
    const bg=safeUrl(settings.backgroundUrl);
    if(body&&bg)body.style.backgroundImage=`linear-gradient(rgba(3,9,6,${Math.max(.48,opacity-.08)}),rgba(3,9,6,${opacity})),linear-gradient(135deg,rgba(17,35,26,.3),rgba(0,0,0,.35)),url("${bg.replace(/"/g,'%22')}")`;
    if(settings.pageTitle)document.title=String(settings.pageTitle);
    document.querySelectorAll('.brand').forEach(el=>{el.textContent=el.closest('.auth-art')?`${settings.siteName||'ОСНОВА'} · ${settings.siteSuffix||'ЕГЭ'}`:(settings.siteName||'ОСНОВА')});
    document.querySelectorAll('.logo').forEach(el=>{el.textContent='';const b=document.createElement('b');b.textContent=settings.siteName||'ОСНОВА';el.append(b,document.createTextNode(` · ${settings.siteSuffix||'ЕГЭ'}`))});
    const title=document.querySelector('.auth-art h1');if(title&&settings.authTitle)title.textContent=settings.authTitle;
    const subtitle=document.querySelector('.auth-art p');if(subtitle&&settings.authSubtitle)subtitle.textContent=settings.authSubtitle;
    document.querySelectorAll('meta[name="theme-color"]').forEach(el=>el.content='#07100c');
  }
  window.applySiteSettings=paint;
  fetch('/api/site-settings',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>d?.settings&&paint(d.settings)).catch(()=>{});
  new MutationObserver(()=>paint(settings)).observe(document.documentElement,{subtree:true,childList:true});
})();
