const curriculum = [
  ['general-biology', 'Общая биология', [
    ['cell-biology', 'Клеточная биология', [
      ['cell-structure', 'Строение клетки', ['cell-organelles', 'Органоиды клетки', 'Строение и функции мембранных и немембранных органоидов.']],
      ['cell-metabolism', 'Обмен веществ', ['energy-metabolism', 'Энергетический обмен', 'Этапы энергетического обмена и синтез АТФ.']]
    ]],
    ['genetics-course', 'Генетика', [
      ['inheritance', 'Закономерности наследования', ['mendel-laws', 'Законы Менделя', 'Моногибридное скрещивание и законы наследования признаков.']]
    ]]
  ]],
  ['organisms', 'Организмы', [
    ['human-course', 'Человек', [
      ['human-systems', 'Системы органов', ['blood-circulation', 'Кровь и кровообращение', 'Состав крови, иммунитет, сердце и круги кровообращения.']]
    ]],
    ['evolution-ecology', 'Эволюция и экология', [
      ['evolution-process', 'Эволюционный процесс', ['natural-selection', 'Естественный отбор', 'Формы естественного отбора и формирование адаптаций.']],
      ['ecosystems', 'Экосистемы', ['ecosystem-structure', 'Структура экосистемы', 'Цепи питания, экологические пирамиды и круговороты веществ.']]
    ]]
  ]]
];

const starterQuestions = [
  ['cell-organelles', 'Какой органоид синтезирует основную часть АТФ?', ['Рибосома','Митохондрия','Лизосома','Ядро'], ['1'], 'АТФ синтезируется на внутренней мембране митохондрий.'],
  ['mendel-laws', 'Как называют разные формы одного гена?', ['Аллели','Хроматиды','Гаметы','Кодоны'], ['0'], 'Разные формы одного гена называют аллелями.'],
  ['blood-circulation', 'Какие клетки крови переносят кислород?', ['Лейкоциты','Тромбоциты','Эритроциты','Лимфоциты'], ['2'], 'Кислород переносит гемоглобин эритроцитов.'],
  ['natural-selection', 'Какой фактор направляет эволюционные изменения?', ['Естественный отбор','Модификационная изменчивость','Дрейф генов','Изоляция'], ['0'], 'Естественный отбор сохраняет наследственные изменения, повышающие приспособленность.'],
  ['ecosystem-structure', 'Как называют последовательность организмов, в которой передаются вещество и энергия?', ['Пищевая цепь','Популяция','Биосфера','Сукцессия'], ['0'], 'Пищевая цепь отражает перенос вещества и энергии между организмами.']
];

