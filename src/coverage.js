async function coverageReport(db, subjectSlug, examYear=2027) {
  const items=await db.rows(`SELECT e.codifier_code,e.title,e.exam_lines_json,e.skills_json,e.content_status,
    COUNT(DISTINCT CASE WHEN c.coverage_kind='theory' AND l.content_status IN ('review','verified') THEN c.entity_id END) theory_blocks,
    COUNT(DISTINCT CASE WHEN c.coverage_kind='practice' AND q.content_status IN ('review','verified') THEN c.entity_id END) question_count,
    COUNT(DISTINCT CASE WHEN c.coverage_kind='practice' AND q.content_status IN ('review','verified') THEN q.exam_line END) represented_lines
    FROM exam_spec_items e JOIN subjects s ON s.id=e.subject_id
    LEFT JOIN content_coverage c ON c.spec_item_id=e.id
    LEFT JOIN lesson_blocks b ON c.entity_type='block' AND b.id=c.entity_id
    LEFT JOIN lessons l ON l.id=b.lesson_id
    LEFT JOIN questions q ON c.entity_type='question' AND q.id=c.entity_id
    WHERE s.slug=? AND e.exam_year=? GROUP BY e.id,e.codifier_code,e.title,e.exam_lines_json,e.skills_json,e.content_status ORDER BY e.codifier_code`,subjectSlug,examYear);
  return items.map(item=>{
    const theoryBlocks=Number(item.theory_blocks), questionCount=Number(item.question_count), representedLines=Number(item.represented_lines);
    return {...item,theory_blocks:theoryBlocks,question_count:questionCount,represented_lines:representedLines,theory_covered:theoryBlocks>0,practice_covered:questionCount>0,needs_content:theoryBlocks===0||questionCount<2};
  });
}
module.exports={coverageReport};
