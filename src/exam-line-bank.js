'use strict';

const registry=require('../content/biology/exam-lines.json');

const specs={
  1:{types:['short_answer','text_analysis','multiple_answer'],domains:['biology-science','biology-molecular','biology-cell']},
  2:{types:['experiment','matching','table','graph'],domains:['biology-science','biology-molecular','biology-cell','biology-ecology']},
  3:{types:['calculation','short_answer'],domains:['biology-molecular','biology-cell','biology-ecology','biology-genetics']},
  4:{types:['genetics_problem','calculation','short_answer'],domains:['biology-genetics','biology-reproduction']},
  5:{types:['image','diagram','short_answer'],domains:['biology-cell','biology-molecular'],visual:true},
  6:{types:['matching','image','diagram'],domains:['biology-cell','biology-molecular'],visual:true},
  7:{types:['multiple_answer','biological_process_analysis','text_analysis'],domains:['biology-cell','biology-molecular','biology-genetics','biology-reproduction']},
  8:{types:['sequence'],domains:['biology-cell','biology-molecular','biology-genetics','biology-reproduction']},
  9:{types:['image','diagram','short_answer'],domains:['biology-diversity'],visual:true},
 10:{types:['matching'],domains:['biology-diversity']},
 11:{types:['multiple_answer','text_analysis'],domains:['biology-diversity']},
 12:{types:['sequence','matching'],domains:['biology-diversity']},
 13:{types:['image','diagram','short_answer'],domains:['biology-human'],visual:true},
 14:{types:['matching'],domains:['biology-human']},
 15:{types:['multiple_answer','text_analysis'],domains:['biology-human']},
 16:{types:['sequence'],domains:['biology-human']},
 17:{types:['multiple_answer','text_analysis','biological_process_analysis'],domains:['biology-evolution']},
 18:{types:['multiple_answer','text_analysis','biological_process_analysis'],domains:['biology-ecology']},
 19:{types:['matching','table','sequence'],domains:['biology-evolution','biology-ecology']},
 20:{types:['table','matching'],domains:['biology-cell','biology-molecular','biology-diversity','biology-human']},
 21:{types:['graph','table','text_analysis','experiment'],domains:['biology-science','biology-ecology','biology-evolution','biology-human']},
 22:{types:['experiment','extended_answer'],domains:['biology-science','biology-exam-practice','biology-ecology','biology-human']},
 23:{types:['experiment','extended_answer','biological_process_analysis'],domains:['biology-exam-practice','biology-science','biology-ecology','biology-human','biology-molecular']},
 24:{types:['extended_answer','image','diagram','biological_process_analysis'],domains:['biology-cell','biology-molecular','biology-diversity','biology-human'],visual:true},
 25:{types:['extended_answer','biological_process_analysis','image'],domains:['biology-human','biology-diversity']},
 26:{types:['extended_answer','biological_process_analysis','text_analysis'],domains:['biology-evolution','biology-ecology']},
 27:{types:['calculation','extended_answer','biological_process_analysis'],domains:['biology-molecular','biology-cell','biology-evolution','biology-ecology']},
 28:{types:['genetics_problem','extended_answer','calculation'],domains:['biology-genetics','biology-reproduction']}
};

const lineInfo=new Map(registry.lines.map(line=>[Number(line.line),line]));
const lessonRefs=new Map(registry.lines.map(line=>[Number(line.line),new Set(line.lessonRefs||[])]));
const domainOf=row=>row.section_slug||'';
const typeOf=row=>row.question_type||row.type||'';
const hasVisual=row=>Boolean(row.image_url)||['image','diagram'].includes(typeOf(row));

function scoreCandidate(line,row){
  const spec=specs[line],info=lineInfo.get(line);if(!spec||!info)return -1;
  const refs=lessonRefs.get(line),type=typeOf(row),domain=domainOf(row);
  let score=0;
  if(refs?.has(row.lesson_slug))score+=120;
  const typeIndex=spec.types.indexOf(type);if(typeIndex>=0)score+=55-typeIndex*7;
  if(spec.domains.includes(domain))score+=42;
  if(spec.visual&&hasVisual(row))score+=20;
  if(line>=22&&type==='extended_answer')score+=22;
  if(line===22&&type==='experiment')score+=20;
  if(line===23&&['experiment','biological_process_analysis'].includes(type))score+=16;
  if(line===28&&type==='genetics_problem')score+=35;
  if(line===27&&type==='calculation')score+=20;
  if(row.content_status==='verified')score+=8;else if(row.content_status==='review')score+=5;
  return score;
}

