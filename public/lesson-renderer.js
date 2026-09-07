(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LessonRenderer=api})(typeof window==='undefined'?this:window,()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const clean=value=>String(value??'').replace(/\bEGE_REQUIRED\b\s*[.:—-]*\s*/gi,'').replace(/\bDEEP_DIVE\b/gi,'Глубже ЕГЭ').trim();
  const paragraphs=value=>clean(value).split(/\n\s*\n/).filter(Boolean).map(x=>`<p>${esc(x).replace(/\n/g,'<br>')}</p>`).join('');
  const itemText=value=>{
    if(value==null)return'';
    if(typeof value==='string'||typeof value==='number')return clean(value);
    if(typeof value==='object')return clean(value.text||value.description||value.title||value.label||value.value||'');
    return'';
  };
  const listItems=c=>{
    for(const key of ['items','steps','facts','bullets','points'])if(Array.isArray(c[key])&&c[key].length)return c[key].map(itemText).filter(Boolean);
    return[];
  };
  const bodyText=c=>clean(c.text||c.body||c.description||c.explanation||c.details||c.note||c.question||c.prompt||c.summary||c.formula||'');
  function render(block,index=0){
    let c={};
    try{c=typeof block.content_json==='string'?JSON.parse(block.content_json):(block.content_json||block.content||{});}catch{return'';}
    const source=c.sourceUrl&&/^https:\/\//.test(c.sourceUrl)?`<p class="lesson-source"><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">${esc(c.sourceLabel||'Источник')}</a></p>`:'';
    const titleText=clean(c.title||'');
    const title=titleText?`<h3>${esc(titleText)}</h3>`:'';
    if(block.type==='heading'){const text=clean(c.text||c.title||'');return text?`<h2 id="lesson-heading-${index}" tabindex="-1">${esc(text)}</h2>`:'';}
    if(block.type==='text'){const body=bodyText(c);return title||body?`<section class="lesson-prose">${title}${paragraphs(body)}</section>`:'';}
    if(['image','diagram'].includes(block.type))return `<figure class="lesson-block visual">${title}<a href="${esc(c.path||'')}" target="_blank" rel="noopener" aria-label="Открыть схему крупнее: ${esc(c.alt||'Учебная схема')}"><img src="${esc(c.path||'')}" alt="${esc(c.alt||'Учебная схема')}" loading="lazy"></a><figcaption>${esc(c.caption||c.alt||'')}</figcaption>${c.description?paragraphs(c.description):''}</figure>`;
    if(['table','comparison'].includes(block.type)){
      const rows=c.rows||c.items||[];
      if(!title&&!(c.columns?.length)&&!rows.length&&!source)return'';
      return `<section class="lesson-comparison">${title}<div class="lesson-table" role="region" aria-label="${esc(c.title||'Учебная таблица')}" tabindex="0"><table>${c.columns?.length?`<thead><tr>${c.columns.map(x=>`<th scope="col">${esc(clean(x))}</th>`).join('')}</tr></thead>`:''}<tbody>${rows.map(row=>`<tr>${(Array.isArray(row)?row:[row]).map((x,i)=>i===0?`<th scope="row">${esc(clean(x))}</th>`:`<td>${esc(clean(x))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${source}</section>`;
    }
    if(block.type==='ege_example'||block.type==='quiz'){
      const prompt=clean(c.prompt||c.question||c.text||c.body||'');
      const answer=clean(c.answer||'');
      if(!title&&!prompt&&!answer)return'';
      return `<section class="lesson-block ${block.type}">${title||`<h3>${block.type==='quiz'?'Проверь себя':'Разобранный пример'}</h3>`}${paragraphs(prompt)}${answer?`<details class="lesson-answer"><summary>Показать ${block.type==='quiz'?'ответ':'ответ и разбор'}</summary>${paragraphs(answer)}</details>`:''}</section>`;
    }
    const tag=block.type==='algorithm'?'ol':'ul';
    const body=bodyText(c),items=listItems(c),answer=clean(c.answer||'');
    if(!title&&!body&&!items.length&&!answer&&!source)return'';
    return `<section class="lesson-block ${esc(block.type)}">${block.type==='deep_dive'?'<span class="deep-label">Глубже ЕГЭ</span>':''}${title}${paragraphs(body)}${items.length?`<${tag}>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</${tag}>`:''}${answer?paragraphs(answer):''}${source}</section>`;
  }
  return {render};
});
