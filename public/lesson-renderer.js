(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LessonRenderer=api})(typeof window==='undefined'?this:window,()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const clean=value=>String(value??'').replace(/\bEGE_REQUIRED\b\s*[.:—-]*\s*/gi,'').replace(/\bDEEP_DIVE\b/gi,'Глубже ЕГЭ').trim();
  const paragraphs=value=>clean(value).split(/\n\s*\n/).filter(Boolean).map(x=>`<p>${esc(x).replace(/\n/g,'<br>')}</p>`).join('');
  function render(block,index=0){
    const c=typeof block.content_json==='string'?JSON.parse(block.content_json):(block.content_json||block.content||{});
    const source=c.sourceUrl&&/^https:\/\//.test(c.sourceUrl)?`<p class="lesson-source"><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">${esc(c.sourceLabel||'Источник')}</a></p>`:'';
    const title=c.title?`<h3>${esc(clean(c.title))}</h3>`:'';
    if(block.type==='heading')return `<h2 id="lesson-heading-${index}" tabindex="-1">${esc(clean(c.text))}</h2>`;
    if(block.type==='text')return `<section class="lesson-prose">${title}${paragraphs(c.text)}</section>`;
    if(['image','diagram'].includes(block.type))return `<figure class="lesson-block visual">${title}<a href="${esc(c.path||'')}" target="_blank" rel="noopener" aria-label="Открыть схему крупнее: ${esc(c.alt||'Учебная схема')}"><img src="${esc(c.path||'')}" alt="${esc(c.alt||'Учебная схема')}" loading="lazy"></a><figcaption>${esc(c.caption||c.alt||'')}</figcaption>${c.description?paragraphs(c.description):''}</figure>`;
    if(['table','comparison'].includes(block.type)){
      const rows=c.rows||c.items||[];
      return `<section class="lesson-comparison">${title}<div class="lesson-table" role="region" aria-label="${esc(c.title||'Учебная таблица')}" tabindex="0"><table>${c.columns?.length?`<thead><tr>${c.columns.map(x=>`<th scope="col">${esc(clean(x))}</th>`).join('')}</tr></thead>`:''}<tbody>${rows.map(row=>`<tr>${(Array.isArray(row)?row:[row]).map((x,i)=>i===0?`<th scope="row">${esc(clean(x))}</th>`:`<td>${esc(clean(x))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${source}</section>`;
    }
    if(block.type==='ege_example'||block.type==='quiz')return `<section class="lesson-block ${block.type}">${title||`<h3>${block.type==='quiz'?'Проверь себя':'Разобранный пример'}</h3>`}${paragraphs(c.prompt||c.question||c.text)}${c.answer?`<details class="lesson-answer"><summary>Показать ${block.type==='quiz'?'ответ':'ответ и разбор'}</summary>${paragraphs(c.answer)}</details>`:''}</section>`;
    const tag=block.type==='algorithm'?'ol':'ul';
    return `<section class="lesson-block ${esc(block.type)}">${block.type==='deep_dive'?'<span class="deep-label">Глубже ЕГЭ</span>':''}${title}${paragraphs(c.text||c.question||c.prompt||'')}${c.items?.length?`<${tag}>${c.items.map(x=>`<li>${esc(clean(x))}</li>`).join('')}</${tag}>`:''}${c.answer?paragraphs(c.answer):''}</section>`;
  }
  return {render};
});
