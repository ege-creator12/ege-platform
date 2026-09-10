'use strict';

const BIOLOGY_LINE_PREFIX='biology-bank-v6-line';
const CHEM_CORE_PREFIX='chemistry-bank-v2-line';
const CHEM_MEDIUM_PREFIX='chemistry-medium-v1-line';

const META_PROMPT_PATTERNS=[
  /что\s+(?:нужно|надо|следует)\s+(?:сделать|проверить|повторить|знать|вспомнить)\s+(?:перед|до)\s+(?:тем[,.\s]+как\s+)?(?:реш(?:ать|ить)|выполн(?:ять|ить))/iu,
  /(?:перед|до)\s+(?:тем[,.\s]+как\s+)?(?:реш(?:ать|ить)|выполн(?:ять|ить))\s+(?:задани|задач)/iu,
  /какой\s+(?:алгоритм|план|порядок)\s+(?:действий\s+)?(?:нужно|надо|следует)\s+(?:использовать|применить).*?(?:решен|выполнен)/iu,
  /что\s+(?:следует|нужно)\s+(?:учесть|помнить)\s+при\s+(?:решении|выполнении)\s+задани/iu,
  /здесь\s+будет\s+(?:вопрос|задание)|\b(?:todo|placeholder|ege_required|qualitybasis)\b/iu
];

const normalize=value=>String(value??'').toLocaleLowerCase('ru-RU').replace(/\s+/g,' ').trim();
const isMetaPrompt=prompt=>META_PROMPT_PATTERNS.some(pattern=>pattern.test(String(prompt||'')));

const optionList=labels=>labels.map((label,index)=>({value:String(index),label}));
const text=(key,prompt,answer,explanation,extra={})=>({key,type:'text',questionType:extra.questionType||'short_answer',prompt,answer:Array.isArray(answer)?answer:[String(answer)],explanation,difficulty:extra.difficulty||1,acceptedVariants:extra.acceptedVariants||[],content:extra.content||{},options:[],solutionSteps:extra.solutionSteps||[],maxScore:extra.maxScore||1});
const multiple=(key,prompt,labels,answer,explanation,extra={})=>({key,type:'multiple',questionType:'multiple_answer',prompt,options:optionList(labels),answer:answer.map(String),explanation,difficulty:extra.difficulty||1,acceptedVariants:[],content:extra.content||{},solutionSteps:extra.solutionSteps||[],maxScore:extra.maxScore||2});
const matching=(key,prompt,left,right,answer,explanation,extra={})=>({key,type:'matching',questionType:'matching',prompt,options:[],answer:answer.map(String),explanation,difficulty:extra.difficulty||2,acceptedVariants:[],content:{left,right,answerEncoding:'pairs',...(extra.content||{})},solutionSteps:extra.solutionSteps||[],maxScore:extra.maxScore||2});
const sequence=(key,prompt,labels,answer,explanation,extra={})=>({key,type:'sequence',questionType:'sequence',prompt,options:optionList(labels),answer:answer.map(String),explanation,difficulty:extra.difficulty||2,acceptedVariants:[],content:extra.content||{},solutionSteps:extra.solutionSteps||[],maxScore:extra.maxScore||2});
const extended=(key,prompt,criteria,extra={})=>({key,type:'text',questionType:'extended_answer',prompt,options:[],answer:[criteria.join(' ')],explanation:criteria.join(' '),difficulty:extra.difficulty||3,acceptedVariants:[],content:{manualReview:true,criteria,...(extra.content||{})},solutionSteps:criteria,maxScore:extra.maxScore||criteria.length});

