'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const base=require('../content/chemistry/curriculum-v2');
const organic=require('../content/chemistry/curriculum-organic-v2');
const tail=require('../content/chemistry/curriculum-processes-calcs-v2');
const depth=require('../content/chemistry/curriculum-depth-v2');
const {course}=require('../src/chemistry-course-upgrade');

const allSourceSections=[...base.sections,organic,...tail];
const sourceTopics=allSourceSections.flatMap(section=>section.topics||[]);
const sourceTopicSlugs=new Set(sourceTopics.map(topic=>topic.slug));
const depthLessons=Object.values(depth).flat();
const required=['heading','definition','remember','table','algorithm','ege_example','deep_dive','summary','quiz'];
const collectText=value=>{
 if(value==null)return'';
 if(typeof value==='string'||typeof value==='number')return String(value);
 if(Array.isArray(value))return value.map(collectText).join(' ');
 if(typeof value==='object')return Object.values(value).map(collectText).join(' ');
 return'';
};

test('every chemistry depth pack targets a real curriculum topic',()=>{
 assert(depth&&typeof depth==='object');
 assert(Object.keys(depth).length>=6,'depth layer should enrich multiple curriculum areas');
 for(const topicSlug of Object.keys(depth))assert(sourceTopicSlugs.has(topicSlug),`unknown depth target: ${topicSlug}`);
});

test('depth pack adds substantial verified lessons with full learning scaffold',()=>{
 assert(depthLessons.length>=15,`expected at least 15 depth lessons, got ${depthLessons.length}`);
 assert.equal(new Set(depthLessons.map(x=>x.slug)).size,depthLessons.length,'depth lesson slugs must be unique');
 for(const lesson of depthLessons){
  assert.equal(lesson.contentStatus,'verified',`${lesson.slug}: status`);
  assert(lesson.title&&lesson.summary,`${lesson.slug}: title/summary`);
  assert(Array.isArray(lesson.blocks)&&lesson.blocks.length>=12,`${lesson.slug}: blocks`);
  for(const type of required)assert(lesson.blocks.some(block=>block.type===type),`${lesson.slug}: missing ${type}`);
  const text=collectText(lesson.blocks);
  assert(text.length>=700,`${lesson.slug}: too thin (${text.length})`);
  assert(!/\b(?:undefined|NaN|null)\b/i.test(text),`${lesson.slug}: broken content`);
 }
});

test('depth lessons are actually integrated into the student-facing chemistry course',()=>{
 const data=course();
 const richTopics=data.sections.flatMap(section=>section.topics).filter(topic=>topic.slug.startsWith('chem-v2-'));
 const richLessons=richTopics.flatMap(topic=>topic.lessons||[]);
 const slugs=new Set(richLessons.map(lesson=>lesson.slug));
 for(const lesson of depthLessons)assert(slugs.has(lesson.slug),`${lesson.slug}: depth lesson is not exposed by course()`);
 assert.equal(new Set(richLessons.map(x=>x.slug)).size,richLessons.length,'all student-facing rich lesson slugs must stay unique');
 assert(richLessons.length>=88,`expected at least 88 subject lessons after depth integration, got ${richLessons.length}`);
 console.log(`chemistry-v2 metrics: topics=${richTopics.length}; lessons=${richLessons.length}; depth=${depthLessons.length}`);
});