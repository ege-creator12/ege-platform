'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const renderer=require('../public/lesson-renderer');

test('deep-dive lesson cards render readable authored content from supported fields',()=>{
 const fromText=renderer.render({type:'deep_dive',content:{title:'Почему это работает',text:'Электронная плотность перераспределяется по системе.'}});
 assert.match(fromText,/Глубже ЕГЭ/);
 assert.match(fromText,/Почему это работает/);
 assert.match(fromText,/Электронная плотность/);

 const fromBody=renderer.render({type:'deep_dive',content:{body:'Текст, сохранённый редактором в поле body.'}});
 assert.match(fromBody,/Текст, сохранённый редактором/);

 const fromItems=renderer.render({type:'deep_dive',content:{items:['Первый вывод','Второй вывод']}});
 assert.match(fromItems,/Первый вывод/);
 assert.match(fromItems,/Второй вывод/);
});

test('renderer does not create an empty deep-dive card',()=>{
 assert.equal(renderer.render({type:'deep_dive',content:{}}),'');
 assert.equal(renderer.render({type:'deep_dive',content_json:'{}'}),'');
});

test('renderer safely ignores invalid JSON lesson blocks',()=>{
 assert.equal(renderer.render({type:'deep_dive',content_json:'{broken'}),'');
});
