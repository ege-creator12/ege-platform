'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {buildStrictV6}=require('../src/biology-strict-line-bank-v6');

const expectedType={
  1:'text',2:'matching',3:'text',4:'text',5:'text',6:'matching',7:'multiple',8:'matching',9:'text',10:'matching',
  11:'multiple',12:'sequence',13:'text',14:'matching',15:'multiple',16:'sequence',17:'multiple',18:'multiple',19:'matching',
  20:'matching',21:'multiple',22:'text',23:'text',24:'text',25:'text',26:'text',27:'text',28:'text'
};
const imageLines=new Set([5,6,9,10,13,14,24]);
const extendedLines=new Set([22,23,24,25,26,27,28]);
const tableLines=new Set([1,20,21]);

for(let line=1;line<=28;line++){
  test(`biology strict v6 line ${line} has correct mechanics for 24 variants`,()=>{
    const variants=[];
    for(let n=1;n<=24;n++){
      const item=buildStrictV6(line,n);
      variants.push(item);
      assert.equal(item.type,expectedType[line],`line ${line} variant ${n}: wrong UI type`);
      assert.equal(Number(item.content?.strictExamLine),line,`line ${line} variant ${n}: wrong strict line tag`);
      assert.equal(Number(item.content?.strictBankVersion),6,`line ${line} variant ${n}: wrong bank version`);
      assert.ok(String(item.prompt||'').trim().length>=20,`line ${line} variant ${n}: prompt too short`);
      assert.ok(Array.isArray(item.answer)&&item.answer.length>0,`line ${line} variant ${n}: empty answer`);
      if(imageLines.has(line))assert.ok(String(item.imageUrl||'').startsWith('/images/biology/'),`line ${line} variant ${n}: image required`);
      if(extendedLines.has(line)){
        assert.equal(item.questionType,'extended_answer',`line ${line} variant ${n}: extended answer required`);
        assert.equal(Boolean(item.content?.manualReview),true,`line ${line} variant ${n}: manual review required`);
      }
      if(tableLines.has(line))assert.ok(item.content?.table?.rows?.length,`line ${line} variant ${n}: table required`);
    }
    if([7,11,15,17,18,21].includes(line))variants.forEach((item,n)=>assert.ok(item.options?.length>=5,`line ${line} variant ${n+1}: choice options missing`));
    if([2,6,8,10,14,19,20].includes(line))variants.forEach((item,n)=>assert.ok(item.content?.left?.length>=4&&item.content?.right?.length>=2,`line ${line} variant ${n+1}: matching data missing`));
    if([12,16].includes(line))variants.forEach((item,n)=>assert.ok(item.options?.length>=4,`line ${line} variant ${n+1}: sequence options missing`));
  });
}

test('strict line builders never leak another line tag',()=>{
  for(let line=1;line<=28;line++)for(let n=1;n<=24;n++)assert.equal(buildStrictV6(line,n).content.strictExamLine,line);
});
