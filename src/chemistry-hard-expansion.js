'use strict';

const rotate=(arr,n)=>{const a=[...arr],shift=((Number(n)||1)-1)%a.length;return a.slice(shift).concat(a.slice(0,shift));};
const options=labels=>labels.map((label,i)=>({value:String(i),label:String(label)}));
const hard=item=>({...item,difficulty:3,content:{...(item.content||{}),strictFipi2027:true,hardExpansion:true}});

function multipleExact(prompt,correct,wrong,n,steps,explanation){
 const correctSet=new Set(correct),shown=rotate([...correct,...wrong],n).slice(0,5);
 if(shown.length!==5||correct.length!==2)throw new Error('multipleExact shape');
 return hard({type:'multiple',questionType:'multiple_answer',prompt,instruction:'Выберите два верных ответа.',options:options(shown),
  answer:shown.map((x,i)=>correctSet.has(x)?String(i):null).filter(x=>x!==null),explanation,solutionSteps:steps});
}
function multipleAny(prompt,correct,wrong,n,steps,explanation){
 const correctSet=new Set(correct),shown=rotate([...correct,...wrong],n).slice(0,5);
 if(shown.length!==5)throw new Error('multipleAny shape');
 return hard({type:'multiple',questionType:'multiple_answer',prompt,instruction:'Выберите все верные ответы.',options:options(shown),
  answer:shown.map((x,i)=>correctSet.has(x)?String(i):null).filter(x=>x!==null),explanation,solutionSteps:steps});
}
function matching(prompt,left,right,answers,n,steps,explanation){
 const shown=rotate(right,n),index=new Map(shown.map((x,i)=>[x,i]));
 return hard({type:'matching',questionType:'matching',prompt,instruction:'Установите соответствие.',options:[],
  answer:answers.map(x=>String(index.get(x))),
  content:{left,right:shown,answerEncoding:'indexes'},explanation,solutionSteps:steps});
}

const mainGroup=[
 {s:'Li',v:1},{s:'Be',v:2},{s:'B',v:3},{s:'C',v:4},{s:'N',v:5},{s:'O',v:6},{s:'F',v:7},{s:'Ne',v:8},
 {s:'Na',v:1},{s:'Mg',v:2},{s:'Al',v:3},{s:'Si',v:4},{s:'P',v:5},{s:'S',v:6},{s:'Cl',v:7},{s:'Ar',v:8}
];
function line1(n){
 const N=Math.max(1,Number(n)||1),v=1+((N-1)%8),correct=mainGroup.filter(x=>x.v===v).map(x=>x.s);
 const wrongPool=mainGroup.filter(x=>x.v!==v).map(x=>x.s);
 const start=(Math.floor((N-1)/8)*3+N)%wrongPool.length,wrong=[wrongPool[start],wrongPool[(start+5)%wrongPool.length],wrongPool[(start+9)%wrongPool.length]];
 return multipleExact(`Из пяти элементов выберите два, атомы которых в основном состоянии имеют ${v} валентных электронов.`,correct,wrong,N,
  ['Для каждого элемента определите электронную конфигурацию внешних и валентных подуровней.','Сосчитайте валентные электроны.','Выберите ровно два элемента с указанным числом.'],
  `У элементов ${correct.join(' и ')} по ${v} валентных электронов.`);
}

