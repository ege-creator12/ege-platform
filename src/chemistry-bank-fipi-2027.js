'use strict';

/*
 * Author tasks with the same response mechanics as the official FIPI EGE
 * chemistry 2026/2027 model. The wording below is original; the important
 * invariant is that every line uses the official control family, number of
 * positions and answer order.
 */
const {rotate,diff}=require('./chemistry-bank-utils');

const uniq=arr=>[...new Set(arr)];
const pick=(arr,n)=>arr[((Math.max(1,Number(n)||1)-1)%arr.length)];
const opt=labels=>labels.map((label,i)=>({value:String(i),label}));
function combinations(arr,k){
  const out=[];
  const walk=(start,buf)=>{
    if(buf.length===k){out.push(buf.slice());return;}
    for(let i=start;i<=arr.length-(k-buf.length);i++){buf.push(arr[i]);walk(i+1,buf);buf.pop();}
  };
  walk(0,[]);return out;
}
function multi(prompt,labels,correctLabels,n,explanation){
  const shown=rotate(labels,n),set=new Set(correctLabels);
  return {type:'multiple',questionType:'multiple_answer',prompt,
    instruction:'Выберите все верные позиции и запишите их номера.',
    options:opt(shown),answer:shown.map((x,i)=>set.has(x)?String(i):null).filter(x=>x!==null),
    difficulty:Math.max(2,diff(n)),explanation,
    solutionSteps:['Проверьте каждую позицию отдельно.','Отберите только варианты, удовлетворяющие условию.','Запишите номера выбранных позиций.'],
    content:{strictFipi2027:true}};
}
function seq(prompt,labels,correctLabels,n,explanation){
  const shown=rotate(labels,n),index=new Map(shown.map((x,i)=>[x,String(i)]));
  return {type:'sequence',questionType:'sequence',prompt,
    instruction:'Запишите номера выбранных элементов в требуемой последовательности.',
    options:opt(shown),answer:correctLabels.map(x=>index.get(x)),
    difficulty:Math.max(2,diff(n)),explanation,
    solutionSteps:['Сначала выберите только требуемые объекты.','Определите направление изменения свойства.','Запишите номера в нужном порядке.'],
    content:{strictFipi2027:true}};
}
function matching(prompt,left,right,pairs,n,explanation){
  const shown=rotate(right,n),index=new Map(shown.map((x,i)=>[x,i]));
  if(new Set(shown).size!==shown.length)throw new Error('Matching choices must be unique');
  return {type:'matching',questionType:'matching',prompt,instruction:'Установите соответствие.',
    answer:pairs.map((label,i)=>`${i}-${index.get(label)}`),
    difficulty:Math.max(2,diff(n)),explanation,
    content:{strictFipi2027:true,left,right:shown,answerEncoding:'pairs'},
    solutionSteps:['Рассмотрите каждый пункт слева отдельно.','Подберите ему соответствующую позицию справа.','Проверьте порядок цифр в ответе.']};
}
function matchFromPairs(prompt,pairs,rightPool,n,leftCount,rightCount,explanation){
  const N=Math.max(1,Number(n)||1),step=1+((N*2)%Math.max(2,pairs.length-1));
  const chosen=[];let cursor=(N-1)%pairs.length,guard=0;
  while(chosen.length<leftCount&&guard<pairs.length*4){
    const p=pairs[cursor%pairs.length];
    if(!chosen.some(x=>x[0]===p[0]))chosen.push(p);
    cursor=(cursor+step)%pairs.length;guard++;
  }
  const needed=uniq(chosen.map(x=>x[1]));
  const extras=rotate(rightPool.filter(x=>!needed.includes(x)),N);
  const right=[...needed,...extras].slice(0,rightCount);
  if(right.length<rightCount)throw new Error('Not enough matching choices');
  return matching(prompt,chosen.map(x=>x[0]),right,chosen.map(x=>x[1]),N,explanation);
}
function pairTask(prompt,scenario,n){
  const right=uniq([scenario.x,scenario.y,...rotate(scenario.wrong,n)]).slice(0,5);
  return matching(prompt.replace('{chain}',scenario.chain),['X','Y'],right,[scenario.x,scenario.y],n,scenario.explanation);
}

