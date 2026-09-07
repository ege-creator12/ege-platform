(function(){
  let settings={},scheduled=false;
  const safeUrl=value=>{try{const u=new URL(String(value));return /^https?:$/.test(u.protocol)?u.href:''}catch{return''}};
  const setText=(el,value)=>{value=String(value??'');if(el&&el.textContent!==value)el.textContent=value};
  function paint(s){
    settings={...settings,...(s||{})};
    const root=document.documentElement,body=document.body;
    if(settings.accent&&root.style.getPropertyValue('--accent')!==settings.accent)root.style.setProperty('--accent',settings.accent);
    const opacity=Math.min(.94,Math.max(.35,Number(settings.overlayOpacity)||.78));
    const bg=safeUrl(settings.backgroundUrl);
    if(body&&bg){const image=`linear-gradient(rgba(3,9,6,${Math.max(.48,opacity-.08)}),rgba(3,9,6,${opacity})),linear-gradient(135deg,rgba(17,35,26,.3),rgba(0,0,0,.35)),url("${bg.replace(/"/g,'%22')}")`;if(body.style.backgroundImage!==image)body.style.backgroundImage=image}
    if(settings.pageTitle&&document.title!==String(settings.pageTitle))document.title=String(settings.pageTitle);
    document.querySelectorAll('.brand').forEach(el=>setText(el,el.closest('.auth-art')?`${settings.siteName||'ОСНОВА'} · ${settings.siteSuffix||'ЕГЭ'}`:(settings.siteName||'ОСНОВА')));
    document.querySelectorAll('.logo').forEach(el=>{const desired=`${settings.siteName||'ОСНОВА'} · ${settings.siteSuffix||'ЕГЭ'}`;if(el.textContent!==desired){el.textContent='';const b=document.createElement('b');b.textContent=settings.siteName||'ОСНОВА';el.append(b,document.createTextNode(` · ${settings.siteSuffix||'ЕГЭ'}`))}});
    const title=document.querySelector('.auth-art h1');if(title&&settings.authTitle)setText(title,settings.authTitle);
    const subtitle=document.querySelector('.auth-art p');if(subtitle&&settings.authSubtitle)setText(subtitle,settings.authSubtitle);
    document.querySelectorAll('meta[name="theme-color"]').forEach(el=>{if(el.content!=='#07100c')el.content='#07100c'});
  }
  function repaintSoon(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;paint(settings)})}
  window.applySiteSettings=paint;
  fetch('/api/site-settings',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(d=>d?.settings&&paint(d.settings)).catch(()=>{});
  new MutationObserver(repaintSoon).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});
})();