const oxidationCases=[
 {el:'S',os:'+6',correct:['SO3','H2SO4'],wrong:['H2S','SO2','S','Na2S','Na2SO3']},
 {el:'S',os:'+4',correct:['SO2','Na2SO3'],wrong:['H2SO4','H2S','S','SO3','Na2S']},
 {el:'N',os:'+5',correct:['HNO3','N2O5'],wrong:['NH3','N2','NO2','NO','N2O3']},
 {el:'N',os:'+3',correct:['HNO2','N2O3'],wrong:['HNO3','NH3','N2','NO2','N2O5']},
 {el:'Cl',os:'+7',correct:['HClO4','KClO4'],wrong:['HCl','Cl2','HClO3','HClO','HClO2']},
 {el:'Cl',os:'+5',correct:['HClO3','KClO3'],wrong:['HClO4','HCl','Cl2','HClO','HClO2']},
 {el:'C',os:'+4',correct:['CO2','Na2CO3'],wrong:['CO','CH4','C','Al4C3','CaC2']},
 {el:'C',os:'−4',correct:['CH4','Al4C3'],wrong:['CO','CO2','C','CaC2','Na2CO3']},
 {el:'Mn',os:'+7',correct:['KMnO4','Mn2O7'],wrong:['MnO2','MnO','Mn','Mn2O3','MnCl2']},
 {el:'Cr',os:'+6',correct:['K2Cr2O7','CrO3'],wrong:['Cr2O3','CrCl3','Cr','CrO','Cr(OH)3']},
 {el:'Fe',os:'+3',correct:['FeCl3','Fe2O3'],wrong:['FeCl2','FeO','Fe','FeSO4','Fe(OH)2']},
 {el:'P',os:'+5',correct:['H3PO4','P2O5'],wrong:['PH3','P','H3PO3','PCl3','Na3P']},
 {el:'P',os:'+3',correct:['H3PO3','PCl3'],wrong:['H3PO4','PH3','P','P2O5','Na3P']},
 {el:'Si',os:'+4',correct:['SiO2','Na2SiO3'],wrong:['SiH4','Si','Mg2Si','Ca2Si','Na2Si']}
];
function line3(n){
 const N=Math.max(1,Number(n)||1),c=oxidationCases[(N-1)%oxidationCases.length],w=rotate(c.wrong,Math.floor((N-1)/oxidationCases.length)+1).slice(0,3);
 return multipleExact(`Выберите два вещества, в которых степень окисления элемента ${c.el} равна ${c.os}.`,c.correct,w,N,
  ['Примите стандартные степени окисления O, H и щелочных металлов.','Составьте уравнение суммы степеней окисления с учётом индексов и заряда.','Выберите два вещества с требуемым значением.'],
  `В ${c.correct.join(' и ')} степень окисления ${c.el} равна ${c.os}.`);
}

const lattice={
 ionic:['NaCl','K2O','CaF2','MgO','Na2SO4','NH4Cl','CaCO3','KNO3'],
 molecular:['I2','CO2(тв.)','H2O(лёд)','S8','P4','SO2(тв.)','NH3(тв.)','HCl(тв.)'],
 atomic:['алмаз','графит','SiO2(кварц)','SiC','Si','B','BN(куб.)','Ge'],
 metallic:['Fe','Cu','Al','Na','Mg','Zn','Ag','Ca']
};
function line4(n){
 const types=Object.keys(lattice),N=Math.max(1,Number(n)||1),type=types[(N-1)%types.length],pool=lattice[type],cycle=Math.floor((N-1)/types.length);
 const correct=[pool[cycle%pool.length],pool[(cycle+3)%pool.length]];
 const others=types.filter(x=>x!==type).map((x,i)=>lattice[x][(cycle*2+i*3)%lattice[x].length]);
 const label={ionic:'ионную',molecular:'молекулярную',atomic:'атомную',metallic:'металлическую'}[type];
 return multipleExact(`Выберите два вещества, которые в твёрдом состоянии имеют ${label} кристаллическую решётку.`,correct,others,N,
  ['Определите тип частиц в узлах решётки каждого вещества.','Отличайте тип химической связи от типа кристаллической решётки.','Выберите два вещества требуемого типа.'],
  `${correct.join(' и ')} имеют ${label} кристаллическую решётку.`);
}