const CELL_THEORY_TASKS=[
  text('cell-theory-v1-01','Закончите положение современной клеточной теории: новые клетки возникают только в результате ...','деления ранее существующих клеток','Новые клетки не возникают самопроизвольно: они образуются при делении уже существующих клеток.',{acceptedVariants:['деления клеток','деления исходных клеток']}),
  multiple('cell-theory-v1-02','Выберите три положения современной клеточной теории.',[
    'Клетка — элементарная структурно-функциональная единица живых организмов',
    'Клетки организмов сходны по основным принципам строения и химического состава',
    'Новые клетки образуются из ранее существующих клеток',
    'Каждая живая клетка обязательно имеет оформленное ядро',
    'Вирусы состоят из одной или нескольких клеток',
    'Клетки многоклеточного организма полностью независимы друг от друга'
  ],[0,1,2],'Клеточная теория утверждает клеточную организацию живого, принципиальное сходство клеток и происхождение новых клеток от существующих. Прокариоты не имеют оформленного ядра, вирусы неклеточные, клетки многоклеточного организма взаимодействуют.'),
  matching('cell-theory-v1-03','Установите соответствие между учёным и вкладом в развитие клеточной теории.',[
    'Обобщил данные о клеточном строении растений',
    'Сформулировал представление о клетке как общей единице строения животных и растений',
    'Обосновал принцип «каждая клетка — из клетки»'
  ],['М. Шлейден','Т. Шванн','Р. Вирхов'],['0-0','1-1','2-2'],'Шлейден исследовал клеточное строение растений; Шванн обобщил клеточное строение животных и растений; Вирхов развил положение о происхождении клеток только от клеток.'),
  extended('cell-theory-v1-04','Зрелый эритроцит млекопитающего не имеет ядра и большинства органоидов. Объясните, почему это не опровергает клеточную теорию.',[
    'Эритроцит развивается из клеточного предшественника и имеет клеточное происхождение.',
    'Утрата ядра и части органоидов происходит в ходе специализации и не означает неклеточное происхождение.',
    'Клеточная теория описывает общие закономерности организации живого, а специализированные клетки могут вторично терять отдельные структуры.'
  ]),
  extended('cell-theory-v1-05','Почему существование вирусов не опровергает клеточную теорию? Укажите три положения.',[
    'Вирусы являются неклеточными биологическими системами и не имеют самостоятельного клеточного строения.',
    'Вне клетки хозяина вирусы не осуществляют самостоятельный полноценный обмен веществ и размножение.',
    'Размножение вирусов происходит с использованием систем клетки хозяина, поэтому клетка остаётся минимальной автономной структурно-функциональной единицей живого организма.'
  ]),
  multiple('cell-theory-v1-06','Выберите три структуры, которые встречаются и в типичной растительной, и в типичной животной эукариотической клетке.',[
    'Митохондрии','Рибосомы','Аппарат Гольджи','Хлоропласты','Клеточная стенка из целлюлозы','Крупная центральная вакуоль как обязательный признак'
  ],[0,1,2],'Обе клетки эукариотические: у них есть митохондрии, рибосомы и аппарат Гольджи. Хлоропласты, целлюлозная стенка и крупная центральная вакуоль характерны для растительной клетки.'),
  matching('cell-theory-v1-07','Установите соответствие между органоидом и его основной функцией.',[
    'Синтез полипептида','Окислительное фосфорилирование','Модификация и сортировка белков','Внутриклеточное переваривание'
  ],['Рибосома','Митохондрия','Аппарат Гольджи','Лизосома'],['0-0','1-1','2-2','3-3'],'Рибосомы осуществляют трансляцию; митохондрии участвуют в аэробном синтезе АТФ; аппарат Гольджи модифицирует и сортирует белки; лизосомы содержат гидролитические ферменты.'),
  sequence('cell-theory-v1-08','Расположите этапы пути секретируемого белка от начала синтеза до выделения из клетки.',[
    'Экзоцитоз содержимого секреторного пузырька',
    'Синтез полипептида на рибосоме шероховатой ЭПС',
    'Поступление белка в аппарат Гольджи',
    'Образование транспортного пузырька от ЭПС',
    'Формирование секреторного пузырька аппаратом Гольджи'
  ],['1','3','2','4','0'],'Белок синтезируется на рибосомах шероховатой ЭПС, транспортируется пузырьками в аппарат Гольджи, сортируется и выводится секреторным пузырьком через экзоцитоз.'),
  matching('cell-theory-v1-09','Установите соответствие между способом транспорта через мембрану и его характеристикой.',[
    'Перемещение воды через полупроницаемую мембрану',
    'Перенос вещества против электрохимического градиента с затратой энергии',
    'Поглощение крупной частицы с образованием мембранного пузырька',
    'Перемещение небольших неполярных молекул по градиенту без белка-переносчика'
  ],['Осмос','Активный транспорт','Фагоцитоз','Простая диффузия'],['0-0','1-1','2-2','3-3'],'Осмос относится к пассивному переносу воды; активный транспорт требует энергии; фагоцитоз связан с впячиванием мембраны; простая диффузия идёт по градиенту.'),
  text('cell-theory-v1-10','Диплоидный набор клетки равен 12. Сколько молекул ДНК находится в этой клетке в метафазе митоза? Запишите только число.','24','После S-фазы каждая из 12 хромосом состоит из двух сестринских хроматид; каждой хроматиде соответствует одна молекула ДНК, поэтому 12 × 2 = 24.',{difficulty:2}),
  multiple('cell-theory-v1-11','Выберите три признака, которые подтверждают эндосимбиотическое происхождение митохондрий и пластид.',[
    'Наличие собственной ДНК','Наличие собственных рибосом бактериального типа','Размножение делением','Наличие одной мембраны','Образование только из аппарата Гольджи','Отсутствие любых собственных генов'
  ],[0,1,2],'Собственная ДНК, рибосомы бактериального типа и размножение делением согласуются с происхождением митохондрий и пластид от древних прокариотических симбионтов.'),
  multiple('cell-theory-v1-12','Выберите три признака прокариотической клетки.',[
    'Нет оформленного мембраной ядра','Есть рибосомы','Основная ДНК располагается в области нуклеоида','Есть митохондрии','Есть аппарат Гольджи','Обязательно есть хлоропласты'
  ],[0,1,2],'Прокариоты не имеют оформленного ядра и мембранных органоидов, но содержат рибосомы; основная ДНК располагается в нуклеоиде.'),
  sequence('cell-theory-v1-13','Расположите этапы клеточного цикла, начиная с периода роста клетки перед репликацией ДНК.',[
    'Митоз','G2-период','S-период','G1-период'
  ],['3','2','1','0'],'Последовательность интерфазы и деления: G1 → S → G2 → митоз.'),
  extended('cell-theory-v1-14','Клетку поместили в гипертонический раствор непроникающего вещества. Объясните, как изменятся движение воды и объём клетки в первые минуты.',[
    'Концентрация осмотически активных частиц снаружи выше, поэтому вода выходит из клетки по осмотическому градиенту.',
    'Объём клетки или её протопласта уменьшается из-за потери воды.',
    'Для растительной клетки это приводит к снижению тургора и при достаточной разнице концентраций — к плазмолизу.'
  ]),
  extended('cell-theory-v1-15','Сравните митохондрию и хлоропласт: назовите два общих признака и одно принципиальное различие их функций.',[
    'Оба органоида имеют две мембраны.',
    'Оба содержат собственную ДНК и рибосомы и относятся к полуавтономным органоидам.',
    'Митохондрия связана преимущественно с аэробным клеточным дыханием и синтезом АТФ, а хлоропласт — с фотосинтезом и фиксацией углерода.'
  ]),
  extended('cell-theory-v1-16','Предложите опыт, позволяющий проверить влияние концентрации раствора сахарозы на изменение массы одинаковых кусочков картофеля.',[
    'Независимая переменная — концентрация сахарозы; зависимая — изменение массы кусочка картофеля за одинаковое время.',
    'Размер и исходную массу кусочков, объём раствора, температуру и длительность выдерживания поддерживают одинаковыми.',
    'Используют несколько концентраций и повторности, взвешивают кусочки до и после опыта и сравнивают изменение массы.'
  ])
];