// Line 2: exactly three selected positions from five, ordered by a periodic trend.
const p2=['B','C','N','O','F'],p3=['Al','Si','P','S','Cl'],g1=['Li','Na','K','Rb','Cs'],g2=['Be','Mg','Ca','Sr','Ba'];
const line2Cases=[
  ...combinations(p2,3).map(correct=>({correct,wrong:['Li','Be'],property:'электроотрицательности',ordered:correct,why:'В 2-м периоде электроотрицательность в целом возрастает слева направо.'})),
  ...combinations(p3,3).map(correct=>({correct,wrong:['Na','Mg'],property:'электроотрицательности',ordered:correct,why:'В 3-м периоде электроотрицательность в целом возрастает слева направо.'})),
  ...combinations(g1,3).map(correct=>({correct,wrong:['Mg','Al'],property:'атомного радиуса',ordered:correct,why:'В группе щелочных металлов атомный радиус возрастает сверху вниз.'})),
  ...combinations(g2,3).map(correct=>({correct,wrong:['Na','Al'],property:'атомного радиуса',ordered:correct,why:'В группе щёлочноземельных металлов атомный радиус возрастает сверху вниз.'}))
];
function build2(n){
  const c=pick(line2Cases,n),labels=[...c.correct,...c.wrong];
  return seq(`Из пяти элементов выберите три элемента одной указанной закономерности и расположите выбранные элементы в порядке увеличения ${c.property}.`,labels,c.ordered,n,c.why);
}

// Line 5: three positions chosen from a 3x3-style bank of nine formula cells.
const formulaPairs=[
 ['оксид натрия','Na2O'],['оксид серы(VI)','SO3'],['оксид алюминия','Al2O3'],
 ['гидроксид натрия','NaOH'],['гидроксид меди(II)','Cu(OH)2'],['гидроксид алюминия','Al(OH)3'],
 ['серная кислота','H2SO4'],['гидрокарбонат натрия','NaHCO3'],['хлорид железа(III)','FeCl3'],
 ['оксид кальция','CaO'],['оксид углерода(IV)','CO2'],['оксид цинка','ZnO'],
 ['гидроксид калия','KOH'],['гидроксид железа(III)','Fe(OH)3'],['азотная кислота','HNO3'],
 ['карбонат калия','K2CO3'],['сульфат меди(II)','CuSO4'],['фосфат натрия','Na3PO4']
];
function build5(n){
  const N=Math.max(1,Number(n)||1);
  const chosen=[formulaPairs[(N-1)%formulaPairs.length],formulaPairs[(N+4)%formulaPairs.length],formulaPairs[(N+9)%formulaPairs.length]];
  const required=chosen.map(x=>x[1]);
  const distract=rotate(formulaPairs.map(x=>x[1]).filter(x=>!required.includes(x)),N);
  const right=uniq([...required,...distract]).slice(0,9);
  return matching('Установите соответствие между названиями веществ (А–В) и формулами в пронумерованном перечне.',chosen.map(x=>x[0]),right,required,N,'Формулу определяют по названию вещества, зарядам ионов и составу класса соединения.');
}

