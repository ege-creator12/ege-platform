'use strict';

const THEORY_TYPES=new Set([
  'heading','text','definition','remember','table','comparison','example',
  'algorithm','exam_trap','image','diagram','experiment','ege_example',
  'deep_dive','summary'
]);

const number=value=>Number(value||0);

async function lineTheorySections(db,lessons){
  const ordered=[];
  const seen=new Set();
  for(const lesson of lessons||[]){
    const id=number(lesson?.id);
    if(!id||seen.has(id))continue;
    seen.add(id);
    ordered.push(lesson);
  }
  if(!ordered.length)return[];

  const ids=ordered.map(lesson=>number(lesson.id));
  const rows=await db.rows(
    `SELECT lesson_id,type,content_json,position
     FROM lesson_blocks
     WHERE lesson_id IN (${ids.map(()=>'?').join(',')})
     ORDER BY lesson_id,position`,
    ...ids
  );

  const byLesson=new Map();
  for(const block of rows||[]){
    if(!THEORY_TYPES.has(String(block.type||'')))continue;
    const id=number(block.lesson_id);
    const bucket=byLesson.get(id)||[];
    bucket.push({
      type:block.type,
      content_json:block.content_json,
      position:number(block.position)
    });
    byLesson.set(id,bucket);
  }

  return ordered.map(lesson=>{
    const id=number(lesson.id);
    const blocks=byLesson.get(id)||[];
    return {
      lessonId:id,
      lessonSlug:lesson.slug,
      title:lesson.title,
      topicTitle:lesson.topic_title,
      sectionTitle:lesson.section_title,
      progress:number(lesson.progress),
      progressStatus:lesson.progress_status||'not_started',
      totalBlocks:blocks.length,
      blocks
    };
  }).filter(section=>section.blocks.length);
}

module.exports={THEORY_TYPES,lineTheorySections};
