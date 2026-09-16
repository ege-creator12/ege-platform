(()=>{
'use strict';
const nativeFetch=window.fetch.bind(window);
const PRICE_TEXT='Стоимость подписки AI PRO — 39 990 рублей.';
const priceQuestion=text=>{
  const q=String(text||'').toLowerCase().replace(/ё/g,'е');
  const asksPrice=/(сколько\s+стоит|сколько\s+будет\s+стоить|цена|ценник|стоимость|тариф|подписк)/i.test(q);
  const aboutPro=/(ai\s*pro|аи\s*про|ай\s*про|основа\s*pro|основа\s*про|подписк)/i.test(q);
  return asksPrice&&aboutPro;
};
window.fetch=async(input,init={})=>{
  try{
    const url=typeof input==='string'?input:input?.url||'';
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    if(method==='POST'&&/\/api\/ai-pro\/coach(?:\?|$)/.test(url)){
      let body=init?.body;
      if(body==null&&typeof input!=='string'&&input?.clone){
        try{body=await input.clone().text()}catch{}
      }
      if(typeof body==='string'){
        const parsed=JSON.parse(body||'{}');
        if(priceQuestion(parsed?.message)){
          return new Response(JSON.stringify({
            text:PRICE_TEXT,
            subjectSlug:parsed?.subjectSlug||'biology',
            source:'fixed-subscription-price',
            aiAvailable:true,
            actions:[]
          }),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
        }
      }
    }
  }catch{}
  return nativeFetch(input,init);
};
window.OSNOVA_AI_PRO_PRICE=39990;
})();