// Lines 6, 9, 16, 23 use ordered X/Y positions.
const l6=[
 {chain:'X + HCl → CO2↑; Y + NaOH → осадок гидроксида',x:'Na2CO3',y:'CuSO4',wrong:['NaCl','KNO3','HNO3','CaCl2'],explanation:'Карбонат с кислотой выделяет CO2, Cu2+ со щёлочью образует Cu(OH)2.'},
 {chain:'X + AgNO3 → белый осадок; Y + BaCl2 → белый осадок',x:'NaCl',y:'Na2SO4',wrong:['KNO3','NaOH','HCl','NH4NO3'],explanation:'Cl− осаждает AgCl, SO4²− — BaSO4.'},
 {chain:'X даёт щелочную среду из-за гидролиза; Y даёт кислую среду из-за гидролиза',x:'Na2CO3',y:'NH4Cl',wrong:['NaCl','KNO3','Na2SO4','KCl'],explanation:'CO3²− гидролизуется по аниону, NH4+ — по катиону.'},
 {chain:'X + NaOH(изб.) растворяет осадок амфотерного гидроксида; Y + HCl выделяет SO2',x:'AlCl3',y:'Na2SO3',wrong:['NaCl','KNO3','CaCl2','Na2SO4'],explanation:'Al(OH)3 амфотерен; сульфит с кислотой выделяет SO2.'},
 {chain:'X + NH4Cl при нагревании выделяет NH3; Y + HCl выделяет H2',x:'NaOH',y:'Zn',wrong:['NaCl','Cu','Ag','KNO3'],explanation:'Щёлочь выделяет NH3 из NH4+, Zn стоит до водорода.'},
 {chain:'X + H2SO4 → BaSO4↓; Y + NaOH → NH3↑ при нагревании',x:'BaCl2',y:'NH4Cl',wrong:['NaCl','KNO3','HCl','Cu'],explanation:'Ba2+ осаждает сульфат; NH4+ со щёлочью выделяет аммиак.'},
 {chain:'X + CO2(изб.) образует гидрокарбонат; Y + HCl образует белый осадок AgCl',x:'Ca(OH)2',y:'AgNO3',wrong:['NaNO3','KOH','HNO3','CuSO4'],explanation:'Избыток CO2 переводит CaCO3 в гидрокарбонат; Ag+ осаждает Cl−.'},
 {chain:'X + HCl → H2S↑; Y + NaOH → голубой осадок',x:'Na2S',y:'CuSO4',wrong:['NaCl','KNO3','BaCl2','HNO3'],explanation:'Сульфид с кислотой выделяет H2S; Cu2+ даёт Cu(OH)2.'}
];
function build6(n){return pairTask('Из перечня веществ выберите X и Y, удовлетворяющие условиям: {chain}.',pick(l6,n),n);}

const l9=[
 {chain:'Fe → FeCl2 → Fe(OH)2',x:'HCl',y:'NaOH',wrong:['Cl2','H2O','CO2','AgNO3'],explanation:'Fe с HCl даёт FeCl2, затем щёлочь осаждает Fe(OH)2.'},
 {chain:'Cu → CuO → CuSO4',x:'O2, t',y:'H2SO4',wrong:['HCl','NaOH','H2O','Cl2'],explanation:'Cu окисляют кислородом, CuO растворяют в H2SO4.'},
 {chain:'S → SO2 → SO3',x:'O2',y:'O2, V2O5',wrong:['H2','NaOH','HCl','H2O'],explanation:'Сера горит до SO2, далее SO2 каталитически окисляется.'},
 {chain:'CaCO3 → CaO → Ca(OH)2',x:'t',y:'H2O',wrong:['HCl','CO2','NaOH','O2'],explanation:'Карбонат кальция разлагают нагреванием, CaO гасят водой.'},
 {chain:'Al → AlCl3 → Al(OH)3',x:'Cl2',y:'NaOH (нед.)',wrong:['NaOH (изб.)','H2','CO2','H2O'],explanation:'Al хлорируют, затем ограниченным количеством щёлочи осаждают Al(OH)3.'},
 {chain:'NH3 → NO → NO2',x:'O2, Pt, t',y:'O2',wrong:['H2','NaOH','HCl','H2O'],explanation:'Каталитическое окисление NH3 даёт NO, который окисляется до NO2.'},
 {chain:'Fe2O3 → Fe → FeCl2',x:'CO, t',y:'HCl',wrong:['Cl2','NaOH','H2O','CO2'],explanation:'Fe2O3 восстанавливают CO, железо растворяют в HCl.'},
 {chain:'Na → Na2O → NaOH',x:'O2',y:'H2O',wrong:['HCl','CO2','Cl2','NaCl'],explanation:'Натрий окисляют, основной оксид взаимодействует с водой.'},
 {chain:'CuSO4 → Cu(OH)2 → CuO',x:'NaOH',y:'t',wrong:['HCl','CO2','H2','O2'],explanation:'Щёлочь осаждает Cu(OH)2, нагревание даёт CuO.'},
 {chain:'CO2 → CaCO3 → Ca(HCO3)2',x:'Ca(OH)2',y:'CO2 + H2O',wrong:['HCl','NaOH','O2','H2'],explanation:'CO2 осаждают известковой водой, избыток CO2 растворяет карбонат.'}
];
function build9(n){return pairTask('Для схемы превращений {chain} выберите вещества X и Y из предложенного перечня.',pick(l9,n),n);}

