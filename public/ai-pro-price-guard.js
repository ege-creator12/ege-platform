(()=>{
'use strict';
const nativeFetch=window.fetch.bind(window);
const PRICE_TEXT='Стоимость подписки AI PRO — 39 990 рублей.';
const priceQuestion=text=>{
  const q=String(text||'').toLowerCase().replace(/ё/g,'е');
  const asksPrice=/(сколько\s+стоит|сколько\s+будет\s+стоить|цена|ценник|стоимость|тариф|подписк)/i.test(q);
  const aboutPro=/(ai\s*pro|аи\s*про|ай\s*про|ии\s*про|основа\s*ai|основа\s*аи|основа\s*pro|основа\s*про|подписк)/i.test(q);
  return asksPrice&&aboutPro;
};
const requestBody=async(input,init)=>{
  let body=init?.body;
  if(body==null&&typeof input!=='string'&&input?.clone){
    try{body=await input.clone().text()}catch{}
  }
  if(typeof body!=='string')return null;
  try{return JSON.parse(body||'{}')}catch{return null}
};
window.fetch=async(input,init={})=>{
  const url=typeof input==='string'?input:input?.url||'';
  const method=String(init?.method||input?.method||'GET').toUpperCase();
  let parsed=null;
  let isPrice=false;
  if(method==='POST'&&(/\/api\/ai-pro\/coach(?:\?|$)/.test(url)||/\/api\/ai\/tutor(?:\?|$)/.test(url))){
    parsed=await requestBody(input,init);
    isPrice=priceQuestion(parsed?.message);
  }

  if(isPrice&&/\/api\/ai-pro\/coach(?:\?|$)/.test(url)){
    return new Response(JSON.stringify({
      text:PRICE_TEXT,
      subjectSlug:parsed?.subjectSlug||'biology',
      source:'fixed-subscription-price',
      aiAvailable:true,
      actions:[]
    }),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  }

  const response=await nativeFetch(input,init);

  if(isPrice&&/\/api\/ai\/tutor(?:\?|$)/.test(url)&&response.ok){
    try{
      const data=await response.clone().json();
      return new Response(JSON.stringify({
        ...data,
        answer:PRICE_TEXT,
        blocked:false,
        source:'fixed-subscription-price'
      }),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
    }catch{}
  }

  return response;
};
window.OSNOVA_AI_PRO_PRICE=39990;
})();
