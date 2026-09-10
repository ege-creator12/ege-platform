'use strict';
const curated=require('./mock-variants');
const {buildStrictV6}=require('../../src/biology-strict-line-bank-v6');
const VARIANT_COUNT=12;
const SOURCE='Авторские учебные варианты ОСНОВЫ по структуре проекта ФИПИ ЕГЭ-2027. Формулировки открытых и коммерческих банков дословно не копируются.';
const poolCache=new Map();

function cleanContent(value){
 const content=structuredClone(value||{});
 for(const key of ['variant','strictBankVersion','curatedSupplement'])delete content[key];
 return content;
}
function visibleFingerprint(q){
 return JSON.stringify([
  String(q.prompt||'').replace(/\s+/g,' ').trim(),
  q.image||q.imageUrl||'',
  (q.options||[]).map(x=>[String(x.value),String(x.label)]),
  cleanContent(q.content)
 ]);
}
function scoringMode(q,maxScore){
  if(q.questionType==='extended_answer'||q.content?.manualReview)return 'manual';
  if(Number(maxScore)<=1)return 'exact';
  if(q.type==='matching')return 'position';
  if(q.type==='sequence')return 'sequence';
  if(q.type==='multiple')return 'selection';
  return 'exact';
}
function generatedPool(line){
 if(poolCache.has(line))return poolCache.get(line);
 const seen=new Set();
 for(let v=1;v<=3;v++){
  const q=curated.variantQuestions(v)[line-1];
  seen.add(visibleFingerprint(q));
 }
 const pool=[];
 for(let n=1;n<=96&&pool.length<VARIANT_COUNT-3;n++){
  const q=structuredClone(buildStrictV6(line,n)),fp=visibleFingerprint(q);
  if(seen.has(fp))continue;
  seen.add(fp);pool.push({n,q});
 }
 if(pool.length<VARIANT_COUNT-3)throw new Error(`Biology line ${line}: not enough visibly distinct tasks for ${VARIANT_COUNT} mock variants`);
 poolCache.set(line,pool);
 return pool;
}
function generatedNumber(line,variant){return generatedPool(Number(line))[Number(variant)-4]?.n||null;}
function generatedVariant(variant){
  return curated.MAX.map((officialMax,index)=>{
    const line=index+1,{n,q}=generatedPool(line)[variant-4];
    const maxScore=Number(q.maxScore||officialMax);
    if(maxScore!==Number(officialMax))throw new Error(`Biology mock line ${line}: score mismatch ${maxScore} != ${officialMax}`);
    const criteria=q.content?.criteria||q.scoringPoints||q.solutionSteps||[];
    return {
      ...q,
      key:`biology-2027-expanded-v${variant}-line${line}-q${n}`,
      line,
      maxScore,
      image:q.image||q.imageUrl||null,
      scoringMode:scoringMode(q,maxScore),
      scoringPoints:criteria,
      commonMistakes:q.commonMistakes||['Пропустить часть условия.','Подменить биологическое объяснение общими словами.'],
      hint:q.hint||(line>=22?'Разбейте условие на отдельные требования и обоснуйте каждый вывод.':'Сначала определите проверяемую закономерность, затем запишите ответ в требуемом формате.')
    };
  });
}
function variantQuestions(variant=1){
  variant=Number(variant);
  if(!Number.isInteger(variant)||variant<1||variant>VARIANT_COUNT)throw new RangeError('Unknown biology mock variant');
  return variant<=3?curated.variantQuestions(variant):generatedVariant(variant);
}
module.exports={SOURCE,MAX:curated.MAX,VARIANT_COUNT,variantQuestions,generatedNumber,visibleFingerprint};
