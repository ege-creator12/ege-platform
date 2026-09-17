(()=>{
'use strict';
const nativeFetch=window.fetch.bind(window);
const PRICE_TEXT='Стоимость подписки AI PRO — 1 749 рублей в месяц.';

const currentTutorUtterance=text=>{
  const value=String(text||'');
  const marker='Текущая реплика ученика:';
  const index=value.lastIndexOf(marker);
  if(index>=0)return value.slice(index+marker.length).trim();
  const alt='Сообщение ученика:';
  const altIndex=value.lastIndexOf(alt);
  if(altIndex>=0)return value.slice(altIndex+alt.length).trim();
  return value.trim();
};

const priceQuestion=text=>{
  const q=currentTutorUtterance(text).toLowerCase().replace(/ё/g,'е');
  if(!q)return false;
  const asksPrice=/(сколько\s+(?:стоит|будет\s+стоить)|цена|ценник|стоимость|тариф|сколько\s+подписк|подписк.{0,24}(?:стоит|цена|стоимость))/i.test(q);
  const aboutPro=/(ai\s*pro|аи\s*про|ай\s*про|ии\s*про|основа\s*(?:ai|аи|pro|про)|подписк)/i.test(q);
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
window.OSNOVA_AI_PRO_PRICE=1749;
})();
