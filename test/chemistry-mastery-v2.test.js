'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const mastery=require('../content/chemistry/curriculum-mastery-v2');
const {course}=require('../src/chemistry-course-upgrade');

const sectionSlugs=['chemistry-foundations','chemistry-inorganic','chemistry-organic','chemistry-processes','chemistry-calculations','chemistry-applied'];
const required=['heading','definition','remember','table','algorithm','ege_example','deep_dive','summary','quiz'];
const textOf=value=>{
 if(value==null)return'';
 if(typeof value==='string'||typeof value==='number')return String(value);
 if(Array.isArray(value))return value.map(textOf).join(' ');
 if(typeof value==='object')return Object.values(value).map(textOf).join(' ');
 return'';
};

test('mastery curriculum expands every chemistry section with focused topics',()=>{
 assert.equal(mastery.length,6);
 assert.deepEqual(mastery.map(x=>x.slug),sectionSlugs);
 const topics=mastery.flatMap(section=>section.topics||[]);
 const lessons=topics.flatMap(topic=>topic.lessons||[]);
 assert.equal(topics.length,15,'mastery layer should add fifteen focused topics');
 assert.equal(lessons.length,45,'mastery layer should add forty-five focused lessons');
 assert.equal(new Set(topics.map(x=>x.slug)).size,15,'mastery topic slugs must be unique');
 assert.equal(new Set(lessons.map(x=>x.slug)).size,45,'mastery lesson slugs must be unique');
});

test('every mastery lesson is substantial and has the complete learning scaffold',()=>{
 const lessons=mastery.flatMap(section=>section.topics||[]).flatMap(topic=>topic.lessons||[]);
 for(const lesson of lessons){
  assert.equal(lesson.contentStatus,'verified',`${lesson.slug}: status`);
  assert(lesson.title&&lesson.summary,`${lesson.slug}: title/summary`);
  assert(Array.isArray(lesson.blocks)&&lesson.blocks.length>=12,`${lesson.slug}: blocks`);
  for(const type of required)assert(lesson.blocks.some(block=>block.type===type),`${lesson.slug}: missing ${type}`);
  const text=textOf(lesson.blocks);
  assert(text.length>=700,`${lesson.slug}: too thin (${text.length})`);
  assert(!/\b(?:undefined|NaN|null)\b/i.test(text),`${lesson.slug}: broken rendered text`);
 }
});

test('mastery curriculum is exposed in the actual student-facing course',()=>{
 const data=course();
 const richTopics=data.sections.flatMap(section=>section.topics).filter(topic=>topic.slug.startsWith('chem-v2-'));
 const richLessons=richTopics.flatMap(topic=>topic.lessons||[]);
 const masteryLessons=mastery.flatMap(section=>section.topics||[]).flatMap(topic=>topic.lessons||[]);
 const visibleSlugs=new Set(richLessons.map(x=>x.slug));
 assert.equal(richTopics.length,39,'student course should expose 39 subject topics');
 assert.equal(richLessons.length,143,'student course should expose 143 proper chemistry lessons including the final FIPI gap lesson');
 assert.equal(visibleSlugs.size,143,'student-facing lesson slugs must be unique');
 for(const lesson of masteryLessons)assert(visibleSlugs.has(lesson.slug),`${lesson.slug}: mastery lesson not exposed`);
 console.log(`chemistry-mastery metrics: topics=${richTopics.length}; lessons=${richLessons.length}; mastery=${masteryLessons.length}`);
});