const skills = [['terminology','Терминология'],['image-analysis','Анализ изображения'],['cause-effect','Причинно-следственные связи'],['genetics','Генетические задачи'],['matching','Соответствие'],['sequence','Последовательность'],['table','Работа с таблицей'],['scheme','Работа со схемой']];
const demoQuestions = [
 ['cell-organelles','multiple','Выберите двумембранные органоиды эукариотической клетки.',['Ядро','Митохондрия','Рибосома','Лизосома'],['0','1'],'Ядро и митохондрия окружены двумя мембранами; рибосомы мембран не имеют, лизосомы одномембранные.','medium',['terminology']],
 ['cell-organelles','single','На электронной микрофотографии видны стопки уплощённых цистерн и пузырьки. Что это?',['Комплекс Гольджи','Клеточный центр','Рибосома','Ядрышко'],['0'],'Стопки цистерн с отпочковывающимися пузырьками — характерный признак комплекса Гольджи.','medium',['image-analysis']],
 ['cell-organelles','sequence','Расположите этапы секреции белка в правильном порядке.',['Комплекс Гольджи','Рибосома','Экзоцитоз','Шероховатая ЭПС'],['1','3','0','2'],'Белок синтезируется рибосомой, поступает в ЭПС, модифицируется в комплексе Гольджи и выводится экзоцитозом.','high',['sequence','cause-effect']],
 ['cell-organelles','matching','Установите соответствие органоидов и функций.',['Рибосома — синтез белка','Лизосома — внутриклеточное пищеварение','Митохондрия — синтез АТФ'],['0','1','2'],'Каждый ответ отражает основную функцию соответствующего органоида.','basic',['matching']],
 ['cell-organelles','text','Как называется внутренняя среда клетки, в которой расположены органоиды?',[],['цитоплазма'],'Цитоплазма включает гиалоплазму, органоиды и включения.','basic',['terminology']],
 ['cell-organelles','single','Почему клетки сердечной мышцы содержат особенно много митохондрий?',['Им нужно много АТФ','Они запасают ДНК','Они выполняют фагоцитоз','В них нет рибосом'],['0'],'Постоянные сокращения требуют больших затрат АТФ, поэтому митохондрий много.','high',['cause-effect']],
 ['cell-organelles','multiple','Какие структуры участвуют в синтезе и транспорте белка?',['Рибосомы','Шероховатая ЭПС','Комплекс Гольджи','Клеточный центр'],['0','1','2'],'Белок проходит путь от рибосом через ЭПС к комплексу Гольджи.','ege',['scheme','cause-effect']],
 ['cell-organelles','single','Какой органоид содержит собственную кольцевую ДНК?',['Лизосома','Митохондрия','Аппарат Гольджи','Вакуоль'],['1'],'Митохондрии имеют собственные кольцевые молекулы ДНК и рибосомы.','basic',['terminology']],
 ['cell-organelles','text','Назовите немембранный органоид, состоящий из двух субъединиц и осуществляющий трансляцию.',[],['рибосома'],'Рибосома связывает аминокислоты в полипептид по информации иРНК.','medium',['terminology']],
 ['mendel-laws','single','Какова доля рецессивных фенотипов при скрещивании Aa × Aa?',['0%','25%','50%','75%'],['1'],'Расщепление генотипов 1AA:2Aa:1aa даёт 25% рецессивных фенотипов.','medium',['genetics']],
 ['mendel-laws','text','Запишите генотип гомозиготной рецессивной особи, используя букву a.',[],['aa'],'Гомозигота несёт два одинаковых рецессивных аллеля — aa.','basic',['terminology','genetics']],
 ['mendel-laws','sequence','Расположите этапы решения генетической задачи.',['Составить решётку Пеннета','Определить генотипы родителей','Записать ответ','Определить гаметы'],['1','3','0','2'],'Сначала задают генотипы, затем гаметы, комбинации потомков и формулируют ответ.','medium',['sequence','genetics']],
 ['mendel-laws','single','Какое скрещивание называют анализирующим?',['С доминантной гомозиготой','С рецессивной гомозиготой','Двух гибридов','Двух чистых линий'],['1'],'Неизвестный доминантный генотип выявляют скрещиванием с рецессивной гомозиготой.','medium',['terminology','genetics']],
 ['mendel-laws','multiple','Какие гаметы образует дигетерозигота AaBb при независимом наследовании?',['AB','Ab','aB','ab'],['0','1','2','3'],'При независимом расхождении образуются четыре типа гамет в равных долях.','high',['genetics']],
 ['mendel-laws','single','У гороха жёлтый цвет доминирует. Какой фенотип имеет Aa?',['Жёлтый','Зелёный','Промежуточный','Бесцветный'],['0'],'При полном доминировании гетерозигота проявляет доминантный признак.','basic',['cause-effect']],
 ['mendel-laws','matching','Соотнесите скрещивание и расщепление по фенотипу.',['Aa × Aa — 3:1','Aa × aa — 1:1','AA × aa — единообразие'],['0','1','2'],'Соотношения следуют из возможных сочетаний гамет родителей.','ege',['matching','genetics']],
 ['mendel-laws','text','Сколько типов гамет образует особь с генотипом AaBb при независимом наследовании?',[],['4'],'Число типов гамет равно 2ⁿ; для двух гетерозиготных пар 2² = 4.','high',['genetics']],
 ['mendel-laws','single','Какой закон иллюстрирует одинаковый фенотип всех гибридов F1 от чистых линий?',['Закон единообразия','Закон расщепления','Закон сцепления','Закон гомологических рядов'],['0'],'Первый закон Менделя — закон единообразия гибридов первого поколения.','basic',['terminology']]
];

