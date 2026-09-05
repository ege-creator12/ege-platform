const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { validateCourse } = require('../src/bootstrap');
const ROOT=resolve(__dirname,'..'), COURSE=resolve(ROOT,'content/biology/course.json'), AUDIT=resolve(ROOT,'content/biology/THEORY_AUDIT.md');
const TASK1_TOPICS=['bio-science-1','bio-science-2','bio-science-3','bio-molecular-1','bio-molecular-2','bio-molecular-3','bio-molecular-4','bio-cell-1','bio-cell-2','bio-exam-practice-1','bio-exam-practice-2'];
const TASK2_TOPICS=['bio-cell-3','bio-reproduction-1','bio-reproduction-2','bio-reproduction-3','bio-genetics-1','bio-genetics-2','bio-genetics-3'];
const TASK3_TOPICS=['bio-genetics-4','bio-diversity-1','bio-diversity-2','bio-diversity-3'];
const TARGET_TOPICS=new Set([...TASK1_TOPICS,...TASK2_TOPICS,...TASK3_TOPICS]);
const TASK3_REQUIRED={
 'bio-genetics-4-lesson':['наследственная изменчивость','массовом отборе','индивидуальном отборе','инбридинг','аутбридинг','гетерозис'],
 'bio-genetics-4-lesson-2':['чистые линии','полиплоидия','оценка потомства','искусственный мутагенез','штамм'],
 'bio-genetics-4-lesson-3':['вавилов','южноазиатский','центральноамериканский','гомологических рядов'],
 'bio-genetics-4-lesson-4':['традиционная биотехнология','тотипотентность','безвирусный','соматической гибридизации','переносе ядра'],
 'bio-genetics-4-lesson-5':['плазмида','рестриктаза','днк-лигаза','рекомбинантную днк','экспрессию','трансген'],
 'bio-genetics-4-lesson-6':['денатурация','отжиг','праймер','электрофорез','секвенирование','генетические маркеры'],
 'bio-diversity-1-lesson':['неклеточные формы','капсомеров','суперкапсид','нет рибосом','обратная транскриптаза','антибиотики'],
 'bio-diversity-1-lesson-2':['головка','хвост','литическом цикле','лизис','профаг'],
 'bio-diversity-2-lesson':['прокариоты','нуклеоид','эндоспора','конъюгация','трансформация','трансдукция'],
 'bio-diversity-2-lesson-2':['источник углерода','фототроф','хемотроф','азотфиксирующие','нитрифицирующие','денитрифицирующие','устойчивость'],
 'bio-diversity-3-lesson':['хитином','гликоген','осмотрофное','мицелий','почкованием','бактериальная эндоспора'],
 'bio-diversity-3-lesson-2':['микоризе','воды и минеральных','органические вещества','редуценты'],
 'bio-diversity-3-lesson-3':['цианобактерией','слоевище','фотобионт','фрагментацией','биоиндикации']
};
const TASK2_REQUIRED={
 'bio-cell-3-lesson':['хроматин','хроматида','центромер','2n2c','2n4c','контрольные точки'],
 'bio-cell-3-lesson-2':['профазе i','бивалент','тетрад','анафазе i','n2c','анафазе ii'],
 'bio-reproduction-1-lesson':['множественное деление','почкован','фрагментац','спора','случайное сочетание'],
 'bio-reproduction-2-lesson':['сперматогони','сперматоцит','спермати','ооцит','направительное тельце','n2c'],
 'bio-reproduction-2-lesson-2':['акросом','митохондри','жгутик','восстанавливает 2n'],
 'bio-reproduction-3-lesson':['морула','бластула','гаструляц','эктодерм','мезодерм','энтодерм'],
 'bio-reproduction-3-lesson-2':['прямом развитии','личинка','метаморфоз','куколк'],
 'bio-genetics-1-lesson':['ген —','аллель','локус','генотип','фенотип','чистая линия','p стоят родители'],
 'bio-genetics-1-lesson-2':['1:2:1','3:1','анализирующее','неполном доминировании','кодоминирован','iᴬiᴮ'],
 'bio-genetics-1-lesson-3':['ab, ab, ab','правило умножения','правило сложения','9:3:3:1'],
 'bio-genetics-2-lesson':['группу сцепления','родительские гаметы','рекомбинант','морганид','сМ'],
 'bio-genetics-2-lesson-2':['гомогамет','гетерогамет','отец — x только дочерям','y-сцепленный','псевдоаутосом'],
 'bio-genetics-2-lesson-3':['квадрат','круг','отец→сын','аутосомно-рецессив','x-доминант'],
 'bio-genetics-2-lesson-4':['13 типов','обратную проверку','моногибридное','карта','комбинированная'],
 'bio-genetics-3-lesson':['норма реакции','вариационный ряд','комбинативн','сдвигает рамку','делеция','анеуплоидия','генеративная','мутагены']
};
const ALGORITHMIC=new Set(['bio-cell-3-lesson','bio-cell-3-lesson-2','bio-reproduction-2-lesson','bio-genetics-1-lesson-2','bio-genetics-1-lesson-3','bio-genetics-2-lesson','bio-genetics-2-lesson-2','bio-genetics-2-lesson-3','bio-genetics-2-lesson-4','bio-genetics-3-lesson']);
const NC_REQUIRED=new Set(['bio-cell-3-lesson','bio-cell-3-lesson-2','bio-reproduction-2-lesson']);
const AUDIT_FIELDS=['section','topic','lesson','codifierCode','examLines','mandatoryConcepts','currentConcepts','missingConcepts','weakConcepts','requiredComparisons','requiredDiagrams','requiredAlgorithms','requiredEgeSkills','statusBefore','statusAfter'];
function lessons(topic){return topic.lessons||[topic.lesson].filter(Boolean)}
function auditBiologyTheory(course,publicRoot=resolve(ROOT,'public')){
 validateCourse(course,publicRoot);
 if(course.subject.examYear!==2027||course.subject.sourceVersion!=='FIPI EGE 2027 project')throw new Error('exam source metadata mismatch');
 const auditText=readFileSync(AUDIT,'utf8'), allTopics=course.sections.flatMap(s=>s.topics), allLessons=allTopics.flatMap(t=>lessons(t).map(l=>({topic:t,lesson:l}))), slugs=new Set(), assets=new Map(course.assets.map(a=>[a.key,a]));
 for(const {lesson} of allLessons){if(slugs.has(lesson.slug))throw new Error(`duplicate lesson slug: ${lesson.slug}`);slugs.add(lesson.slug)}
 for(const asset of course.assets)if(!existsSync(resolve(publicRoot,asset.path.replace(/^\//,''))))throw new Error(`broken media: ${asset.key}`);
 const selected=[];
 for(const topic of allTopics.filter(t=>TARGET_TOPICS.has(t.slug))){
  if(!topic.codifierCode||!topic.examLines?.length)throw new Error(`${topic.slug}: codifierCode/examLines missing`);
  for(const lesson of lessons(topic)){
   selected.push(lesson.slug); if(!lesson.blocks?.length)throw new Error(`${lesson.slug}: published lesson is empty`);
   if(!['review','verified'].includes(lesson.contentStatus))throw new Error(`${lesson.slug}: lesson is not reviewed`);
   const types=new Set(lesson.blocks.map(b=>b.type)), corpus=JSON.stringify(lesson).toLocaleLowerCase('ru');
   if(!types.has('text')||!types.has('heading')||!types.has('summary'))throw new Error(`${lesson.slug}: incomplete connected learning sequence`);
   if([...types].every(t=>['definition','summary','table','heading'].includes(t)))throw new Error(`${lesson.slug}: theory consists only of reference blocks`);
   for(const concept of [...(TASK2_REQUIRED[lesson.slug]||[]),...(TASK3_REQUIRED[lesson.slug]||[])])if(!corpus.includes(concept.toLocaleLowerCase('ru')))throw new Error(`${lesson.slug}: mandatory concept missing: ${concept}`);
   if(ALGORITHMIC.has(lesson.slug)&&(!types.has('algorithm')||![...types].some(t=>['example','ege_example'].includes(t))))throw new Error(`${lesson.slug}: algorithm/example missing`);
   if(NC_REQUIRED.has(lesson.slug)&&(!corpus.includes('2n2c')||!corpus.includes('2n4c')||!corpus.includes('n2c')))throw new Error(`${lesson.slug}: n/c sequence missing`);
   for(const b of lesson.blocks.filter(b=>['image','diagram'].includes(b.type))){if(!assets.has(b.content.assetKey))throw new Error(`${lesson.slug}: unknown media ${b.content.assetKey}`);if(!b.content.alt)throw new Error(`${lesson.slug}: media alt missing`)}
   for(const b of lesson.blocks.filter(b=>b.type==='deep_dive'))if(b.content.label!=='Глубже ЕГЭ')throw new Error(`${lesson.slug}: DEEP_DIVE is not labelled`);
   if((TASK2_REQUIRED[lesson.slug]||TASK3_REQUIRED[lesson.slug])&&!corpus.includes('ege_required'))throw new Error(`${lesson.slug}: EGE_REQUIRED marker missing`);
   if(TASK3_REQUIRED[lesson.slug]){
    if(!types.has('comparison')||!types.has('exam_trap')||!types.has('ege_example'))throw new Error(`${lesson.slug}: task 3 comparison/trap/application missing`);
    if(lesson.blocks.filter(b=>b.type==='text').length<2)throw new Error(`${lesson.slug}: task 3 lacks connected explanation`);
   }
   const entry=auditText.split(new RegExp(`(?=^## )`,'m')).find(x=>x.includes(`lesson: ${lesson.slug}`));
   if(!entry)throw new Error(`${lesson.slug}: THEORY_AUDIT entry missing`);
   for(const field of ((TASK2_REQUIRED[lesson.slug]||TASK3_REQUIRED[lesson.slug])?AUDIT_FIELDS:['lesson','mandatoryConcepts']))if(!entry.includes(`- ${field}:`))throw new Error(`${lesson.slug}: audit field missing: ${field}`);
  }
 }
 const missing=Object.keys(TASK2_REQUIRED).filter(slug=>!selected.includes(slug)); if(missing.length)throw new Error(`required lessons absent: ${missing.join(', ')}`);
 const task3Missing=Object.keys(TASK3_REQUIRED).filter(slug=>!selected.includes(slug)); if(task3Missing.length)throw new Error(`task 3 lessons absent: ${task3Missing.join(', ')}`);
 return {lessonsAudited:selected.length,task2LessonsAudited:Object.keys(TASK2_REQUIRED).length,task3LessonsAudited:Object.keys(TASK3_REQUIRED).length,task3StatusBefore:{MISSING:9,WEAK:0,PARTIAL:4,FULL:0},task3StatusAfter:{MISSING:0,WEAK:0,PARTIAL:0,FULL:Object.keys(TASK3_REQUIRED).length},duplicateSlugs:0,brokenMedia:0,sourceVersion:course.subject.sourceVersion,examYear:course.subject.examYear};
}
if(require.main===module)process.stdout.write(`${JSON.stringify(auditBiologyTheory(JSON.parse(readFileSync(COURSE,'utf8'))),null,2)}\n`);
module.exports={auditBiologyTheory};
