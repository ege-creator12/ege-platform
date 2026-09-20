'use strict';

/*
 * Structural rules are based on the official FIPI EGE 2027 project materials.
 * FIPI states the 2027 structure through the demo/specification; these rules
 * validate the mechanics of each exam line, not just its topic.
 *
 * The platform does not mark a task as strict-FIPI unless its control type,
 * answer cardinality and matching/sequence dimensions match the official line.
 */

const CHEMISTRY_FORMATS=Object.freeze({
  1:{kind:'multiple',options:5,answers:2},
  2:{kind:'sequence',options:5,answers:3},
  3:{kind:'multiple',options:5,answers:2},
  4:{kind:'multiple',options:5,answers:2},
  5:{kind:'matching',left:3,right:9},
  6:{kind:'matching',left:2,right:5},
  7:{kind:'matching',left:4,right:5},
  8:{kind:'matching',left:4,right:6},
  9:{kind:'matching',left:2,right:5},
 10:{kind:'matching',left:3,right:4},
 11:{kind:'multiple',options:5,answers:2},
 12:{kind:'multiple',options:5,minAnswers:2,maxAnswers:4},
 13:{kind:'multiple',options:5,answers:2},
 14:{kind:'matching',left:4,right:6},
 15:{kind:'matching',left:4,right:6},
 16:{kind:'matching',left:2,right:5},
 17:{kind:'matching',left:3,right:4},
 18:{kind:'multiple',options:5,minAnswers:2,maxAnswers:4},
 19:{kind:'matching',left:3,right:4},
 20:{kind:'matching',left:3,right:4},
 21:{kind:'sequence',options:4,answers:4},
 22:{kind:'matching',left:4,right:3},
 23:{kind:'matching',left:2,right:6},
 24:{kind:'matching',left:4,right:5},
 25:{kind:'matching',left:3,right:4},
 26:{kind:'short'},
 27:{kind:'short'},
 28:{kind:'short'},
 29:{kind:'extended'},
 30:{kind:'extended'},
 31:{kind:'extended'},
 32:{kind:'extended'},
 33:{kind:'extended'},
 34:{kind:'extended'}
});

const BIOLOGY_FORMATS=Object.freeze({
  1:{kind:'short',table:true},
  2:{kind:'multiple',minOptions:5,minAnswers:2},
  3:{kind:'short'},
  4:{kind:'short'},
  5:{kind:'short',image:true},
  6:{kind:'matching',image:true},
  7:{kind:'multiple',minOptions:5,minAnswers:3},
  8:{kind:'matching'},
  9:{kind:'short',image:true},
 10:{kind:'matching',image:true},
 11:{kind:'multiple',minOptions:5,minAnswers:3},
 12:{kind:'sequence',minOptions:4},
 13:{kind:'short',image:true},
 14:{kind:'matching',image:true},
 15:{kind:'multiple',minOptions:5,minAnswers:3},
 16:{kind:'sequence',minOptions:4},
 17:{kind:'multiple',minOptions:5,minAnswers:3},
 18:{kind:'multiple',minOptions:5,minAnswers:3},
 19:{kind:'matching'},
 20:{kind:'short',table:true},
 21:{kind:'multiple',minOptions:5,minAnswers:2,table:true},
 22:{kind:'extended'},
 23:{kind:'extended'},
 24:{kind:'extended'},
 25:{kind:'extended'},
 26:{kind:'extended'},
 27:{kind:'extended'},
 28:{kind:'extended'}
});

function parse(value,fallback={}){
  if(value==null)return fallback;
  if(typeof value==='object')return value;
  try{return JSON.parse(value);}catch{return fallback;}
}
function itemContent(item){return parse(item?.content??item?.content_json,{});}
function itemAnswer(item){
  const value=item?.answer??parse(item?.answer_json,[]);
  return Array.isArray(value)?value:[value].filter(v=>v!==undefined&&v!==null);
}
function itemOptions(item){return Array.isArray(item?.options)?item.options:[];}
function normalizedType(item){return String(item?.type||'').trim();}
function questionType(item){return String(item?.questionType||item?.question_type||'').trim();}
function hasImage(item){return Boolean(item?.imageUrl||item?.image_url);}
function hasTable(item){return Boolean(itemContent(item)?.table);}
function matchingShape(item){
  const content=itemContent(item);
  return {
    left:Array.isArray(content.left)?content.left:[],
    right:Array.isArray(content.right)?content.right:[],
    answer:itemAnswer(item)
  };
}
function isText(item){return normalizedType(item)==='text'&&questionType(item)!=='extended_answer';}
function isExtended(item){
  const content=itemContent(item);
  const criteria=Array.isArray(item?.scoringPoints)?item.scoringPoints:(Array.isArray(content?.criteria)?content.criteria:[]);
  return normalizedType(item)==='text'
    && questionType(item)==='extended_answer'
    && Boolean(item?.manualReview??content?.manualReview??true)
    && itemAnswer(item).length>=1
    && criteria.length>=1;
}

function validateAgainst(rule,item){
  if(!rule||!item)return false;
  const type=normalizedType(item),answer=itemAnswer(item),options=itemOptions(item);
  if(rule.kind==='short'){
    if(!isText(item)||answer.length!==1)return false;
  }else if(rule.kind==='extended'){
    if(!isExtended(item))return false;
  }else if(rule.kind==='multiple'){
    if(type!=='multiple')return false;
    if(rule.options!=null&&options.length!==rule.options)return false;
    if(rule.minOptions!=null&&options.length<rule.minOptions)return false;
    if(rule.answers!=null&&answer.length!==rule.answers)return false;
    if(rule.minAnswers!=null&&answer.length<rule.minAnswers)return false;
    if(rule.maxAnswers!=null&&answer.length>rule.maxAnswers)return false;
  }else if(rule.kind==='sequence'){
    if(type!=='sequence')return false;
    if(rule.options!=null&&options.length!==rule.options)return false;
    if(rule.minOptions!=null&&options.length<rule.minOptions)return false;
    if(rule.answers!=null&&answer.length!==rule.answers)return false;
    if(answer.length<2)return false;
  }else if(rule.kind==='matching'){
    if(type!=='matching')return false;
    const shape=matchingShape(item);
    if(rule.left!=null&&shape.left.length!==rule.left)return false;
    if(rule.right!=null&&shape.right.length!==rule.right)return false;
    if(!shape.left.length||!shape.right.length||shape.answer.length!==shape.left.length)return false;
  }else return false;

  if(rule.image&&!hasImage(item))return false;
  if(rule.table&&!hasTable(item))return false;
  return true;
}

function isChemistryFipiFormat(line,item){return validateAgainst(CHEMISTRY_FORMATS[Number(line)],item);}
function isBiologyFipiFormat(line,item){return validateAgainst(BIOLOGY_FORMATS[Number(line)],item);}

module.exports={CHEMISTRY_FORMATS,BIOLOGY_FORMATS,isChemistryFipiFormat,isBiologyFipiFormat};
