(()=>{
'use strict';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
}[char]));

function inlineMarkdown(text){
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*\n][\s\S]*?)\*\*/g,'<strong>$1</strong>');
}

function formatMarkdown(raw){
  const lines=String(raw??'').replace(/\r\n?/g,'\n').split('\n');
  const out=[];
  let list=null;
  const closeList=()=>{if(list){out.push(`</${list}>`);list=null}};

  for(const source of lines){
    const line=source.trimEnd();
    const unordered=line.match(/^\s*[-•]\s+(.+)$/);
    const ordered=line.match(/^\s*\d+[.)]\s+(.+)$/);
    if(unordered){
      if(list!=='ul'){closeList();list='ul';out.push('<ul>')}
      out.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      continue;
    }
    if(ordered){
      if(list!=='ol'){closeList();list='ol';out.push('<ol>')}
      out.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }
    closeList();
    if(!line.trim()){out.push('<div class="pro-md-gap"></div>');continue}
    out.push(`<div class="pro-md-line">${inlineMarkdown(line)}</div>`);
  }
  closeList();
  return out.join('');
}

function enhanceMessage(message){
  if(!(message instanceof HTMLElement))return;
  if(!message.classList.contains('assistant')||message.classList.contains('pro-thinking'))return;
  if(message.dataset.proMarkdown==='1')return;

  const mode=message.querySelector(':scope > .pro-msg-mode');
  const raw=Array.from(message.childNodes)
    .filter(node=>node!==mode)
    .map(node=>node.textContent||'')
    .join('');
  if(!raw.trim())return;

  const modeHtml=mode?mode.outerHTML:'';
  message.innerHTML=`${modeHtml}<div class="pro-msg-rich">${formatMarkdown(raw)}</div>`;
  message.dataset.proMarkdown='1';
}

function enhanceAll(root=document){
  if(root instanceof HTMLElement&&root.matches('.pro-msg.assistant'))enhanceMessage(root);
  root.querySelectorAll?.('.pro-msg.assistant').forEach(enhanceMessage);
}

const style=document.createElement('style');
style.textContent=`
  .pro-msg-rich{white-space:normal;line-height:1.55}
  .pro-msg-rich strong{font-weight:800;color:inherit}
  .pro-msg-rich ul,.pro-msg-rich ol{margin:7px 0 7px 1.35rem;padding:0}
  .pro-msg-rich li{margin:3px 0;padding-left:2px}
  .pro-msg-rich code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92em;padding:.08em .35em;border-radius:6px;background:rgba(255,255,255,.07)}
  .pro-md-gap{height:10px}
  .pro-md-line{min-height:1em}
`;
document.head.appendChild(style);

enhanceAll();
const observer=new MutationObserver(mutations=>{
  for(const mutation of mutations){
    for(const node of mutation.addedNodes){
      if(node instanceof HTMLElement)enhanceAll(node);
    }
  }
});
const app=document.querySelector('#app');
if(app)observer.observe(app,{childList:true,subtree:true});
})();