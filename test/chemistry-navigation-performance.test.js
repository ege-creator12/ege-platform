'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const root=join(__dirname,'..');

test('chemistry home does not preload the expensive 34-line progress endpoint',()=>{
 const source=readFileSync(join(root,'public/chemistry-home-hotfix.js'),'utf8');
 assert.match(source,/api\('\/subjects\/chemistry'\)/);
 assert.doesNotMatch(source,/subjects\/chemistry\/exam-lines/);
});

test('chemistry line list uses bulk statistics instead of 34 detailed payloads',()=>{
 const source=readFileSync(join(root,'server-chemistry.js'),'utf8');
 assert.match(source,/async function chemistryLinesPayload/);
 assert.match(source,/GROUP BY exam_line/);
 assert.match(source,/GROUP BY q\.exam_line/);
 assert.doesNotMatch(source,/for\s*\(const info of registry\.lines\)\s*\{\s*const p=await chemistryLinePayload/);
});
