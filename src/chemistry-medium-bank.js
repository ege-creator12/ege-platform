'use strict';

// Extra medium-difficulty practice is generated from the reviewed line builders.
// We deliberately keep this bank original: public FIPI/third-party banks are used
// only to verify line structure and topic coverage, never copied verbatim.
const MEDIUM_BANK_VERSION='v1';

const rotate=(arr,shift)=>{
  if(!Array.isArray(arr)||arr.length<2)return Array.isArray(arr)?[...arr]:arr;
  const n=((Number(shift)||0)%arr.length+arr.length)%arr.length;
  return [...arr.slice(n),...arr.slice(0,n)];
};

function remapOptions(item,line,n){
  if(!Array.isArray(item.options)||item.options.length<2)return item;
  const old=item.options.map(option=>({...option,value:String(option.value)}));
  // A line-dependent shift prevents the added set from merely mirroring the
  // ordering of the starter bank while preserving the chemistry itself.
  const shift=((line*3+n*2)%old.length)||1;
  const reordered=rotate(old,shift);
  const map=new Map();
  const options=reordered.map((option,index)=>{
    map.set(String(option.value),String(index));
    return {...option,value:String(index)};
  });
  const answer=(item.answer||[]).map(value=>map.get(String(value))??String(value));
  return {...item,options,answer};
}

function remapMatching(item,line,n){
  if(item.type!=='matching'||!Array.isArray(item.content?.right)||item.content.right.length<2)return item;
  const right=[...item.content.right];
  const indexes=right.map((_,index)=>index);
  const shift=((line+n*3)%right.length)||1;
  const order=rotate(indexes,shift);
  const newIndex=new Map(order.map((oldIndex,index)=>[oldIndex,index]));
  const answer=(item.answer||[]).map(value=>{
    const oldIndex=Number(value);
    return Number.isInteger(oldIndex)&&newIndex.has(oldIndex)?String(newIndex.get(oldIndex)):String(value);
  });
  return {...item,answer,content:{...item.content,right:order.map(index=>right[index])}};
}

function mediumVariant(line,n,base){
  const variant=Math.max(1,Number(n)||1);
  let item={...base,difficulty:2};
  item=remapOptions(item,Number(line)||0,variant);
  item=remapMatching(item,Number(line)||0,variant);
  const lead=[
    'Средний тренировочный вариант.',
    'Практика в формате ЕГЭ, средний уровень.',
    'Закрепление линии ЕГЭ, средний уровень.',
    'Тренировочное задание без подсказки, средний уровень.'
  ][(variant-1)%4];
  return {
    ...item,
    prompt:`${lead} ${String(item.prompt||'').trim()}`,
    explanation:String(item.explanation||'').trim(),
    solutionSteps:Array.isArray(item.solutionSteps)?item.solutionSteps:[],
    mediumVariant:variant,
    mediumBankVersion:MEDIUM_BANK_VERSION
  };
}

module.exports={MEDIUM_BANK_VERSION,mediumVariant};