const inorganicChains=[
 {chain:'Fe → FeCl3 → Fe(OH)3',x:'Cl2',y:'NaOH',wrong:['HCl','H2O','CO2']},
 {chain:'Cu → CuO → CuSO4',x:'O2, t',y:'H2SO4',wrong:['HCl','NaOH','H2']},
 {chain:'Zn → ZnCl2 → Zn(OH)2',x:'HCl',y:'NaOH (нед.)',wrong:['Cl2','H2O','CO2']},
 {chain:'Ca → CaO → Ca(OH)2',x:'O2',y:'H2O',wrong:['HCl','CO2','NaCl']},
 {chain:'SO2 → SO3 → H2SO4',x:'O2, V2O5, t',y:'H2O',wrong:['H2','NaOH','Cl2']},
 {chain:'P → P2O5 → H3PO4',x:'O2, t',y:'H2O',wrong:['H2','NaOH','NH3']},
 {chain:'N2 → NH3 → NO',x:'H2, Fe, p, t',y:'O2, Pt, t',wrong:['HCl','NaOH','H2O']},
 {chain:'NH3 → NH4Cl → NH3',x:'HCl',y:'NaOH, t',wrong:['O2','H2','Cl2']},
 {chain:'Na2CO3 → CO2 → CaCO3',x:'HCl',y:'Ca(OH)2',wrong:['NaOH','H2','O2']},
 {chain:'FeCl2 → Fe(OH)2 → Fe(OH)3',x:'NaOH',y:'O2 + H2O',wrong:['HCl','CO2','H2']},
 {chain:'AlCl3 → Al(OH)3 → Na[Al(OH)4]',x:'NaOH (нед.)',y:'NaOH (изб.)',wrong:['HCl','CO2','Cl2']},
 {chain:'CuSO4 → Cu(OH)2 → CuO',x:'NaOH',y:'t',wrong:['HCl','H2O','O2']},
 {chain:'CaCO3 → CaO → CaCl2',x:'t',y:'HCl',wrong:['NaOH','CO2','H2']},
 {chain:'Fe2O3 → Fe → FeSO4',x:'CO, t',y:'H2SO4(разб.)',wrong:['Cl2','NaOH','O2']}
];
function pairChain(line,c,n,organic=false){
 const right=[c.x,c.y,...c.wrong],prompt=`Для схемы превращений ${c.chain} выберите вещества или условия X и Y, необходимые для первой и второй стадий соответственно.`;
 return matching(prompt,['X','Y'],right,[c.x,c.y],n,
  ['Определите тип каждой реакции в цепочке.','Для каждой стадии подберите реагент и условия, обеспечивающие указанный продукт.','Запишите позиции X и Y в заданном порядке.'],
  organic?'Проверьте функциональные группы и условия органических превращений.':'Проверьте химические свойства исходного вещества и продукта каждой стадии.');
}
function line9(n){return pairChain(9,inorganicChains[((Number(n)||1)-1)%inorganicChains.length],n);}

const organicPairs=[
 ['CH3CH2OH','одноатомный предельный спирт'],['CH3OCH3','простой эфир'],['CH3CHO','альдегид'],['CH3COCH3','кетон'],
 ['CH3COOH','одноосновная карбоновая кислота'],['C6H5OH','фенол'],['CH3NH2','первичный амин'],['NH2CH2COOH','аминокислота'],
 ['CH3COOC2H5','сложный эфир'],['CH2=CH2','алкен'],['HC≡CH','алкин'],['C6H6','арен'],
 ['CH3CH2CH3','алкан'],['CH2=CHCH=CH2','алкадиен'],['HOCH2CH2OH','двухатомный спирт'],['C6H5NH2','ароматический амин']
];
function line10(n){
 const N=Math.max(1,Number(n)||1),len=organicPairs.length,start=(N-1)%len,step=[1,3,5,7][Math.floor((N-1)/len)%4],chosen=[];
 let i=start;while(chosen.length<3){const p=organicPairs[i%len];if(!chosen.includes(p))chosen.push(p);i=(i+step)%len;}
 const correct=chosen.map(x=>x[1]),extra=organicPairs.find(x=>!correct.includes(x[1]))[1],right=[...correct,extra];
 return matching('Установите соответствие между формулой органического вещества и его классом.',chosen.map(x=>x[0]),right,correct,N,
  ['Найдите функциональную группу или характер кратной связи.','Определите класс каждого вещества.','Сопоставьте три формулы с вариантами справа.'],
  'Класс органического вещества определяется строением углеродного скелета и функциональной группой.');
}

