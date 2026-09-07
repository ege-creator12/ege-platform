'use strict';
const registry=require('../content/chemistry/exam-lines');
const {blocksFor}=require('../content/chemistry/theory');
const {importCourse}=require('./bootstrap');
const VERSION='chemistry-2027-full-v1';
const groups=[
 {slug:'chemistry-foundations',title:'Теоретические основы химии',description:'Атом, периодический закон, связь, степени окисления и классификация веществ.',lines:[1,2,3,4,5]},
 {slug:'chemistry-inorganic',title:'Неорганическая химия',description:'Электролиты, свойства веществ, превращения, качественные реакции и неорганические цепочки.',lines:[6,7,8,9,24,30,31]},
 {slug:'chemistry-organic',title:'Органическая химия',description:'Номенклатура, строение, свойства классов, механизмы и органические цепочки.',lines:[10,11,12,13,14,15,16,32,33]},
 {slug:'chemistry-processes',title:'Химические реакции и закономерности',description:'Классификация реакций, скорость, ОВР, электролиз, гидролиз и равновесие.',lines:[17,18,19,20,21,22,29]},
 {slug:'chemistry-calculations',title:'Расчёты в химии',description:'Стехиометрия, растворы, термохимия, выход продукта и комплексные расчётные задачи.',lines:[23,26,27,28,34]},
 {slug:'chemistry-applied',title:'Практическая и промышленная химия',description:'Промышленные процессы, материалы, полимеры, применение веществ и безопасность.',lines:[25]}
];
function course(){return{
 subject:{slug:'chemistry',title:'Химия',description:'Полный курс подготовки к ЕГЭ-2027: теория, все 34 линии, тренировки и пробники.',icon:'flask',examYear:2027,sourceVersion:'Проект КИМ ФИПИ ЕГЭ-2027 / ОСНОВА full v1'},
 sections:groups.map(section=>({slug:section.slug,title:section.title,description:section.description,topics:section.lines.map(line=>{
   const info=registry.lines.find(x=>x.line===line);
   const num=String(line).padStart(2,'0');
   return{slug:`chemistry-line-${num}`,title:`Задание ${line}. ${info.title}`,description:info.shortDescription,examLines:[line],skills:info.skills,lesson:{slug:`chemistry-line-${num}-lesson`,title:info.title,summary:`Полная теория и алгоритм решения задания ${line} ЕГЭ по химии.`,minutes:line>=29?35:24,difficulty:line>=29?'hard':'base',contentStatus:'verified',blocks:blocksFor(line)},questions:[]};
 })}))
};}
async function ensureChemistryCourse(db){
 await db.run('CREATE TABLE IF NOT EXISTS chemistry_upgrade_state (version TEXT PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 if(await db.row('SELECT version FROM chemistry_upgrade_state WHERE version=?',VERSION))return {applied:false,version:VERSION};
 await importCourse(db,course());
 const subject=await db.row("SELECT id FROM subjects WHERE slug='chemistry'");
 if(!subject)throw new Error('Chemistry subject missing after full upgrade');
 // The old chemistry package was generic placeholder content. Retire it once so
 // students cannot receive template questions in line practice.
 await db.run("UPDATE sections SET published=FALSE WHERE subject_id=? AND slug LIKE 'chemistry-section-%'",subject.id);
 await db.run("UPDATE questions SET active=FALSE,published=FALSE WHERE subject_id=?",subject.id);
 await db.run('INSERT INTO chemistry_upgrade_state(version) VALUES(?)',VERSION);
 console.log(`Chemistry full course upgrade applied: ${VERSION}`);
 return {applied:true,version:VERSION};
}
module.exports={VERSION,groups,course,ensureChemistryCourse};