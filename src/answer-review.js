'use strict';

function json(value, fallback) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value)??fallback; } catch { return fallback; }
}

function label(options, value) {
  const option=options.find(item=>String(item.value)===String(value));
  return option?.label||null;
}

function numberedAnswer(values) {
  return values.map(value=>/^\d+$/.test(String(value))?String(Number(value)+1):String(value)).join('');
}

/** Builds the only post-attempt representation of a correct answer used by the UI. */
function formatAnswerForReview(question, optionRows=[]) {
  const expected=json(question.answer_json,[]);
  const values=Array.isArray(expected)?expected:[expected];
  const type=question.question_type||question.type||'short_answer';
  const answerData=json(question.answer_data_json,{});
  const content=Object.keys(answerData.content||{}).length?answerData.content:json(question.content_json,{});
  const options=optionRows.length?optionRows:(Array.isArray(content.options)?content.options.map((label,index)=>({value:String(index),label})):[]);
  const textValues=values.map(String);
  let examAnswer=textValues.join(', '),items=[];

  if (type==='matching') {
    const left=content.left, right=content.right;
    if (Array.isArray(left)&&Array.isArray(right)) {
      const indexes=textValues.map(value=>/^\d+-\d+$/.test(value)?value.split('-')[1]:value);
      items=left.map((leftLabel,index)=>`${leftLabel} → ${right[Number(indexes[index])]??indexes[index]}`);
      examAnswer=numberedAnswer(indexes);
    } else if (textValues.every(value=>/^\d+-\d+$/.test(value))) {
      items=textValues.map(value=>{
        const [leftIndex,rightIndex]=value.split('-').map(Number),combined=label(options,leftIndex);
        if (combined) return combined.replace(/\s+[—–-]\s+/, ' → ');
        return `Элемент ${leftIndex+1} → вариант ${rightIndex+1}`;
      });
      examAnswer=textValues.map(value=>String(Number(value.split('-')[1])+1)).join('');
    } else {
      items=textValues.map((value,index)=>`${left?.[index]||`Элемент ${index+1}`} → ${label(options,value)||value}`);
      examAnswer=numberedAnswer(textValues);
    }
  } else if (type==='sequence') {
    examAnswer=numberedAnswer(textValues);
    items=textValues.map((value,index)=>`${index+1}. ${label(options,value)||value}`);
  } else if (type==='multiple_answer'||question.type==='multiple') {
    examAnswer=numberedAnswer(textValues);
    items=textValues.map(value=>`${/^\d+$/.test(value)?Number(value)+1:value} — ${label(options,value)||value}`);
  } else if (type==='table') {
    items=textValues.map(value=>label(options,value)||value.replace(/\s*[|:=]\s*/, ' → '));
  } else if (['image','diagram','graph'].includes(type)) {
    items=textValues.map(value=>{const decoded=label(options,value);return decoded?`${value} — ${decoded}`:null}).filter(Boolean);
  } else if (type==='extended_answer') {
    examAnswer=textValues.join('\n');
    const criteria=content.criteria||content.keyElements;
    if (Array.isArray(criteria)) items=criteria.map(String);
  }

  return {label:type==='extended_answer'?'Эталон ответа':'Ответ для записи на ЕГЭ',examAnswer,items};
}

module.exports={formatAnswerForReview};
