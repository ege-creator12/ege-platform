'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const createStudyData = require('../public/study-data');
const origin = 'https://example.test';
const biology = '/api/subjects/biology/exam-lines';
const chemistry = '/api/subjects/chemistry/exam-lines';
const response = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(data),
  json: async () => data,
});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve=done; }); return {promise,resolve}; };

test('concurrent widgets share one read per subject and receive independent data', async () => {
  const wait = deferred();
  let calls = 0;
  const data = createStudyData({origin,fetch:async()=>{calls++;await wait.promise;return response({lines:[{progress:0}]});}});
  const first = data.request(biology);
  const second = data.request(biology);
  const third = data.request(chemistry);
  assert.equal(calls,2);
  wait.resolve();
  const [a,b] = await Promise.all([first,second,third]);
  a.lines[0].progress=99;
  assert.equal(b.lines[0].progress,0);
  assert.equal((await data.request(biology)).lines[0].progress,0);
  assert.equal(calls,2);
});

test('plan widgets share exactly two reads and cached values expire', async () => {
  let time=0,calls=0;
  const data=createStudyData({origin,now:()=>time,fetch:async()=>response({version:++calls})});
  await Promise.all(Array.from({length:3},()=>['biology','chemistry'].map(slug=>data.request('/api/ai-pro/plan?subject='+slug))).flat());
  assert.equal(calls,2);
  time=30001;
  await data.request('/api/ai-pro/plan?subject=biology');
  assert.equal(calls,3);
});

test('account changes and writes cannot repopulate the cache with an older pending response', async () => {
  const wait=deferred();let calls=0;
  const data=createStudyData({origin,fetch:async(path,options)=>{
    if(options.method==='POST')return response({ok:true});
    const version=++calls;
    if(version===1)await wait.promise;
    return response({user:version});
  }});
  const beforeLogout=data.request('/api/me');
  await data.request('/api/logout',{method:'POST'});
  assert.deepEqual(await data.request('/api/me'),{user:2});
  wait.resolve();await beforeLogout;
  assert.deepEqual(await data.request('/api/me'),{user:2});
  assert.equal(calls,2);
  data.invalidate();
  assert.deepEqual(await data.request('/api/me'),{user:3});
});

test('transient errors are retried and a failed biology request does not block chemistry', async () => {
  const wait=deferred();let biologyCalls=0;
  const data=createStudyData({origin,fetch:async path=>{
    if(path===biology&&++biologyCalls===1){await wait.promise;return response({error:'offline'},503);}
    return response({subject:path===biology?'biology':'chemistry'});
  }});
  const bio=data.request(biology);
  assert.deepEqual(await data.request(chemistry),{subject:'chemistry'});
  wait.resolve();
  assert.deepEqual(await bio,{subject:'biology'});
  assert.equal(biologyCalls,2);
  assert.deepEqual(await data.request(biology),{subject:'biology'});
  assert.equal(biologyCalls,2);
});

test('explicit credentials, abortable reads and unlisted routes are never shared', async () => {
  let calls=0;
  const data=createStudyData({origin,fetch:async()=>response({call:++calls})});
  for(const options of [{credentials:'omit'},{headers:{Authorization:'example'}},{signal:new AbortController().signal}]) {
    const before=calls;
    await Promise.all([data.request(biology,options),data.request(biology,options)]);
    assert.equal(calls-before,2);
  }
  const before=calls;
  await Promise.all([data.request('/api/training/sessions/1'),data.request('/api/training/sessions/1')]);
  assert.equal(calls-before,2);
});
