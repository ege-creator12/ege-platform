'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const root=join(__dirname,'..');

test('production page loads only the stable chemistry UI',()=>{
 const html=readFileSync(join(root,'public/index.html'),'utf8');
 assert.match(html,/chemistry-stable\.js/);
 assert.doesNotMatch(html,/chemistry-upgrades\.js/);
 assert.doesNotMatch(html,/chemistry-home-hotfix\.js/);
});

test('stable chemistry UI cannot create a mutation observer render loop',()=>{
 const source=readFileSync(join(root,'public/chemistry-stable.js'),'utf8');
 assert.doesNotMatch(source,/MutationObserver/);
 assert.match(source,/label\.textContent!==['"]Поиск по химии['"]/);
 assert.match(source,/chemApi\('\/subjects\/chemistry'\)/);
});

test('chemistry home does not preload the expensive 34-line progress endpoint',()=>{
 const source=readFileSync(join(root,'public/chemistry-stable.js'),'utf8');
 const subjectStart=source.indexOf("subject=async function(slug)");
 const linesStart=source.indexOf('async function chemistryLines');
 const homeSource=source.slice(subjectStart,linesStart);
 assert.match(homeSource,/chemApi\('\/subjects\/chemistry'\)/);
 assert.doesNotMatch(homeSource,/subjects\/chemistry\/exam-lines/);
});

test('chemistry line list uses bulk statistics instead of 34 detailed payloads',()=>{
 const source=readFileSync(join(root,'server-chemistry.js'),'utf8');
 assert.match(source,/async function chemistryLinesPayload/);
 assert.match(source,/GROUP BY exam_line/);
 assert.match(source,/GROUP BY q\.exam_line/);
 assert.doesNotMatch(source,/for\s*\(const info of registry\.lines\)\s*\{\s*const p=await chemistryLinePayload/);
});
