'use strict';
const THEORY={
  ...require('./theory-foundations'),
  ...require('./theory-inorganic'),
  ...require('./theory-organic'),
  ...require('./theory-processes'),
  ...require('./theory-calculations'),
  ...require('./theory-applied'),
  ...require('./theory-coverage-2027')
};
const EXTRA_REFS={
  6:[7,8,24],7:[6,8],8:[6,7],
  12:[14,15],14:[12],15:[12],16:[10,11,12,13,14,15],
  23:[22],24:[6,7,8,12,13,15],
  29:[19],30:[6],31:[6,7,8,9],
  32:[10,11,12,13,14,15,16],33:[10,11,12,13,14,15],34:[23,26,28]
};
function blocksFor(line){
  const t=THEORY[line];
  if(!t)throw new Error(`Missing chemistry theory for line ${line}`);
  return [
    {type:'heading',content:{text:t.title}},
    {type:'definition',content:{title:'Ключевое определение',text:t.definition}},
    ...t.core.map((text,i)=>({type:'text',content:{title:i?'Продолжение':'Основа темы',text}})),
    {type:'remember',content:{text:t.facts.join('\n')}},
    {type:'table',content:{title:'Опорная таблица',columns:t.table[0],rows:t.table.slice(1)}},
    {type:'algorithm',content:{title:'Алгоритм ЕГЭ',items:t.algorithm}},
    {type:'ege_example',content:{title:'Разобранный пример',text:t.example}},
    ...t.traps.map(text=>({type:'exam_trap',content:{text}})),
    {type:'deep_dive',content:{title:'Важно понимать',text:t.deep}},
    {type:'summary',content:{text:`${t.title}. Повторите определения, алгоритм, формулы/реакции, исключения и типичные условия; каждый шаг решения должен быть химически обоснован.`}},
    {type:'quiz',content:{question:t.quiz[0],answer:t.quiz[1]}}
  ];
}
module.exports={THEORY,EXTRA_REFS,blocksFor};