const l16=[
 {chain:'C2H4 → C2H5OH → CH3CHO',x:'H2O, H+',y:'CuO, t',wrong:['H2','Br2','NaOH','Cl2, hν'],explanation:'Этен гидратируют, этанол мягко окисляют CuO.'},
 {chain:'C2H6 → C2H5Cl → C2H5OH',x:'Cl2, hν',y:'KOH(водн.)',wrong:['KOH(спирт)','H2','H2O, H+','O2'],explanation:'Алкан хлорируют радикально, галогеналкан гидролизуют водной щёлочью.'},
 {chain:'C2H5OH → C2H4 → C2H4Br2',x:'H2SO4(конц.), 170°C',y:'Br2',wrong:['H2','NaOH','CuO','HCl'],explanation:'Дегидратация спирта даёт этен, к двойной связи присоединяется Br2.'},
 {chain:'C2H2 → CH3CHO → CH3COOH',x:'H2O, Hg2+/H+',y:'[O]',wrong:['H2','NaOH','Br2','Cl2'],explanation:'Гидратация ацетилена по Кучерову даёт этаналь, который окисляется до кислоты.'},
 {chain:'C6H6 → C6H5NO2 → C6H5NH2',x:'HNO3/H2SO4',y:'Fe/HCl, затем NaOH',wrong:['Br2(водн.)','KOH(спирт)','H2O','NaCl'],explanation:'Бензол нитруют, нитрогруппу восстанавливают до аминогруппы.'},
 {chain:'CH3COOH → CH3COOC2H5 → C2H5OH',x:'C2H5OH, H+',y:'H2O, H+',wrong:['H2','Br2','NaOH(спирт)','CuO'],explanation:'Этерификация образует эфир, кислотный гидролиз возвращает спирт.'},
 {chain:'CH3CH2Br → CH2=CH2 → CH3CH2OH',x:'KOH(спирт), t',y:'H2O, H+',wrong:['KOH(водн.)','Cl2','H2','CuO'],explanation:'Элиминирование HBr даёт алкен, затем идёт гидратация.'},
 {chain:'CH3CHO → CH3COOH → CH3COONa',x:'[O]',y:'NaOH',wrong:['H2','Br2','HCl','Cu'],explanation:'Альдегид окисляют до кислоты, затем нейтрализуют.'},
 {chain:'CH4 → CH3Cl → CH3OH',x:'Cl2, hν',y:'KOH(водн.)',wrong:['KOH(спирт)','H2','O2','H2SO4'],explanation:'Метан хлорируют на свету, хлорметан гидролизуют.'},
 {chain:'CH2=CH2 → BrCH2CH2Br → HC≡CH',x:'Br2',y:'KOH(спирт), избыток, t',wrong:['H2','H2O','NaCl','CuO'],explanation:'Бром присоединяется к C=C; двойное дегидрогалогенирование даёт алкин.'}
];
function build16(n){return pairTask('Для схемы органических превращений {chain} выберите X и Y.',pick(l16,n),n);}

// Reusable pair sets for official correspondence lines.
const l7Pairs=[
 ['Zn + HCl','ZnCl2 + H2'],['Fe + CuSO4','FeSO4 + Cu'],['Cu + HNO3(конц.)','Cu(NO3)2 + NO2 + H2O'],
 ['Al + NaOH + H2O','алюминат + H2'],['Cl2 + KBr','KCl + Br2'],['Br2 + KI','KBr + I2'],
 ['SO2 + O2','SO3'],['NH3 + HCl','NH4Cl'],['SiO2 + NaOH, t','Na2SiO3 + H2O'],
 ['CaCO3 + HCl','CaCl2 + CO2 + H2O'],['FeCl3 + NaOH','Fe(OH)3 + NaCl'],['CuO + H2, t','Cu + H2O']
];
const l7Right=uniq(l7Pairs.map(x=>x[1])).concat(['реакция не идёт','только исходные вещества']);
function build7(n){return matchFromPairs('Установите соответствие между парой реагентов и основными продуктами реакции.',l7Pairs,l7Right,n,4,5,'Учитываются типичные свойства неорганических веществ и условия реакции.');}

