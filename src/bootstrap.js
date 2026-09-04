const { row, run, db } = require('./db');
const { sections } = require('./course-data');

function upsertTopic(subjectId, parentId, slug, title, description, theory, position, kind, depth, content = {}) {
  run(`INSERT INTO topics(subject_id,parent_id,slug,title,description,theory,position,kind,depth,content_json)
       VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(subject_id,slug) DO UPDATE SET
       parent_id=excluded.parent_id,title=excluded.title,description=excluded.description,position=excluded.position,
       kind=excluded.kind,depth=excluded.depth`, subjectId,parentId,slug,title,description,theory,position,kind,depth,JSON.stringify(content));
  return row('SELECT id FROM topics WHERE subject_id=? AND slug=?', subjectId, slug).id;
}

function ensureBaseData() {
  db.exec('BEGIN IMMEDIATE');
  try {
    run(`INSERT INTO subjects(slug,title,description,icon) VALUES(?,?,?,?)
         ON CONFLICT(slug) DO UPDATE SET title=excluded.title,description=excluded.description`,
      'biology','Биология','Системная подготовка по всем линиям ЕГЭ','dna');
    const subjectId = row('SELECT id FROM subjects WHERE slug=?','biology').id;
    sections.forEach(([sectionSlug,sectionTitle,sectionDescription,topics],sectionPosition) => {
      const sectionId=upsertTopic(subjectId,null,sectionSlug,sectionTitle,sectionDescription,
        `${sectionDescription}. Материал разделён на последовательные темы, подтемы и уроки.`,sectionPosition,'section',0);
      topics.forEach(([topicSlug,topicTitle,lessons],topicPosition) => {
        const topicId=upsertTopic(subjectId,sectionId,`${sectionSlug}-${topicSlug}`,topicTitle,
          `Ключевые понятия и задания по теме «${topicTitle}».`,'',topicPosition,'topic',1);
        const subtopicId=upsertTopic(subjectId,topicId,`${sectionSlug}-${topicSlug}-core`,`Основы: ${topicTitle}`,
          'Системное изучение основных процессов, терминов и закономерностей.','',0,'subtopic',2);
        lessons.forEach((lessonTitle,lessonPosition) => upsertTopic(subjectId,subtopicId,
          `${sectionSlug}-${topicSlug}-lesson-${lessonPosition+1}`,lessonTitle,
          `Урок по теме «${lessonTitle}» с теорией, примерами и контролем освоения.`,
          `В уроке последовательно раскрываются ключевые понятия темы «${lessonTitle}».`,lessonPosition,'lesson',3,
          {definitions:[],tables:[],illustrations:[],remember:[],examTraps:[],workedExamples:[],masteryCheck:{enabled:true}}));
      });
    });
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

module.exports = { ensureBaseData };
