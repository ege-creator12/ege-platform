'use strict';

// Keep these values in sync with the current duplicate-free generated-bank namespaces.
// This module stays tiny so the normal cold-start path can verify readiness without
// loading the large course/generator modules.
const { BIOLOGY_BANK_VERSION_TAG: BIOLOGY_BANK_VERSION } = require('./biology-bank-version');
const { CHEMISTRY_BANK_VERSION } = require('./chemistry-bank-version');
const CHEMISTRY_MEDIUM_VERSION = 'retired-v1';
const CHEMISTRY_COURSE_VERSION = 'chemistry-2027-subject-course-v2-fipi-mastery-complete';

const numeric = value => Number(value || 0);

function completeLineSet(rows, lineCount, minimum) {
  const counts = new Map((rows || []).map(row => [Number(row.exam_line), numeric(row.n)]));
  if (counts.size < lineCount) return false;
  for (let line = 1; line <= lineCount; line++) {
    if ((counts.get(line) || 0) < minimum) return false;
  }
  return true;
}

async function fastContentReady(db, { biologyMinimum = 10, chemistryMinimum = 10 } = {}) {
  try {
    const [biology, chemistry, chemistryUpgrade] = await Promise.all([
      db.row("SELECT id FROM subjects WHERE slug='biology' AND published=1"),
      db.row("SELECT id FROM subjects WHERE slug='chemistry' AND published=1"),
      db.row('SELECT version FROM chemistry_upgrade_state WHERE version=?', CHEMISTRY_COURSE_VERSION),
    ]);
    if (!biology?.id || !chemistry?.id || !chemistryUpgrade?.version) return false;

    const [biologyCounts, biologyHard26, chemistryCore] = await Promise.all([
      db.rows(`SELECT exam_line,COUNT(*) n FROM questions
        WHERE subject_id=? AND active=1 AND published=1
          AND exam_line BETWEEN 1 AND 28
          AND external_key LIKE ?
        GROUP BY exam_line`, Number(biology.id), `biology-bank-${BIOLOGY_BANK_VERSION}-line%`),
      db.row(`SELECT COUNT(*) n FROM questions
        WHERE subject_id=? AND active=1 AND published=1
          AND exam_line=26 AND external_key LIKE ?`, Number(biology.id), `biology-bank-${BIOLOGY_BANK_VERSION}-line26-hard-%`),
      db.rows(`SELECT exam_line,COUNT(*) n FROM questions
        WHERE subject_id=? AND active=1 AND published=1
          AND exam_line BETWEEN 1 AND 34
          AND external_key LIKE ?
        GROUP BY exam_line`, Number(chemistry.id), `chemistry-bank-${CHEMISTRY_BANK_VERSION}-line%`),
    ]);

    return completeLineSet(biologyCounts, 28, biologyMinimum)
      && numeric(biologyHard26?.n) >= biologyMinimum
      && completeLineSet(chemistryCore, 34, chemistryMinimum);
  } catch (error) {
    // A missing state table or a partially migrated database simply falls back to
    // the deep startup repair path. Never make startup correctness depend on this gate.
    return false;
  }
}

module.exports = {
  fastContentReady,
  completeLineSet,
  BIOLOGY_BANK_VERSION,
  CHEMISTRY_BANK_VERSION,
  CHEMISTRY_MEDIUM_VERSION,
  CHEMISTRY_COURSE_VERSION,
};
