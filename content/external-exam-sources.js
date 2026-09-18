'use strict';

const FIPI_PROJECTS = {
  biology: 'CA9D848A31849ED149D382C32A7A2BE4',
  chemistry: 'EA45D8517ABEB35140D0D83E76F14A41',
};

const NAVIGATORS = {
  biology: 'https://doc.fipi.ru/navigator-podgotovki/navigator-ege/2026/bi-tren.pdf',
  chemistry: 'https://doc.fipi.ru/navigator-podgotovki/navigator-ege/2026/hi-tren.pdf',
};

const QIDS = {
  biology: {
    1:['512FFA'],2:['D5DFFC'],3:['745A06'],4:['A80C04'],5:['566BAD'],6:['ED3EB2'],7:['C57F94'],
    8:['4F9293'],9:['59F0CD'],10:['3F0668'],11:['32F7F5'],12:['FF644F'],13:['68D397'],14:['EA5F98'],
    15:['45C88A'],16:['D63057'],17:['B31488'],18:['6DB47E'],19:['DA2F3B'],20:['DA2F3B'],21:['6C5FF1'],
    22:['D243E7'],23:['C60A3E'],24:['B7E6C5'],25:['1357A9'],26:['02566B'],27:['773B80'],28:['F4D06D'],
  },
  chemistry: {
    1:['F5D00C','CD143B','E717BB'],
    2:['28E34E','FE6EAE','B40008'],
    3:['3EB59E','58CAF7','444EF2'],
    4:['FFA8A4','4AFA28','FD166F'],
    5:['C7299C','6DFFC4','46FF84'],
    6:['D4F584','788320','890D68'],
    7:['795782','B4E94A','B73843'],
    8:['CDC883','8F9053','B38B4D'],
    9:['C0A7F6','F30CCC','C7BA6A'],
    10:['40C313','AB9ED4','3F1E31'],
    11:['654206','746E70','704065'],
    12:['771F29','7A6546','FC34BA'],
    13:['340406','F06441','D58F6F'],
    14:['78331F','27A844','151845'],
    15:['D6AC43','3F79B7','062443'],
    16:['DE380B','091111','0EC76F'],
    17:['CE6F5C','2F9644','621632'],
    18:['DD1B21','4BD4B7','F3AA6B'],
    19:['1FAD40','85EE18','801EE0'],
    20:['E94344','19CD17','06536A'],
    21:['4980BD','3A2ED2','96D4FD'],
    22:['A25104','0EEA0E','95784F'],
    23:['707F23','712EF0','99C34C'],
    24:['1D4141','EE3B4B','597743'],
    25:['A123FF','D5C079','DCCD65'],
    26:['4E2E02','AB81DC','4C603F'],
    27:['E16506','5CAC29','EA4D62'],
    28:['CB5270','B2C750','460D63'],
    29:['A2FDC5','74C767','ADBE96'],
    30:['606037','468F31','203294'],
    31:['679DA1','E62675','D65749'],
    32:['DD4C2D','CB3BC4','67B170'],
    33:['29982D','75E60C','D0C748'],
    34:['1244A3','0110A0','D3B44F'],
  },
};

const FALLBACKS = {
  biology: 'https://bio-ege.sdamgia.ru/test?a=catlistwstat',
  chemistry: 'https://chem-ege.sdamgia.ru/test?a=catlistwstat',
};

function normalizeSubject(value) {
  const subject = String(value || '').toLowerCase();
  if (subject === 'biology' || subject === 'chemistry') return subject;
  return null;
}

function fipiTaskUrl(subject, qid) {
  const project = FIPI_PROJECTS[subject];
  return `https://ege.fipi.ru/bank/index.php?proj=${encodeURIComponent(project)}&qid=${encodeURIComponent(qid)}`;
}

function lineSources(subjectValue, lineValue, countValue = 5) {
  const subject = normalizeSubject(subjectValue);
  const line = Number(lineValue);
  const count = Math.min(10, Math.max(1, Number(countValue) || 5));
  if (!subject || !Number.isInteger(line) || line < 1) return null;
  const qids = QIDS[subject]?.[line] || [];
  const tasks = qids.slice(0, count).map((qid, index) => ({
    source: 'ФИПИ',
    sourceType: 'official',
    qid,
    line,
    ordinal: index + 1,
    url: fipiTaskUrl(subject, qid),
  }));
  return {
    subject,
    line,
    requestedCount: count,
    tasks,
    navigatorUrl: NAVIGATORS[subject],
    bankUrl: `https://ege.fipi.ru/bank/index.php?proj=${encodeURIComponent(FIPI_PROJECTS[subject])}`,
    fallbackCatalogUrl: FALLBACKS[subject],
    sourcePolicy: 'fipi-first',
  };
}

module.exports = { lineSources, fipiTaskUrl, FIPI_PROJECTS, NAVIGATORS, QIDS, FALLBACKS };
