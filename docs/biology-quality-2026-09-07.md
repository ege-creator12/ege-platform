# Biology quality work — 7 September 2026

Status: implementation and local automated checks complete; draft pending browser/mobile acceptance. Do not merge before that acceptance.

## Changes

- Preserve all 203 lesson identities and all 951 legacy question identities. The bank now contains 1,226 records: 911 active and 315 archived template exercises, plus preserved attempt history.
- Add 191 lesson-specific self-checks and 84 authored numbered tasks forming three 28-task variants. Topic exercises have no exact exam-line label; each numbered line has three reviewed tasks.
- Add 63 human physiology reference tables, the complete standard genetic code, fermentation mechanisms and scoring guidance. Repair malformed matching/sequence keys and misleading image associations; replace 14 generic image placeholders with biological reference diagrams.
- Render lesson prompts, comparisons, summaries and assets; search the full course. Add mobile navigation, larger controls, scrolling tables, structured matching and sequence input.
- Queue immutable answer saves, retain failed drafts, drain edits before navigation, and preserve completed reading progress during practice.
- Require explicit semantic self-review for reasoned answers; never grade a paragraph by exact string equality. Numbered mocks use the published FIPI 2027 draft: 235 minutes, maximum 57, 21 short and seven manually reviewed extended answers.

## Evidence and limits

`npm test`: 62 tests passed. `npm run check` and audits for theory, question bank, exam lines, mock exams and phase 2 passed. Checks include repeat imports, stable IDs, stale option removal, inactive archival questions, media resolution, answer privacy, save queue behavior and line-specific scoring.

Existing audit counts now distinguish preserved legacy records from additions. Repeated generic experiment/deep-dive paragraphs are no longer required in every lesson; the audit retains core theory, worked-example, biological-concept and experiment-question coverage checks. Structural audits do not establish universal scientific correctness.

SVG assets were rendered and visually inspected separately. Final interactive browser verification is blocked: the preview reports running, but the cloud browser returns ERR_CONNECTION_REFUSED. The sites-preview-troubleshooting workflow requires stopping preview retries at this point. No successful final phone acceptance is claimed. Local integration tests use SQLite; a live PostgreSQL deployment was not exercised.

Before merge: check navigation, search, long lessons and tables, matching/sequence controls, draft restoration and complete mock submission at 320/360/390 px and desktop; resolve any defects. Then verify deployment health with the production database.

Sources: https://fipi.ru/ege/demoversii-specifikacii-kodifikatory and https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi#SG1 . FIPI 2027 is a draft; recheck after final publication.
