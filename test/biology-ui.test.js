const {test}=require('node:test');
const assert=require('node:assert/strict');
const {render}=require('../public/lesson-renderer');
const controls=require('../public/question-controls');
const {create}=require('../public/save-queue');
const {isCorrectAnswer}=require('../src/question-answer');
const {search}=require('../src/biology-search');

test('lesson examples include the actual prompt; summaries and comparison headings remain visible',()=>{
  const example=render({type:'ege_example',content:{prompt:'Какую цепь считывает РНК-полимераза?',answer:'Матричную цепь ДНК.'}});
  assert.match(example,/Какую цепь/);assert.match(example,/<details/);assert.match(example,/Матричную цепь/);
  assert.match(render({type:'summary',content:{title:'Итоги',items:['Мейоз уменьшает плоидность','Репликация удваивает ДНК']}}),/Мейоз уменьшает плоидность/);
  assert.match(render({type:'comparison',content:{title:'Митоз и мейоз',items:[['Делений','1','2']]}}),/Митоз и мейоз/);
  assert.doesNotMatch(render({type:'text',content:{text:'<img src=x onerror=alert(1)>'}}),/<img/);
});

test('exam-style sequence input converts displayed numbers to actual stored values',()=>{
  const options=['A','B','C','D'].map((label,i)=>({label,value:String(i)}));
  assert.deepEqual(controls.orderedValues('3142',options),['2','0','3','1']);
  assert.deepEqual(controls.orderedValues('3, 1, 4, 2',options),['2','0','3','1']);
  assert.deepEqual(controls.orderedValues('0',options),['invalid']);
  const question={id:314,type:'sequence',options,prompt:'Последовательность'};
  const saved=['2','0','3','1'];
  const shown=controls.presentedOptions(question);
  const visible=saved.map(value=>shown.findIndex(option=>String(option.value)===String(value))+1).join('');
  assert.match(controls.render(question,saved,'mock'),new RegExp(`value="${visible}"`));
  assert.notEqual(visible,'3142');
  assert.doesNotMatch(controls.render(question),/type="radio"/);
});

test('matching controls present separate labels without revealing the correct pairs',()=>{
  const html=controls.render({id:315,type:'matching',prompt:'Белки и функции',contentJson:{left:['Гемоглобин','Инсулин'],right:['Перенос газов','Регуляция'],answerEncoding:'pairs'}},['0-0','1-1']);
  assert.equal((html.match(/<select/g)||[]).length,2);
  assert.match(html,/Гемоглобин/);assert.doesNotMatch(html,/Гемоглобин — Перенос/);
});

test('queued autosave retains edits made while the first request is still in flight',async()=>{
  const saved=[];let release;
  const blocked=new Promise(resolve=>release=resolve);
  const enqueue=create(async value=>{if(value.version===1)await blocked;saved.push(value)});
  const first=enqueue({version:1,answer:['A']});
  const nextValue={version:2,answer:['B']};const next=enqueue(nextValue);nextValue.answer[0]='mutated';
  let done=false;next.then(()=>done=true);await Promise.resolve();assert.equal(done,false);
  release();await Promise.all([first,next]);
  assert.deepEqual(saved,[{version:1,answer:['A']},{version:2,answer:['B']}]);
});

test('a failed save rejects its caller and the queue can retry',async()=>{
  let count=0;const save=create(async()=>{if(++count===1)throw Error('offline');return 'saved'});
  await assert.rejects(save({}),/offline/);assert.equal(await save({}),'saved');
});

test('matching position matters, multiple-choice order does not, accepted variants work',()=>{
  assert.equal(isCorrectAnswer({type:'matching',answer_json:['0','1','0']},['1','0','0']),false);
  assert.equal(isCorrectAnswer({type:'multiple',answer_json:['0','2']},['2','0']),true);
  assert.equal(isCorrectAnswer({type:'multiple',answer_json:['0','2']},['0','0','2']),false);
  assert.equal(isCorrectAnswer({type:'text',answer_json:['4 г/л; 17 мм'],acceptedVariants:['4;17']},['4; 17']),true);
  assert.equal(isCorrectAnswer({type:'text',answer_json:['мейоз']},['митоз']),false);
});

test('search covers late-course ecology and specific physiological terms',()=>{
  assert.ok(search('эвтрофикация').some(hit=>hit.lessonSlug.includes('eutrophication')));
  assert.ok(search('АДГ уменьшает объём мочи').some(hit=>/water-balance|urine|nephron/.test(hit.lessonSlug)));
  assert.deepEqual(search('почему как'),[]);
});
