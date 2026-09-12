(()=>{
'use strict';

const parseBody=value=>{
  if(!value)return{};
  if(typeof value==='string'){try{return JSON.parse(value)}catch{return{}}}
  return value&&typeof value==='object'?value:{};
};

function localCoachReply(message,mode='coach'){
  const q=String(message||'').toLowerCase().replace(/ё/g,'е');
  if(/теори|достаточ|хватит|хватает/.test(q)){
    return 'Для понимания темы — да, но на ЕГЭ одной теории недостаточно. После урока реши 8–12 заданий этой линии без подсказок и отдельно проверь формулировки для второй части. Если держишь около 80% и выше на практике, значит объёма теории тебе хватает.';
  }
  if(/ошиб|разбор|почему не/.test(q)){
    return 'Начни с трёх последних ошибок: для каждой выпиши, где именно сломалась логика, затем реши по 2 похожих задания. Если ошибка повторяется второй раз, вернись к короткому фрагменту теории именно по этому месту, а не перечитывай всю тему.';
  }
  if(/завтра|следующ/.test(q)){
    return 'Завтра бери следующий пункт из текущего плана, а перед ним сделай 10 минут повторения сегодняшних ошибок. Так материал не будет выпадать между занятиями.';
  }
  if(/недел|план|расписан/.test(q)){
    return 'Держись текущего недельного плана по порядку: сначала слабые линии, затем закрепление и пробник. Если один день выпал, не пытайся удвоить нагрузку — перенеси незакрытый блок на ближайший учебный день.';
  }
  if(mode==='quiz'){
    return 'Проверим без подсказки: объясни своими словами ключевое правило по теме, которую сейчас проходишь, и приведи один пример. Я оценю полноту и точность формулировки.';
  }
  if(mode==='hint'){
    return 'Подсказка: сначала выдели, что именно дано в условии, а затем назови одно правило из теории, которое напрямую связывает данные с ответом. Готовый ответ пока не бери.';
  }
  return 'По текущему плану сейчас выгоднее закончить ближайший учебный шаг и сразу закрепить его практикой. Если вопрос про конкретную тему — напиши её название или номер линии, и разберём точечно.';
}

function install(){
  const data=window.OsnovaData;
  if(!data||typeof data.request!=='function'||data.request.__proResiliencePatched)return false;
  const original=data.request.bind(data);
  const wrapped=async(path,opts={})=>{
    const method=String(opts?.method||'GET').toUpperCase();
    const isCoach=String(path||'').includes('/api/ai-pro/coach')&&method==='POST';
    if(!isCoach)return original(path,opts);
    try{
      return await original(path,opts);
    }catch(error){
      if(error?.status&&!error?.transient)return Promise.reject(error);
      const body=parseBody(opts?.body);
      console.warn('pro-coach-local-fallback',error?.status||0,error?.message||'transient error');
      return {
        text:localCoachReply(body.message,body.mode),
        subjectSlug:body.subjectSlug||null,
        source:'local-resilience',
        aiAvailable:null,
        actions:[]
      };
    }
  };
  wrapped.__proResiliencePatched=true;
  data.request=wrapped;
  return true;
}

install();
let attempts=0;
const timer=setInterval(()=>{if(install()||++attempts>20)clearInterval(timer)},250);
})();