async function insertQuestion(db,{subjectId,topicId,lessonId,key,item,examLine=null,source='ОСНОВА · авторская практика ЕГЭ-2027'}){
  const maxScore=Number(item.maxScore||1);
  const result=await db.run(`INSERT INTO questions(
    subject_id,topic_id,lesson_id,external_key,type,question_type,prompt,instruction,explanation,difficulty,
    answer_json,answer_data_json,explanation_json,content_json,media_json,source,source_type,exam_line,points,estimated_seconds,
    active,published,exam_year,solution_steps_json,max_score,content_status,image_url
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,TRUE,TRUE,?,?,?,?,?)`,
    subjectId,topicId,lessonId,key,item.type,item.questionType,item.prompt,item.instruction||'Выполните задание по условию.',item.explanation,item.difficulty||1,
    JSON.stringify(item.answer||[]),JSON.stringify({correct:item.answer||[],acceptedVariants:item.acceptedVariants||[],content:item.content||{}}),
    JSON.stringify({short:item.explanation,fullSolution:item.explanation,scoringPoints:item.content?.criteria||item.solutionSteps||[]}),JSON.stringify(item.content||{}),'{}',
    source,'original',examLine,maxScore,examLine&&examLine>=22?360:150,2027,JSON.stringify(item.solutionSteps||[]),maxScore,'verified',item.image||item.imageUrl||null);
  const questionId=Number(result.lastInsertRowid);
  for(const [index,opt] of (item.options||[]).entries())await db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)',questionId,String(opt.value),String(opt.label),index);
  return questionId;
}