const isomerCases=[
 {prompt:'Выберите два вещества, являющиеся межклассовыми изомерами состава C2H6O.',correct:['этанол','диметиловый эфир'],wrong:['этан','этен','этаналь','метанол']},
 {prompt:'Выберите два вещества, являющиеся межклассовыми изомерами состава C3H6O.',correct:['пропаналь','пропанон'],wrong:['пропанол-1','пропен','пропановая кислота','пропан']},
 {prompt:'Выберите два вещества, являющиеся изомерами углеродного скелета состава C4H10.',correct:['бутан','2-метилпропан'],wrong:['бутен-1','бутен-2','пропан','пентан']},
 {prompt:'Выберите два спирта, являющиеся изомерами положения функциональной группы состава C3H8O.',correct:['пропанол-1','пропанол-2'],wrong:['пропан','пропаналь','пропанон','метоксиэтан']},
 {prompt:'Выберите два алкена, являющиеся изомерами положения двойной связи состава C4H8.',correct:['бутен-1','бутен-2'],wrong:['бутан','бутадиен-1,3','2-метилпропан','пентен-1']},
 {prompt:'Выберите два вещества, молекулы которых содержат карбонильный атом углерода в sp2-гибридизации.',correct:['этаналь','пропанон'],wrong:['этанол','этан','этиламин','этиленгликоль']},
 {prompt:'Выберите два вещества, для которых возможна геометрическая цис-транс-изомерия.',correct:['бутен-2','1,2-дихлорэтен'],wrong:['этен','пропен','2-метилпропен','этин']},
 {prompt:'Выберите два вещества, молекулы которых содержат делокализованную ароматическую π-систему.',correct:['бензол','фенол'],wrong:['циклогексан','этен','этин','этанол']},
 {prompt:'Выберите два вещества, содержащие атом углерода в sp-гибридизации.',correct:['этин','пропин'],wrong:['этен','бензол','этан','пропанон']},
 {prompt:'Выберите два вещества, содержащие только σ-связи между атомами углерода.',correct:['этан','пропан'],wrong:['этен','этин','бензол','бутадиен-1,3']}
];
function line11(n){
 const N=Math.max(1,Number(n)||1),c=isomerCases[(N-1)%isomerCases.length],wrong=rotate(c.wrong,Math.floor((N-1)/isomerCases.length)+1).slice(0,3);
 return multipleExact(c.prompt,c.correct,wrong,N,
  ['Сравните молекулярные формулы и строение предложенных веществ.','Проверьте тип гибридизации, кратной связи или функциональной группы, указанный в условии.','Выберите ровно два подходящих вещества.'],
  'Верные варианты удовлетворяют всем структурным условиям задания.');
}

