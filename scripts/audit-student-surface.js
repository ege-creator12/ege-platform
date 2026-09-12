#!/usr/bin/env node
'use strict';

const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const publicDir=path.join(root,'public');
const html=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
const errors=[];

const localRefs=[...html.matchAll(/(?:src|href)="\/([^"?]+)(?:\?[^\"]*)?"/g)].map(m=>m[1]).filter(x=>!x.startsWith('api/'));
for(const ref of localRefs){
  if(!fs.existsSync(path.join(publicDir,ref)))errors.push(`missing public asset referenced by index: /${ref}`);
}
const scripts=[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1].split('?')[0]);
const duplicates=scripts.filter((x,i,a)=>a.indexOf(x)!==i);
if(duplicates.length)errors.push(`duplicate script references: ${[...new Set(duplicates)].join(', ')}`);

for(const required of ['/student-dialogs.js','/student-runtime-hardening.js','/answer-expert.js','/subscription-access.js','/pro-student-ai-gate.js']){
  if(!scripts.includes(required))errors.push(`required student runtime missing: ${required}`);
}
if(html.includes('chemistry-finish-no-confirm.js'))errors.push('obsolete global confirm patch is still loaded');

const forbidden=/\b(?:Gemini|Cerebras|DeepSeek|OpenAI)\b|gpt-oss-\d+b/ig;
for(const name of fs.readdirSync(publicDir).filter(x=>x.endsWith('.js'))){
  const text=fs.readFileSync(path.join(publicDir,name),'utf8');
  const hits=text.match(forbidden);
  if(hits?.length)errors.push(`${name}: student-visible provider/model name found (${[...new Set(hits)].join(', ')})`);
}

const subscription=fs.readFileSync(path.join(publicDir,'subscription-access.js'),'utf8');
for(const marker of ['data-profile-pro-access','Доступ до:','без ограничения срока','AI PRO доступен']){
  if(!subscription.includes(marker))errors.push(`profile subscription marker missing: ${marker}`);
}

const hardening=fs.readFileSync(path.join(publicDir,'student-runtime-hardening.js'),'utf8');
if(!hardening.includes('variantCount'))errors.push('chemistry mock UI is not tied to server variantCount');
for(const id of ['chem-check-answer','chem-get-hint','chem-show-review']){
  if(!hardening.includes(id))errors.push(`chemistry mock integrity guard missing: ${id}`);
}

const chemistryMocks=fs.readFileSync(path.join(root,'src','chemistry-mock-exams.js'),'utf8');
if(!chemistryMocks.includes("code:'MOCK_HELP_DISABLED'"))errors.push('chemistry mock help is not blocked server-side');
if(!chemistryMocks.includes("Во время пробника подсказки и разбор недоступны"))errors.push('chemistry mock help block has no student-safe message');

const answerExpert=fs.readFileSync(path.join(publicDir,'answer-expert.js'),'utf8');
if(/\.provider\b|\.model\b|provider\s*:|model\s*:/i.test(answerExpert))errors.push('answer expert exposes provider/model metadata in student runtime');

const gateway=fs.readFileSync(path.join(root,'server-performance.js'),'utf8');
for(const marker of ['requireProForAi','sanitizeAiPayload','providerName','ОСНОВА AI']){
  if(!gateway.includes(marker))errors.push(`student AI gateway protection missing: ${marker}`);
}

if(errors.length){
  console.error(`STUDENT SURFACE AUDIT FAILED (${errors.length})`);
  errors.forEach(x=>console.error('ERROR',x));
  process.exit(1);
}
console.log(`STUDENT SURFACE AUDIT PASSED: ${localRefs.length} local assets checked, provider/model branding hidden, PRO profile and mock integrity guards present on client and server.`);
