'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const optimizer = resolve(__dirname, '..', 'server-ai-quota-optimizer.js');

function runSnippet(source) {
  const result = spawnSync(process.execPath, ['-e', source], {
    encoding: 'utf8',
    env: { ...process.env, OPTIMIZER_PATH: optimizer },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

test('parses straightforward teacher commands without external Gemini call', () => {
  const result = runSnippet(`
    let external = 0;
    global.fetch = async () => { external += 1; throw new Error('should not call upstream'); };
    require(process.env.OPTIMIZER_PATH);
    (async () => {
      const prompt = 'Ты разбираешь короткую команду учителя для платформы подготовки к ЕГЭ.\\nКоманда учителя: Дай по биологии линию 4, 12 заданий';
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/x:generateContent', { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) });
      const data = await response.json();
      console.log(JSON.stringify({ external, text: data.candidates[0].content.parts[0].text }));
    })().catch(error => { console.error(error); process.exit(1); });
  `);
  assert.equal(result.external, 0);
  assert.deepEqual(JSON.parse(result.text), { subject: 'biology', examLine: 4, count: 12, dueDate: null, title: '' });
});

test('reuses one Gemini review bundle for multiple review actions', () => {
  const result = runSnippet(`
    let external = 0;
    global.fetch = async () => {
      external += 1;
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"full":"FULL","hint":"HINT","simplify":"SIMPLE","why_wrong":"WRONG","similar":"SIMILAR","harder":"HARDER"}' }] } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    require(process.env.OPTIMIZER_PATH);
    const context = 'Предмет: Биология\\nТема: Клетка\\nЗадание: X\\nОтвет ученика: A\\nОфициальный ответ: B';
    const makePrompt = mode => 'Ты — встроенный персональный репетитор платформы ОСНОВА для подготовки к ЕГЭ по биологии и химии.\\nРЕЖИМ: ' + mode + '\\nИНСТРУКЦИЯ: x\\n\\nКОНТЕКСТ ЗАДАНИЯ:\\n' + context;
    const call = async mode => {
      const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/x:generateContent', { method: 'POST', body: JSON.stringify({ contents: [{ parts: [{ text: makePrompt(mode) }] }], generationConfig: { maxOutputTokens: 100 } }) });
      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    };
    (async () => console.log(JSON.stringify({ first: await call('Полный разбор'), second: await call('Подсказка'), external })))().catch(error => { console.error(error); process.exit(1); });
  `);
  assert.equal(result.first, 'FULL');
  assert.equal(result.second, 'HINT');
  assert.equal(result.external, 1);
});
