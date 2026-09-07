'use strict';
const parse=(value,fallback=[])=>{try{return value==null?fallback:typeof value==='string'?JSON.parse(value):value}catch{return fallback}};
const normalize=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[−–—]/g,'-').replace(/\s*([;,:])\s*/g,'$1').replace(/\s+/g,' ').replace(/[.!]$/,'');
function isCorrectAnswer(question,answer){
  const expected=parse(question.answer_json||question.answerJson),given=(Array.isArray(answer)?answer:[answer]).map(normalize);
  const values=(Array.isArray(expected)?expected:[expected]).map(normalize);
  if(!given.length||given.some(x=>!x||x==='invalid'))return false;
  if(question.type==='multiple')return [...given].sort().join('|')===[...values].sort().join('|');
  if(['matching','sequence'].includes(question.type))return given.join('|')===values.join('|');
  if(given.join('|')===values.join('|')||given.join(';')===values.join(';'))return true;
  const variants=question.acceptedVariants||parse(question.answer_data_json,{}).acceptedVariants||[];
  return variants.some(variant=>(Array.isArray(variant)?variant.map(normalize).join(';'):normalize(variant))===given.join(';'));
}
function needsManualReview(question){
  if(question.question_type==='extended_answer'||question.questionType==='extended_answer')return true;
  if(question.type!=='text')return false;
  const data=parse(question.answer_data_json,{}),content=parse(question.content_json||question.contentJson,{});
  if(content.manualReview||data.content?.manualReview)return true;
  const answer=parse(question.answer_json||question.answerJson,[]);
  return (Array.isArray(answer)?answer:[answer]).join(' ').split(/\s+/).length>8;
}
module.exports={isCorrectAnswer,normalize,needsManualReview};
