const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { validateCourse } = require('../src/bootstrap');

const PHASE2_SECTION = 'biology-diversity';
const REQUIRED_BLOCKS = ['definition','table','comparison','algorithm','exam_trap','image','diagram','experiment','ege_example','deep_dive','summary','quiz'];
const REQUIRED_FACTS = [
  ['мох', /У мхов доминирует гаметофит/],
  ['папоротник', /У папоротника доминирует спорофит/],
  ['мейоз спор', /Споры растений образуются мейозом/],
  ['двойное оплодотворение', /Двойное оплодотворение характерно покрытосеменным/],
  ['сердце рыб', /Рыбы имеют двухкамерное сердце/],
  ['сердце земноводных', /Земноводные имеют трёхкамерное сердце/],
  ['сердце птиц', /Птицы имеют четырёхкамерное сердце/],
  ['сердце млекопитающих', /Сердце млекопитающих четырёхкамерное/],
  ['членистоногие', /Кровеносная система членистоногих незамкнутая/],
  ['кольчатые черви', /У кольчатых червей замкнутая кровеносная система/],
  ['трахеи насекомых', /Трахеи насекомых доставляют воздух к тканям/]
];

function phase2Report(course, publicRoot=resolve(__dirname,'../public')) {
  validateCourse(course, publicRoot);
  const section=course.sections.find(item=>item.slug===PHASE2_SECTION);
  if (!section) throw new Error('Phase 2 section is missing');
  const topics=section.topics;
  const questions=topics.flatMap(topic=>topic.questions||[]);
  const blocks=topics.flatMap(topic=>topic.lesson?.blocks||[]);
  const subtopics=topics.filter(topic=>topic.parentSlug);
  const lessons=topics.filter(topic=>topic.lesson);
  const plantLessons=subtopics.filter(topic=>topic.parentSlug==='bio-diversity-4');
  const animalLessons=subtopics.filter(topic=>topic.parentSlug==='bio-diversity-5');
  if (subtopics.length<24 || plantLessons.length<12 || animalLessons.length<12) throw new Error('Phase 2 decomposition is incomplete');
  if (lessons.length<20) throw new Error('Phase 2 must contain at least 20 lessons');
  for (const topic of [...plantLessons,...animalLessons]) if (topic.lesson.blocks.length>15) throw new Error(`${topic.slug}: monolithic lesson`);
  if (questions.length!==210) throw new Error(`questions lost: expected 210, received ${questions.length}`);
  const expectedKeys=new Set([...[12,14,14,80,90].entries()].flatMap(([offset,count])=>Array.from({length:count},(_,i)=>`phase2-bio-diversity-${offset+1}-${String(i+1).padStart(3,'0')}`)));
  for (const q of questions) if (!expectedKeys.delete(q.key)) throw new Error(`unexpected or duplicate Phase 2 question: ${q.key}`);
  if (expectedKeys.size) throw new Error(`questions lost: ${[...expectedKeys].join(', ')}`);
  const prompts=new Set();
  for (const topic of topics) {
    if (!topic.lesson) continue;
    if (topic.lesson.contentStatus!=='review') throw new Error(`${topic.slug}: lesson is not reviewed`);
    const kinds=new Set(topic.lesson.blocks.map(block=>block.type));
    for (const kind of REQUIRED_BLOCKS) if (!kinds.has(kind)) throw new Error(`${topic.slug}: missing ${kind}`);
    if (!topic.codifierCode || !topic.examLines?.length || !topic.skills?.length) throw new Error(`${topic.slug}: incomplete exam metadata`);
    for (const q of topic.questions) if (!topic.examLines.includes(q.examLine)) throw new Error(`${q.key}: examLine is outside topic mapping`);
  }
  for (const q of questions) {
    const normalized=q.prompt.toLowerCase().replace(/\s+/g,' ').trim();
    if (prompts.has(normalized)) throw new Error(`duplicate prompt: ${q.key}`);
    prompts.add(normalized);
    if (q.explanation.length<80) throw new Error(`${q.key}: explanation is too short`);
    if (q.difficulty===3 && q.solutionSteps?.length<2) throw new Error(`${q.key}: hard solution is incomplete`);
    if (!q.examLine) throw new Error(`${q.key}: examLine is missing`);
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
