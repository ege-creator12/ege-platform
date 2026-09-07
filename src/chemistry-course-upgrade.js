'use strict';
const registry=require('../content/chemistry/exam-lines');
const {blocksFor}=require('../content/chemistry/theory');
const curriculum=require('../content/chemistry/curriculum-v2');
const organic=require('../content/chemistry/curriculum-organic-v2');
const {importCourse}=require('./bootstrap');

const VERSION='chemistry-2027-subject-course-v2-foundations-inorganic-organic';
const groups=[
 {slug:'chemistry-foundations',title:'Теоретические основы химии',description:'Строение вещества и атома, периодический закон, связь, химический язык и количество вещества.',lines:[1,2,3,4,5]},
 {slug:'chemistry-inorganic',title:'Неорганическая химия',description:'Классы веществ, электролиты, металлы, неметаллы, качественные реакции и цепочки.',lines:[6,7,8,9,24,30,31]},
 {slug:'chemistry-organic',title:'Органическая химия',description:'Полный блок ФИПИ 3.1–3.20: строение, свойства классов, механизмы, идентификация и органические цепочки.',lines:[10,11,12,13,14,15,16,32,33]},
 {slug:'chemistry-processes',title:'Химические реакции и закономерности',description:'Классификация реакций, скорость, ОВР, электролиз, гидролиз и равновесие.',lines:[17,18,19,20,21,22,29]},
 {slug:'chemistry-calculations',title:'Расчёты в химии',description:'Стехиометрия, растворы, термохимия, выход продукта и комплексные расчётные задачи.',lines:[23,26,27,28,34]},
 {slug:'chemistry-applied',title:'Практическая и промышленная химия',description:'Промышленные процессы, материалы, полимеры, применение веществ и безопасность.',lines:[25]}
];

function legacyLineTopic(line){
 const info=registry.lines.find(x=>x.line===line);
 const num=String(line).padStart(2,'0');
 return {
  slug:`chemistry-line-${num}`,
  title:`Задание ${line}. ${info.title}`,
  description:info.shortDescription,
  examLines:[line],skills:info.skills,
  lesson:{slug:`chemistry-line-${num}-lesson`,title:info.title,summary:`Теория и алгоритм решения задания ${line} ЕГЭ по химии.`,minutes:line>=29?35:24,difficulty:line>=29?'hard':'base',contentStatus:'verified',blocks:blocksFor(line)},
  questions:[]
 };
}

function course(){
 const expanded=new Map([...curriculum.sections,organic].map(section=>[section.slug,section]));
 return {
  subject:{
   slug:'chemistry',title:'Химия',
   description:'Полный курс химии для ЕГЭ: теория по предмету с нуля, связи с 34 линиями экзамена, тренировки и пробники.',
   icon:'flask',examYear:2027,
   sourceVersion:'Проект КИМ ФИПИ ЕГЭ-2027 + Навигатор самостоятельной подготовки ФИПИ / ОСНОВА chemistry v2'
  },
  sections:groups.map(section=>{
   const rich=expanded.get(section.slug);
   const lineTopics=section.lines.map(legacyLineTopic);
   return {slug:section.slug,title:rich?.title||section.title,description:rich?.description||section.description,topics:[...(rich?.topics||[]),...lineTopics]};
  })
 };
}

async function ensureChemistryCourse(db){
 await db.run('CREATE TABLE IF NOT EXISTS chemistry_upgrade_state (version TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 if(await db.row('SELECT version FROM chemistry_upgrade_state WHERE version=?',VERSION))return {applied:false,version:VERSION};
 await importCourse(db,course());
 const subject=await db.row("SELECT id FROM subjects WHERE slug='chemistry'");
 if(!subject)throw new Error('Chemistry subject missing after v2 upgrade');
 await db.run("UPDATE sections SET published=FALSE WHERE subject_id=? AND slug LIKE 'chemistry-section-%'",subject.id);

 // Rebuilt sections use subject-based topics in normal navigation/search. Stable
 // line lessons stay published behind hidden topics because generated practice and
 // old progress records refer to those lesson slugs.
 const replacedLines=[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,24,30,31,32,33];
 for(const line of replacedLines){
  const slug=`chemistry-line-${String(line).padStart(2,'0')}`;
  await db.run('UPDATE topics SET published=FALSE WHERE subject_id=? AND slug=?',subject.id,slug);
 }

 await db.run('INSERT INTO chemistry_upgrade_state(version) VALUES(?)',VERSION);
 console.log(`Chemistry subject-course upgrade applied: ${VERSION}`);
 return {applied:true,version:VERSION};
}

module.exports={VERSION,groups,course,ensureChemistryCourse};