async function ensureExamLineBank(db,{minimum=15}={}){
  const subject=await db.row("SELECT id FROM subjects WHERE slug='biology'");
  if(!subject)return {ok:false,reason:'biology subject missing'};
  const countRows=await db.rows(`SELECT exam_line,COUNT(*) n FROM questions WHERE subject_id=? AND active=1 AND published=1 AND exam_line BETWEEN 1 AND 28 GROUP BY exam_line`,subject.id);
  const counts=new Map(Array.from({length:28},(_,i)=>[i+1,0]));
  for(const item of countRows)counts.set(Number(item.exam_line),Number(item.n));
  const deficits=new Map([...counts].map(([line,count])=>[line,Math.max(0,minimum-count)]));
  if([...deficits.values()].every(v=>v===0))return {ok:true,changed:0,counts:Object.fromEntries(counts)};

  const candidates=await db.rows(`SELECT q.id,q.external_key,q.type,q.question_type,q.content_status,q.image_url,q.difficulty,l.slug lesson_slug,t.slug topic_slug,s.slug section_slug
    FROM questions q
    JOIN topics t ON t.id=q.topic_id
    LEFT JOIN lessons l ON l.id=q.lesson_id
    LEFT JOIN sections s ON s.id=t.section_id
    WHERE q.subject_id=? AND q.active=1 AND q.published=1 AND q.exam_line IS NULL
    ORDER BY CASE q.content_status WHEN 'verified' THEN 0 WHEN 'review' THEN 1 ELSE 2 END,q.id`,subject.id);

  const assigned=new Map();
  const used=new Set();
  const pairs=[];
  for(const row of candidates)for(let line=1;line<=28;line++)if(deficits.get(line)>0){const score=scoreCandidate(line,row);if(score>=42)pairs.push({score,line,row});}
  pairs.sort((a,b)=>b.score-a.score||a.line-b.line||Number(a.row.id)-Number(b.row.id));
  for(const pair of pairs){
    if(used.has(pair.row.id)||deficits.get(pair.line)<=0)continue;
    used.add(pair.row.id);assigned.set(pair.row.id,pair.line);deficits.set(pair.line,deficits.get(pair.line)-1);
  }

  // Second pass: keep domain relevance even when the exact question mechanic is scarce.
  for(let line=1;line<=28;line++){
    let need=deficits.get(line);if(!need)continue;
    const spec=specs[line];
    const pool=candidates.filter(row=>!used.has(row.id)&&spec.domains.includes(domainOf(row)))
      .sort((a,b)=>scoreCandidate(line,b)-scoreCandidate(line,a)||Number(a.id)-Number(b.id));
    for(const row of pool){if(!need)break;used.add(row.id);assigned.set(row.id,line);need--;}
    deficits.set(line,need);
  }

  // Final fallback uses the correct mechanic across neighboring biology domains rather than duplicating questions.
  for(let line=1;line<=28;line++){
    let need=deficits.get(line);if(!need)continue;
    const spec=specs[line];
    const pool=candidates.filter(row=>!used.has(row.id)&&spec.types.includes(typeOf(row)))
      .sort((a,b)=>scoreCandidate(line,b)-scoreCandidate(line,a)||Number(a.id)-Number(b.id));
    for(const row of pool){if(!need)break;used.add(row.id);assigned.set(row.id,line);need--;}
    deficits.set(line,need);
  }

  if(assigned.size)await db.transaction(async tx=>{for(const [id,line] of assigned)await tx.run('UPDATE questions SET exam_line=? WHERE id=?',line,id)});
  for(const [,line] of assigned)counts.set(line,(counts.get(line)||0)+1);
  const remaining=Object.fromEntries([...deficits].filter(([,n])=>n>0));
  if(Object.keys(remaining).length)console.warn('Exam line bank still below minimum:',remaining);
  else console.log(`Exam line bank ready: at least ${minimum} active questions on every line; assigned ${assigned.size}.`);
  return {ok:Object.keys(remaining).length===0,changed:assigned.size,counts:Object.fromEntries(counts),remaining};
}

module.exports={ensureExamLineBank,scoreCandidate,specs};