const l8Pairs=[
 ['Al2O3 + HCl','AlCl3 + H2O'],['Al2O3 + NaOH','алюминат натрия'],['SO3 + NaOH','сульфат/гидросульфат натрия'],
 ['CO2 + Ca(OH)2 (нед. CO2)','CaCO3 + H2O'],['CO2 + Ca(OH)2 (изб. CO2)','Ca(HCO3)2'],
 ['NH4Cl + NaOH, t','NH3 + NaCl + H2O'],['Na2SO3 + HCl','SO2 + NaCl + H2O'],
 ['FeCl2 + NaOH','Fe(OH)2 + NaCl'],['Fe(OH)2 + O2 + H2O','Fe(OH)3'],
 ['SiO2 + NaOH, t','Na2SiO3 + H2O'],['Cu(OH)2, t','CuO + H2O'],['NaHCO3, t','Na2CO3 + CO2 + H2O']
];
const l8Right=uniq(l8Pairs.map(x=>x[1])).concat(['реакция не идёт','образуется H2']);
function build8(n){return matchFromPairs('Установите соответствие между исходными веществами и продуктами реакции.',l8Pairs,l8Right,n,4,6,'При выборе продукта учитывайте амфотерность, избыток реагента и термическое разложение.');}

const l14Pairs=[
 ['CH3CH=CH2 + HCl','2-хлорпропан'],['CH3CH=CH2 + HBr, ROOR','1-бромпропан'],['C2H5Br + KOH(водн.)','этанол'],
 ['C2H5Br + KOH(спирт), t','этен'],['CH2=CH2 + Br2','1,2-дибромэтан'],['CH3CH(OH)CH3 + CuO, t','пропанон'],
 ['C2H5OH + H2SO4(конц.), 170°C','этен'],['C6H6 + Br2, FeBr3','бромбензол'],['HC≡CH + H2O, Hg2+','этаналь'],
 ['BrCH2CH2Br + Zn','этен'],['CH4 + Cl2, hν','хлорметан'],['C2H4 + H2, Ni','этан']
];
const l14Right=uniq(l14Pairs.map(x=>x[1])).concat(['пропан','этановая кислота']);
function build14(n){return matchFromPairs('Установите соответствие между реакцией и преимущественно образующимся органическим продуктом.',l14Pairs,l14Right,n,4,6,'Продукт определяют по механизму реакции и условиям её проведения.');}

const l15Pairs=[
 ['этаналь + реактив Толленса','серебряное зеркало'],['глицерин + Cu(OH)2, холод','ярко-синий раствор'],['этановая кислота + NaHCO3','выделение CO2'],
 ['фенол + Br2(водн.)','белый осадок 2,4,6-трибромфенола'],['этанол + Na','выделение H2'],['пропан-2-ол + CuO, t','образование пропанона'],
 ['этилэтаноат + H2O, H+','этанол и этановая кислота'],['глюкоза + Cu(OH)2, t','кирпично-красный Cu2O'],
 ['метановая кислота + реактив Толленса','серебряное зеркало'],['сахароза + H2O, H+','глюкоза и фруктоза'],['аминокислота + HCl','аммонийная соль'],['этановая кислота + этанол, H+','этилэтаноат']
];
const l15Right=uniq(l15Pairs.map(x=>x[1])).concat(['реакция не идёт','образуется метан']);
function build15(n){return matchFromPairs('Установите соответствие между органическим веществом/реакцией и характерным результатом.',l15Pairs,l15Right,n,4,6,'Используются качественные реакции и типичные свойства кислород- и азотсодержащих органических веществ.');}

const l17Pairs=[
 ['2H2 + O2 → 2H2O','соединение, ОВР'],['CaCO3 → CaO + CO2','разложение, не ОВР'],['Zn + 2HCl → ZnCl2 + H2','замещение, ОВР'],
 ['HCl + NaOH → NaCl + H2O','обмен, не ОВР'],['2KClO3 → 2KCl + 3O2','разложение, ОВР'],['Fe + CuSO4 → FeSO4 + Cu','замещение, ОВР'],
 ['BaCl2 + Na2SO4 → BaSO4 + 2NaCl','обмен, не ОВР'],['N2 + 3H2 ⇄ 2NH3','соединение, ОВР'],['CaO + H2O → Ca(OH)2','соединение, не ОВР'],
 ['Cl2 + 2KBr → 2KCl + Br2','замещение, ОВР'],['CO2 + Ca(OH)2 → CaCO3 + H2O','обмен, не ОВР'],['2HgO → 2Hg + O2','разложение, ОВР']
];
const l17Right=['соединение, ОВР','соединение, не ОВР','разложение, ОВР','разложение, не ОВР','замещение, ОВР','обмен, не ОВР'];
function build17(n){return matchFromPairs('Установите соответствие между уравнением реакции и её классификацией.',l17Pairs,l17Right,n,3,4,'Тип реакции и наличие ОВР определяют независимо друг от друга.');}

