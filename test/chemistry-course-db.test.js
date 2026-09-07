'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');

const dir=mkdtempSync(join(tmpdir(),'ege-chemistry-v2-'));
process.env.DATABASE_PATH=join(dir,'course.sqlite');
delete process.env.DATABASE_URL;

const db=require('../src/db');
const {ensureChemistryCourse,VERSION}=require('../src/chemistry-course-upgrade');

test('chemistry v2 imports all 143 visible lessons and stays idempotent',async()=>{
 try{
  await db.migrate();
  const first=await ensureChemistryCourse(db);
  assert.equal(first.version,VERSION);
  const subject=await db.row("SELECT id FROM subjects WHERE slug='chemistry'");
  assert(subject?.id,'chemistry subject must exist');
  const visibleTopics=await db.row(`SELECT COUNT(*) n FROM topics t JOIN sections s ON s.id=t.section_id WHERE t.subject_id=? AND t.published=1 AND s.published=1 AND t.slug LIKE 'chem-v2-%'`,subject.id);
  const visibleLessons=await db.row(`SELECT COUNT(*) n FROM lessons l JOIN topics t ON t.id=l.topic_id JOIN sections s ON s.id=t.section_id WHERE t.subject_id=? AND t.published=1 AND s.published=1 AND l.published=1 AND t.slug LIKE 'chem-v2-%'`,subject.id);
  assert.equal(Number(visibleTopics.n),39,'database must expose all 39 chemistry theory topics');
  assert.equal(Number(visibleLessons.n),143,'database must expose all 143 chemistry theory lessons');
  const gap=await db.row("SELECT l.id FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE t.subject_id=? AND l.slug='chem-v2-fipi-19-electrolytes' AND l.published=1 AND t.published=1",subject.id);
  assert(gap?.id,'FIPI 1.9 lesson must be imported and visible');
  for(let line=1;line<=34;line++){
   const slug=`chemistry-line-${String(line).padStart(2,'0')}`;
   const hidden=await db.row('SELECT published FROM topics WHERE subject_id=? AND slug=?',subject.id,slug);
   assert(hidden,'legacy line topic must remain as a bank anchor');
   assert.equal(Number(hidden.published),0,`line ${line}: legacy topic must stay hidden`);
  }
  const second=await ensureChemistryCourse(db);
  assert.equal(second.applied,false,'second upgrade run must be idempotent');
  const after=await db.row(`SELECT COUNT(*) n FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE t.subject_id=? AND t.published=1 AND l.published=1 AND t.slug LIKE 'chem-v2-%'`,subject.id);
  assert.equal(Number(after.n),143,'idempotent rerun must not duplicate lessons');
 }finally{
  await db.close();
  rmSync(dir,{recursive:true,force:true});
 }
});