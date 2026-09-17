(()=>{
  'use strict';
  const KEY='osnova-ai-tutor-history-v1';
  const PRICE='стоимость подписки ai pro — 1 749 рублей в месяц';

  const asksPrice=text=>{
    const q=String(text||'').toLowerCase().replace(/ё/g,'е');
    return /(сколько\s+(?:стоит|будет\s+стоить)|цена|ценник|стоимость|тариф|сколько\s+подписк|подписк.{0,24}(?:стоит|цена|стоимость))/i.test(q);
  };

  try{
    const raw=JSON.parse(localStorage.getItem(KEY)||'[]');
    if(!Array.isArray(raw)||!raw.length)return;
    const cleaned=[];
    for(const item of raw){
      const role=item?.role;
      const text=String(item?.text||'').trim();
      if(!text||!(role==='user'||role==='assistant'))continue;

      const normalized=text.toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ');
      if(role==='assistant'&&normalized.startsWith(PRICE)){
        const previous=cleaned[cleaned.length-1];
        if(previous?.role==='user'&&!asksPrice(previous.text)){
          cleaned.pop();
          continue;
        }
        if(cleaned.some((entry,index)=>index===cleaned.length-1&&entry.role==='assistant'&&String(entry.text||'').toLowerCase().startsWith(PRICE)))continue;
      }
      cleaned.push(item);
    }
    if(cleaned.length!==raw.length)localStorage.setItem(KEY,JSON.stringify(cleaned.slice(-24)));
  }catch{}
})();
