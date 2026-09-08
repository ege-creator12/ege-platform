(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.QuestionControls=api})(typeof window==='undefined'?this:window,()=>{
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#039;'}[c]));
  const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{}}catch{return {}}};
  function seedOf(question){
    const numeric=Number(question?.id);if(Number.isSafeInteger(numeric)&&numeric>0)return numeric;
    const text=String(question?.prompt||'question');let seed=0;for(let i=0;i<text.length;i++)seed=(Math.imul(seed,31)+text.charCodeAt(i))>>>0;return seed||1;
  }
  function presentationIndexes(length,seed){
    const base=Array.from({length},(_,i)=>i);if(length<2)return base;
    const value=Math.abs(Number(seed)||1),shift=value%(length-1)+1;
    let order=base.slice(shift).concat(base.slice(0,shift));
    if(length>2&&Math.floor(value/length)%2)order=order.reverse();
    if(order.every((value,index)=>value===index))order=base.slice(1).concat(base[0]);
    return order;
  }
  function presentedOptions(question){
    const options=question?.options||[];
    return presentationIndexes(options.length,seedOf(question)).map(index=>options[index]);
  }
  function presentedMatchingChoices(question,content=parse(question?.contentJson)){
    const right=Array.isArray(content?.right)?content.right:[];
    return presentationIndexes(right.length,seedOf(question)+7919).map((canonicalIndex,displayIndex)=>({canonicalIndex,displayIndex,text:right[canonicalIndex]}));
  }
  function orderedValues(raw,options){
    raw=String(raw||'').trim();if(!raw)return [];
    const parts=/^[1-9]+$/.test(raw)&&options.length<=9?raw.split(''):raw.split(/[\s,;]+/).filter(Boolean);
    return parts.map(value=>options[Number(value)-1]?.value??'invalid');
  }
  function render(question,saved=[],prefix='answer'){
    const options=question.options||[],shownOptions=presentedOptions(question),content=parse(question.contentJson),type=question.type;
    const media=parse(question.mediaJson),src=question.imageUrl||media.path||'';
    const dataTable=content.table?`<div class="lesson-table" role="region" aria-label="Данные задания" tabindex="0"><table><thead><tr>${content.table.columns.map(v=>`<th scope="col">${esc(v)}</th>`).join('')}</tr></thead><tbody>${content.table.rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'';
    const visual=dataTable+(src?`<figure class="question-visual"><a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${esc(media.alt||'Схема к заданию')}" loading="lazy"></a><figcaption>Нажмите на схему, чтобы открыть крупнее</figcaption></figure>`:'');
    if(type==='matching'&&content.left?.length&&content.right?.length){
      const choices=presentedMatchingChoices(question,content);
      return visual+`<fieldset class="matching-controls"><legend>Выберите соответствие для каждого пункта</legend>${content.left.map((text,i)=>{
        const value=content.answerEncoding==='pairs'?String(saved[i]||'').split('-')[1]:saved[i];
        return `<label><span>${String.fromCharCode(1040+i)}. ${esc(text)}</span><select data-match="${i}" aria-label="${esc(text)}"><option value="">Выберите ответ</option>${choices.map(x=>`<option value="${x.canonicalIndex}" ${String(value)===String(x.canonicalIndex)?'selected':''}>${x.displayIndex+1}. ${esc(x.text)}</option>`).join('')}</select></label>`;
      }).join('')}</fieldset>`;
    }
    if(type==='sequence'&&options.length){
      const values=saved.map(value=>shownOptions.findIndex(o=>String(o.value)===String(value))+1).filter(Boolean);
      return visual+`<ol class="sequence-options">${shownOptions.map(o=>`<li>${esc(o.label)}</li>`).join('')}</ol><label class="ordered-label" for="${prefix}-ordered">Порядок номеров, например 3142</label><input id="${prefix}-ordered" data-ordered class="answer-input" inputmode="numeric" autocomplete="off" value="${esc(values.join(options.length>9?' ':''))}" placeholder="Запишите номера по порядку">`;
    }
    if(['single','multiple'].includes(type)&&options.length)return visual+`<fieldset class="options"><legend>${type==='multiple'?'Выберите все верные ответы':'Выберите один ответ'}</legend>${shownOptions.map((o,i)=>`<label class="option"><input name="${prefix}" data-option type="${type==='multiple'?'checkbox':'radio'}" value="${esc(o.value)}" ${saved.map(String).includes(String(o.value))?'checked':''}><b>${i+1}</b><span>${esc(o.label)}</span></label>`).join('')}</fieldset>`;
    return visual+`<label class="ordered-label" for="${prefix}-text">${question.questionType==='extended_answer'?'Ваш развёрнутый ответ':'Ваш ответ'}</label><textarea id="${prefix}-text" data-text-answer class="answer-input" placeholder="${question.questionType==='extended_answer'?'Объясните ответ и приведите обоснование':'Введите ответ'}">${esc(saved.join('; '))}</textarea>`;
  }
  function read(root,question){
    const matches=[...root.querySelectorAll('[data-match]')],content=parse(question.contentJson);
    if(matches.length)return matches.map((el,i)=>el.value===''?'':content.answerEncoding==='pairs'?`${i}-${el.value}`:el.value);
    const ordered=root.querySelector('[data-ordered]');if(ordered)return orderedValues(ordered.value,presentedOptions(question));
    const text=root.querySelector('[data-text-answer]');if(text)return [text.value];
    return [...root.querySelectorAll('[data-option]:checked')].map(el=>el.value);
  }
  return {render,read,orderedValues,presentationIndexes,presentedOptions,presentedMatchingChoices,seedOf};
});
