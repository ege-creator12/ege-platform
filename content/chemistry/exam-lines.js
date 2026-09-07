'use strict';
const {THEORY,EXTRA_REFS}=require('./theory');
const maxScores={6:2,7:2,8:2,14:2,15:2,22:2,23:2,24:2,29:2,30:2,31:4,32:5,33:3,34:4};
const extended=new Set([29,30,31,32,33,34]);
const answerFormats={
  1:'Последовательность цифр / краткий ответ',2:'Последовательность цифр',3:'Последовательность цифр',4:'Последовательность цифр',5:'Соответствие / последовательность цифр',
  6:'Выбор нескольких позиций',7:'Соответствие / выбор',8:'Соответствие / выбор',9:'Краткая последовательность',10:'Соответствие / последовательность',11:'Выбор позиций',12:'Выбор позиций',13:'Выбор позиций',14:'Выбор / соответствие',15:'Выбор / соответствие',16:'Последовательность превращений',17:'Выбор позиций',18:'Выбор позиций',19:'Краткий ответ',20:'Краткий ответ',21:'Выбор позиций',22:'Выбор позиций',23:'Числовой расчёт',24:'Выбор / соответствие',25:'Выбор позиций',26:'Числовой ответ',27:'Числовой ответ',28:'Числовой ответ',
  29:'Развёрнутый ответ: электронный баланс',30:'Развёрнутый ответ: ионные уравнения',31:'Развёрнутый ответ: неорганическая цепочка',32:'Развёрнутый ответ: органическая цепочка',33:'Развёрнутый ответ: формула вещества',34:'Развёрнутый расчёт'
};
const lines=Array.from({length:34},(_,i)=>i+1).map(line=>{
  const t=THEORY[line];
  if(!t)throw new Error(`Missing theory for chemistry line ${line}`);
  const refs=[line,...(EXTRA_REFS[line]||[])];
  return {
    line,
    title:t.title,
    part:line<=28?1:2,
    maxScore:maxScores[line]||1,
    answerFormat:answerFormats[line],
    shortDescription:t.definition,
    skills:[`Знать: ${t.title}`,`Применять алгоритм линии ${line} к новым условиям`,`Проверять химическую корректность формул, коэффициентов и условий`],
    strategy:t.algorithm,
    commonTraps:t.traps,
    lessonRefs:refs.map(n=>`chemistry-line-${String(n).padStart(2,'0')}-lesson`),
    extended:extended.has(line)
  };
});
const registry={
  subject:'chemistry',examYear:2027,
  sourceStatus:'Проект КИМ ЕГЭ-2027 · химия',
  sourceLabel:'Авторские задания ОСНОВЫ по структуре проекта ЕГЭ-2027; официальный банк не копируется.',
  durationMinutes:210,primaryScoreMax:56,part1Count:28,part2Count:6,lines
};
if(lines.reduce((sum,x)=>sum+x.maxScore,0)!==56)throw new Error('Chemistry registry score must equal 56');
module.exports=registry;
