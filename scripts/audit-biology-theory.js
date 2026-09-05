const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { validateCourse } = require('../src/bootstrap');

const ROOT=resolve(__dirname,'..');
const COURSE=resolve(ROOT,'content/biology/course.json');
const AUDIT=resolve(ROOT,'content/biology/THEORY_AUDIT.md');
const TARGET_TOPICS=new Set(['bio-science-1','bio-science-2','bio-science-3','bio-molecular-1','bio-molecular-2','bio-molecular-3','bio-molecular-4','bio-cell-1','bio-cell-2','bio-exam-practice-1','bio-exam-practice-2']);
const REQUIRED_BY_LESSON={
 'bio-science-1-lesson':['гомеостаз','дискретность','биосферном'],
 'bio-science-2-lesson':['нулевая гипотеза','положительный контроль','электрофорез','систематическ'],
 'bio-science-3-lesson':['Процентное изменение','Корреляция','Нельзя заключить'],
 'bio-molecular-1-lesson':['органогены','водородные связи','целлюлоза','фосфолипид'],
 'bio-molecular-2-lesson':['аминогруппу','четвертичная','энерги','ингибитор'],
 'bio-molecular-3-lesson':['антипараллельны','тРНК','макроэргическими'],
 'bio-molecular-3-lesson-2':['полуконсервативна','5′→3′','сплайсинге'],
 'bio-molecular-3-lesson-3':['вырожден','антикодон','пептидной связи'],
 'bio-molecular-4-lesson':['Энергетическое сопряжение','Катаболизм','Анаболизм'],
 'bio-molecular-4-lesson-2':['Гликолиз','Кислород','школьная арифметика'],
 'bio-molecular-4-lesson-3':['фотолизе','происходит из воды','Хемосинтез'],
 'bio-cell-1-lesson':['Шлейден','Эндомембранная система','кристы'],
 'bio-cell-2-lesson':['нуклеоиде','хитина','гликоген'],
 'bio-cell-2-lesson-2':['жидкостно-мозаичной','облегчённая диффузия','фагоцитоз'],
 'bio-exam-practice-1-lesson':['нулевая гипотеза','Систематическую ошибку','Положительный'],
 'bio-exam-practice-2-lesson':['0,34 нм','рамку','стоп-кодон']
};
function lessons(topic){return topic.lessons||[topic.lesson].filter(Boolean)}
function auditBiologyTheory(course, publicRoot=resolve(ROOT,'public')){
 validateCourse(course,publicRoot);
 if(course.subject.examYear!==2027||course.subject.sourceVersion!=='FIPI EGE 2027 project') throw new Error('exam source metadata mismatch');
 const auditText=readFileSync(AUDIT,'utf8');
 const allTopics=course.sections.flatMap(section=>section.topics);
 const allLessons=allTopics.flatMap(topic=>lessons(topic).map(lesson=>({topic,lesson})));
 const slugs=new Set();
 for(const {lesson} of allLessons){if(slugs.has(lesson.slug))throw new Error(`duplicate lesson slug: ${lesson.slug}`);slugs.add(lesson.slug)}
 const assets=new Map(course.assets.map(asset=>[asset.key,asset]));
 for(const asset of course.assets){if(!existsSync(resolve(publicRoot,asset.path.replace(/^\//,''))))throw new Error(`broken media: ${asset.key}`)}
 const selected=[];
 for(const topic of allTopics.filter(item=>TARGET_TOPICS.has(item.slug))){
  if(!topic.codifierCode)throw new Error(`${topic.slug}: codifierCode missing`);
  if(!Array.isArray(topic.examLines)||!topic.examLines.length)throw new Error(`${topic.slug}: examLines missing`);
  for(const lesson of lessons(topic)){
   selected.push(lesson.slug);
   if(!lesson.blocks?.length)throw new Error(`${lesson.slug}: published lesson is empty`);
   if(lesson.contentStatus!=='review'&&lesson.contentStatus!=='verified')throw new Error(`${lesson.slug}: published foundation lesson is not reviewed`);
   const types=new Set(lesson.blocks.map(block=>block.type));
   // Quality is checked by pedagogical structure and lesson-specific concepts, never by word/character totals.
   if(!types.has('text'))throw new Error(`${lesson.slug}: no connected explanatory text`);
   if(!types.has('heading')||!types.has('summary'))throw new Error(`${lesson.slug}: incomplete learning sequence`);
   if([...types].every(type=>['definition','summary','table','heading'].includes(type)))throw new Error(`${lesson.slug}: consists almost only of reference blocks`);
   const corpus=JSON.stringify(lesson);
   const normalizedCorpus=corpus.toLocaleLowerCase('ru');
   for(const concept of REQUIRED_BY_LESSON[lesson.slug]||[])if(!normalizedCorpus.includes(concept.toLocaleLowerCase('ru')))throw new Error(`${lesson.slug}: mandatory concept missing: ${concept}`);
   for(const block of lesson.blocks.filter(block=>['image','diagram'].includes(block.type))){
    const key=block.content.assetKey;if(!assets.has(key))throw new Error(`${lesson.slug}: unknown media ${key}`);
    if(!block.content.alt)throw new Error(`${lesson.slug}: media alt missing`);
   }
   for(const block of lesson.blocks.filter(block=>block.type==='deep_dive'))if(block.content.label!=='Глубже ЕГЭ')throw new Error(`${lesson.slug}: DEEP_DIVE is not labelled`);
   if(!auditText.includes(`lesson: ${lesson.slug}`)||!auditText.includes(`mandatoryConcepts:`))throw new Error(`${lesson.slug}: THEORY_AUDIT entry missing`);
  }
 }
 const missing=Object.keys(REQUIRED_BY_LESSON).filter(slug=>!selected.includes(slug));
 if(missing.length)throw new Error(`required lessons absent: ${missing.join(', ')}`);
 return {lessonsAudited:selected.length,statusAfter:{FULL:selected.length},duplicateSlugs:0,brokenMedia:0,sourceVersion:course.subject.sourceVersion,examYear:course.subject.examYear};
}
if(require.main===module)process.stdout.write(`${JSON.stringify(auditBiologyTheory(JSON.parse(readFileSync(COURSE,'utf8'))),null,2)}\n`);
module.exports={auditBiologyTheory};
