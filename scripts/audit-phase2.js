const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { validateCourse } = require('../src/bootstrap');

const PHASE2_SECTION = 'biology-diversity';
const REQUIRED_BLOCKS = ['definition','table','comparison','algorithm','exam_trap','image','diagram','experiment','ege_example','deep_dive','summary'];
const REQUIRED_FACTS = [
  ['мох', /У мхов доминирует гаметофит/],
  ['папоротник', /У папоротника доминирует спорофит/],
  ['мейоз спор', /Споры растений образуются мейозом/],
  ['двойное оплодотворение', /Двойное оплодотворение характерно покрытосеменным/],
  ['сердце рыб', /рыб.{0,80}(двухкамерн|две камеры)/i],
  ['сердце земноводных', /земноводн.{0,80}(трёхкамерн|три камеры)/i],
  ['сердце птиц', /птиц.{0,80}(четырёхкамерн|четыре камеры)/i],
  ['сердце млекопитающих', /млекопитающ.{0,80}(четырёхкамерн|четыре камеры)/i],
  ['членистоногие', /(?=[\s\S]*членистоног)(?=[\s\S]*незамкнут)/i],
  ['кольчатые черви', /(?=[\s\S]*кольчат)(?=[\s\S]*замкнут)/i],
  ['трахеи насекомых', /трахе.{0,120}(ткан|клет)/i]
];

function phase2Report(course, publicRoot=resolve(__dirname,'../public')) {
  validateCourse(course, publicRoot);
  const section=course.sections.find(item=>item.slug===PHASE2_SECTION);
  if (!section) throw new Error('Phase 2 section is missing');
  const topics=section.topics;
  const questions=topics.flatMap(topic=>topic.questions||[]);
  const topicLessons=topic=>topic.lessons||[topic.lesson].filter(Boolean);
  const blocks=topics.flatMap(topic=>topicLessons(topic).flatMap(lesson=>lesson.blocks||[]));
  const subtopics=topics.filter(topic=>topic.parentSlug);
  const lessons=topics.flatMap(topicLessons);
  const plantLessons=subtopics.filter(topic=>topic.parentSlug==='bio-diversity-4');
  const animalLessons=subtopics.filter(topic=>topic.parentSlug==='bio-diversity-5');
  if (subtopics.length<24 || plantLessons.length<12 || animalLessons.length<12) throw new Error('Phase 2 decomposition is incomplete');
  if (lessons.length<20) throw new Error('Phase 2 must contain at least 20 lessons');
  for (const topic of [...plantLessons,...animalLessons]) for(const lesson of topicLessons(topic)) if (lesson.blocks.length>15) throw new Error(`${lesson.slug}: monolithic lesson`);
  if (questions.length<210) throw new Error(`questions lost: expected at least 210, received ${questions.length}`);
  const expectedKeys=new Set([...[12,14,14,80,90].entries()].flatMap(([offset,count])=>Array.from({length:count},(_,i)=>`phase2-bio-diversity-${offset+1}-${String(i+1).padStart(3,'0')}`)));
  for (const q of questions) expectedKeys.delete(q.key);
  if (expectedKeys.size) throw new Error(`questions lost: ${[...expectedKeys].join(', ')}`);
  const prompts=new Set();
  for (const topic of topics) {
    const lessonsForTopic=topicLessons(topic); if (!lessonsForTopic.length) continue;
    if (lessonsForTopic.some(lesson=>!['review','verified'].includes(lesson.contentStatus))) throw new Error(`${topic.slug}: lesson is not reviewed`);
    const kinds=new Set(lessonsForTopic.flatMap(lesson=>lesson.blocks).map(block=>block.type));
    const requiredKinds=topic.slug.includes('-animal-')?['heading','text','algorithm','exam_trap','ege_example','summary']:REQUIRED_BLOCKS;
    for (const kind of requiredKinds) if (!kinds.has(kind)) throw new Error(`${topic.slug}: missing ${kind}`);
    if (!topic.codifierCode || !topic.examLines?.length || !topic.skills?.length) throw new Error(`${topic.slug}: incomplete exam metadata`);
    for (const q of topic.questions) if (q.examLine!=null&&(!Number.isInteger(q.examLine)||q.examLine<1||q.examLine>28)) throw new Error(`${q.key}: examLine is outside topic mapping`);
  }
  for (const q of questions) {
    const normalized=q.prompt.toLowerCase().replace(/\s+/g,' ').trim();
    if (prompts.has(normalized)) throw new Error(`duplicate prompt: ${q.key}`);
    prompts.add(normalized);
    if (!q.explanation.trim()) throw new Error(`${q.key}: explanation is too short`);
    if (q.difficulty===3 && q.solutionSteps?.length<2) throw new Error(`${q.key}: hard solution is incomplete`);
    if (q.image && !existsSync(resolve(publicRoot,q.image.replace(/^\//,'')))) throw new Error(`${q.key}: missing image`);
  }
  const corpus=JSON.stringify(section);
  for (const [name,pattern] of REQUIRED_FACTS) if (!pattern.test(corpus)) throw new Error(`biological assertion is missing: ${name}`);
  const byDifficulty=Object.fromEntries([1,2,3].map(level=>[level,questions.filter(q=>q.difficulty===level).length]));
  const byType=Object.fromEntries([...new Set(questions.map(q=>q.type))].sort().map(type=>[type,questions.filter(q=>q.type===type).length]));
  const byTopic=Object.fromEntries(topics.map(topic=>[topic.slug,(topic.questions||[]).length]));
  const assetKeys=new Set(course.assets.filter(asset=>asset.key.startsWith('phase2-')).map(asset=>asset.key));
  return {topics:topics.length,subtopics:subtopics.length,lessons:lessons.length,blocks:blocks.length,questions:questions.length,questionsLost:0,byDifficulty,byType,byTopic,assets:assetKeys.size,codifierCodes:[...new Set(topics.map(t=>t.codifierCode))],examLines:[...new Set(topics.flatMap(t=>t.examLines))].sort((a,b)=>a-b)};
}

if (require.main===module) {
  const report=phase2Report(JSON.parse(readFileSync(resolve(__dirname,'../content/biology/course.json'),'utf8')));
  process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
}

module.exports={phase2Report};
