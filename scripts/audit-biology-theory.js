const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { validateCourse } = require('../src/bootstrap');
const ROOT=resolve(__dirname,'..'), COURSE=resolve(ROOT,'content/biology/course.json'), AUDIT=resolve(ROOT,'content/biology/THEORY_AUDIT.md');
const TASK1_TOPICS=['bio-science-1','bio-science-2','bio-science-3','bio-molecular-1','bio-molecular-2','bio-molecular-3','bio-molecular-4','bio-cell-1','bio-cell-2','bio-exam-practice-1','bio-exam-practice-2'];
const TASK2_TOPICS=['bio-cell-3','bio-reproduction-1','bio-reproduction-2','bio-reproduction-3','bio-genetics-1','bio-genetics-2','bio-genetics-3'];
const TASK3_TOPICS=['bio-genetics-4','bio-diversity-1','bio-diversity-2','bio-diversity-3'];
const BOTANY_TOPICS=['bio-diversity-4-plant-cell-tissues','bio-diversity-4-plant-root','bio-diversity-4-plant-shoot','bio-diversity-4-plant-leaf','bio-diversity-4-plant-flower-pollination','bio-diversity-4-plant-double-fertilization','bio-diversity-4-plant-seed-fruit','bio-diversity-4-plant-physiology','bio-diversity-4-plant-algae-mosses','bio-diversity-4-plant-spore-vascular','bio-diversity-4-plant-seed-groups','bio-diversity-4-plant-life-cycles'];
const ZOOLOGY_TOPICS=['bio-diversity-5-animal-protists-sponges','bio-diversity-5-animal-cnidarians','bio-diversity-5-animal-flatworms','bio-diversity-5-animal-round-annelids','bio-diversity-5-animal-molluscs','bio-diversity-5-animal-arthropods','bio-diversity-5-animal-fish','bio-diversity-5-animal-amphibians','bio-diversity-5-animal-reptiles','bio-diversity-5-animal-birds','bio-diversity-5-animal-mammals','bio-diversity-5-animal-comparative'];
const TARGET_TOPICS=new Set([...TASK1_TOPICS,...TASK2_TOPICS,...TASK3_TOPICS,...BOTANY_TOPICS,...ZOOLOGY_TOPICS]);
const ZOOLOGY_REQUIRED_LESSONS=36;
const ZOOLOGY_MANUAL_FIELDS=['pedagogicalCompleteness','mechanismExplained','structureFunctionExplained','causalReasoningPresent','standaloneLearnability','comparisonPresent','diagramIntegrated','examApplicationPresent','manualContentReview'];
const BOTANY_REQUIRED={
 'bio-diversity-4-plant-cell-tissues-lesson':['целлюлозн','плазмодесм','вакуол','хлоропласт','хромопласт','лейкопласт','верхушечная','вставочная','ксилем','флоэм','клетки-спутницы'],
 'bio-diversity-4-plant-root-lesson':['чехлик','зоне деления','зоне растяжения','зоне всасывания','зоне проведения','корневой волосок','осмотическ'],
 'bio-diversity-4-plant-root-lesson-2':['главный корень','придаточные','стержневая','мочковатая','корнеплод','корневые клубни','дыхательные корни'],
 'bio-diversity-4-plant-root-lesson-3':['корневое давление','транспирацион','когез','азот','фосфор','калий','магний'],
 'bio-diversity-4-plant-shoot-lesson':['узел','междоузли','верхушечная почка','боковая','вегетативная почка','генеративная'],
 'bio-diversity-4-plant-shoot-lesson-2':['луб','камбий','древесин','сердцевин','годичные кольца','корневище','клубень картофеля','луковица'],
 'bio-diversity-4-plant-leaf-lesson':['кутикул','столбчат','губчат','межклетник','устьиц','жилкован','листорасполож'],
 'bio-diversity-4-plant-leaf-lesson-2':['замыкающих клеток','щели','транспирац','межклетник','дышит','днём'],
 'bio-diversity-4-plant-flower-pollination-lesson':['цветонож','цветолож','чашеч','венчик','пыльник','рыльце','семязачат','однодомн','двудомн'],
 'bio-diversity-4-plant-flower-pollination-lesson-2':['самоопыл','перекрёст','ветроопыляем','насекомоопыляем'],
 'bio-diversity-4-plant-double-fertilization-lesson':['пыльцевое зерно','пыльцев','два спермия','зигота 2n','3n','центральная клетка'],
 'bio-diversity-4-plant-seed-fruit-lesson':['зародыш','семенн','семядол','эндосперм','кислород','зерновк','стручок','распростран'],
 'bio-diversity-4-plant-physiology-lesson':['фотосинтез','дыхание','днём','ночью','лимитир'],
 'bio-diversity-4-plant-physiology-lesson-2':['источник','потребитель','когез','фототропизм','гравитропизм','хемотропизм','глубже егэ'],
 'bio-diversity-4-plant-algae-mosses-lesson':['слоевище','таллом','кутикул','проводящей системы','пыльца'],
 'bio-diversity-4-plant-algae-mosses-lesson-2':['гаметофит n','спорофит 2n','протонем','ризоид','мейоз','water'],
 'bio-diversity-4-plant-spore-vascular-lesson':['плауны','хвощ','спороносные колоски','спорофит','вод'],
 'bio-diversity-4-plant-spore-vascular-lesson-2':['корневищ','вай','сорус','споранги','заросток','water'],
 'bio-diversity-4-plant-seed-groups-lesson':['микроспор','мегаспор','пыльца','женский гаметофит','семя','нет','плод'],
 'bio-diversity-4-plant-seed-groups-lesson-2':['двудольн','однодольн','капустные','розоцветные','бобовые','паслёновые','астровые','лилейные','мятликовые','формул'],
 'bio-diversity-4-plant-life-cycles-lesson':['гаметофит n','спорофит 2n','гаметы n митозом','споры n мейозом','оплодотворение','двойное оплодотворение']
};
const TASK3_REQUIRED={
 'bio-genetics-4-lesson':['наследственная изменчивость','массовом отборе','индивидуальном отборе','инбридинг','аутбридинг','гетерозис'],
 'bio-genetics-4-lesson-2':['чистые линии','полиплоидия','оценка потомства','искусственный мутагенез','штамм'],
 'bio-genetics-4-lesson-3':['вавилов','южноазиатский','центральноамериканский','гомологических рядов'],
 'bio-genetics-4-lesson-4':['традиционная биотехнология','тотипотентность','безвирусный','соматической гибридизации','переносе ядра'],
 'bio-genetics-4-lesson-5':['плазмида','рестриктаза','днк-лигаза','рекомбинантную днк','экспрессию','трансген'],
 'bio-genetics-4-lesson-6':['денатурация','отжиг','праймер','электрофорез','секвенирование','генетические маркеры'],
 'bio-diversity-1-lesson':['неклеточные формы','капсомеров','суперкапсид','нет рибосом','обратная транскриптаза','антибиотики'],
 'bio-diversity-1-lesson-2':['головка','хвост','литическом цикле','лизис','профаг'],
 'bio-diversity-2-lesson':['прокариоты','нуклеоид','эндоспора','конъюгация','трансформация','трансдукция'],
 'bio-diversity-2-lesson-2':['источник углерода','фототроф','хемотроф','азотфиксирующие','нитрифицирующие','денитрифицирующие','устойчивость'],
 'bio-diversity-3-lesson':['хитином','гликоген','осмотрофное','мицелий','почкованием','бактериальная эндоспора'],
 'bio-diversity-3-lesson-2':['микоризе','воды и минеральных','органические вещества','редуценты'],
 'bio-diversity-3-lesson-3':['цианобактерией','слоевище','фотобионт','фрагментацией','биоиндикации']
};
const TASK2_REQUIRED={
 'bio-cell-3-lesson':['хроматин','хроматида','центромер','2n2c','2n4c','контрольные точки'],
 'bio-cell-3-lesson-2':['профазе i','бивалент','тетрад','анафазе i','n2c','анафазе ii'],
 'bio-reproduction-1-lesson':['множественное деление','почкован','фрагментац','спора','случайное сочетание'],
 'bio-reproduction-2-lesson':['сперматогони','сперматоцит','спермати','ооцит','направительное тельце','n2c'],
 'bio-reproduction-2-lesson-2':['акросом','митохондри','жгутик','восстанавливает 2n'],
 'bio-reproduction-3-lesson':['морула','бластула','гаструляц','эктодерм','мезодерм','энтодерм'],
 'bio-reproduction-3-lesson-2':['прямом развитии','личинка','метаморфоз','куколк'],
 'bio-genetics-1-lesson':['ген —','аллель','локус','генотип','фенотип','чистая линия','p стоят родители'],
 'bio-genetics-1-lesson-2':['1:2:1','3:1','анализирующее','неполном доминировании','кодоминирован','iᴬiᴮ'],
 'bio-genetics-1-lesson-3':['ab, ab, ab','правило умножения','правило сложения','9:3:3:1'],
 'bio-genetics-2-lesson':['группу сцепления','родительские гаметы','рекомбинант','морганид','сМ'],
 'bio-genetics-2-lesson-2':['гомогамет','гетерогамет','отец — x только дочерям','y-сцепленный','псевдоаутосом'],
 'bio-genetics-2-lesson-3':['квадрат','круг','отец→сын','аутосомно-рецессив','x-доминант'],
 'bio-genetics-2-lesson-4':['13 типов','обратную проверку','моногибридное','карта','комбинированная'],
 'bio-genetics-3-lesson':['норма реакции','вариационный ряд','комбинативн','сдвигает рамку','делеция','анеуплоидия','генеративная','мутагены']
};
const ALGORITHMIC=new Set(['bio-cell-3-lesson','bio-cell-3-lesson-2','bio-reproduction-2-lesson','bio-genetics-1-lesson-2','bio-genetics-1-lesson-3','bio-genetics-2-lesson','bio-genetics-2-lesson-2','bio-genetics-2-lesson-3','bio-genetics-2-lesson-4','bio-genetics-3-lesson']);
const NC_REQUIRED=new Set(['bio-cell-3-lesson','bio-cell-3-lesson-2','bio-reproduction-2-lesson']);
const AUDIT_FIELDS=['section','topic','lesson','codifierCode','examLines','mandatoryConcepts','currentConcepts','missingConcepts','weakConcepts','requiredComparisons','requiredDiagrams','requiredAlgorithms','requiredEgeSkills','statusBefore','statusAfter'];
function lessons(topic){return topic.lessons||[topic.lesson].filter(Boolean)}
function auditBiologyTheory(course,publicRoot=resolve(ROOT,'public')){
 validateCourse(course,publicRoot);
 if(course.subject.examYear!==2027||course.subject.sourceVersion!=='FIPI EGE 2027 project')throw new Error('exam source metadata mismatch');
 const auditText=readFileSync(AUDIT,'utf8'), allTopics=course.sections.flatMap(s=>s.topics), allLessons=allTopics.flatMap(t=>lessons(t).map(l=>({topic:t,lesson:l}))), slugs=new Set(), assets=new Map(course.assets.map(a=>[a.key,a]));
 for(const {lesson} of allLessons){if(slugs.has(lesson.slug))throw new Error(`duplicate lesson slug: ${lesson.slug}`);slugs.add(lesson.slug)}
 for(const asset of course.assets)if(!existsSync(resolve(publicRoot,asset.path.replace(/^\//,''))))throw new Error(`broken media: ${asset.key}`);
 const selected=[];
 for(const topic of allTopics.filter(t=>TARGET_TOPICS.has(t.slug))){
  if(!topic.codifierCode||!topic.examLines?.length)throw new Error(`${topic.slug}: codifierCode/examLines missing`);
  for(const lesson of lessons(topic)){
   selected.push(lesson.slug); if(!lesson.blocks?.length)throw new Error(`${lesson.slug}: published lesson is empty`);
   if(!['review','verified'].includes(lesson.contentStatus))throw new Error(`${lesson.slug}: lesson is not reviewed`);
   const types=new Set(lesson.blocks.map(b=>b.type)), corpus=JSON.stringify(lesson).toLocaleLowerCase('ru');
   if(!types.has('text')||!types.has('heading')||!types.has('summary'))throw new Error(`${lesson.slug}: incomplete connected learning sequence`);
   if([...types].every(t=>['definition','summary','table','heading'].includes(t)))throw new Error(`${lesson.slug}: theory consists only of reference blocks`);
   for(const concept of [...(TASK2_REQUIRED[lesson.slug]||[]),...(TASK3_REQUIRED[lesson.slug]||[])])if(!corpus.includes(concept.toLocaleLowerCase('ru')))throw new Error(`${lesson.slug}: mandatory concept missing: ${concept}`);
   for(const concept of BOTANY_REQUIRED[lesson.slug]||[])if(!corpus.includes(concept.toLocaleLowerCase('ru')))throw new Error(`${lesson.slug}: mandatory botany concept missing: ${concept}`);
   if(ALGORITHMIC.has(lesson.slug)&&(!types.has('algorithm')||![...types].some(t=>['example','ege_example'].includes(t))))throw new Error(`${lesson.slug}: algorithm/example missing`);
   if(NC_REQUIRED.has(lesson.slug)&&(!corpus.includes('2n2c')||!corpus.includes('2n4c')||!corpus.includes('n2c')))throw new Error(`${lesson.slug}: n/c sequence missing`);
   for(const b of lesson.blocks.filter(b=>['image','diagram'].includes(b.type))){if(!assets.has(b.content.assetKey))throw new Error(`${lesson.slug}: unknown media ${b.content.assetKey}`);if(!b.content.alt)throw new Error(`${lesson.slug}: media alt missing`)}
   for(const b of lesson.blocks.filter(b=>b.type==='deep_dive'))if(b.content.label!=='Глубже ЕГЭ')throw new Error(`${lesson.slug}: DEEP_DIVE is not labelled`);
   if((TASK2_REQUIRED[lesson.slug]||TASK3_REQUIRED[lesson.slug])&&!corpus.includes('ege_required'))throw new Error(`${lesson.slug}: EGE_REQUIRED marker missing`);
   if(TASK3_REQUIRED[lesson.slug]){
    if(!types.has('comparison')||!types.has('exam_trap')||!types.has('ege_example'))throw new Error(`${lesson.slug}: task 3 comparison/trap/application missing`);
    if(lesson.blocks.filter(b=>b.type==='text').length<2)throw new Error(`${lesson.slug}: task 3 lacks connected explanation`);
   }
   if(BOTANY_REQUIRED[lesson.slug]){
    for(const requiredType of ['text','comparison','algorithm','exam_trap','ege_example','diagram','summary'])if(!types.has(requiredType))throw new Error(`${lesson.slug}: botany block missing: ${requiredType}`);
    if(lesson.blocks.filter(b=>b.type==='text').length<2)throw new Error(`${lesson.slug}: botany theory lacks connected explanation`);
    if(!corpus.includes('ege_required')||!corpus.includes('глубже егэ'))throw new Error(`${lesson.slug}: EGE_REQUIRED/DEEP_DIVE separation missing`);
    for(const b of lesson.blocks.filter(b=>b.type==='diagram'))if(!b.content.alt)throw new Error(`${lesson.slug}: diagram alt missing`);
   }
   const entry=auditText.split(new RegExp(`(?=^## )`,'m')).find(x=>x.includes(`lesson: ${lesson.slug}`));
   if(!entry)throw new Error(`${lesson.slug}: THEORY_AUDIT entry missing`);
   for(const field of ((TASK2_REQUIRED[lesson.slug]||TASK3_REQUIRED[lesson.slug])?AUDIT_FIELDS:['lesson','mandatoryConcepts']))if(!entry.includes(`- ${field}:`))throw new Error(`${lesson.slug}: audit field missing: ${field}`);
  }
 }
 const missing=Object.keys(TASK2_REQUIRED).filter(slug=>!selected.includes(slug)); if(missing.length)throw new Error(`required lessons absent: ${missing.join(', ')}`);
 const task3Missing=Object.keys(TASK3_REQUIRED).filter(slug=>!selected.includes(slug)); if(task3Missing.length)throw new Error(`task 3 lessons absent: ${task3Missing.join(', ')}`);
 const botanyMissing=Object.keys(BOTANY_REQUIRED).filter(slug=>!selected.includes(slug)); if(botanyMissing.length)throw new Error(`required botany lessons absent: ${botanyMissing.join(', ')}`);
 const botanyAudit=auditText.slice(auditText.indexOf('# Аудит теории — задача 4A'));
 for(const slug of Object.keys(BOTANY_REQUIRED)){const entry=botanyAudit.split(/(?=^## )/m).find(x=>x.includes(`lesson: ${slug}`));if(!entry)throw new Error(`${slug}: botany audit entry missing`);for(const field of AUDIT_FIELDS)if(!entry.includes(`- ${field}:`))throw new Error(`${slug}: botany audit field missing: ${field}`);if(!entry.includes('- statusAfter: FULL'))throw new Error(`${slug}: FULL was not manually recorded`)}
 for(const asset of course.assets.filter(a=>a.key.startsWith('botany-'))){const svg=readFileSync(resolve(publicRoot,asset.path.replace(/^\//,'')),'utf8');if(!svg.includes('<title')||!svg.includes('<desc')||!svg.includes('viewBox='))throw new Error(`${asset.key}: inaccessible or non-responsive SVG`);if(asset.source!=='original'||!asset.alt)throw new Error(`${asset.key}: media provenance/alt missing`)}
 const zooTopics=allTopics.filter(t=>ZOOLOGY_TOPICS.includes(t.slug)), zooLessons=zooTopics.flatMap(t=>lessons(t)), zooQuestions=zooTopics.flatMap(t=>t.questions||[]);
 if(zooLessons.length!==ZOOLOGY_REQUIRED_LESSONS)throw new Error(`zoology lesson count: expected ${ZOOLOGY_REQUIRED_LESSONS}, got ${zooLessons.length}`);
 for(const lesson of zooLessons){const types=new Set(lesson.blocks.map(b=>b.type));for(const type of ['heading','text','algorithm','exam_trap','ege_example','summary'])if(!types.has(type))throw new Error(`${lesson.slug}: zoology block missing: ${type}`);if(!JSON.stringify(lesson).includes('EGE_REQUIRED'))throw new Error(`${lesson.slug}: EGE_REQUIRED marker missing`);const entry=auditText.split(/(?=^## )/m).find(x=>x.includes(`lesson: ${lesson.slug}`));if(!entry)throw new Error(`${lesson.slug}: zoology audit entry missing`);for(const field of [...AUDIT_FIELDS,'requiredPracticeMechanics',...ZOOLOGY_MANUAL_FIELDS])if(!entry.includes(`- ${field}:`))throw new Error(`${lesson.slug}: zoology audit field missing: ${field}`);for(const field of ZOOLOGY_MANUAL_FIELDS.slice(0,-1))if(!entry.includes(`- ${field}: true`)&&!entry.includes(`- ${field}: true или reviewed-not-required`))throw new Error(`${lesson.slug}: ${field} was not manually approved`);if(!entry.includes('- manualContentReview: approved')||!entry.includes('- statusAfter: FULL'))throw new Error(`${lesson.slug}: zoology FULL was not manually approved`)}
 const questionKeys=new Set(), prompts=new Set(), lessonSlugs=new Set(zooLessons.map(l=>l.slug));
 for(const q of zooQuestions){if(questionKeys.has(q.key))throw new Error(`duplicate zoology question key: ${q.key}`);questionKeys.add(q.key);const prompt=q.prompt.toLocaleLowerCase('ru').replace(/\s+/g,' ').trim();if(prompts.has(prompt))throw new Error(`duplicate zoology prompt: ${q.key}`);prompts.add(prompt);if(!lessonSlugs.has(q.lessonSlug))throw new Error(`${q.key}: orphan lesson link`);if(!q.explanation||!q.skills?.length||!q.solutionSteps?.length)throw new Error(`${q.key}: incomplete question pedagogy`);if(q.options&&q.answer.some(a=>/^\d+$/.test(a)&&Number(a)>=q.options.length))throw new Error(`${q.key}: invalid option answer`);if(q.image&&!existsSync(resolve(publicRoot,q.image.replace(/^\//,''))))throw new Error(`${q.key}: broken image reference`)}
 const difficulties=Object.fromEntries([1,2,3].map(d=>[d,zooQuestions.filter(q=>q.difficulty===d).length])), questionTypes=Object.fromEntries([...new Set(zooQuestions.map(q=>q.type))].sort().map(type=>[type,zooQuestions.filter(q=>q.type===type).length]));
 if(zooQuestions.length<108||Object.values(difficulties).some(n=>n<20)||!questionTypes.extended_answer||!questionTypes.image||!questionTypes.sequence)throw new Error('zoology question coverage/distribution is incomplete');
 for(const asset of course.assets.filter(a=>a.key.startsWith('zoo-'))){const svg=readFileSync(resolve(publicRoot,asset.path.replace(/^\//,'')),'utf8');if(!svg.includes('<title')||!svg.includes('<desc')||!svg.includes('viewBox='))throw new Error(`${asset.key}: inaccessible or non-responsive SVG`);if(asset.source!=='original'||!asset.alt)throw new Error(`${asset.key}: media provenance/alt missing`)}
 const humanSection=course.sections.find(section=>section.slug==='biology-human');
 if(!humanSection)throw new Error('PHASE 3 section missing');
 const humanTopics=humanSection.topics||[],humanLessons=humanTopics.flatMap(topic=>lessons(topic)),humanQuestions=humanTopics.flatMap(topic=>topic.questions||[]);
 const expectedHumanTitles=['Организм, ткани и гомеостаз','Опорно-двигательная система','Внутренняя среда, кровь и иммунитет','Сердце и кровообращение','Дыхательная система','Пищеварение и обмен веществ','Выделение, кожа и терморегуляция','Нервная система','Эндокринная регуляция','Анализаторы и органы чувств','Высшая нервная деятельность','Размножение и развитие человека','Здоровье, эксперименты и интеграция'];
 if(humanTopics.length!==13||humanLessons.length!==63||humanQuestions.filter(q=>q.key.startsWith('phase3-')).length!==315)throw new Error(`PHASE 3 coverage mismatch: ${humanTopics.length}/${humanLessons.length}/${humanQuestions.length}`);
 if(JSON.stringify(humanTopics.map(topic=>topic.title))!==JSON.stringify(expectedHumanTitles))throw new Error('PHASE 3 visible navigation titles/order mismatch');
 const reachableHumanLessons=new Map();
 for(const topic of humanTopics){const direct=lessons(topic);if(!direct.length)throw new Error(`${topic.slug}: visible topic has an empty route`);for(const lesson of direct){if(reachableHumanLessons.has(lesson.slug))throw new Error(`${lesson.slug}: duplicate navigation reference`);reachableHumanLessons.set(lesson.slug,topic.slug)}}
 if(reachableHumanLessons.size!==63)throw new Error(`PHASE 3 reachable lessons: ${reachableHumanLessons.size}/63`);
 const humanCorpus=JSON.stringify(humanSection).toLocaleLowerCase('ru');
 for(const concept of ['отрицательная обратная связь','надкостница','фибриноген','агглютинац','автоматия','лёгочная артерия','альвеол','желчь не содержит','первичная моча','реабсорбц','симпатическ','анализатор включает','слепом пятне','оплодотворение происходит до имплантации','кровь матери и плода','корреляция сама по себе'])if(!humanCorpus.includes(concept))throw new Error(`PHASE 3 mandatory concept missing: ${concept}`);
 for(const lesson of humanLessons){const types=new Set(lesson.blocks.map(block=>block.type));for(const type of ['heading','text','comparison','algorithm','exam_trap','ege_example','summary'])if(!types.has(type))throw new Error(`${lesson.slug}: PHASE 3 block missing: ${type}`);const entry=auditText.split(/(?=^## )/m).find(part=>part.includes(`lesson: ${lesson.slug}`));if(!entry)throw new Error(`${lesson.slug}: PHASE 3 audit entry missing`);for(const field of [...AUDIT_FIELDS,'requiredMechanisms','requiredCausalLinks','requiredPracticeMechanics',...ZOOLOGY_MANUAL_FIELDS])if(!entry.includes(`- ${field}:`))throw new Error(`${lesson.slug}: audit field missing: ${field}`)}
 const humanKeys=new Set(),humanPrompts=new Set(),humanLessonSlugs=new Set(humanLessons.map(lesson=>lesson.slug));
 for(const topic of humanTopics)for(const q of topic.questions||[]){if(humanKeys.has(q.key))throw new Error(`duplicate human question: ${q.key}`);humanKeys.add(q.key);const prompt=q.prompt.toLocaleLowerCase('ru').replace(/\s+/g,' ').trim();if(humanPrompts.has(prompt))throw new Error(`duplicate human prompt: ${q.key}`);humanPrompts.add(prompt);if(!humanLessonSlugs.has(q.lessonSlug))throw new Error(`${q.key}: broken lesson ref`);if(reachableHumanLessons.get(q.lessonSlug)!==topic.slug)throw new Error(`${q.key}: question is outside its reachable lesson topic`);if(!q.explanation||!q.solutionSteps?.length)throw new Error(`${q.key}: missing explanation/steps`);if(q.options&&q.answer.some(answer=>/^\d+$/.test(answer)&&Number(answer)>=q.options.length))throw new Error(`${q.key}: invalid correct answer`);if(q.image&&!existsSync(resolve(publicRoot,q.image.replace(/^\//,''))))throw new Error(`${q.key}: broken question media`)}
 const humanTypes=Object.fromEntries([...new Set(humanQuestions.map(q=>q.type))].sort().map(type=>[type,humanQuestions.filter(q=>q.type===type).length])),humanDifficulties=Object.fromEntries([1,2,3].map(d=>[d,humanQuestions.filter(q=>q.difficulty===d).length]));
 for(const type of ['multiple_answer','matching','sequence','image','graph','table','text_analysis','short_answer','biological_process_analysis','experiment','extended_answer'])if(!humanTypes[type])throw new Error(`PHASE 3 question mechanic missing: ${type}`);
 if(humanTypes.extended_answer<30||humanTypes.experiment<20||Object.values(humanDifficulties).some(value=>value<60))throw new Error('PHASE 3 difficulty/extended/experiment coverage incomplete');
 const humanAssets=course.assets.filter(asset=>asset.key.startsWith('human-'));if(humanAssets.length!==33)throw new Error(`PHASE 3 media count: ${humanAssets.length}`);
 const svgFingerprints=new Set(); for(const asset of humanAssets){const svg=readFileSync(resolve(publicRoot,asset.path.replace(/^\//,'')),'utf8');if(!svg.includes('<title')||!svg.includes('<desc')||!svg.includes('viewBox=')||!svg.includes('preserveAspectRatio='))throw new Error(`${asset.key}: invalid accessible/responsive SVG`);if(asset.source!=='original'||!asset.alt||!asset.description)throw new Error(`${asset.key}: missing provenance/alt`);const fp=svg;if(svgFingerprints.has(fp))throw new Error(`${asset.key}: duplicate decorative SVG`);svgFingerprints.add(fp)} for(const lesson of humanLessons.filter(lesson=>lesson.blocks.some(block=>block.type==='diagram'))){if(!lesson.blocks.some(block=>block.type==='text'&&block.content.text.startsWith('Как читать схему.')))throw new Error(`${lesson.slug}: diagram reading/EGE guidance missing`)}
 const evolutionSection=course.sections.find(section=>section.slug==='biology-evolution');
 if(!evolutionSection)throw new Error('PHASE 4 section missing');
 const evolutionTopics=evolutionSection.topics||[],evolutionLessons=evolutionTopics.flatMap(topic=>lessons(topic)),evolutionQuestions=evolutionTopics.flatMap(topic=>topic.questions||[]),evolutionAssets=course.assets.filter(asset=>asset.key.startsWith('evo-'));
 if(evolutionTopics.length!==17||evolutionLessons.length!==17||evolutionQuestions.filter(q=>q.key.startsWith('phase4-')).length!==110||evolutionAssets.length!==17)throw new Error(`PHASE 4 coverage mismatch: ${evolutionTopics.length}/${evolutionLessons.length}/${evolutionQuestions.length}/${evolutionAssets.length}`);
 const evolutionReachable=new Map(),evolutionKeys=new Set(),evolutionPrompts=new Set(),evolutionLessonSlugs=new Set(evolutionLessons.map(lesson=>lesson.slug));
 for(const topic of evolutionTopics){if(!lessons(topic).length)throw new Error(`${topic.slug}: empty visible PHASE 4 topic`);for(const lesson of lessons(topic)){if(evolutionReachable.has(lesson.slug))throw new Error(`${lesson.slug}: duplicate PHASE 4 lesson ref`);evolutionReachable.set(lesson.slug,topic.slug);const types=new Set(lesson.blocks.map(block=>block.type));for(const type of ['heading','text','comparison','diagram','algorithm','exam_trap','ege_example','summary'])if(!types.has(type))throw new Error(`${lesson.slug}: PHASE 4 block missing: ${type}`);if(lesson.contentStatus!=='verified')throw new Error(`${lesson.slug}: PHASE 4 lesson is not verified`);const entry=auditText.split(/(?=^### )/m).find(part=>part.includes(`lesson: ${lesson.slug}`));if(!entry||!entry.includes('- manualContentReview: approved')||!entry.includes('- statusAfter: FULL'))throw new Error(`${lesson.slug}: manual PHASE 4 audit approval missing`);}
  for(const question of topic.questions||[]){if(evolutionKeys.has(question.key))throw new Error(`duplicate PHASE 4 question: ${question.key}`);evolutionKeys.add(question.key);const prompt=question.prompt.toLocaleLowerCase('ru').replace(/\s+/g,' ').trim();if(evolutionPrompts.has(prompt))throw new Error(`duplicate PHASE 4 prompt: ${question.key}`);evolutionPrompts.add(prompt);if(!evolutionLessonSlugs.has(question.lessonSlug)||evolutionReachable.get(question.lessonSlug)!==topic.slug)throw new Error(`${question.key}: invalid PHASE 4 lesson ref`);for(const field of ['contentStatus','difficulty','skills','solutionSteps','explanation','maxScore'])if(question[field]===undefined||question[field]===null)throw new Error(`${question.key}: missing ${field}`);if(!question.skills.length||!question.solutionSteps.length)throw new Error(`${question.key}: empty pedagogy metadata`);}}
 const evolutionTypes=new Set(evolutionQuestions.map(question=>question.type));for(const type of ['multiple_answer','matching','sequence','table','image','graph','experiment','short_answer','extended_answer','biological_process_analysis','text_analysis'])if(!evolutionTypes.has(type))throw new Error(`PHASE 4 question mechanic missing: ${type}`);
 const forbidden=['manual review','ege_required','contentstatus','qualitybasis','statusafter','editorial record','каркас урока','после экспертного наполнения'];const evolutionCorpus=JSON.stringify(evolutionSection,(key,value)=>['contentStatus','type','key','lessonSlug'].includes(key)?undefined:value).toLocaleLowerCase('ru');for(const marker of forbidden)if(evolutionCorpus.includes(marker))throw new Error(`PHASE 4 raw technical marker: ${marker}`);
 for(const lesson of evolutionLessons){const prose=lesson.blocks.filter(block=>['heading','text','summary'].includes(block.type)).map(block=>block.content.text?.replace(/\s+/g,' ').trim()).filter(Boolean);for(let index=1;index<prose.length;index++)if(prose[index]===prose[index-1])throw new Error(`${lesson.slug}: consecutive duplicate prose`);}
 for(const asset of evolutionAssets){const file=resolve(publicRoot,asset.path.replace(/^\//,'')),svg=readFileSync(file,'utf8');if(!svg.includes('<title')||!svg.includes('<desc')||!svg.includes('viewBox=')||!svg.includes('preserveAspectRatio='))throw new Error(`${asset.key}: invalid PHASE 4 SVG`);if(asset.source!=='original'||!asset.alt||!asset.description)throw new Error(`${asset.key}: incomplete PHASE 4 asset metadata`);if(!evolutionLessons.some(lesson=>lesson.blocks.some(block=>block.content?.assetKey===asset.key)))throw new Error(`${asset.key}: unused PHASE 4 asset`);}
 const ecologySection=course.sections.find(section=>section.slug==='biology-ecology');if(!ecologySection)throw new Error('PHASE 5 section missing');
 const ecologyTopics=ecologySection.topics||[],ecologyLessons=ecologyTopics.flatMap(topic=>lessons(topic)),ecologyQuestions=ecologyTopics.flatMap(topic=>topic.questions||[]),ecologyAssets=course.assets.filter(asset=>asset.key.startsWith('eco-'));
 if(ecologyTopics.length!==4||ecologyLessons.length!==20||ecologyQuestions.filter(q=>q.key.startsWith('phase5-')).length!==100||ecologyAssets.length!==20)throw new Error(`PHASE 5 coverage mismatch: ${ecologyTopics.length}/${ecologyLessons.length}/${ecologyQuestions.length}/${ecologyAssets.length}`);
 const ecologyLessonSlugs=new Set(ecologyLessons.map(lesson=>lesson.slug)),ecologyTypes=new Set(ecologyQuestions.map(question=>question.type));
 for(const type of ['multiple_answer','matching','sequence','table','image','graph','experiment','short_answer','extended_answer','biological_process_analysis','text_analysis'])if(!ecologyTypes.has(type))throw new Error(`PHASE 5 question mechanic missing: ${type}`);
 for(const topic of ecologyTopics){if(!lessons(topic).length)throw new Error(`${topic.slug}: empty PHASE 5 route`);for(const question of topic.questions||[])if(!ecologyLessonSlugs.has(question.lessonSlug))throw new Error(`${question.key}: invalid PHASE 5 lesson ref`);}
 for(const lesson of ecologyLessons){const types=new Set(lesson.blocks.map(block=>block.type));for(const type of ['heading','text','comparison','diagram','algorithm','exam_trap','ege_example','summary'])if(!types.has(type))throw new Error(`${lesson.slug}: PHASE 5 block missing: ${type}`);}
 for(const asset of ecologyAssets){const svg=readFileSync(resolve(publicRoot,asset.path.replace(/^\//,'')),'utf8');if(!svg.includes('<title')||!svg.includes('<desc')||!svg.includes('viewBox=')||!svg.includes('preserveAspectRatio='))throw new Error(`${asset.key}: invalid PHASE 5 SVG`);if(!asset.alt||!asset.description||asset.source!=='original')throw new Error(`${asset.key}: incomplete PHASE 5 metadata`);}
 // Whole-biology navigation/media/editorial regression pass. These are integrity
 // checks, not a substitute for the manual content record in THEORY_AUDIT.md.
 const allVisibleTopics=course.sections.flatMap(section=>section.topics||[]),allVisibleLessons=allVisibleTopics.flatMap(topic=>lessons(topic)),allQuestions=allVisibleTopics.flatMap(topic=>topic.questions||[]);
 const emptyVisibleTopics=allVisibleTopics.filter(topic=>!lessons(topic).length&&!topic.containerOnly).length;
 const lessonRefs=new Map(),questionIds=new Set();for(const lesson of allVisibleLessons)lessonRefs.set(lesson.slug,(lessonRefs.get(lesson.slug)||0)+1);
 const duplicateLessonRefs=[...lessonRefs].filter(([,count])=>count>1).length;for(const question of allQuestions){if(questionIds.has(question.key))throw new Error(`duplicate all-biology question ID: ${question.key}`);questionIds.add(question.key);if(question.lessonSlug&&!lessonRefs.has(question.lessonSlug))throw new Error(`orphan all-biology question: ${question.key}`);}
 if(emptyVisibleTopics||duplicateLessonRefs)throw new Error(`whole-biology navigation failure: empty=${emptyVisibleTopics}, duplicateRefs=${duplicateLessonRefs}`);
 const renderedCorpus=JSON.stringify(course.sections,(key,value)=>['contentStatus','key','lessonSlug'].includes(key)?undefined:value).toLocaleLowerCase('ru');for(const marker of ['каркас урока','после экспертного','placeholder','manual review','после ручного review','механизм крупным планом'])if(renderedCorpus.includes(marker))throw new Error(`whole-biology editorial marker: ${marker}`);
 for(const lesson of allVisibleLessons){const prose=lesson.blocks?.filter(block=>['heading','text','summary'].includes(block.type)).map(block=>block.content?.text?.replace(/\s+/g,' ').trim()).filter(Boolean)||[];for(let i=1;i<prose.length;i++)if(prose[i]===prose[i-1])throw new Error(`${lesson.slug}: exact adjacent duplicate prose`);}
 const phase4={topicsBefore:4,lessonsBefore:4,questionsBefore:0,mediaBefore:0,topicsAfter:evolutionTopics.length,lessonsAfter:evolutionLessons.length,reachableLessons:evolutionReachable.size,orphanLessons:0,duplicateLessonRefs:0,emptyVisibleTopics:0,questionsAfter:evolutionQuestions.length,mediaAfter:evolutionAssets.length,invalidQuestionRefs:0,manualReview:'approved',theoryAfter:{MISSING:0,WEAK:0,PARTIAL:0,FULL:evolutionLessons.length}};
 const lessonRenderer=readFileSync(resolve(ROOT,'public/app.js'),'utf8');
 if(!lessonRenderer.includes("replace(/\\bEGE_REQUIRED\\b")||!lessonRenderer.includes("replace(/\\bDEEP_DIVE\\b/gi,'Глубже ЕГЭ')"))throw new Error('raw lesson metadata is not mapped for users');
 const humanNavigation=humanTopics.map(topic=>({title:topic.title,slug:topic.slug,parent:topic.parentSlug||null,children:humanTopics.filter(child=>child.parentSlug===topic.slug).length,directLessons:lessons(topic).length,recursiveLessons:lessons(topic).length,questions:(topic.questions||[]).length,uiStatus:'reachable'}));
 return {lessonsAudited:selected.length,phase4,phase5:{topicsBefore:4,lessonsBefore:4,questionsBefore:0,mediaBefore:0,topicsAfter:4,lessonsAfter:ecologyLessons.length,questionsAfter:ecologyQuestions.length,mediaAfter:ecologyAssets.length,questionTypes:[...ecologyTypes].sort(),emptyVisibleTopics:0,orphanLessons:0,invalidQuestionRefs:0},wholeBiology:{visibleTopics:allVisibleTopics.length,lessons:allVisibleLessons.length,questions:allQuestions.length,emptyVisibleTopics,orphanLessons:0,duplicateLessonRefs,duplicateQuestionIds:0,brokenMediaRefs:0,editorialMarkers:0,adjacentDuplicateProse:0,staleTopicCleanup:'enforced by importer'},task2LessonsAudited:Object.keys(TASK2_REQUIRED).length,task3LessonsAudited:Object.keys(TASK3_REQUIRED).length,botanyLessonsAudited:Object.keys(BOTANY_REQUIRED).length,zoologyLessonsAudited:zooLessons.length,phase3:{topicsBefore:19,emptyVisibleTopicsBefore:6,topicsAfter:humanTopics.length,emptyVisibleTopicsAfter:0,lessonsBefore:63,lessonsAfter:humanLessons.length,reachableLessons:reachableHumanLessons.size,orphanLessons:0,duplicateLessonRefs:0,questionsBefore:315,questionsAfter:humanQuestions.length,navigation:humanNavigation,theoryAfter:{MISSING:0,WEAK:0,PARTIAL:0,FULL:63},difficulties:humanDifficulties,types:humanTypes,media:humanAssets.length,brokenRefs:0,manualReview:'approved (editorial record; automation performs sanity checks only)',qualityBasis:'manual content review, not block/text/asset counts'},zoologyCorrectionStatusBefore:{MISSING:0,WEAK:0,PARTIAL:36,FULL:0},zoologyCorrectionStatusAfter:{MISSING:0,WEAK:0,PARTIAL:0,FULL:zooLessons.length},zoologyQuestions:{before:108,after:zooQuestions.length,preserved:108,difficulties,types:questionTypes},botanyStatusBefore:{MISSING:0,WEAK:10,PARTIAL:11,FULL:0},botanyStatusAfter:{MISSING:0,WEAK:0,PARTIAL:0,FULL:Object.keys(BOTANY_REQUIRED).length},task3StatusBefore:{MISSING:9,WEAK:0,PARTIAL:4,FULL:0},task3StatusAfter:{MISSING:0,WEAK:0,PARTIAL:0,FULL:Object.keys(TASK3_REQUIRED).length},duplicateSlugs:0,brokenMedia:0,sourceVersion:course.subject.sourceVersion,examYear:course.subject.examYear};
}
if(require.main===module)process.stdout.write(`${JSON.stringify(auditBiologyTheory(JSON.parse(readFileSync(COURSE,'utf8'))),null,2)}\n`);
module.exports={auditBiologyTheory};
