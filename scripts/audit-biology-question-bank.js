#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const coursePath = path.join(root, 'content/biology/course.json');
const course = JSON.parse(fs.readFileSync(coursePath, 'utf8'));
const allowedTypes = new Set(['single_choice', 'multiple_answer', 'matching', 'sequence', 'table', 'image', 'diagram', 'graph', 'experiment', 'short_answer', 'extended_answer', 'biological_process_analysis', 'text_analysis', 'calculation', 'genetics_problem']);
const requiredMechanics = new Set(['multiple_answer', 'matching', 'sequence', 'table', 'image', 'graph', 'experiment', 'short_answer', 'extended_answer', 'biological_process_analysis', 'text_analysis', 'calculation', 'genetics_problem']);
const failures = [];
const warnings = [];
const rows = [];
const ids = new Map();
const prompts = new Map();
const explanations = new Map();
const lessonSlugs = new Set();
const topicSlugs = new Set();
const validLines = new Set(Array.from({ length: 28 }, (_, index) => index + 1));

for (const section of course.sections) {
  for (const topic of section.topics) {
    topicSlugs.add(topic.slug);
    if (topic.lesson?.slug) lessonSlugs.add(topic.lesson.slug);
    for (const lesson of topic.lessons || []) if (lesson.slug) lessonSlugs.add(lesson.slug);
  }
}

function add(map, key, id) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(id);
}
function present(value) {
  return Array.isArray(value) ? value.length > 0 : typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
}
function resolveMedia(reference) {
  if (!reference) return null;
  const clean = reference.replace(/^\//, '');
  return path.join(root, clean.startsWith('images/') ? 'public' : '', clean);
}

for (const section of course.sections) {
  for (const topic of section.topics) {
    for (const question of topic.questions || []) {
      const id = question.key;
      rows.push({ section: section.slug, topic: topic.slug, ...question });
      if (!present(id)) failures.push(`question without key in ${topic.slug}`);
      else add(ids, id, topic.slug);
      if (!allowedTypes.has(question.type)) failures.push(`${id}: invalid type ${question.type}`);
      if (![1, 2, 3].includes(question.difficulty)) failures.push(`${id}: invalid difficulty ${question.difficulty}`);
      if (!present(question.prompt)) failures.push(`${id}: empty prompt`);
      if (!present(question.answer)) failures.push(`${id}: empty answer`);
      if (!present(question.explanation)) failures.push(`${id}: empty explanation`);
      if (!validLines.has(question.examLine)) failures.push(`${id}: invalid exam line ${question.examLine}`);
      if (question.lessonSlug && !lessonSlugs.has(question.lessonSlug)) failures.push(`${id}: missing lesson ${question.lessonSlug}`);
      if (question.lessonSlug && topic.lesson?.slug && question.lessonSlug !== topic.lesson.slug) failures.push(`${id}: cross-topic lesson ref`);
      if (present(question.prompt)) add(prompts, question.prompt.trim().toLowerCase().replace(/\s+/g, ' '), id);
      if (present(question.explanation)) add(explanations, question.explanation.trim().toLowerCase().replace(/\s+/g, ' '), id);
      if (question.type === 'extended_answer') {
        if (!Array.isArray(question.scoringPoints) || question.scoringPoints.length < 2) failures.push(`${id}: extended answer lacks scoringPoints`);
        if (!Array.isArray(question.commonMistakes) || question.commonMistakes.length === 0) failures.push(`${id}: extended answer lacks commonMistakes`);
      }
      if (question.image) {
        const file = resolveMedia(question.image);
        if (!file || !fs.existsSync(file)) failures.push(`${id}: broken media ${question.image}`);
        else if (path.extname(file) === '.svg') {
          const svg = fs.readFileSync(file, 'utf8');
          for (const token of ['<svg', 'viewBox=', '<title', '<desc']) if (!svg.includes(token)) failures.push(`${id}: SVG lacks ${token}: ${question.image}`);
        }
      }
      const userText = [question.prompt, question.explanation, ...(question.options || [])].join(' ');
      if (/\b(?:TODO|placeholder|EGE_REQUIRED|qualityBasis|verified)\b/i.test(userText) || /здесь будет вопрос|схема временно недоступна/i.test(userText)) failures.push(`${id}: editor marker in user content`);
    }
  }
}

for (const [id, refs] of ids) if (refs.length > 1) failures.push(`duplicate key ${id}: ${refs.join(', ')}`);
for (const [prompt, refs] of prompts) if (refs.length > 1) failures.push(`exact duplicate prompt (${refs.join(', ')}): ${prompt.slice(0, 80)}`);
for (const [explanation, refs] of explanations) if (refs.length > 1) failures.push(`exact duplicate explanation (${refs.join(', ')}): ${explanation.slice(0, 80)}`);
for (const mechanic of requiredMechanics) if (rows.filter((q) => q.type === mechanic).length < 2) failures.push(`insufficient coverage: ${mechanic}`);
for (const section of course.sections.filter((item) => item.slug !== 'biology-exam-practice')) {
  const sectionRows = rows.filter((q) => q.section === section.slug);
  if (!sectionRows.some((q) => q.difficulty === 3)) failures.push(`${section.slug}: no hard practice`);
  if (!sectionRows.some((q) => q.type === 'extended_answer')) failures.push(`${section.slug}: no extended answer`);
}

console.log(`Biology question bank: ${rows.length} questions; ${ids.size} unique keys; ${validLines.size} referenced codifier lines.`);
console.log(`Warnings: ${warnings.length}`);
for (const warning of warnings.slice(0, 12)) console.warn(`WARN ${warning}`);
if (warnings.length > 12) console.warn(`WARN ... ${warnings.length - 12} more warnings`);
if (failures.length) {
  for (const failure of failures) console.error(`ERROR ${failure}`);
  console.error(`Audit failed with ${failures.length} critical issue(s).`);
  process.exitCode = 1;
} else {
  console.log('Audit passed: structural, reference, media, metadata and coverage invariants hold.');
}
