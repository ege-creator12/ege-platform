'use strict';
const {THEORY,EXTRA_REFS}=require('./theory');
const maxScores={6:2,7:2,8:2,14:2,15:2,22:2,23:2,24:2,29:2,30:2,31:4,32:5,33:3,34:4};
const extended=new Set([29,30,31,32,33,34]);
const answerFormats={
  1:'Последовательность цифр / краткий ответ',2:'Последовательность цифр',3:'Последовательность цифр',4:'Последовательность цифр',5:'Соответствие / последовательность цифр',
  6:'Выбор нескольких позиций',7:'Соответствие / выбор',8:'Соответствие / выбор',9:'Краткая последовательность',10:'Соответствие / последовательность',11:'Выбор позиций',12:'Выбор позиций',13:'Выбор позиций',14:'Выбор / соответствие',15:'Выбор / соответствие',16:'Последовательность превращений',17:'Выбор позиций',18:'Выбор позиций',19:'Краткий ответ',20:'Краткий ответ',21:'Выбор позиций',22:'Выбор позиций',23:'Числовой расчёт',24:'Выбор / соответствие',25:'Выбор позиций',26:'Числовой ответ',27:'Числовой ответ',28:'Числовой ответ',
  29:'Развёрнутый ответ: электронный баланс',30:'Развёрнутый ответ: ионные уравнения',31:'Развёрнутый ответ: неорганическая цепочка',32:'Развёрнутый ответ: органическая цепочка',33:'Развёрнутый ответ: формула вещества',34:'Развёрнутый расчёт'
};

// Subject-course lessons for the parts already rebuilt in chemistry v2. The
// legacy line lesson remains a compatibility fallback for sections that have not
// yet been editorially split into full subject lessons.
const v2LessonRefs={
  1:['chem-v2-atom-isotopes-ions','chem-v2-electron-config','chem-v2-periodic-table'],
  2:['chem-v2-periodic-table','chem-v2-periodic-trends'],
  3:['chem-v2-oxidation-state','chem-v2-periodic-trends'],
  4:['chem-v2-bond-types','chem-v2-molecular-polarity','chem-v2-crystal-lattices'],
  5:['chem-v2-matter-particles','chem-v2-inorganic-names','chem-v2-oxides','chem-v2-bases','chem-v2-acids','chem-v2-salts'],
  6:['chem-v2-dissociation','chem-v2-ionic-equations','chem-v2-oxides','chem-v2-bases','chem-v2-acids','chem-v2-salts','chem-v2-amphoteric'],
  7:['chem-v2-oxides','chem-v2-bases','chem-v2-acids','chem-v2-salts','chem-v2-amphoteric','chem-v2-metals-general','chem-v2-halogens-hydrogen','chem-v2-oxygen-sulfur','chem-v2-nitrogen-phosphorus','chem-v2-carbon-silicon'],
  8:['chem-v2-metals-general','chem-v2-s-metals-aluminium','chem-v2-fe-cr-mn','chem-v2-cu-zn-ag','chem-v2-halogens-hydrogen','chem-v2-oxygen-sulfur','chem-v2-nitrogen-phosphorus','chem-v2-carbon-silicon'],
  9:['chem-v2-inorganic-chains','chem-v2-qualitative'],
  24:['chem-v2-qualitative','chem-v2-dissociation','chem-v2-ionic-equations'],
  30:['chem-v2-ionic-equations','chem-v2-qualitative','chem-v2-hydrolysis'],
  31:['chem-v2-inorganic-chains','chem-v2-metals-general','chem-v2-s-metals-aluminium','chem-v2-fe-cr-mn','chem-v2-cu-zn-ag','chem-v2-halogens-hydrogen','chem-v2-oxygen-sulfur','chem-v2-nitrogen-phosphorus','chem-v2-carbon-silicon']
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
    lessonRefs:v2LessonRefs[line]||refs.map(n=>`chemistry-line-${String(n).padStart(2,'0')}-lesson`),
    extended:extended.has(line)
  };
});
const registry={
  subject:'chemistry',examYear:2027,
  sourceStatus:'Проект КИМ ЕГЭ-2027 · химия',
  sourceLabel:'Теория ОСНОВЫ сверяется с открытыми материалами и навигатором ФИПИ; тренировочные задания авторские и официальный банк дословно не копируется.',
  durationMinutes:210,primaryScoreMax:56,part1Count:28,part2Count:6,lines
};
if(lines.reduce((sum,x)=>sum+x.maxScore,0)!==56)throw new Error('Chemistry registry score must equal 56');
module.exports=registry;
