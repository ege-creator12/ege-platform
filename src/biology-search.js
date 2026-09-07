'use strict';
const course=require('../content/biology/course.json');
const stop=new Set('как что где когда почему какой какая какие это для при или если из на по в к от до и а но ли же чем его её их быть является значит можно нужно после перед между про у с со не'.split(' '));
const normalize=s=>String(s||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
const words=s=>normalize(s).match(/[a-zа-я0-9]+/g)||[];
const stem=w=>w.length>7?w.slice(0,-3):w.length>5?w.slice(0,-2):w;
const visible=value=>typeof value==='string'?value:Array.isArray(value)?value.map(visible).join(' '):'';
function makeIndex(data){
  const entries=[];
  for(const section of data.sections)for(const topic of section.topics)for(const lesson of topic.lessons||[topic.lesson].filter(Boolean)){
    for(const block of lesson.blocks){
      if(['heading','diagram','image'].includes(block.type))continue;
      const c=block.content;
      const text=['title','text','prompt','question','answer','columns','rows','items'].map(k=>visible(c[k])).filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
      if(text.length<35)continue;
      entries.push({lessonSlug:lesson.slug,title:lesson.title,topic:topic.title,text,normalized:normalize(text),titleWords:new Set(words(lesson.title).map(stem))});
    }
  }
  return entries;
}
const index=makeIndex(course);
function search(query,entries=index){
  const terms=[...new Set(words(query).filter(w=>w.length>1&&!stop.has(w)).map(stem))];
  if(!terms.length)return [];
  const phrase=normalize(query).trim();
  return entries.map(item=>{
    const found=terms.filter(term=>item.normalized.includes(term));
    const score=found.length*5+terms.filter(t=>item.titleWords.has(t)).length*2+(item.normalized.includes(phrase)?12:0);
    return {...item,score,found:found.length};
  }).filter(x=>x.found>0).sort((a,b)=>b.found-a.found||b.score-a.score).slice(0,10).map(item=>{
    const first=Math.min(...terms.map(t=>item.normalized.indexOf(t)).filter(n=>n>=0));
    const start=item.text.length>1100?Math.max(0,first-150):0;
    return {lessonSlug:item.lessonSlug,title:item.title,topic:item.topic,text:(start?'…':'')+item.text.slice(start,start+1100)+(item.text.length>start+1100?'…':''),score:item.score};
  });
}
module.exports={search,makeIndex};