function ensureTopic(db, subjectId, parentId, slug, title, kind, position, theory = '') {
  let topic = db.row('SELECT id FROM topics WHERE subject_id=? AND slug=?', subjectId, slug);
  if (!topic) {
    db.run('INSERT INTO topics(subject_id,parent_id,slug,title,description,theory,position,kind,published) VALUES(?,?,?,?,?,?,?,?,1)', subjectId, parentId, slug, title, '', theory, position, kind);
    topic = db.row('SELECT id FROM topics WHERE subject_id=? AND slug=?', subjectId, slug);
  } else {
    db.run('UPDATE topics SET parent_id=?,title=?,kind=?,position=?,published=1 WHERE id=?', parentId, title, kind, position, topic.id);
  }
  return topic.id;
}

function bootstrapCourse(db) {
  let subject = db.row("SELECT id FROM subjects WHERE slug='biology'");
  if (!subject) {
    db.run('INSERT INTO subjects(slug,title,description,icon) VALUES(?,?,?,?)', 'biology', 'Биология', 'Полный курс подготовки к ЕГЭ по биологии', 'dna');
    subject = db.row("SELECT id FROM subjects WHERE slug='biology'");
  }
  curriculum.forEach(([sectionSlug, sectionTitle, themes], sectionIndex) => {
    const sectionId = ensureTopic(db, subject.id, null, sectionSlug, sectionTitle, 'section', sectionIndex);
    themes.forEach(([themeSlug, themeTitle, subtopics], themeIndex) => {
      const themeId = ensureTopic(db, subject.id, sectionId, themeSlug, themeTitle, 'topic', themeIndex);
      subtopics.forEach(([subtopicSlug, subtopicTitle, lesson], subtopicIndex) => {
        const subtopicId = ensureTopic(db, subject.id, themeId, subtopicSlug, subtopicTitle, 'subtopic', subtopicIndex);
        ensureTopic(db, subject.id, subtopicId, lesson[0], lesson[1], 'lesson', 0, lesson[2]);
      });
    });
  });
  skills.forEach(([slug,title]) => db.run('INSERT INTO skills(slug,title) VALUES(?,?) ON CONFLICT(slug) DO UPDATE SET title=excluded.title',slug,title));
  db.run(`UPDATE topics SET lesson_content_json=json_object('intro',COALESCE(NULLIF(description,''),title),'blocks',json_array(json_object('title','Главное','text',theory)),'definitions',json_array(),'remember','Связывайте строение биологической системы с её функцией.','mistakes',json_array('Не подменяйте термин бытовым описанием.'),'ege_traps',json_array('Внимательно читайте условие и выбирайте все требуемые признаки.'),'examples',json_array(),'mini_check','Объясните ключевое понятие урока своими словами.') WHERE kind='lesson' AND lesson_content_json='{}'`);
  starterQuestions.forEach(([lessonSlug, prompt, options, answer, explanation]) => {
    const lesson = db.row('SELECT id FROM topics WHERE subject_id=? AND slug=?', subject.id, lessonSlug);
    if (!lesson || db.row('SELECT id FROM questions WHERE prompt=?', prompt)) return;
    const inserted = db.run('INSERT INTO questions(topic_id,type,prompt,explanation,difficulty,answer_json,source,exam_line,points) VALUES(?,?,?,?,?,?,?,?,?)', lesson.id, 'single', prompt, explanation, 1, JSON.stringify(answer), 'Базовый курс ОСНОВА', 1, 1);
    options.forEach((label, position) => db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)', Number(inserted.lastInsertRowid), String(position), label, position));
  });
  demoQuestions.forEach(([lessonSlug,type,prompt,options,answer,explanation,level,tagSlugs]) => {
    const lesson=db.row('SELECT id FROM topics WHERE subject_id=? AND slug=?',subject.id,lessonSlug);if(!lesson)return;
    let question=db.row('SELECT id FROM questions WHERE prompt=?',prompt);
    if(!question){const inserted=db.run('INSERT INTO questions(topic_id,type,prompt,explanation,difficulty,answer_json,difficulty_level,source,points) VALUES(?,?,?,?,?,?,?,?,?)',lesson.id,type,prompt,explanation,level==='basic'?1:level==='medium'?2:3,JSON.stringify(answer),level,'Демонстрационный банк ОСНОВА',level==='ege'?2:1);question={id:Number(inserted.lastInsertRowid)};options.forEach((label,position)=>db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)',question.id,String(position),label,position));}
    tagSlugs.forEach(slug=>db.run('INSERT OR IGNORE INTO question_skills(question_id,skill_id) SELECT ?,id FROM skills WHERE slug=?',question.id,slug));
  });
}

module.exports = { bootstrapCourse };
