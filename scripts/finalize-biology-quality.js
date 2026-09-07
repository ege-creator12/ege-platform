'use strict';
const fs=require('node:fs');
const path=require('node:path');
const human=require('../content/biology/human-reference');
const {variantQuestions}=require('../content/biology/mock-variants');
const H=text=>({type:'heading',content:{text}});
const T=text=>({type:'text',content:{text}});
function finalize(course){
 const topics=course.sections.flatMap(s=>s.topics),lessons=topics.flatMap(t=>t.lessons||[t.lesson].filter(Boolean));
 const add=(slug,blocks)=>{const l=lessons.find(l=>l.slug===slug);if(!l)throw new Error('Missing lesson '+slug);if(l.blocks.some(b=>b.type==='heading'&&b.content.text===blocks[0].content.text))return;let at=l.blocks.findIndex(b=>b.type==='summary');l.blocks.splice(at<0?l.blocks.length:at,0,...blocks)};
 for(const [key,rows]of Object.entries(human))add('bio-human-'+key,[H('Опорная таблица: структуры, механизмы и различия'),{type:'table',content:{columns:['Структура или процесс','Механизм','Что следует из этого'],rows}}]);
 add('bio-molecular-3-lesson-3',[
  H('Полная таблица стандартного генетического кода'),
  T('Читайте кодон иРНК в направлении 5′→3′. В таблице перечислены все 64 триплета; несколько кодонов могут обозначать одну аминокислоту. АУГ кодирует метионин и обычно служит стартом. Стоп-кодоны завершают трансляцию и не добавляют аминокислоту. Это стандартный код; в отдельных генетических системах существуют исключения.'),
  {type:'table',content:{columns:['Аминокислота или сигнал','Кодоны иРНК'],rows:[['Фенилаланин','УУУ, УУЦ'],['Лейцин','УУА, УУГ, ЦУУ, ЦУЦ, ЦУА, ЦУГ'],['Изолейцин','АУУ, АУЦ, АУА'],['Метионин','АУГ'],['Валин','ГУУ, ГУЦ, ГУА, ГУГ'],['Серин','УЦУ, УЦЦ, УЦА, УЦГ, АГУ, АГЦ'],['Пролин','ЦЦУ, ЦЦЦ, ЦЦА, ЦЦГ'],['Треонин','АЦУ, АЦЦ, АЦА, АЦГ'],['Аланин','ГЦУ, ГЦЦ, ГЦА, ГЦГ'],['Тирозин','УАУ, УАЦ'],['Гистидин','ЦАУ, ЦАЦ'],['Глутамин','ЦАА, ЦАГ'],['Аспарагин','ААУ, ААЦ'],['Лизин','ААА, ААГ'],['Аспарагиновая кислота','ГАУ, ГАЦ'],['Глутаминовая кислота','ГАА, ГАГ'],['Цистеин','УГУ, УГЦ'],['Триптофан','УГГ'],['Аргинин','ЦГУ, ЦГЦ, ЦГА, ЦГГ, АГА, АГГ'],['Глицин','ГГУ, ГГЦ, ГГА, ГГГ'],['Стоп','УАА, УАГ, УГА']],sourceUrl:'https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi#SG1',sourceLabel:'Стандартный генетический код — NCBI'}},
  {type:'ege_example',content:{prompt:'Кодирующая ДНК: 5′-АТГ-ТТТ-ГГТ-ТГА-3′. Запишите иРНК, аминокислоты и число пептидных связей, считая участок полностью переводимым.',answer:'иРНК совпадает с кодирующей цепью с У вместо Т: 5′-АУГ-УУУ-ГГУ-УГА-3′. Получается метионин — фенилаланин — глицин; УГА — стоп. В линейном полипептиде из трёх аминокислот две пептидные связи. По матричной цепи нужно было бы строить антипараллельный комплемент.'}}
 ]);
 add('bio-molecular-4-lesson-2',[H('Брожение: зачем восстанавливается НАД⁺'),T('Гликолиз восстанавливает НАД⁺ до НАДН. Если окисленный переносчик не возвращается, гликолиз останавливается. При молочнокислом брожении пируват восстанавливается до лактата, а НАДН окисляется до НАД⁺. При спиртовом брожении пируват сначала теряет CO₂, образуя ацетальдегид, который восстанавливается до этанола. Само брожение не добавляет АТФ к двум чистым АТФ гликолиза; его роль — позволить гликолизу продолжаться без кислородной дыхательной цепи.'),{type:'comparison',content:{title:'Не путайте процессы',columns:['Процесс','Конечный результат для углерода','Роль кислорода'],rows:[['Молочнокислое брожение','Лактат, без выделения CO₂ на данном этапе','Не требуется как конечный акцептор'],['Спиртовое брожение','Этанол и CO₂','Не требуется как конечный акцептор'],['Аэробное дыхание','Полное окисление до CO₂; образование воды','O₂ принимает электроны в конце дыхательной цепи']]}}]);
 add('bio-exam-practice-4-lesson',[H('Структура пробника и баллы: проект ЕГЭ-2027'),T('Полный вариант содержит 28 заданий: 21 с кратким ответом и 7 с развёрнутым. Максимум — 57 первичных баллов; экзаменационное время — 235 минут. Задания 1, 3, 4, 5, 9, 13, 21 дают по 1 баллу; остальные задания первой части — по 2. Задания 22–25, 27 и 28 дают до 3 баллов, задание 26 — до 4. Развёрнутые ответы оцениваются по смысловым критериям, а не буквальному совпадению фразы.'),T('На сайте можно заниматься без таймера и обращаться к разбору. Поэтому полученный балл — учебный результат, а не гарантированный прогноз экзамена. Используется опубликованный проект ФИПИ-2027; окончательная спецификация после утверждения может потребовать обновления.'),{type:'table',content:{columns:['Группа заданий','Правило частичного балла'],rows:[['2, 6, 10, 14, 19, 20','Один неверный символ на своей позиции — 1 балл; лишняя длина — 0'],['7, 11, 15, 17, 18','Порядок не важен; одна замена, один лишний или один пропущенный символ — 1 балл'],['8, 12, 16','Не более двух неверных позиций — 1 балл; при лишней длине результат уменьшается на 1, не ниже 0']],sourceUrl:'https://fipi.ru/ege/demoversii-specifikacii-kodifikatory',sourceLabel:'Проекты демоверсии, спецификации и кодификатора ФИПИ'}}]);
 // Correct a pair-of-bases statement: a single strand does not contain A–T pairs.
 const molecular=lessons.find(l=>l.slug==='bio-exam-practice-2-lesson');
 for(const b of molecular.blocks)if(b.content.text)b.content.text=b.content.text.replace('Если в одной цепи 12 A–T-пар и 8 G–C-пар','Если в двуцепочечном фрагменте 12 A–T-пар и 8 G–C-пар');
 const boilerplate=[/^Связь строения и функции\. Особенности строения уменьшают путь переноса/,/^Связи систем\. Рассматриваемый процесс зависит от кровоснабжения/,/^Сформулируйте гипотезу, изменяйте одну независимую переменную/,/^Количественные детали конкретного механизма могут зависеть/];
 for(const l of lessons)l.blocks=l.blocks.filter(b=>!boilerplate.some(re=>re.test(b.content.text||''))&&!(b.type==='quiz'&&/^(Как проверить ответ по теме урока|Объясните одну ключевую причинно-следственную связь урока)/.test(b.content.question||b.content.prompt||b.content.text||'')));
 const questions=topics.flatMap(t=>t.questions||[]),byKey=new Map(questions.map(q=>[q.key,q]));
 // Repair misleading image associations and require semantic self-review for explanations.
 const imageFixes={'bio-70-006':'replication.svg','bio-80-006':'mitochondrion.svg','bio-90-006':'chloroplast.svg','phase3-human-029-d':'phase3/digestive-system.svg','phase4-mechanism-22':'phase3/skeleton.svg'};
 for(const [key,file] of Object.entries(imageFixes))byKey.get(key).image='/images/biology/'+file;
 byKey.get('bio-90-006').prompt='Органоид имеет двойную оболочку и стопки мембранных дисков — граны. Назовите органоид и объясните роль тилакоидов.';
 Object.assign(byKey.get('bio-90-006'),{manualReview:true,answer:['Хлоропласт. На мембранах тилакоидов происходят светозависимые реакции фотосинтеза: перенос электронов, образование протонного градиента и синтез АТФ.']});
 const stomach=lessons.find(l=>l.slug==='bio-human-stomach');
 for(const b of stomach.blocks)if((b.content.assetKey==='human-tooth'||b.content.src==='/images/biology/phase3/digestive-system.svg'))b.content={path:'/images/biology/phase3/digestive-system.svg',title:'Пищеварительная система',alt:'Положение желудка в пищеварительном тракте',caption:'Желудок находится между пищеводом и двенадцатиперстной кишкой.'};
 for(const q of questions)if(q.key.startsWith('phase2-')&&/\[PH2-/.test(q.prompt)&&['image','diagram'].includes(q.type)){
  const claim=q.prompt.match(/«([^»]+)»/)?.[1];if(!claim)continue;
  q.prompt='Объясните утверждение «'+claim+'». Укажите биологический механизм.';
  q.explanation=q.explanation.replace(' Поэтому признак нужно выводить из устройства или последовательности процесса, а не запоминать изолированно.','');
  q.answer=[q.explanation];q.manualReview=true;
 }
 const seq=(key,labels,answer,explanation)=>{const q=byKey.get(key);if(!q)throw new Error(key);Object.assign(q,{options:labels,answer:answer.map(String),explanation,solutionSteps:[explanation,'Проверьте начальную точку и направление последовательности.']})};
 seq('phase1-bio-reproduction-1-03',['Образование зиготы','Гаметогенез','Начало слияния гамет','Дробление зиготы'],[1,2,0,3],'Гаметогенез образует гаметы. Их слияние приводит к зиготе; затем начинаются её митотические деления.');
 seq('phase1-bio-reproduction-2-01',['Созревание','Размножение','Формирование','Рост'],[1,3,0,2],'Сперматогонии размножаются, растут, проходят мейоз и затем формируются в сперматозоиды.');
 seq('phase1-bio-reproduction-3-01',['Гаструла','Зигота','Бластула','Дробление','Органогенез'],[1,3,2,0,4],'Зигота дробится; образуется бластула, затем гаструла и закладываются органы.');
 seq('phase1-bio-genetics-3-08',['Измерить признак','Построить кривую','Упорядочить варианты','Подсчитать частоты'],[0,2,3,1],'Измерения дают исходные данные; варианты упорядочивают, определяют частоты и строят график.');
 seq('phase1-bio-genetics-4-02',['Введение в клетку','Выделение ДНК','Соединение лигазой','Разрезание рестриктазой'],[1,3,2,0],'Выделяют ДНК и вектор, разрезают, соединяют совместимые фрагменты и вводят рекомбинантную молекулу в клетку.');
 seq('phase1-bio-genetics-4-05',['Отжиг праймеров','Денатурация ДНК','Удлинение цепи полимеразой'],[1,0,2],'Нагрев разделяет цепи, затем праймеры связываются с матрицами, после чего полимераза удлиняет цепи.');
 seq('phase4-mechanism-05',['Накопление различий','Появление географического барьера','Устойчивая репродуктивная изоляция','Сокращение потока генов','Независимое действие мутаций, дрейфа и отбора в изолированных группах'],[1,3,4,0,2],'Географический барьер уменьшает поток генов. Независимые изменения генофондов могут приводить к накоплению различий и репродуктивной изоляции. Это возможный путь, а не гарантированное следствие любого барьера.');
 seq('phase4-mechanism-17',['Появление эукариот','Первые прокариоты','Выход сосудистых растений на сушу','Амниотическое яйцо','Распространение покрытосеменных'],[1,0,2,3,4],'Прокариоты возникли раньше эукариот; сосудистые наземные растения — раньше амниот и широкого распространения покрытосеменных.');
 seq('phase4-mechanism-20',['Homo sapiens','Приматы','Млекопитающие','Хордовые','Homo'],[3,2,1,4,0],'Тип Хордовые → класс Млекопитающие → отряд Приматы → род Homo → вид Homo sapiens.');
 const matching={
  'phase1-bio-reproduction-1-02':[['Деление надвое','Почкование','Размножение клубнями'],['Гидра','Картофель','Амёба'],[2,0,1]],
  'phase1-bio-reproduction-2-02':[['Четыре функциональные гаметы','Одна крупная гамета и полярные тельца'],['Овогенез','Сперматогенез'],[1,0]],
  'phase1-bio-reproduction-3-02':[['Головной мозг','Сердечная мышца','Эпителий средней кишки'],['Мезодерма','Энтодерма','Эктодерма'],[2,0,1]],
  'phase1-bio-genetics-1-04':[['AA','Aa','aa'],['Гетерозигота','Рецессивная гомозигота','Доминантная гомозигота'],[2,0,1]],
  'phase1-bio-genetics-3-01':[['Замена нуклеотида','Инверсия участка хромосомы','Трисомия'],['Геномная мутация','Генная мутация','Хромосомная мутация'],[1,2,0]],
  'phase1-bio-genetics-4-01':[['Порода','Сорт','Штамм'],['Микроорганизмы','Животные','Растения'],[1,2,0]],
  'phase4-mechanism-09':[['Рука человека и ласт кита','Крыло птицы и крыло бабочки как органы полёта','Клубень картофеля и корнеплод моркови как запасающие органы'],['Гомологичные','Аналогичные'],[0,1,1]],
  'phase4-mechanism-11':[['Сравнение последовательностей ДНК','Археоптерикс в ископаемой породе','Сходство ранних зародышей','Эндемики островов'],['Эмбриологический','Биогеографический','Палеонтологический','Молекулярно-генетический'],[3,2,0,1]],
  'phase4-mechanism-23':[['Мутации','Дрейф генов','Изготовление орудий и передача навыка','Речь','Естественный отбор','Культурное обучение'],['Биологические факторы','Социальные факторы'],[0,0,1,1,0,1]]
 };
 for(const [key,[left,right,answer]]of Object.entries(matching)){const q=byKey.get(key);q.content={left,right,answerEncoding:'indices'};q.answer=answer.map(String);q.explanation=left.map((v,i)=>`${v} — ${right[answer[i]]}`).join('; ')+'.';q.solutionSteps=['Рассмотрите каждый признак отдельно.',q.explanation]}
 const badAnswer=/^(фактор механизм следствие|механизм и проверка|тенденция и механизм|Определение ключевого понятия;|Исправление должно различить уровень|Изменяют один фактор, остальные условия стандартизируют)/;
 for(const q of questions){
  if(q.key.startsWith('biology-2027-reviewed-')||q.key.startsWith('biology-lesson-check-'))continue;
  // Legacy topic exercises are not automatically examples of the numbered exam format.
  q.examLine=null;
  if(badAnswer.test(q.answer.join(' '))||/универсальную причинную последовательность|соответствие элементов рассуждения|Сопоставьте звенья анализа/.test(q.prompt)||q.options?.some(x=>/признак\s*[12]/i.test(x))){q.contentStatus='draft';q.editorialNote='Архивная шаблонная заготовка: исключена из выдачи до предметной переработки.'}
  if(q.type==='matching'&&!q.content?.left&&q.options?.length){const pairs=q.options.map(label=>label.split(/\s+[—–]\s+/));if(pairs.every(p=>p.length>1))q.content={left:pairs.map(p=>p[0]),right:pairs.map(p=>p.slice(1).join(' — ')),answerEncoding:'pairs'}}
  if(q.type==='multiple_answer'&&!q.options?.length){q.type='short_answer';q.manualReview=true}
 }
 // Every suitable lesson gains a concrete self-check, preserving the theory and old attempt IDs.
 const normalize=s=>s.toLowerCase().replace(/\d+/g,'#').replace(/[^а-яёa-z#]+/gi,' ').trim();
 const prompts=new Set(questions.map(q=>normalize(q.prompt)));
 for(const t of topics)for(const l of t.lessons||[t.lesson].filter(Boolean)){
  const key='biology-lesson-check-'+l.slug;if(byKey.has(key))continue;
  const examples=l.blocks.filter(b=>b.type==='ege_example'&&b.content.prompt?.length>=50&&b.content.answer?.length>=100);
  const example=examples.find(b=>!prompts.has(normalize(b.content.prompt)));if(!example)continue;
  const q={key,type:'extended_answer',examLine:null,difficulty:2,contentStatus:'review',lessonSlug:l.slug,prompt:example.content.prompt,answer:[example.content.answer],explanation:example.content.answer,solutionSteps:[example.content.answer,'Сверьте причинные связи, термины и все вопросы условия.'],scoringPoints:[example.content.answer],commonMistakes:['Назвать итог без объяснения механизма.','Пропустить один из вопросов условия.'],skills:t.skills||['concepts'],maxScore:1,manualReview:true};
  t.questions.push(q);prompts.add(normalize(q.prompt));
 }
 const lessonForLine=['bio-science-1-lesson','bio-science-2-lesson','bio-cell-3-lesson','bio-genetics-1-lesson-2','bio-cell-1-lesson','bio-cell-1-lesson','bio-molecular-2-lesson','bio-cell-3-lesson-2','bio-diversity-4-plant-root-lesson','bio-diversity-4-plant-life-cycles-lesson','bio-diversity-5-animal-birds-lesson','bio-zoo-foundations','bio-human-nephron','bio-human-vessels','bio-human-digestion-basics','bio-human-circuits','bio-evolution-factors','bio-ecology-ecosystem-lesson','bio-evolution-3-lesson','bio-human-blood','bio-science-3-lesson','bio-exam-practice-1-lesson','bio-exam-practice-1-lesson','bio-cell-1-lesson','bio-human-heart','bio-ecology-eutrophication-lesson','bio-exam-practice-2-lesson','bio-genetics-2-lesson'];
 const perVariant={
 3:['bio-molecular-3-lesson','bio-cell-3-lesson','bio-ecology-pyramids-lesson'],
 7:['bio-cell-3-lesson-2','bio-molecular-2-lesson','bio-genetics-4-lesson-5'],
 8:['bio-cell-3-lesson-2','bio-cell-1-lesson','bio-genetics-4-lesson-5'],
 9:['bio-diversity-4-plant-root-lesson','bio-diversity-4-plant-leaf-lesson','bio-diversity-4-plant-flower-pollination-lesson'],
 10:['bio-diversity-4-plant-algae-mosses-lesson-2','bio-zoo-insects','bio-diversity-4-plant-seed-groups-lesson'],
 11:['bio-diversity-5-animal-birds-lesson','bio-diversity-3-lesson','bio-zoo-mammals'],
 14:['bio-human-spinal','bio-human-vessels','bio-human-glucose'],
 15:['bio-human-gas-transport','bio-human-small-intestine','bio-human-immunity'],
 16:['bio-human-circuits','bio-human-reflex','bio-human-digestion-basics'],
 19:['bio-evolution-3-lesson','bio-evolution-selection','bio-ecology-nitrogen-lesson'],
 20:['bio-cell-1-lesson','bio-human-blood','bio-diversity-4-plant-physiology-lesson-2'],
 24:['bio-cell-1-lesson','bio-diversity-4-plant-root-lesson-3','bio-human-nephron'],
 25:['bio-human-heart','bio-human-absorption','bio-zoo-bird-respiration'],
 26:['bio-ecology-eutrophication-lesson','bio-evolution-selection','bio-evolution-factors'],
 27:['bio-cell-3-lesson-2','bio-molecular-3-lesson-3','bio-evolution-factors'],
 28:['bio-genetics-1-lesson-2','bio-genetics-2-lesson','bio-genetics-2-lesson-2']
 };
 for(const t of topics)t.questions=(t.questions||[]).filter(q=>!q.key.startsWith('biology-2027-reviewed-'));
 for(let variant=1;variant<=3;variant++)for(const v of variantQuestions(variant)){
  const lessonSlug=perVariant[v.line]?.[variant-1]||lessonForLine[v.line-1],topic=topics.find(t=>(t.lessons||[t.lesson].filter(Boolean)).some(l=>l.slug===lessonSlug));if(!topic)throw new Error('Missing topic for '+lessonSlug);
  topic.questions.push({...v,type:v.type==='multiple'?'multiple_answer':v.questionType,...(v.options?{options:v.options.map(o=>o.label)}:{}),examLine:v.line,lessonSlug,contentStatus:'verified',skills:topic.skills||['concepts']});
 }
 return course;
}
if(require.main===module){const file=path.resolve(__dirname,'../content/biology/course.json');const course=finalize(JSON.parse(fs.readFileSync(file,'utf8')));fs.writeFileSync(file,JSON.stringify(course,null,2)+'\n');const qs=course.sections.flatMap(s=>s.topics.flatMap(t=>t.questions||[]));console.log(JSON.stringify({total:qs.length,published:qs.filter(q=>q.contentStatus!=='draft').length,archived:qs.filter(q=>q.contentStatus==='draft').length}));}
module.exports={finalize};
