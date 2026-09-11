(()=>{
'use strict';

const fine=()=>matchMedia('(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)').matches&&innerWidth>900;
const selectors=[
  '.premium-hero','.premium-quick-card','.premium-continue','.premium-week','.premium-calendar','.premium-quote','.premium-metric',
  '.quick-continue','.topics>.card','.grid3>.card','.view-switch','.line-card','.mock-variant-card'
].join(',');
let frame=0,enabled=false;

function bindCard(el){
  if(el.closest('.question-card,.training,.options,.result'))return;
  if(el.dataset.motionBound)return;
  el.dataset.motionBound='1';
  el.classList.add('premium-motion');
  let pending=null;
  const render=()=>{
    frame=0;if(!pending||!fine())return;
    const {event,rect}=pending,pctX=(event.clientX-rect.left)/rect.width,pctY=(event.clientY-rect.top)/rect.height;
    const nx=Math.max(-1,Math.min(1,(pctX-.5)*2));
    const ny=Math.max(-1,Math.min(1,(pctY-.5)*2));
    const subtle=el.matches('.premium-hero,.quick-continue,.view-switch');
    const max=el.classList.contains('premium-hero')?2.0:subtle?2.6:3.6;
    el.style.setProperty('--mx',`${Math.round(pctX*100)}%`);
    el.style.setProperty('--my',`${Math.round(pctY*100)}%`);
    el.style.setProperty('--ry',`${(nx*max).toFixed(2)}deg`);
    el.style.setProperty('--rx',`${(-ny*max).toFixed(2)}deg`);
    el.style.setProperty('--nx',nx.toFixed(3));
    el.style.setProperty('--ny',ny.toFixed(3));
    el.classList.add('is-pointer-active');
  };
  el.addEventListener('pointermove',event=>{
    if(!fine())return;
    pending={event,rect:el.getBoundingClientRect()};
    if(!frame)frame=requestAnimationFrame(render);
  },{passive:true});
  el.addEventListener('pointerleave',()=>{
    pending=null;el.classList.remove('is-pointer-active');
    el.style.setProperty('--mx','50%');el.style.setProperty('--my','50%');
    el.style.setProperty('--rx','0deg');el.style.setProperty('--ry','0deg');
    el.style.setProperty('--nx','0');el.style.setProperty('--ny','0');
  },{passive:true});
}

function bindAll(){
  if(!fine())return;
  document.querySelectorAll(selectors).forEach(bindCard);
}

function globalPointer(event){
  if(!fine())return;
  document.documentElement.style.setProperty('--cursor-x',`${event.clientX}px`);
  document.documentElement.style.setProperty('--cursor-y',`${event.clientY}px`);
}

function start(){
  if(enabled)return;enabled=true;
  addEventListener('pointermove',globalPointer,{passive:true});
  bindAll();
  const root=document.querySelector('#app');
  if(root)new MutationObserver(()=>queueMicrotask(bindAll)).observe(root,{childList:true,subtree:true});
  addEventListener('hashchange',()=>setTimeout(bindAll,0));
  addEventListener('resize',()=>{if(fine())bindAll()},{passive:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
