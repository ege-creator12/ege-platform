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
  starterQuestions.forEach(([lessonSlug, prompt, options, answer, explanation]) => {
    const lesson = db.row('SELECT id FROM topics WHERE subject_id=? AND slug=?', subject.id, lessonSlug);
    if (!lesson || db.row('SELECT id FROM questions WHERE prompt=?', prompt)) return;
    const inserted = db.run('INSERT INTO questions(topic_id,type,prompt,explanation,difficulty,answer_json,source,exam_line,points) VALUES(?,?,?,?,?,?,?,?,?)', lesson.id, 'single', prompt, explanation, 1, JSON.stringify(answer), 'Базовый курс ОСНОВА', 1, 1);
    options.forEach((label, position) => db.run('INSERT INTO question_options(question_id,value,label,position) VALUES(?,?,?,?)', Number(inserted.lastInsertRowid), String(position), label, position));
  });
  const skills = [
    ['concepts', 'Знание биологических понятий', 'Узнавать термины, структуры и их функции.'],
    ['processes', 'Анализ биологических процессов', 'Устанавливать причины, этапы и последствия процессов.'],
    ['evidence', 'Работа с данными', 'Интерпретировать схемы, таблицы и экспериментальные данные.']
  ];
  skills.forEach(([slug, title, description], position) => {
    db.run(`INSERT INTO skills(subject_id,slug,title,description,position) VALUES(?,?,?,?,?)
      ON CONFLICT(subject_id,slug) DO UPDATE SET title=excluded.title,description=excluded.description,position=excluded.position`,
      subject.id, slug, title, description, position);
  });
  const concepts = db.row("SELECT id FROM skills WHERE subject_id=? AND slug='concepts'", subject.id);
  if (concepts) db.run(`INSERT OR IGNORE INTO question_skills(question_id,skill_id)
    SELECT q.id,? FROM questions q JOIN topics t ON t.id=q.topic_id WHERE t.subject_id=?`, concepts.id, subject.id);
}

module.exports = { bootstrapCourse };