const hydrocarbonCases=[
 {prompt:'Выберите вещества, которые обесцвечивают бромную воду при обычных условиях без освещения и катализатора.',correct:['этен','этин'],wrong:['этан','бензол','метан']},
 {prompt:'Выберите вещества, которые вступают в реакцию гидрирования по кратной связи.',correct:['пропен','пропин','бутадиен-1,3'],wrong:['пропан','бензол']},
 {prompt:'Выберите вещества, для которых характерна реакция полимеризации по кратной связи.',correct:['этен','пропен','бутадиен-1,3'],wrong:['этан','бензол']},
 {prompt:'Выберите вещества, которые могут вступать в реакцию присоединения HBr по кратной связи.',correct:['этен','пропен','этин'],wrong:['метан','этан']},
 {prompt:'Выберите вещества, которые при полном сгорании образуют CO2 и H2O.',correct:['метан','этен','этин'],wrong:['CO2','C']},
 {prompt:'Выберите углеводороды, способные обесцвечивать разбавленный раствор KMnO4 при мягких условиях.',correct:['этен','пропен','этин'],wrong:['метан','бензол']},
 {prompt:'Выберите вещества, для которых характерно радикальное галогенирование на свету.',correct:['метан','этан'],wrong:['этен','этин','бензол']},
 {prompt:'Выберите вещества, содержащие две π-связи в молекуле.',correct:['этин','бутадиен-1,3'],wrong:['этен','этан','бензол']},
 {prompt:'Выберите вещества, которые являются непредельными ациклическими углеводородами.',correct:['пропен','пропин','бутадиен-1,3'],wrong:['пропан','бензол']},
 {prompt:'Выберите вещества, которые присоединяют водород с уменьшением числа π-связей.',correct:['этен','этин','бутадиен-1,3'],wrong:['метан','циклогексан']},
 {prompt:'Выберите углеводороды, которые при полном гидрировании превращаются в пропан.',correct:['пропен','пропин'],wrong:['этен','бутен-1','этан']},
 {prompt:'Выберите углеводороды, которые при полном гидрировании превращаются в бутан.',correct:['бутен-1','бутен-2','бутин-1','бутин-2'],wrong:['пропен']},
 {prompt:'Выберите вещества, содержащие ровно одну π-связь в молекуле.',correct:['этен','пропен'],wrong:['этан','этин','бутадиен-1,3']},
 {prompt:'Выберите вещества, содержащие ровно две π-связи в молекуле.',correct:['этин','бутадиен-1,3'],wrong:['этен','пропан','циклогексан']},
 {prompt:'Выберите углеводороды, способные вступать в реакцию присоединения Br2 без освещения.',correct:['этен','пропен','этин'],wrong:['метан','этан']},
 {prompt:'Выберите вещества, способные вступать в реакцию гидратации по кратной связи.',correct:['этен','пропен','этин'],wrong:['этан','метан']},
 {prompt:'Выберите углеводороды, в молекулах которых есть атомы углерода sp2-гибридизации.',correct:['этен','пропен','бензол'],wrong:['этан','этин']},
 {prompt:'Выберите углеводороды, в молекулах которых есть атомы углерода sp-гибридизации.',correct:['этин','пропин'],wrong:['этен','бензол','этан']},
 {prompt:'Выберите вещества, относящиеся к ациклическим непредельным углеводородам.',correct:['бутен-1','бутин-1','бутадиен-1,3'],wrong:['бутан','бензол']},
 {prompt:'Выберите углеводороды, для которых характерно электрофильное присоединение по двойной связи.',correct:['этен','пропен'],wrong:['этан','этин','бензол']},
 {prompt:'Выберите вещества, которые могут быть мономерами реакций полимеризации по связи C=C.',correct:['этен','пропен','бутадиен-1,3'],wrong:['этан','этин']},
 {prompt:'Выберите углеводороды, которые содержат кратную связь и при полном сгорании дают только CO2 и H2O.',correct:['этен','этин','пропен'],wrong:['CO','этанол']}
];
function line12(n){
 const N=Math.max(1,Number(n)||1),c=hydrocarbonCases[(N-1)%hydrocarbonCases.length];
 return multipleAny(c.prompt,c.correct,c.wrong,N,
  ['Определите класс каждого углеводорода и наличие π-связей.','Учтите условия реакции, указанные в задании.','Выберите все и только подходящие вещества.'],
  'Реакционная способность углеводородов определяется типом связей и условиями процесса.');
}

