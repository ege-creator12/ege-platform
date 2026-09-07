(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QuestionControls=api})(typeof window==='undefined'?this:window,()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{}}catch{return {}}};
  function orderedValues(raw,options){
    raw=String(raw||'').trim();if(!raw)return [];
    const parts=/^[1-9]+$/.test(raw)&&options.length<=9?raw.split(''):raw.split(/[\s,;]+/).filter(Boolean);
    return parts.map(value=>options[Number(value)-1]?.value??'invalid');
  }
  function render(question,saved=[],prefix='answer'){
    const options=question.options||[],content=parse(question.contentJson),type=question.type;
    const media=parse(question.mediaJson),src=question.imageUrl||media.path||'';
    const dataTable=content.table?`<div class="lesson-table" role="region" aria-label="Данные задания" tabindex="0"><table><thead><tr>${content.table.columns.map(v=>`<th scope="col">${esc(v)}</th>`).join('')}</tr></thead><tbody>${content.table.rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'';
    const visual=dataTable+(src?`<figure class="question-visual"><a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${esc(media.alt||'Схема к заданию')}" loading="lazy"></a><figcaption>Нажмите на схему, чтобы открыть крупнее</figcaption></figure>`:'');
    if(type==='matching'&&content.left?.length&&content.right?.length){
      const choices=content.right.map((text,i)=>({text,i})).sort((a,b)=>a.text.localeCompare(b.text,'ru'));
      return visual+`<fieldset class="matching-controls"><legend>Выберите соответствие для каждого пункта</legend>${content.left.map((text,i)=>{
        const value=content.answerEncoding==='pairs'?String(saved[i]||'').split('-')[1]:saved[i];
        return `<label><span>${String.fromCharCode(1040+i)}. ${esc(text)}</span><select data-match="${i}" aria-label="${esc(text)}"><option value="">Выберите ответ</option>${choices.map(x=>`<option value="${x.i}" ${String(value)===String(x.i)?'selected':''}>${x.i+1}. ${esc(x.text)}</option>`).join('')}</select></label>`;
      }).join('')}</fieldset>`;
    }
    if(type==='sequence'&&options.length){
      const values=saved.map(value=>options.findIndex(o=>String(o.value)===String(value))+1).filter(Boolean);
      return visual+`<ol class="sequence-options">${options.map(o=>`<li>${esc(o.label)}</li>`).join('')}</ol><label class="ordered-label" for="${prefix}-ordered">Порядок номеров, например 3142</label><input id="${prefix}-ordered" data-ordered class="answer-input" inputmode="numeric" autocomplete="off" value="${esc(values.join(options.length>9?' ':''))}" placeholder="Запишите номера по порядку">`;
    }
    if(['single','multiple'].includes(type)&&options.length)return visual+`<fieldset class="options"><legend>${type==='multiple'?'Выберите все верные ответы':'Выберите один ответ'}</legend>${options.map((o,i)=>`<label class="option"><input name="${prefix}" data-option type="${type==='multiple'?'checkbox':'radio'}" value="${esc(o.value)}" ${saved.map(String).includes(String(o.value))?'checked':''}><b>${i+1}</b><span>${esc(o.label)}</span></label>`).join('')}</fieldset>`;
    return visual+`<label class="ordered-label" for="${prefix}-text">${question.questionType==='extended_answer'?'Ваш развёрнутый ответ':'Ваш ответ'}</label><textarea id="${prefix}-text" data-text-answer class="answer-input" placeholder="${question.questionType==='extended_answer'?'Объясните ответ и приведите обоснование':'Введите ответ'}">${esc(saved.join('; '))}</textarea>`;
  }
  function read(root,question){
    const matches=[...root.querySelectorAll('[data-match]')],content=parse(question.contentJson);
    if(matches.length)return matches.map((el,i)=>el.value===''?'':content.answerEncoding==='pairs'?`${i}-${el.value}`:el.value);
    const ordered=root.querySelector('[data-ordered]');if(ordered)return orderedValues(ordered.value,question.options||[]);
    const text=root.querySelector('[data-text-answer]');if(text)return [text.value];
    return [...root.querySelectorAll('[data-option]:checked')].map(el=>el.value);
  }
  return {render,read,orderedValues};
});
