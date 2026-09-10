'use strict';

// Keep these values in sync with the current generated-bank namespaces.
// This module is intentionally tiny and does not require the large course/generator
// modules, so the normal cold-start path can verify readiness without parsing them.
const BIOLOGY_BANK_VERSION = 'v6';
const CHEMISTRY_BANK_VERSION = 'v2';
const CHEMISTRY_MEDIUM_VERSION = 'v1';
const CHEMISTRY_COURSE_VERSION = 'chemistry-2027-subject-course-v2-fipi-mastery-complete';

const BIOLOGY_MINIMUM = 27;
const CHEMISTRY_MINIMUM = 24;
const numeric = value => Number(value || 0);

function completeLineSet(rows, lineCount, minimum) {
  const counts = new Map((rows || []).map(row => [Number(row.exam_line), numeric(row.n)]));
  if (counts.size < lineCount) return false;
  for (let line = 1; line <= lineCount; line++) {
    if ((counts.get(line) || 0) < minimum) return false;
  }
  return true;
}

async function fastContentReady(db, { biologyMinimum = BIOLOGY_MINIMUM, chemistryMinimum = CHEMISTRY_MINIMUM } = {}) {
  try {
    const [biology, chemistry, chemistryUpgrade] = await Promise.all([
      db.row("SELECT id FROM subjects WHERE slug='biology' AND published=1"),
      db.row("SELECT id FROM subjects WHERE slug='chemistry' AND published=1"),
      db.row('SELECT version FROM chemistry_upgrade_state WHERE version=?', CHEMISTRY_COURSE_VERSION),
    ]);
    if (!biology?.id || !chemistry?.id || !chemistryUpgrade?.version) return false;

    const [biologyCounts, chemistryCore, chemistryMedium] = await Promise.all([
      db.rows(`SELECT exam_line,COUNT(*) n FROM questions
        WHERE subject_id=? AND active=1 AND published=1
          AND exam_line BETWEEN 1 AND 28
          AND external_key LIKE ?
        GROUP BY exam_line`, Number(biology.id), `biology-bank-${BIOLOGY_BANK_VERSION}-line%`),
      db.rows(`SELECT exam_line,COUNT(*) n FROM questions
        WHERE subject_id=? AND active=1 AND published=1
          AND exam_line BETWEEN 1 AND 34
          AND external_key LIKE ?
        GROUP BY exam_line`, Number(chemistry.id), `chemistry-bank-${CHEMISTRY_BANK_VERSION}-line%`),
      db.rows(`SELECT exam_line,COUNT(*) n FROM questions
        WHERE subject_id=? AND active=1 AND published=1
          AND exam_line BETWEEN 1 AND 34
          AND external_key LIKE ?
        GROUP BY exam_line`, Number(chemistry.id), `chemistry-medium-${CHEMISTRY_MEDIUM_VERSION}-line%`),
    ]);

    return completeLineSet(biologyCounts, 28, biologyMinimum)
      && completeLineSet(chemistryCore, 34, chemistryMinimum)
      && completeLineSet(chemistryMedium, 34, chemistryMinimum);
  } catch (error) {
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
  BIOLOGY_MINIMUM,
  CHEMISTRY_MINIMUM,
};