const l19Pairs=[
 ['Zn⁰ → Zn²⁺','окисление, отдача 2e−'],['Cl2⁰ → 2Cl−','восстановление, принятие 2e−'],['Fe²⁺ → Fe³⁺','окисление, отдача 1e−'],
 ['Mn⁷⁺ → Mn²⁺','восстановление, принятие 5e−'],['Cr⁶⁺ → Cr³⁺','восстановление, принятие 3e−'],['S²⁻ → S⁰','окисление, отдача 2e−'],
 ['N⁵⁺ → N⁴⁺','восстановление, принятие 1e−'],['Cu⁰ → Cu²⁺','окисление, отдача 2e−'],['O2⁰ → 2O²⁻','восстановление, принятие 4e−'],
 ['2Br− → Br2⁰','окисление, отдача 2e−'],['Al⁰ → Al³⁺','окисление, отдача 3e−'],['Cl⁵⁺ → Cl⁻','восстановление, принятие 6e−']
];
const l19Right=uniq(l19Pairs.map(x=>x[1]));
function build19(n){return matchFromPairs('Установите соответствие между электронным переходом и его характеристикой.',l19Pairs,l19Right,n,3,4,'Повышение степени окисления означает отдачу электронов, понижение — принятие.');}

const l20Pairs=[
 ['расплав NaCl','катод: Na; анод: Cl2'],['раствор NaCl, инертные электроды','катод: H2; анод: Cl2'],['раствор CuSO4, инертные электроды','катод: Cu; анод: O2'],
 ['расплав KBr','катод: K; анод: Br2'],['раствор AgNO3, инертные электроды','катод: Ag; анод: O2'],['раствор H2SO4, инертные электроды','катод: H2; анод: O2'],
 ['расплав CaCl2','катод: Ca; анод: Cl2'],['раствор CuCl2, инертные электроды','катод: Cu; анод: Cl2'],['расплав Al2O3','катод: Al; анод: O2 (формально)'],
 ['раствор K2SO4, инертные электроды','катод: H2; анод: O2'],['раствор ZnSO4, инертные электроды','катод: H2; анод: O2'],['расплав MgBr2','катод: Mg; анод: Br2']
];
const l20Right=uniq(l20Pairs.map(x=>x[1]));
function build20(n){return matchFromPairs('Установите соответствие между электролизуемой системой и основными продуктами на электродах.',l20Pairs,l20Right,n,3,4,'Сначала различают расплав и водный раствор, затем учитывают конкуренцию воды и ионов на электродах.');}

// Line 21: four positions in a strict pH order.
const phPool=['0,1 M HCl','0,1 M CH3COOH','0,1 M NH4Cl','0,1 M NaCl','0,1 M CH3COONa','0,1 M NH3·H2O','0,1 M NaOH'];
const phComb=combinations(phPool,4);
function build21(n){const chosen=pick(phComb,n);return seq('Расположите растворы в порядке увеличения pH при одинаковой температуре.',chosen,chosen,n,'Сильная кислота имеет минимальный pH; затем идут слабая кислота и кислая соль, нейтральная соль, основные растворы и сильная щёлочь.');}

