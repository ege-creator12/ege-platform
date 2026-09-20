'use strict';
const builders=require('../../src/chemistry-line-bank');
const registry=require('./exam-lines');
const {isChemistryFipiFormat}=require('../../src/ege-fipi-format');

const SOURCE='Авторские варианты ОСНОВЫ по структуре проекта КИМ ФИПИ ЕГЭ-2027; задания официального банка дословно не копируются.';
const VARIANT_COUNT=12;
const VARIANT_OFFSETS=[5,10,15,1,2,3,4,6,7,8,9,11];

function scoringModeFor(q,line){
 if(q.questionType==='extended_answer'||q.manualReview)return 'manual';
 if(Number(line.maxScore)<=1)return null;
 if(q.type==='matching')return 'position';
 if(q.type==='sequence')return 'sequence';
 if(q.type==='multiple')return 'selection';
 return null;
}

function itemNumber(line,variant){
 // Variants 1-3 keep their old selection. Added variants use distinct offsets
 // modulo 20, so every full paper gets a different authored task on each line.
 const offset=VARIANT_OFFSETS[Number(variant)-1];
 if(offset===undefined)throw new RangeError('Unknown chemistry mock variant');
 return ((line*7+offset+Math.floor(line/3))%20)+1;
}

function variantQuestions(variant=1){
 variant=Number(variant);
 if(!Number.isInteger(variant)||variant<1||variant>VARIANT_COUNT)throw new RangeError('Unknown chemistry mock variant');
 return registry.lines.map(info=>{
  const n=itemNumber(info.line,variant),q=builders[info.line](n);
  const maxScore=Number(q.maxScore||info.maxScore||1);
  if(maxScore!==Number(info.maxScore))throw new Error(`Chemistry mock line ${info.line}: score mismatch ${maxScore} != ${info.maxScore}`);
  const result={
   key:`chemistry-mock-v${variant}-l${String(info.line).padStart(2,'0')}-q${String(n).padStart(2,'0')}`,
   line:info.line,part:info.part,type:q.type,questionType:q.questionType||q.type,
   prompt:q.prompt,instruction:q.instruction||'',content:q.content||{},options:q.options||[],answer:q.answer,
   acceptedVariants:q.acceptedVariants||[],difficulty:Number(q.difficulty||2),maxScore,
   scoringMode:scoringModeFor(q,info),manualReview:Boolean(q.manualReview||q.questionType==='extended_answer'),
   explanation:q.explanation||'',solutionSteps:q.solutionSteps||[],scoringPoints:q.scoringPoints||q.content?.criteria||[],
   commonMistakes:q.commonMistakes||info.commonTraps||[],hint:q.hint||info.strategy?.[0]||'',
  };
  if(!isChemistryFipiFormat(info.line,result))throw new Error(`Chemistry mock line ${info.line} does not match FIPI mechanics`);
  if(!Array.isArray(result.solutionSteps)||!result.solutionSteps.length)throw new Error(`Chemistry mock line ${info.line} is missing worked solution steps`);
  return result;
 });
}

module.exports={SOURCE,VARIANT_COUNT,variantQuestions,itemNumber};