const line13Cases=[
 {prompt:'Выберите два вещества, которые проявляют основные свойства за счёт атома азота и реагируют с HCl.',correct:['метиламин','анилин'],wrong:['глицин','глюкоза','этанол']},
 {prompt:'Выберите два вещества, молекулы которых содержат одновременно аминогруппу и карбоксильную группу.',correct:['глицин','аланин'],wrong:['метиламин','уксусная кислота','глюкоза']},
 {prompt:'Выберите два вещества, способные образовывать пептидные связи друг с другом.',correct:['глицин','аланин'],wrong:['этанол','глюкоза','анилин']},
 {prompt:'Выберите два высокомолекулярных соединения природного происхождения.',correct:['крахмал','целлюлоза'],wrong:['глюкоза','сахароза','этанол']},
 {prompt:'Выберите два вещества, являющиеся моносахаридами.',correct:['глюкоза','фруктоза'],wrong:['сахароза','крахмал','целлюлоза']},
 {prompt:'Выберите два вещества, подвергающиеся гидролизу с образованием моносахаридов.',correct:['сахароза','крахмал'],wrong:['глюкоза','фруктоза','метиламин']},
 {prompt:'Выберите два вещества, которые могут образовывать соли и с кислотами, и со щелочами.',correct:['глицин','аланин'],wrong:['метиламин','анилин','глюкоза']},
 {prompt:'Выберите два азотсодержащих органических вещества, проявляющих основные свойства.',correct:['метиламин','этиламин'],wrong:['уксусная кислота','этанол','глюкоза']},
 {prompt:'Выберите два полимера, мономерные звенья которых связаны пептидными или гликозидными связями.',correct:['белок','целлюлоза'],wrong:['полиэтилен','поливинилхлорид','этен']},
 {prompt:'Выберите два вещества, содержащие несколько гидроксильных групп в молекуле.',correct:['глюкоза','фруктоза'],wrong:['метиламин','этаналь','этановая кислота']}
];
function line13(n){
 const N=Math.max(1,Number(n)||1),c=line13Cases[(N-1)%line13Cases.length];
 return multipleExact(c.prompt,c.correct,c.wrong,N,
  ['Определите функциональные группы и класс каждого вещества.','Вспомните химические свойства аминов, аминокислот и углеводов.','Выберите два вещества, удовлетворяющие условию.'],
  'Верные вещества имеют указанные функциональные группы и соответствующие свойства.');
}

const organicChains=[
 {chain:'CH3CH2Br → CH2=CH2 → CH3CH2OH',x:'KOH(спирт), t',y:'H2O, H+',wrong:['KOH(водн.)','H2','Cl2, hν']},
 {chain:'C2H5OH → C2H4 → C2H4Br2',x:'H2SO4(конц.), 170°C',y:'Br2',wrong:['H2','NaOH','CuO']},
 {chain:'HC≡CH → CH3CHO → CH3COOH',x:'H2O, Hg2+/H+',y:'[O]',wrong:['H2','Br2','NaOH']},
 {chain:'C6H6 → C6H5NO2 → C6H5NH2',x:'HNO3/H2SO4',y:'Fe/HCl, затем NaOH',wrong:['Br2(водн.)','KOH(спирт)','H2O']},
 {chain:'CH3COOH → CH3COOC2H5 → C2H5OH',x:'C2H5OH, H+',y:'H2O, H+',wrong:['H2','Br2','CuO']},
 {chain:'CH3CHO → CH3COOH → CH3COONa',x:'[O]',y:'NaOH',wrong:['H2','Br2','HCl']},
 {chain:'CH4 → CH3Cl → CH3OH',x:'Cl2, hν',y:'KOH(водн.)',wrong:['KOH(спирт)','H2','O2']},
 {chain:'CH2=CH2 → BrCH2CH2Br → HC≡CH',x:'Br2',y:'KOH(спирт), избыток, t',wrong:['H2','H2O','NaCl']},
 {chain:'CH3CH2OH → CH3CHO → CH3COOH',x:'CuO, t',y:'[O]',wrong:['H2','NaOH','Br2']},
 {chain:'CH3CH=CH2 → CH3CHBrCH3 → CH3CHOHCH3',x:'HBr',y:'KOH(водн.)',wrong:['KOH(спирт)','H2','CuO']},
 {chain:'C2H6 → C2H5Cl → C2H5OH',x:'Cl2, hν',y:'KOH(водн.)',wrong:['H2O, H+','H2','NaOH(спирт)']},
 {chain:'C2H4 → C2H5OH → CH3CHO',x:'H2O, H+',y:'CuO, t',wrong:['H2','Br2','NaOH']},
 {chain:'C2H5OH → C2H5ONa → C2H5OH',x:'Na',y:'H2O',wrong:['H2','Br2','CuO']},
 {chain:'CH3COOC2H5 → CH3COONa → CH4',x:'NaOH(водн.)',y:'NaOH/CaO, t',wrong:['H2','Br2','CuO']}
];
function line16(n){return pairChain(16,organicChains[((Number(n)||1)-1)%organicChains.length],n,true);}