const l22Pairs=[
 ['N2 + 3H2 ⇄ 2NH3 + Q; повысить давление','вправо'],['N2 + 3H2 ⇄ 2NH3 + Q; повысить температуру','влево'],['N2 + 3H2 ⇄ 2NH3 + Q; удалить NH3','вправо'],
 ['2SO2 + O2 ⇄ 2SO3 + Q; уменьшить давление','влево'],['2SO2 + O2 ⇄ 2SO3 + Q; добавить O2','вправо'],['2SO2 + O2 ⇄ 2SO3 + Q; повысить температуру','влево'],
 ['H2 + I2 ⇄ 2HI − Q; повысить температуру','вправо'],['H2 + I2 ⇄ 2HI − Q; удалить HI','вправо'],['H2 + I2 ⇄ 2HI − Q; увеличить давление','не смещается'],
 ['CaCO3(тв) ⇄ CaO(тв) + CO2(г) − Q; увеличить давление','влево'],['CaCO3(тв) ⇄ CaO(тв) + CO2(г) − Q; удалить CO2','вправо'],['CaCO3(тв) ⇄ CaO(тв) + CO2(г) − Q; повысить температуру','вправо']
];
function build22(n){return matchFromPairs('Установите соответствие между воздействием на равновесную систему и направлением смещения химического равновесия.',l22Pairs,['вправо','влево','не смещается'],n,4,3,'Примените принцип Ле Шателье с учётом теплового эффекта и числа молей газа.');}

// Line 23: two calculated equilibrium concentrations X/Y selected from six numbers.
function build23(n){
  const N=Math.max(1,Number(n)||1),a=1+(N%5),b=2+((N*2)%5),change=0.2+0.1*(N%4);
  const x=Number((a-change).toFixed(1)),y=Number((b-change).toFixed(1));
  const values=uniq([x,y,Number((a+change).toFixed(1)),Number((b+change).toFixed(1)),a,b,Number((x+y).toFixed(1)),change]).map(String);
  while(values.length<6)values.push(String(values.length+1));
  const right=values.slice(0,6);
  const prompt=`В системе A + B ⇄ C исходные концентрации A и B равны ${a.toFixed(1)} и ${b.toFixed(1)} моль/л. К моменту равновесия концентрация C увеличилась на ${change.toFixed(1)} моль/л. Установите значения X=[A]равн и Y=[B]равн, выбрав их из перечня.`;
  return matching(prompt,['X','Y'],right,[String(x),String(y)],N,'По стехиометрии 1:1 концентрации A и B уменьшаются на ту же величину, на которую увеличилась концентрация C.');
}

const l24Pairs=[
 ['Cl−','AgNO3: белый AgCl'],['SO4²−','BaCl2: белый BaSO4'],['CO3²−','HCl: выделение CO2'],['NH4+','NaOH, t: выделение NH3'],
 ['Cu²+','NaOH: голубой Cu(OH)2'],['Fe³+','NaOH: бурый Fe(OH)3'],['Br−','AgNO3: кремовый AgBr'],['I−','AgNO3: жёлтый AgI'],
 ['SO3²−','HCl: выделение SO2'],['Al³+','NaOH: белый осадок, растворяется в избытке'],['фенол','Br2(водн.): белый осадок'],['альдегид','реактив Толленса: серебряное зеркало']
];
const l24Right=uniq(l24Pairs.map(x=>x[1]));
function build24(n){return matchFromPairs('Установите соответствие между определяемой частицей/веществом и качественным реагентом с наблюдаемым признаком.',l24Pairs,l24Right,n,4,5,'Качественная реакция должна давать специфичный наблюдаемый признак.');}

const l25Pairs=[
 ['аммиак','производство азотных удобрений'],['серная кислота','производство минеральных удобрений и химический синтез'],['полиэтилен','упаковочные материалы'],
 ['поливинилхлорид','трубы и изоляционные материалы'],['этиленгликоль','компонент антифризов'],['этанол','растворитель и химическое сырьё'],
 ['хлор','обеззараживание воды и химический синтез'],['карбонат натрия','производство стекла'],['кремнезём SiO2','сырьё для стекла и силикатов'],
 ['метан','топливо и сырьё для синтеза'],['алюминий','лёгкие конструкционные сплавы'],['железо','основа сталей']
];
const l25Right=uniq(l25Pairs.map(x=>x[1]));
function build25(n){return matchFromPairs('Установите соответствие между веществом/материалом и областью его применения или промышленного использования.',l25Pairs,l25Right,n,3,4,'Выберите типичное практическое применение вещества или материала.');}

module.exports={2:build2,5:build5,6:build6,7:build7,8:build8,9:build9,14:build14,15:build15,16:build16,17:build17,19:build19,20:build20,21:build21,22:build22,23:build23,24:build24,25:build25};