async function sanitizeStudentQuestions(db,biologyId,chemistryId){
  const visible=await db.rows('SELECT id,prompt,content_status FROM questions WHERE active=1');
  const bad=visible.filter(row=>String(row.content_status||'').toLowerCase()==='draft'||isMetaPrompt(row.prompt));
  if(bad.length)await db.transaction(async tx=>{for(const row of bad)await tx.run('UPDATE questions SET active=FALSE,published=FALSE WHERE id=?',row.id)});

  let biologyDetached=0,chemistryDetached=0;
  if(biologyId){
    const before=await db.row(`SELECT COUNT(*) n FROM questions WHERE subject_id=? AND exam_line BETWEEN 1 AND 28 AND COALESCE(external_key,'') NOT LIKE ?`,biologyId,`${BIOLOGY_LINE_PREFIX}%`);
    biologyDetached=Number(before?.n||0);
    if(biologyDetached)await db.run(`UPDATE questions SET exam_line=NULL WHERE subject_id=? AND exam_line BETWEEN 1 AND 28 AND COALESCE(external_key,'') NOT LIKE ?`,biologyId,`${BIOLOGY_LINE_PREFIX}%`);
  }
  if(chemistryId){
    const before=await db.row(`SELECT COUNT(*) n FROM questions WHERE subject_id=? AND exam_line BETWEEN 1 AND 34 AND COALESCE(external_key,'') NOT LIKE ? AND COALESCE(external_key,'') NOT LIKE ?`,chemistryId,`${CHEM_CORE_PREFIX}%`,`${CHEM_MEDIUM_PREFIX}%`);
    chemistryDetached=Number(before?.n||0);
    if(chemistryDetached)await db.run(`UPDATE questions SET exam_line=NULL WHERE subject_id=? AND exam_line BETWEEN 1 AND 34 AND COALESCE(external_key,'') NOT LIKE ? AND COALESCE(external_key,'') NOT LIKE ?`,chemistryId,`${CHEM_CORE_PREFIX}%`,`${CHEM_MEDIUM_PREFIX}%`);
  }
  return {hidden:bad.length,biologyDetached,chemistryDetached};
}

async function ensureCellTheoryBank(db,biologyId){
  if(!biologyId)return {inserted:0,total:0};
  const topic=await db.row("SELECT id FROM topics WHERE subject_id=? AND slug='bio-cell-1'",biologyId);
  const lesson=await db.row("SELECT id FROM lessons WHERE topic_id=? AND slug='bio-cell-1-lesson'",Number(topic?.id||0));
  if(!topic?.id||!lesson?.id)return {inserted:0,total:0,warning:'cell-topic-not-found'};
  const rows=await db.rows("SELECT external_key FROM questions WHERE subject_id=? AND external_key LIKE 'cell-theory-v1-%'",biologyId);
  const existing=new Set(rows.map(row=>String(row.external_key)));
  let inserted=0;
  for(const item of CELL_THEORY_TASKS){
    if(existing.has(item.key))continue;
    await insertQuestion(db,{subjectId:biologyId,topicId:Number(topic.id),lessonId:Number(lesson.id),key:item.key,item,source:'ОСНОВА · клеточная теория · авторский банк по требованиям ЕГЭ-2027'});
    inserted++;
  }
  return {inserted,total:CELL_THEORY_TASKS.length};
}