const rateCases=[
 {system:'Zn + HCl',correct:['измельчить цинк','повысить концентрацию HCl'],wrong:['понизить температуру','разбавить кислоту водой','уменьшить площадь поверхности цинка']},
 {system:'CaCO3 + HCl',correct:['измельчить CaCO3','повысить температуру'],wrong:['охладить смесь','разбавить HCl','взять крупные куски CaCO3']},
 {system:'H2 + I2(г)',correct:['повысить температуру','увеличить давление при постоянной температуре'],wrong:['понизить температуру','уменьшить давление','добавить инертный газ при постоянном объёме']},
 {system:'разложение H2O2',correct:['добавить катализатор MnO2','повысить температуру'],wrong:['охладить раствор','разбавить раствор','удалить катализатор']},
 {system:'Mg + HCl',correct:['повысить концентрацию кислоты','повысить температуру'],wrong:['разбавить кислоту','охладить смесь','покрыть Mg защитной плёнкой']},
 {system:'горение CO в O2',correct:['повысить температуру','увеличить концентрацию O2'],wrong:['понизить температуру','уменьшить концентрацию CO','разбавить смесь инертным газом при снижении парциальных давлений']},
 {system:'Na2S2O3 + H2SO4(р-р)',correct:['повысить концентрацию Na2S2O3','повысить температуру'],wrong:['разбавить растворы','охладить смесь','уменьшить концентрацию H2SO4']},
 {system:'Fe(тв.) + HCl',correct:['увеличить площадь поверхности Fe','повысить температуру'],wrong:['охладить смесь','уменьшить концентрацию HCl','использовать более крупный кусок Fe']},
 {system:'N2 + H2 на катализаторе',correct:['повысить температуру в пределах рассматриваемой кинетической задачи','увеличить парциальные давления реагентов'],wrong:['понизить температуру','уменьшить давление','удалить катализатор']},
 {system:'этерификация CH3COOH и C2H5OH',correct:['повысить температуру','добавить кислотный катализатор'],wrong:['охладить смесь','удалить катализатор','сильно разбавить реагенты']},
 {system:'Al + HCl',correct:['удалить оксидную плёнку с алюминия','повысить концентрацию HCl'],wrong:['охладить смесь','разбавить кислоту','уменьшить площадь поверхности Al']},
 {system:'CuO + H2 при нагревании',correct:['повысить температуру','увеличить парциальное давление H2'],wrong:['понизить температуру','уменьшить давление H2','ввести инертный газ при снижении парциального давления H2']},
 {system:'2SO2 + O2 → 2SO3',correct:['повысить температуру в кинетическом опыте','увеличить концентрацию SO2'],wrong:['понизить концентрацию O2','охладить смесь','уменьшить давление реагирующих газов']},
 {system:'гидролиз сложного эфира в кислой среде',correct:['повысить температуру','увеличить концентрацию H+ в пределах опыта'],wrong:['охладить смесь','уменьшить концентрацию кислоты','сильно разбавить реагенты']},
 {system:'реакция порошка Fe с раствором CuSO4',correct:['измельчить железо','повысить концентрацию CuSO4'],wrong:['охладить смесь','разбавить раствор CuSO4','взять сплошной крупный кусок Fe']},
 {system:'нейтрализация HCl раствором NaOH',correct:['повысить концентрации реагентов','повысить температуру'],wrong:['сильно разбавить оба раствора','охладить растворы','уменьшить концентрацию NaOH']},
 {system:'реакция гранул Zn с раствором CuSO4',correct:['увеличить площадь поверхности Zn','повысить температуру'],wrong:['охладить смесь','разбавить CuSO4','уменьшить площадь поверхности Zn']},
 {system:'окисление NO кислородом',correct:['увеличить концентрацию NO','увеличить концентрацию O2'],wrong:['разбавить газовую смесь','уменьшить давление','снизить концентрацию NO']},
 {system:'разложение KClO3 при нагревании',correct:['повысить температуру','добавить MnO2 как катализатор'],wrong:['охладить смесь','удалить катализатор','снизить температуру нагревателя']},
 {system:'реакция растворов Na2S2O3 и HCl',correct:['повысить концентрацию HCl','повысить температуру'],wrong:['охладить смесь','разбавить HCl','уменьшить концентрацию Na2S2O3']}
];
function line18(n){
 const N=Math.max(1,Number(n)||1),c=rateCases[(N-1)%rateCases.length];
 return multipleExact(`Для реакции «${c.system}» выберите два изменения, которые увеличивают скорость реакции при прочих равных условиях.`,c.correct,c.wrong,N,
  ['Определите, какие факторы изменяют частоту и эффективность столкновений частиц.','Для гетерогенной реакции учтите площадь поверхности; для газов и растворов — концентрацию.','Выберите два фактора, ускоряющих процесс.'],
  'Скорость реакции возрастает при увеличении частоты эффективных столкновений или снижении энергии активации.');
}

