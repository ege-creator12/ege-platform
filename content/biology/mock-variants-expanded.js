'use strict';
const curated=require('./mock-variants');
const {buildStrictV6}=require('../../src/biology-strict-line-bank-v6');
const VARIANT_COUNT=12;
const SOURCE='Авторские учебные варианты ОСНОВЫ по структуре проекта ФИПИ ЕГЭ-2027. Формулировки открытых и коммерческих банков дословно не копируются.';

function generatedNumber(line,variant){
  return ((Number(line)*5+(Number(variant)-4)*7+3)%24)+1;
}
function scoringMode(q,maxScore){
  if(q.questionType==='extended_answer'||q.content?.manualReview)return 'manual';
  if(Number(maxScore)<=1)return 'exact';
  if(q.type==='matching')return 'position';
  if(q.type==='sequence')return 'sequence';
  if(q.type==='multiple')return 'selection';
  return 'exact';
}
function generatedVariant(variant){
  return curated.MAX.map((officialMax,index)=>{
    const line=index+1,n=generatedNumber(line,variant),q=structuredClone(buildStrictV6(line,n));
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
module.exports={SOURCE,MAX:curated.MAX,VARIANT_COUNT,variantQuestions,generatedNumber};
