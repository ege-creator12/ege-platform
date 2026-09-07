const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const EXAM_YEAR = 2027;
const SOURCE_VERSION = 'FIPI EGE 2027 project';
const blockTypes = new Set(['heading','text','definition','remember','table','comparison','example','algorithm','exam_trap','image','diagram','experiment','ege_example','deep_dive','summary','quiz']);
const questionTypes = new Set(['multiple_answer','sequence','matching','table','image','diagram','graph','experiment','calculation','genetics_problem','biological_process_analysis','text_analysis','short_answer','extended_answer']);
const legacyQuestionTypes = new Set(['single_choice']);
const legacySkills = { chemistry: ['atomic_structure','periodic_trends','inorganic','organic','redox','equilibrium','solutions','calculations','reaction_chains'] };

function validateCourse(course, publicRoot=resolve(__dirname,'../public')) {
  const errors=[];
  if (!course?.subject?.slug || !Array.isArray(course.sections)) errors.push('subject and sections are required');
  const keys=new Set(), slugs=new Set();
  const codifier=new Map((course.codifier||[]).map(item=>[item.code,new Set(item.examLines||[])]));
  const allowedDifficulties=new Set([1,2,3]);
  const allowedStatuses=new Set(['draft','review','verified','legacy']);
  const normalizedPrompts=new Map();
  for (const section of course.sections||[]) for (const topic of section.topics||[]) {
    if (topic.parentSlug && !slugs.has(topic.parentSlug)) errors.push(`unknown or unordered parent topic: ${topic.parentSlug}`);
    if (slugs.has(topic.slug)) errors.push(`duplicate topic slug: ${topic.slug}`); slugs.add(topic.slug);
    if (course.subject.slug==='biology' && !topic.codifierCode) errors.push(`missing codifierCode: ${topic.slug}`);
    if (course.subject.slug==='biology' && topic.codifierCode && !codifier.has(topic.codifierCode)) errors.push(`unknown codifierCode: ${topic.codifierCode}`);
    const lessons=topic.lessons||[topic.lesson].filter(Boolean);
    for (const lesson of lessons) if (course.subject.slug==='biology') {
      if (!allowedStatuses.has(lesson.contentStatus)) errors.push(`invalid lesson contentStatus: ${lesson.slug}`);
      for (const block of lesson.blocks||[]) {
        if (!blockTypes.has(block.type)) errors.push(`unsupported block type: ${block.type}`);
        if (!block.content || !Object.keys(block.content).length) errors.push(`empty lesson block: ${lesson.slug}`);
        const assetKey=block.content?.assetKey;
        if (assetKey && !(course.assets||[]).some(asset=>asset.key===assetKey)) errors.push(`unknown lesson asset: ${assetKey}`);
      }
    }
    for (const q of topic.questions||[]) {
      if (keys.has(q.key)) errors.push(`duplicate question key: ${q.key}`); keys.add(q.key);
      if (course.subject.slug==='biology' && !questionTypes.has(q.type) && !legacyQuestionTypes.has(q.type)) errors.push(`unsupported question type: ${q.type}`);
      if (course.subject.slug==='biology' && (!q.prompt?.trim() || !Array.isArray(q.answer) || !q.answer.length || q.answer.some(value=>!String(value).trim()))) errors.push(`incomplete question: ${q.key}`);
      if (!allowedDifficulties.has(q.difficulty)) errors.push(`invalid difficulty: ${q.key}`);
      if (course.subject.slug==='biology' && !allowedStatuses.has(q.contentStatus)) errors.push(`invalid contentStatus: ${q.key}`);
      if (!q.explanation?.trim()) errors.push(`missing explanation: ${q.key}`);
      if (Array.isArray(q.options) && q.options.some(option=>!String(option).trim())) errors.push(`empty option: ${q.key}`);
      if (q.examLine != null && (!Number.isInteger(q.examLine) || q.examLine<1 || q.examLine>28)) errors.push(`invalid examLine ${q.examLine}: ${q.key}`);
      if ((q.type==='calculation' || q.difficulty===3 || q.contentStatus==='verified') && (!Array.isArray(q.solutionSteps) || q.solutionSteps.length<2)) errors.push(`missing solutionSteps: ${q.key}`);
      if (q.contentStatus==='verified' && (q.explanation.trim().length<40 || q.prompt.trim().length<20)) errors.push(`verified question is under-explained: ${q.key}`);
      const normalized=q.prompt?.toLowerCase().replace(/\d+/g,'#').replace(/[^а-яёa-z#]+/gi,' ').trim();
      if (normalized && normalizedPrompts.has(normalized)) errors.push(`probable duplicate prompt: ${q.key} and ${normalizedPrompts.get(normalized)}`);
      if (normalized) normalizedPrompts.set(normalized,q.key);
      if (q.image && !existsSync(resolve(publicRoot,q.image.replace(/^\//,'')))) errors.push(`missing image: ${q.image}`);
    }
  }
  for (const asset of course.assets||[]) if (!existsSync(resolve(publicRoot,asset.path.replace(/^\//,'')))) errors.push(`missing asset: ${asset.path}`);
  if (errors.length) throw new Error(`Invalid course content:\n- ${errors.join('\n- ')}`);
  return true;
}

const dbType = type => type==='sequence'?'sequence':type==='matching'?'matching':type==='multiple_answer'?'multiple':type==='single_choice'?'single':'text';

async function importCourse(db, course) {
  validateCourse(course);
  const s=course.subject, year=s.examYear||EXAM_YEAR, source=s.sourceVersion||SOURCE_VERSION;
  await db.run(`INSERT INTO subjects(slug,title,description,icon,exam_year,published,position,source_version,content_version)
    VALUES(?,?,?,?,?,TRUE,?,?,1) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,description=excluded.description,icon=excluded.icon,exam_year=excluded.exam_year,published=excluded.published,position=excluded.position,source_version=excluded.source_version,content_version=excluded.content_version,updated_at=CURRENT_TIMESTAMP`,s.slug,s.title,s.description,s.icon,year,s.position||0,source);
  const subject=(await db.row('SELECT id FROM subjects WHERE slug=?',s.slug));
  if (s.slug==='biology') await db.run("UPDATE questions SET content_status='legacy' WHERE subject_id=? AND content_status='draft'",subject.id);
  const skills=course.skills||legacySkills[s.slug]?.map(slug=>({slug,title:slug.replaceAll('_',' '),description:'Навык ЕГЭ'}))||[];
  for (const [position,skill] of skills.entries()) await db.run(`INSERT INTO skills(subject_id,slug,title,description,position) VALUES(?,?,?,?,?) ON CONFLICT(subject_id,slug) DO UPDATE SET title=excluded.title,description=excluded.description,position=excluded.position`,subject.id,skill.slug,skill.title,skill.description||'',position);
  for (const item of course.codifier||[]) await db.run(`INSERT INTO exam_spec_items(subject_id,exam_year,codifier_code,title,parent_code,exam_lines_json,skills_json,difficulty,is_ege_required,source_version,content_status) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(subject_id,exam_year,codifier_code) DO UPDATE SET title=excluded.title,parent_code=excluded.parent_code,exam_lines_json=excluded.exam_lines_json,skills_json=excluded.skills_json,difficulty=excluded.difficulty,is_ege_required=excluded.is_ege_required,source_version=excluded.source_version,content_status=excluded.content_status`,subject.id,year,item.code,item.title,item.parentCode||null,JSON.stringify(item.examLines||[]),JSON.stringify(item.skills||[]),item.difficulty||'base',item.isEgeRequired!==false,source,item.contentStatus||'draft');
  for (const asset of course.assets||[]) await db.run(`INSERT INTO media_assets(external_key,path,mime_type,alt_text,width,height,metadata_json,content_status) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(external_key) DO UPDATE SET path=excluded.path,mime_type=excluded.mime_type,alt_text=excluded.alt_text,width=excluded.width,height=excluded.height,metadata_json=excluded.metadata_json,content_status=excluded.content_status`,asset.key,asset.path,asset.mimeType,asset.alt,asset.width||null,asset.height||null,JSON.stringify(asset.metadata||{}),asset.contentStatus||'verified');
  for (const [si,section] of course.sections.entries()) {
    await db.run(`INSERT INTO sections(subject_id,slug,title,description,position,published,exam_year,source_version) VALUES(?,?,?,?,?,TRUE,?,?) ON CONFLICT(subject_id,slug) DO UPDATE SET title=excluded.title,description=excluded.description,position=excluded.position,published=TRUE,exam_year=excluded.exam_year,source_version=excluded.source_version,updated_at=CURRENT_TIMESTAMP`,subject.id,section.slug,section.title,section.description||'',si,year,source);
    const sectionId=(await db.row('SELECT id FROM sections WHERE subject_id=? AND slug=?',subject.id,section.slug)).id;
    for (const [ti,topic] of (section.topics||[]).entries()) {
      const parent=topic.parentSlug?await db.row('SELECT id FROM topics WHERE subject_id=? AND slug=?',subject.id,topic.parentSlug):null;
      if (topic.parentSlug && !parent) throw new Error(`Unknown parent topic: ${topic.parentSlug}`);
      await db.run(`INSERT INTO topics(subject_id,section_id,parent_id,slug,title,description,theory,position,kind,published,exam_year,source_version) VALUES(?,?,?,?,?,?,?,?,'topic',TRUE,?,?) ON CONFLICT(subject_id,slug) DO UPDATE SET section_id=excluded.section_id,parent_id=excluded.parent_id,title=excluded.title,description=excluded.description,position=excluded.position,published=TRUE,exam_year=excluded.exam_year,source_version=excluded.source_version,updated_at=CURRENT_TIMESTAMP`,subject.id,sectionId,parent?.id||null,topic.slug,topic.title,topic.description||'','',ti,year,source);
      const topicId=(await db.row('SELECT id FROM topics WHERE subject_id=? AND slug=?',subject.id,topic.slug)).id;
      const spec=topic.codifierCode?await db.row('SELECT id FROM exam_spec_items WHERE subject_id=? AND exam_year=? AND codifier_code=?',subject.id,year,topic.codifierCode):null;
      if (spec) await db.run(`INSERT INTO content_coverage(spec_item_id,entity_type,entity_id,coverage_kind) VALUES(?,'topic',?,'theory') ON CONFLICT(spec_item_id,entity_type,entity_id,coverage_kind) DO NOTHING`,spec.id,topicId);
      const topicLessons=topic.lessons||[topic.lesson].filter(Boolean);
      if (!topicLessons.length) {
        if (topic.containerOnly) await db.run('UPDATE lessons SET published=FALSE WHERE topic_id=?',topicId);
        continue;
      }
      const lessonIds=new Map();
      for (const [lessonPosition,l] of topicLessons.entries()) {
        // A lesson slug is globally unique in a course. Move the existing row when
        // editorial navigation changes its topic, preserving progress and attempts.
        const existingLesson=await db.row(`SELECT l.id,l.topic_id FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE t.subject_id=? AND l.slug=?`,subject.id,l.slug);
        if(existingLesson&&Number(existingLesson.topic_id)!==Number(topicId))await db.run('UPDATE lessons SET topic_id=? WHERE id=?',topicId,existingLesson.id);
        await db.run(`INSERT INTO lessons(topic_id,slug,title,summary,estimated_minutes,difficulty,position,published,exam_year,source_version,codifier_code,exam_lines_json,skills_json,content_status,is_ege_required,is_beyond_ege) VALUES(?,?,?,?,?,?,?,TRUE,?,?,?,?,?,?,?,?) ON CONFLICT(topic_id,slug) DO UPDATE SET title=excluded.title,summary=excluded.summary,estimated_minutes=excluded.estimated_minutes,difficulty=excluded.difficulty,position=excluded.position,published=TRUE,exam_year=excluded.exam_year,source_version=excluded.source_version,codifier_code=excluded.codifier_code,exam_lines_json=excluded.exam_lines_json,skills_json=excluded.skills_json,content_status=excluded.content_status,is_ege_required=excluded.is_ege_required,is_beyond_ege=excluded.is_beyond_ege,updated_at=CURRENT_TIMESTAMP`,topicId,l.slug,l.title,l.summary||'',l.minutes||12,l.difficulty||'base',lessonPosition,year,source,topic.codifierCode||null,JSON.stringify(topic.examLines||[]),JSON.stringify(topic.skills||[]),l.contentStatus||'draft',l.isEgeRequired!==false,Boolean(l.isBeyondEge));
        const lessonId=(await db.row('SELECT id FROM lessons WHERE topic_id=? AND slug=?',topicId,l.slug)).id; lessonIds.set(l.slug,lessonId);
        await db.run("DELETE FROM content_coverage WHERE entity_type='block' AND entity_id IN (SELECT id FROM lesson_blocks WHERE lesson_id=?)",lessonId);
        await db.run('DELETE FROM lesson_blocks WHERE lesson_id=?',lessonId);
        for (const [position,block] of (l.blocks||[]).entries()) { const asset=(course.assets||[]).find(a=>a.key===block.content.assetKey);const content=asset?{...block.content,path:asset.path}:block.content;await db.run(`INSERT INTO lesson_blocks(lesson_id,type,content_json,position) VALUES(?,?,?,?)`,lessonId,block.type,JSON.stringify(content),position); if(spec) await db.run(`INSERT INTO content_coverage(spec_item_id,entity_type,entity_id,coverage_kind) VALUES(?,'block',?,'theory') ON CONFLICT(spec_item_id,entity_type,entity_id,coverage_kind) DO NOTHING`,spec.id,(await db.row('SELECT id FROM lesson_blocks WHERE lesson_id=? AND position=?',lessonId,position)).id); }
      }
      await db.run(`UPDATE lessons SET published=FALSE WHERE topic_id=? AND slug NOT IN (${topicLessons.map(()=>'?').join(',')})`,topicId,...topicLessons.map(l=>l.slug));
      for (const q of topic.questions||[]) {
        const lessonSlug=q.lessonSlug&&lessonIds.has(q.lessonSlug)?q.lessonSlug:topicLessons[0].slug,lessonId=lessonIds.get(lessonSlug);
        const status=q.contentStatus||'draft', answer=JSON.stringify(q.answer), explanation=JSON.stringify({short:q.explanation,fullSolution:q.explanation,commonMistake:q.commonMistake||'',commonMistakes:q.commonMistakes||[],scoringPoints:q.scoringPoints||[],theoryReference:lessonSlug});
        await db.run(`INSERT INTO questions(subject_id,topic_id,lesson_id,external_key,type,question_type,prompt,explanation,difficulty,answer_json,answer_data_json,explanation_json,source,source_type,exam_line,points,active,published,exam_year,codifier_code,skills_json,solution_steps_json,max_score,content_status,image_url) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE,TRUE,?,?,?,?,?,?,?) ON CONFLICT(external_key) DO UPDATE SET subject_id=excluded.subject_id,topic_id=excluded.topic_id,lesson_id=excluded.lesson_id,type=excluded.type,question_type=excluded.question_type,prompt=excluded.prompt,explanation=excluded.explanation,difficulty=excluded.difficulty,answer_json=excluded.answer_json,answer_data_json=excluded.answer_data_json,explanation_json=excluded.explanation_json,exam_line=excluded.exam_line,active=TRUE,published=TRUE,exam_year=excluded.exam_year,codifier_code=excluded.codifier_code,skills_json=excluded.skills_json,solution_steps_json=excluded.solution_steps_json,max_score=excluded.max_score,points=excluded.points,content_status=excluded.content_status,image_url=excluded.image_url`,subject.id,topicId,lessonId,q.key,dbType(q.type),q.type,q.prompt||q.text,q.explanation,q.difficulty||1,answer,JSON.stringify({correct:q.answer,content:q.content||{},acceptedVariants:q.acceptedVariants||[]}),explanation,'Оригинальный контент ОСНОВА','original',Object.hasOwn(q,'examLine')?q.examLine:topic.examLines?.[0]||null,q.maxScore||1,year,topic.codifierCode||null,JSON.stringify(q.skills||topic.skills||[]),JSON.stringify(q.solutionSteps||[]),q.maxScore||1,status,q.image||null);
        const questionId=(await db.row('SELECT id FROM questions WHERE external_key=?',q.key)).id;
        let content={...(q.content||{}),...(q.manualReview?{manualReview:true}:{})};
        if(q.type==='matching'&&!content.left&&q.options?.length&&q.answer.every(x=>/^\d+-\d+$/.test(x))){
          const pairs=q.options.map(label=>label.split(/\s+[—–]\s+/));
          if(pairs.every(pair=>pair.length>=2))content={left:pairs.map(pair=>pair[0]),right:pairs.map(pair=>pair.slice(1).join(' — ')),answerEncoding:'pairs'};
        }
        await db.run('UPDATE questions SET active=?,published=? WHERE id=?',status!=='draft'&&status!=='legacy',status!=='draft'&&status!=='legacy',questionId);
        await db.run('UPDATE questions SET instruction=?,content_json=?,media_json=? WHERE id=?',q.instruction||'',JSON.stringify(content),JSON.stringify(q.image?{path:q.image,alt:'Схема к заданию'}:{}),questionId);
        await db.run('DELETE FROM question_options WHERE question_id=?',questionId);
        for (const [position,label] of (q.options||[]).entries()) await db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)',questionId,String(position),label,position);
        if(spec) await db.run(`INSERT INTO content_coverage(spec_item_id,entity_type,entity_id,coverage_kind) VALUES(?,'question',?,'practice') ON CONFLICT(spec_item_id,entity_type,entity_id,coverage_kind) DO NOTHING`,spec.id,questionId);
        const assigned=q.skills||topic.skills||skills.slice(0,1).map(x=>x.slug);
        for (const slug of assigned) { const skill=await db.row('SELECT id FROM skills WHERE subject_id=? AND slug=?',subject.id,slug); if(skill) await db.run('INSERT INTO question_skills(question_id,skill_id,weight) VALUES(?,?,1) ON CONFLICT(question_id,skill_id) DO NOTHING',questionId,skill.id); }
      }
    }
    const currentTopicSlugs=(section.topics||[]).map(topic=>topic.slug);
    if(currentTopicSlugs.length)await db.run(`UPDATE topics SET published=FALSE WHERE section_id=? AND slug NOT IN (${currentTopicSlugs.map(()=>'?').join(',')})`,sectionId,...currentTopicSlugs);
  }
}

async function bootstrapCourse(db) {
  await db.run(`INSERT INTO content_sources(slug,title,source_type,source_version,exam_year) VALUES('osnova-original','Оригинальный контент ОСНОВА','original',?,?) ON CONFLICT(slug) DO UPDATE SET source_version=excluded.source_version,updated_at=CURRENT_TIMESTAMP`,SOURCE_VERSION,EXAM_YEAR);
  for (const name of ['biology','chemistry']) await importCourse(db,JSON.parse(readFileSync(resolve(__dirname,`../content/${name}/course.json`),'utf8')));
}
module.exports={EXAM_YEAR,SOURCE_VERSION,blockTypes,questionTypes,validateCourse,bootstrapCourse,importCourse};
