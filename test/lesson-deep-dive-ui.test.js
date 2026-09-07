'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const renderer=require('../public/lesson-renderer');

const root=join(__dirname,'..');

test('deep-dive blocks render alternate body fields and never become blank cards',()=>{
  const html=renderer.render({type:'deep_dive',content:{body:'Текст углублённого разбора'}});
  assert.match(html,/Глубже ЕГЭ/);
  assert.match(html,/Текст углублённого разбора/);
  assert.equal(renderer.render({type:'deep_dive',content:{}}),'');
});

test('deep-dive theme fix is loaded and keeps text theme-aware',()=>{
  const index=readFileSync(join(root,'public/index.html'),'utf8');
  const css=readFileSync(join(root,'public/lesson-theme-fix.css'),'utf8');
  assert.match(index,/lesson-theme-fix\.css/);
  assert.match(css,/\.lesson-block\.deep_dive/);
  assert.match(css,/color:var\(--text\)/);
  assert.match(css,/\.dark \.lesson-block\.deep_dive/);
});