function line23(n){
 const N=Math.max(1,Number(n)||1),patterns=[[1,1],[2,1],[1,2],[2,3],[3,1]],p=patterns[(N-1)%patterns.length],cycle=Math.floor((N-1)/patterns.length);
 const a0=Number((2.4+0.3*((cycle+N)%6)).toFixed(1)),b0=Number((2.8+0.2*((cycle*2+N)%7)).toFixed(1)),extent=Number((0.1+0.1*((cycle+N)%4)).toFixed(1));
 const x=Number((a0-p[0]*extent).toFixed(1)),y=Number((b0-p[1]*extent).toFixed(1));
 const values=[x,y,a0,b0,Number((x+extent).toFixed(1)),Number((y+extent).toFixed(1)),extent,Number((x+y).toFixed(1))];
 const right=[];for(const v of values){const s=v.toFixed(1);if(!right.includes(s))right.push(s);if(right.length===6)break;}
 while(right.length<6)right.push((right.length+0.5).toFixed(1));
 const prompt=`В системе ${p[0]===1?'A':p[0]+'A'} + ${p[1]===1?'B':p[1]+'B'} ⇄ C исходные концентрации A и B равны ${a0.toFixed(1)} и ${b0.toFixed(1)} моль/л. К равновесию концентрация C увеличилась на ${extent.toFixed(1)} моль/л. Установите X=[A]равн и Y=[B]равн.`;
 return matching(prompt,['X','Y'],right,[x.toFixed(1),y.toFixed(1)],N,
  ['Обозначьте изменение концентрации продукта как степень превращения ξ.','Уменьшите концентрации реагентов пропорционально их стехиометрическим коэффициентам.','Сопоставьте рассчитанные X и Y с перечнем.'],
  `[A]равн = ${a0.toFixed(1)} − ${p[0]}·${extent.toFixed(1)} = ${x.toFixed(1)}; [B]равн = ${b0.toFixed(1)} − ${p[1]}·${extent.toFixed(1)} = ${y.toFixed(1)} моль/л.`);
}

function build(line,n){
 switch(Number(line)){
  case 1:return line1(n);
  case 3:return line3(n);
  case 4:return line4(n);
  case 9:return line9(n);
  case 10:return line10(n);
  case 11:return line11(n);
  case 12:return line12(n);
  case 13:return line13(n);
  case 16:return line16(n);
  case 18:return line18(n);
  case 23:return line23(n);
  default:return null;
 }
}
module.exports={build};
