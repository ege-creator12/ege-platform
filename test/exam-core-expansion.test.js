'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {expand,additions}=require('../scripts/expand-biology-exam-core');
const {refine,generic}=require('../scripts/refine-biology-worked-examples');
const course=JSON.parse(fs.readFileSync(path.join(__dirname,'../content/biology/course.json'),'utf8'));
const lessons=course.sections.flatMap(s=>s.topics.flatMap(t=>t.lessons||[t.lesson].filter(Boolean)));
const lesson=slug=>lessons.find(l=>l.slug===slug);
const corpus=slug=>JSON.stringify(lesson(slug).blocks);

test('the complete content migration is repeatable without changing bank or lesson identities',()=>{
 const input=structuredClone(course);
 const keys=lessons.map(l=>l.slug);
 const bank=JSON.stringify(input.sections.map(s=>s.topics.map(t=>t.questions)));
 const result=refine(expand(input));
 assert.deepEqual(result,course);
 assert.deepEqual(result.sections.flatMap(s=>s.topics.flatMap(t=>t.lessons||[t.lesson].filter(Boolean))).map(l=>l.slug),keys);
 assert.equal(JSON.stringify(result.sections.map(s=>s.topics.map(t=>t.questions))),bank);
 for(const [slug,blocks]of Object.entries(additions)){
  const l=lesson(slug),start=l.blocks.findIndex(b=>b.type==='heading'&&b.content.text===blocks[0].content.text);
  assert(start>=0,slug);
  assert.deepEqual(l.blocks.slice(start,start+blocks.length),blocks,slug);
  assert(start+blocks.length<=l.blocks.findIndex(b=>b.type==='summary'),slug);
 }
 assert.equal(lessons.flatMap(l=>l.blocks).filter(generic).length,0);
});

test('oriented transcription and DNA counting examples agree with their stated molecules',()=>{
 const complement={'Т':'А','А':'У','Ц':'Г','Г':'Ц'};
 assert.equal([... 'ТАЦГГААЦТ'].map(x=>complement[x]).join(''),'АУГЦЦУУГА');
 assert(corpus('bio-molecular-3-lesson-2').includes('5′-АУГ-ЦЦУ-УГА-3′'));
 const pairs={AT:240,GC:360};
 assert.equal(2*(pairs.AT+pairs.GC),1200);
 assert.equal(pairs.AT*2+pairs.GC*3,1560);
 assert(corpus('bio-molecular-3-lesson').includes('1560'));
 assert(corpus('bio-molecular-3-lesson').includes('1198'));
});

test('linked inheritance and population examples use the correct denominator',()=>{
 const expected=[(1-.18)/2,(1-.18)/2,.18/2,.18/2].map(p=>Math.round(2000*p));
 assert.deepEqual(expected,[820,820,180,180]);
 const q=Math.sqrt(.04),p=1-q;
 assert.equal(Math.round(1250*2*p*q),400);
 assert.equal((2*50+40)/(2*(50+40+10)),.7);
 const offspring=['AA','Aa','Aa','aa'].filter(x=>x!=='aa');
 assert.equal(offspring.filter(x=>x==='Aa').length/offspring.length,2/3);
 for(const [slug,answer]of [['bio-genetics-2-lesson','820'],['bio-evolution-factors','400'],['bio-genetics-2-lesson-3','2/3']])assert(corpus(slug).includes(answer));
});

test('physiology and ecology worked calculations retain units and avoid double counting',()=>{
 assert.equal(6*38+4*2,236);
 assert.equal(500+2500+1000,4000);
 assert.equal(120*90/1000,10.8);
 assert.equal((180-1.8)/180*100,99);
 assert.equal((24000-9000)*.12*.15,270);
 assert.equal(800+160-100+30-50,840);
 for(const [slug,answer]of [['bio-molecular-4-lesson-2','236'],['bio-human-ventilation','4000'],['bio-human-exercise','10,8 л/мин'],['bio-human-urine','99%'],['bio-ecology-pyramids-lesson','270'],['bio-ecology-population-data-lesson','840']])assert(corpus(slug).includes(answer));
});
