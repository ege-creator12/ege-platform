const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const skillCatalog = {
  biology: ['genetics','cytology','human_anatomy','botany','zoology','evolution','ecology','data_analysis','experiment_analysis'],
  chemistry: ['atomic_structure','periodic_trends','inorganic','organic','redox','equilibrium','solutions','calculations','reaction_chains']
};
const title = slug => slug.split('_').map(x => x[0].toUpperCase() + x.slice(1)).join(' ');

async function importCourse(db, course) {
  const s = course.subject;
  await db.run(`INSERT INTO subjects(slug,title,description,icon,exam_year,published,position,source_version,content_version)
    VALUES(?,?,?,?,2027,TRUE,?,?,1) ON CONFLICT(slug) DO UPDATE SET title=excluded.title,description=excluded.description,icon=excluded.icon,exam_year=excluded.exam_year,published=excluded.published,position=excluded.position,source_version=excluded.source_version,content_version=excluded.content_version,updated_at=CURRENT_TIMESTAMP`, s.slug,s.title,s.description,s.icon,s.slug==='biology'?0:1,'osnova-2027-draft');
  const subject = await db.row('SELECT id FROM subjects WHERE slug=?',s.slug);
  for (const [si,section] of course.sections.entries()) {
    await db.run(`INSERT INTO sections(subject_id,slug,title,description,position,published) VALUES(?,?,?,?,?,TRUE)
      ON CONFLICT(subject_id,slug) DO UPDATE SET title=excluded.title,description=excluded.description,position=excluded.position,published=TRUE,updated_at=CURRENT_TIMESTAMP`,subject.id,section.slug,section.title,section.description,si);
    const sectionId=(await db.row('SELECT id FROM sections WHERE subject_id=? AND slug=?',subject.id,section.slug)).id;
    for (const [ti,topic] of section.topics.entries()) {
      await db.run(`INSERT INTO topics(subject_id,section_id,parent_id,slug,title,description,theory,position,kind,published) VALUES(?,?,NULL,?,?,?,?,?,'topic',TRUE)
        ON CONFLICT(subject_id,slug) DO UPDATE SET section_id=excluded.section_id,title=excluded.title,description=excluded.description,position=excluded.position,published=TRUE,updated_at=CURRENT_TIMESTAMP`,subject.id,sectionId,topic.slug,topic.title,topic.description,'',ti);
      const topicId=(await db.row('SELECT id FROM topics WHERE subject_id=? AND slug=?',subject.id,topic.slug)).id;
      const lesson=topic.lesson;
      await db.run(`INSERT INTO lessons(topic_id,slug,title,summary,estimated_minutes,difficulty,position,published) VALUES(?,?,?,?,?,'base',0,TRUE)
        ON CONFLICT(topic_id,slug) DO UPDATE SET title=excluded.title,summary=excluded.summary,estimated_minutes=excluded.estimated_minutes,published=TRUE,updated_at=CURRENT_TIMESTAMP`,topicId,lesson.slug,lesson.title,lesson.summary,lesson.minutes);
      const lessonId=(await db.row('SELECT id FROM lessons WHERE topic_id=? AND slug=?',topicId,lesson.slug)).id;
      for (const [position,block] of lesson.blocks.entries()) await db.run(`INSERT INTO lesson_blocks(lesson_id,type,content_json,position) VALUES(?,?,?,?)
        ON CONFLICT(lesson_id,position) DO UPDATE SET type=excluded.type,content_json=excluded.content_json`,lessonId,block.type,JSON.stringify(block.content),position);
      for (const q of topic.questions) {
        const answer=JSON.stringify(q.answer), explanation=JSON.stringify({short:q.explanation,fullSolution:q.explanation,commonMistake:'Проверьте условия и терминологию.',theoryReference:lesson.slug});
        await db.run(`INSERT INTO questions(subject_id,topic_id,lesson_id,external_key,type,question_type,prompt,explanation,difficulty,answer_json,answer_data_json,explanation_json,source,source_type,exam_line,points,active,published)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE,TRUE) ON CONFLICT(external_key) DO UPDATE SET subject_id=excluded.subject_id,topic_id=excluded.topic_id,lesson_id=excluded.lesson_id,prompt=excluded.prompt,explanation=excluded.explanation,difficulty=excluded.difficulty,answer_json=excluded.answer_json,answer_data_json=excluded.answer_data_json,explanation_json=excluded.explanation_json,exam_line=excluded.exam_line,active=TRUE,published=TRUE`,subject.id,topicId,lessonId,q.key,'single',q.type,q.text,q.explanation,q.difficulty,answer,JSON.stringify({correct:q.answer,acceptedVariants:q.answer}),explanation,'Оригинальный контент ОСНОВА','original',q.examLine,1);
        const questionId=(await db.row('SELECT id FROM questions WHERE external_key=?',q.key)).id;
        for (const [position,label] of q.options.entries()) await db.run(`INSERT INTO question_options(question_id,value,label,position) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM question_options WHERE question_id=? AND position=?)`,questionId,String(position),label,position,questionId,position);
      }
    }
  }
  for (const [position,slug] of skillCatalog[s.slug].entries()) await db.run(`INSERT INTO skills(subject_id,slug,title,description,position) VALUES(?,?,?,?,?) ON CONFLICT(subject_id,slug) DO UPDATE SET title=excluded.title,position=excluded.position`,subject.id,slug,title(slug),'Навык ЕГЭ',position);
  const firstSkill=await db.row('SELECT id FROM skills WHERE subject_id=? ORDER BY position LIMIT 1',subject.id);
  await db.run(`INSERT INTO question_skills(question_id,skill_id,weight) SELECT q.id,?,1 FROM questions q WHERE q.subject_id=? ON CONFLICT(question_id,skill_id) DO NOTHING`,firstSkill.id,subject.id);
}
async function bootstrapCourse(db) {
  await db.run(`INSERT INTO content_sources(slug,title,source_type,source_version,exam_year) VALUES('osnova-original','Оригинальный контент ОСНОВА','original','1',2027) ON CONFLICT(slug) DO UPDATE SET source_version=excluded.source_version,updated_at=CURRENT_TIMESTAMP`);
  for (const name of ['biology','chemistry']) await importCourse(db,JSON.parse(readFileSync(resolve(__dirname,`../content/${name}/course.json`),'utf8')));
}
module.exports={bootstrapCourse,importCourse};
