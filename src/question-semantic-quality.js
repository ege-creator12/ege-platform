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
  'mediumvariant','mediumbankversion','qualitytier','answerencoding',
  'qualitybankversion','qualityexamline'
]);

function canonicalValue(value,key=''){
  if(value===null||value===undefined)return null;
  if(typeof value==='string')return normalizeText(value);
  if(typeof value==='number'||typeof value==='boolean')return value;
  if(Array.isArray(value)){
    const items=value.map(item=>canonicalValue(item,key));
    // Answer-option order and the right column of matching tasks are presentation
    // details. Left-hand data, table rows and sequence order remain meaningful.
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

function parseContent(value){
  if(!value)return {};
  if(typeof value==='object')return value;
  try{return JSON.parse(value);}catch{return value;}
}
function canonicalContent(item){return canonicalValue(parseContent(item?.content??item?.content_json??{}));}

function semanticFingerprint(item){
  const prompt=normalizeText(item?.prompt);
  const image=String(item?.imageUrl||item?.image_url||'');
  const optionLabels=(item?.options||[]).map(option=>normalizeText(option?.label)).filter(Boolean).sort((a,b)=>a.localeCompare(b,'ru'));
  const content=canonicalContent(item);
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

  // Reused EGE instructions are normal. If the structured payload (table,
  // matching left side, experimental data, etc.) is different, the task itself
  // is different even when the top-level prompt is identical.
  const contentA=JSON.stringify(canonicalContent(a));
  const contentB=JSON.stringify(canonicalContent(b));
  if(contentA!==contentB&&(contentA!=='{}'||contentB!=='{}'))return false;

  const sameOptions=JSON.stringify((a.options||[]).map(x=>normalizeText(x.label)).sort())===JSON.stringify((b.options||[]).map(x=>normalizeText(x.label)).sort());
  return sameOptions&&jaccard(a.prompt,b.prompt)>=threshold;
}

module.exports={normalizeText,canonicalValue,canonicalContent,semanticFingerprint,jaccard,nearDuplicate};
