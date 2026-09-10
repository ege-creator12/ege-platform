'use strict';

const BIO_VARIANT_COUNT = 12;
const CHEM_VARIANT_COUNT = 12;

function patchBiologyVariants() {
  const source = require('../content/biology/mock-variants');
  if (source.__fastExtendedVariants) return;

  const original = source.variantQuestions;
  const patterns = [
    [0],
    [1],
    [2],
    [0, 1, 2],
    [1, 2, 0],
    [2, 0, 1],
    [0, 2, 1],
    [1, 0, 2],
    [2, 1, 0],
    [0, 0, 1, 1, 2, 2],
    [1, 1, 2, 2, 0, 0],
    [2, 2, 0, 0, 1, 1],
  ];

  source.variantQuestions = function extendedBiologyVariant(variant = 1) {
    variant = Number(variant);
    if (!Number.isInteger(variant) || variant < 1 || variant > BIO_VARIANT_COUNT) {
      throw new RangeError('Unknown biology variant');
    }
    if (variant <= 3) return original(variant);

    const banks = [original(1), original(2), original(3)];
    const pattern = patterns[variant - 1];
    return banks[0].map((_, index) => {
      const picked = banks[pattern[index % pattern.length]][index];
      return {
        ...picked,
        key: `biology-2027-mixed-v${variant}-line${picked.line}`,
      };
    });
  };
  source.VARIANT_COUNT = BIO_VARIANT_COUNT;
  source.__fastExtendedVariants = true;

  const service = require('./mock-exams');
  service.CONFIG.variantCount = BIO_VARIANT_COUNT;
}

function patchChemistryVariants() {
  const source = require('../content/chemistry/mock-variants');
  if (source.__fastExtendedVariants) return;

  const original = source.variantQuestions;
  const builders = require('./chemistry-line-bank');
  const registry = require('../content/chemistry/exam-lines');
  const offsets = [5, 10, 15, 1, 2, 3, 4, 6, 7, 8, 9, 11];

  const scoringModeFor = (q, line) => {
    if (q.questionType === 'extended_answer' || q.manualReview) return 'manual';
    if (Number(line.maxScore) <= 1) return null;
    if (q.type === 'matching') return 'position';
    if (q.type === 'sequence') return 'sequence';
    if (q.type === 'multiple') return 'selection';
    return null;
  };

  const itemNumber = (line, variant) =>
    ((Number(line) * 7 + offsets[Number(variant) - 1] + Math.floor(Number(line) / 3)) % 20) + 1;

  source.itemNumber = itemNumber;
  source.variantQuestions = function extendedChemistryVariant(variant = 1) {
    variant = Number(variant);
    if (!Number.isInteger(variant) || variant < 1 || variant > CHEM_VARIANT_COUNT) {
      throw new RangeError('Unknown chemistry mock variant');
    }
    if (variant <= 3) return original(variant);

    return registry.lines.map(info => {
      const n = itemNumber(info.line, variant);
      const q = builders[info.line](n);
      const maxScore = Number(q.maxScore || info.maxScore || 1);
      if (maxScore !== Number(info.maxScore)) {
        throw new Error(`Chemistry mock line ${info.line}: score mismatch ${maxScore} != ${info.maxScore}`);
      }
      return {
        key: `chemistry-mock-v${variant}-l${String(info.line).padStart(2, '0')}-q${String(n).padStart(2, '0')}`,
        line: info.line,
        part: info.part,
        type: q.type,
        questionType: q.questionType || q.type,
        prompt: q.prompt,
        instruction: q.instruction || '',
        content: q.content || {},
        options: q.options || [],
        answer: q.answer,
        acceptedVariants: q.acceptedVariants || [],
        difficulty: Number(q.difficulty || 2),
        maxScore,
        scoringMode: scoringModeFor(q, info),
        manualReview: Boolean(q.manualReview || q.questionType === 'extended_answer'),
        explanation: q.explanation || '',
        solutionSteps: q.solutionSteps || [],
        scoringPoints: q.scoringPoints || q.content?.criteria || [],
        commonMistakes: q.commonMistakes || info.commonTraps || [],
        hint: q.hint || info.strategy?.[0] || '',
      };
    });
  };
  source.VARIANT_COUNT = CHEM_VARIANT_COUNT;
  source.__fastExtendedVariants = true;

  const service = require('./chemistry-mock-exams');
  service.CONFIG.variantCount = CHEM_VARIANT_COUNT;
}

patchBiologyVariants();
patchChemistryVariants();

module.exports = { BIO_VARIANT_COUNT, CHEM_VARIANT_COUNT };
