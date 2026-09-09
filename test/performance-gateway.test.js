'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const source=readFileSync(join(__dirname,'..','server-performance.js'),'utf8');
const product=readFileSync(join(__dirname,'..','server-product.js'),'utf8');
const entry=readFileSync(join(__dirname,'..','server-entry.js'),'utf8');

test('performance gateway parses and sits before the product and existing server chain',()=>{
 assert.doesNotThrow(()=>new Function(source));
 assert.doesNotThrow(()=>new Function(product));
 assert.match(entry,/require\('\.\/server-performance'\)/);
 assert.match(source,/server-product\.js/);
 assert.match(product,/server-biology-lines\.js/);
});

test('topics fast path avoids recursive whole-tree aggregation',()=>{
 const start=source.indexOf('async function fastTopics');
 const end=source.indexOf('async function handleFastApi');
 assert.ok(start>=0&&end>start);
 const body=source.slice(start,end);
 assert.match(body,/FROM topics t/);
 assert.match(body,/LEFT JOIN topic_progress/);
 assert.match(body,/GROUP BY topic_id/);
 assert.doesNotMatch(body,/WITH RECURSIVE/);
 assert.doesNotMatch(body,/JOIN descendants/);
});

test('static assets get long cache only when their URL is versioned',()=>{
 assert.match(source,/url\.searchParams\.has\('v'\)/);
 assert.match(source,/max-age=31536000, immutable/);
 assert.match(source,/max-age=600, stale-while-revalidate=86400/);
 assert.match(source,/etag/);
});
