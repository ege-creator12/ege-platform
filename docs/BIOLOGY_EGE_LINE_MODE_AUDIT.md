# Biology EGE line mode — audit record

## BEFORE (main before implementation)

The source audit covered all nested Biology topics, lessons and questions in `course.json` before line metadata was changed.

- **TOTAL BIOLOGY LESSONS:** 203
- **TOTAL BIOLOGY QUESTIONS:** 951
- **QUESTIONS WITH VALID EXAM LINE:** 951
- **QUESTIONS WITHOUT EXAM LINE:** 0
- **Range:** 1–28
- **LINES PRESENT:** 1–5, 17, 19, 21–28
- **LINES WITH 0 QUESTIONS:** 6–16, 18, 20
- **LINES WITH 0 THEORY LINKS:** 6–16, 18, 20
- **ORPHAN LINE REFERENCES:** 0

The values were syntactically valid but the mapping was not semantically valid: broad generated sets `[1,3,4]` and `[2,23,24]` were repeated across unrelated molecular, organism and diversity topics. Human anatomy questions were assigned mostly to lines 3/4, and zoology theory was linked to cytology line 3. There was no line registry, no list/detail API, no line filter in session creation, no line progress, and the Biology switch displayed the line route as disabled.

## Corrections

Questions in the first-part thematic ranges were reassigned by the actual content domain: cell and molecular biology (3, 5, 6), organism/genetics (4, 7, 8), diversity (9–12), human biology (13–16), and evolution/ecology (17–20). Existing deliberately authored transversal and second-part mappings (21–28), stable question keys, lesson slugs, attempts and progress entities were preserved. Topic `examLines` now provide lesson-level links for all current lines. The original bank already contained enough reusable tasks; remapping closed all practice gaps without creating duplicate theory or bulk synthetic practice.

This file is an editorial record. The repeatable current-state integrity report is produced by `npm run audit:biology-exam-lines`.
