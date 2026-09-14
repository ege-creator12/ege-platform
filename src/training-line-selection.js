'use strict';

const COSMETIC_PREFIXES = [
  'Проанализируйте условие в экзаменационном формате.',
  'Выполните ещё один вариант этого типа.',
  'По новой серии измерений:',
];
const TRANSIENT_CONTENT_KEYS = new Set([
  'variant',
  'strictFipi2027',
  'strictExamLine',
  'strictBankVersion',
]);

const normalizeText = value => String(value ?? '')
  .toLocaleLowerCase('ru-RU')
  .replace(/\s+/g, ' ')
  .trim();

function withoutCosmeticPrefix(value) {
  let text = String(value ?? '').trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of COSMETIC_PREFIXES) {
      if (text.toLocaleLowerCase('ru-RU').startsWith(prefix.toLocaleLowerCase('ru-RU'))) {
        text = text.slice(prefix.length).trim();
        changed = true;
      }
    }
  }
  return text;
}

function safeJson(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return null; }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter(key => !TRANSIENT_CONTENT_KEYS.has(key))
      .sort()
      .map(key => [key, canonicalize(value[key])]),
  );
}

function canonicalJson(value) {
  const parsed = safeJson(value);
  if (parsed == null) return normalizeText(value);
  return JSON.stringify(canonicalize(parsed));
}

function semanticFamily(candidate) {
  return [
    normalizeText(withoutCosmeticPrefix(candidate.prompt)),
    canonicalJson(candidate.content_json),
    canonicalJson(candidate.answer_json),
    String(candidate.image_url || ''),
  ].join('|');
}

function learningPriority(candidate, mode, now = Date.now()) {
  if (!['adaptive', 'mixed', 'infinite', 'topic', 'hard'].includes(mode)) return 0;
  if (candidate.attempt_id && !isCorrect(candidate.correct)) return 0;
  if (candidate.attempt_id && isDue(candidate.next_review_at, now)) return 1;
  if (!candidate.attempt_id) return 2;
  return 3;
}

function isCorrect(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function isDue(value, now = Date.now()) {
  if (!value) return false;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) && time <= now;
}

function exposureFor(exposureById, id) {
  return exposureById.get(Number(id)) || {
    assignedCount: 0,
    presentedCount: 0,
    lastAssignedAt: null,
    lastPresentedAt: null,
  };
}

function timestamp(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value || '');
  return Number.isFinite(time) ? time : 0;
}

function selectExamLineQuestionIds(candidates, exposureById, { mode = 'adaptive', limit = 10, now = Date.now() } = {}) {
  const families = new Map();
  for (const [randomIndex, candidate] of candidates.entries()) {
    const family = semanticFamily(candidate);
    const exposure = exposureFor(exposureById, candidate.id);
    const enriched = {
      ...candidate,
      family,
      randomIndex,
      assignedCount: Number(exposure.assignedCount || 0),
      presentedCount: Number(exposure.presentedCount || 0),
      lastAssignedAt: exposure.lastAssignedAt || null,
      lastPresentedAt: exposure.lastPresentedAt || null,
      learningPriority: learningPriority(candidate, mode, now),
      difficultyScore: Number(candidate.difficulty || 1),
    };
    if (!families.has(family)) families.set(family, []);
    families.get(family).push(enriched);
  }

  const rankedFamilies = [];
  for (const members of families.values()) {
    const familyAssignedCount = members.reduce((sum, item) => sum + item.assignedCount, 0);
    const familyPresentedCount = members.reduce((sum, item) => sum + item.presentedCount, 0);
    const familyLastSeenAt = members.reduce((latest, item) => Math.max(
      latest,
      timestamp(item.lastPresentedAt),
      timestamp(item.lastAssignedAt),
    ), 0);

    members.sort((a, b) =>
      a.assignedCount - b.assignedCount ||
      a.presentedCount - b.presentedCount ||
      b.difficultyScore - a.difficultyScore ||
      a.learningPriority - b.learningPriority ||
      timestamp(a.lastPresentedAt) - timestamp(b.lastPresentedAt) ||
      a.randomIndex - b.randomIndex,
    );

    const representative = members[0];
    rankedFamilies.push({
      representative,
      familyAssignedCount,
      familyPresentedCount,
      familyLastSeenAt,
    });
  }

  rankedFamilies.sort((a, b) =>
    a.familyAssignedCount - b.familyAssignedCount ||
    a.familyPresentedCount - b.familyPresentedCount ||
    b.representative.difficultyScore - a.representative.difficultyScore ||
    a.representative.learningPriority - b.representative.learningPriority ||
    a.familyLastSeenAt - b.familyLastSeenAt ||
    a.representative.randomIndex - b.representative.randomIndex,
  );

  return rankedFamilies
    .slice(0, Math.max(0, Number(limit) || 0))
    .map(item => Number(item.representative.id));
}

module.exports = {
  semanticFamily,
  selectExamLineQuestionIds,
  withoutCosmeticPrefix,
};
