'use strict';

const BOILERPLATE=[
  /^средний тренировочный вариант\.\s*/i,
  /^практика в формате егэ, средний уровень\.\s*/i,
  /^закрепление линии егэ, средний уровень\.\s*/i,
  /^тренировочное задание без подсказки, средний уровень\.\s*/i,
  /^проанализируйте условие в экзаменационном формате\.\s*/i,
  /^выполните ещё один вариант этого типа\.\s*/i,
  /^по новой серии измерений:\s*/i,
  /^в ряду предложенных частиц\.\s*/i
];

function normalizeText(value){
  let text=String(value??'').toLocaleLowerCase('ru-RU')
    .replace(/[‐‑‒–—−]/g,'-')
    .replace(/\s+/g,' ')
    .trim();
  let changed=true;
  while(changed){
    changed=false;
    for(const pattern of BOILERPLATE){
      const next=text.replace(pattern,'').trim();
      if(next!==text){text=next;changed=true;}
    }
  }
  return text;
}

const IGNORED_KEYS=new Set([
  'variant','strictbankversion','strictfipi2027','strictexamline',
  'mediumvariant','mediumbankversion','qualitytier','answerencoding'
]);

function canonicalValue(value,key=''){
  if(value===null||value===undefined)return null;
  if(typeof value==='string')return normalizeText(value);
  if(typeof value==='number'||typeof value==='boolean')return value;
  if(Array.isArray(value)){
    const items=value.map(item=>canonicalValue(item,key));
    // The order of answer choices / the right column in matching tasks is UI noise;
    // content on the left, table rows and sequence data keep their original order.
    if(['right','options'].includes(String(key).toLowerCase()))return items.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'ru'));
    return items;
  }
  if(typeof value==='object'){
    const out={};
    for(const k of Object.keys(value).sort()){
      if(IGNORED_KEYS.has(String(k).toLowerCase()))continue;
      out[k]=canonicalValue(value[k],k);
    }
    return out;
  }
  return normalizeText(value);
}

function semanticFingerprint(item){
  const prompt=normalizeText(item?.prompt);
  const image=String(item?.imageUrl||item?.image_url||'');
  const optionLabels=(item?.options||[]).map(option=>normalizeText(option?.label)).filter(Boolean).sort((a,b)=>a.localeCompare(b,'ru'));
  const content=canonicalValue(item?.content||item?.content_json||{});
  return JSON.stringify({prompt,image,optionLabels,content});
}

function tokenSet(text){
  return new Set(normalizeText(text).replace(/[^a-zа-яё0-9+\-]+/gi,' ').split(/\s+/).filter(token=>token.length>2));
}

function jaccard(a,b){
  const A=tokenSet(a),B=tokenSet(b);
  if(!A.size&&!B.size)return 1;
  let intersection=0;
  for(const token of A)if(B.has(token))intersection++;
  return intersection/(A.size+B.size-intersection||1);
}

function nearDuplicate(a,b,{threshold=0.96}={}){
  if(!a||!b)return false;
  if(String(a.type||a.questionType||'')!==String(b.type||b.questionType||''))return false;
  if(String(a.imageUrl||a.image_url||'')!==String(b.imageUrl||b.image_url||''))return false;
  if(semanticFingerprint(a)===semanticFingerprint(b))return true;
  const sameOptions=JSON.stringify((a.options||[]).map(x=>normalizeText(x.label)).sort())===JSON.stringify((b.options||[]).map(x=>normalizeText(x.label)).sort());
  return sameOptions&&jaccard(a.prompt,b.prompt)>=threshold;
}

module.exports={normalizeText,canonicalValue,semanticFingerprint,jaccard,nearDuplicate};