async function ensureBiologyLineSupplements(db,biologyId){
  if(!biologyId)return {inserted:0,total:0};
  const registry=require('../content/biology/exam-lines.json');
  const expected=registry.lines.length*3;
  const count=Number((await db.row("SELECT COUNT(*) n FROM questions WHERE subject_id=? AND external_key LIKE 'biology-bank-v6-line%-curated-v%' AND active=1 AND published=1",biologyId))?.n||0);
  if(count>=expected)return {inserted:0,total:count};
  const {variantQuestions}=require('../content/biology/mock-variants');
  const promptRows=await db.rows('SELECT prompt FROM questions WHERE subject_id=? AND active=1 AND published=1',biologyId);
  const prompts=new Set(promptRows.map(row=>normalize(row.prompt)));
  const keyRows=await db.rows("SELECT external_key FROM questions WHERE subject_id=? AND external_key LIKE 'biology-bank-v6-line%-curated-v%'",biologyId);
  const keys=new Set(keyRows.map(row=>String(row.external_key)));
  const lessonByLine=new Map();
  for(const info of registry.lines){
    const marks=(info.lessonRefs||[]).map(()=>'?').join(',');
    if(!marks)continue;
    const lesson=await db.row(`SELECT l.id,l.topic_id FROM lessons l JOIN topics t ON t.id=l.topic_id WHERE t.subject_id=? AND l.slug IN (${marks}) ORDER BY l.id LIMIT 1`,biologyId,...info.lessonRefs);
    if(lesson)lessonByLine.set(Number(info.line),lesson);
  }
  let inserted=0,skippedDuplicate=0;
  for(let variant=1;variant<=3;variant++){
    for(const q of variantQuestions(variant)){
      const line=Number(q.line),lesson=lessonByLine.get(line),key=`biology-bank-v6-line${line}-curated-v${variant}`;
      if(!lesson||keys.has(key))continue;
      const fp=normalize(q.prompt);
      if(prompts.has(fp)){skippedDuplicate++;continue;}
      const item={
        type:q.type||'text',questionType:q.questionType||q.type||'short_answer',prompt:q.prompt,instruction:q.instruction||'Выполните задание в формате ЕГЭ.',
        explanation:q.explanation||'',difficulty:q.difficulty||1,answer:q.answer||[],acceptedVariants:q.acceptedVariants||[],content:{...(q.content||{}),strictFipi2027:true,strictExamLine:line,curatedSupplement:true},
        options:q.options||[],solutionSteps:q.solutionSteps||[],maxScore:q.maxScore||1,image:q.image||null
      };
      await insertQuestion(db,{subjectId:biologyId,topicId:Number(lesson.topic_id),lessonId:Number(lesson.id),key,item,examLine:line,source:'ОСНОВА · проверенный авторский вариант по структуре проекта ФИПИ ЕГЭ-2027'});
      keys.add(key);prompts.add(fp);inserted++;
    }
  }
  return {inserted,total:count+inserted,skippedDuplicate};
}

async function ensureContentQuality2027(db){
  const [biology,chemistry]=await Promise.all([
    db.row("SELECT id FROM subjects WHERE slug='biology'"),
    db.row("SELECT id FROM subjects WHERE slug='chemistry'")
  ]);
  const biologyId=Number(biology?.id||0),chemistryId=Number(chemistry?.id||0);
  const sanitation=await sanitizeStudentQuestions(db,biologyId,chemistryId);
  const cellTheory=await ensureCellTheoryBank(db,biologyId);
  const biologyLines=await ensureBiologyLineSupplements(db,biologyId);
  console.log('Student content quality 2027:',JSON.stringify({sanitation,cellTheory,biologyLines}));
  return {sanitation,cellTheory,biologyLines};
}

module.exports={ensureContentQuality2027,isMetaPrompt,CELL_THEORY_TASKS,META_PROMPT_PATTERNS};
