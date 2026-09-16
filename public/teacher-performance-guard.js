(()=>{
  'use strict';

  if(window.__osnovaTeacherPerformanceGuard)return;
  window.__osnovaTeacherPerformanceGuard=true;

  const NativeObserver=window.MutationObserver;
  const nativeSetInterval=window.setInterval.bind(window);
  if(!NativeObserver)return;

  /*
   * Several teacher modules observe #app. Watching the full subtree makes a
   * harmless table/nav update wake every observer again, which can create a
   * feedback loop and eventually freeze the tab. Page renders replace the
   * direct children of #app, so observing only that level is enough to know
   * that a route/shell was rendered without reacting to thousands of nested
   * DOM mutations.
   */
  class OsnovaStableObserver{
    constructor(callback){
      this.callback=callback;
      this.pending=false;
      this.records=[];
      this.native=new NativeObserver(records=>{
        this.records.push(...records);
        if(this.pending)return;
        this.pending=true;
        setTimeout(()=>{
          this.pending=false;
          const batch=this.records.splice(0);
          if(!batch.length)return;
          requestAnimationFrame(()=>{
            try{this.callback(batch,this)}catch(error){console.error(error)}
          });
        },80);
      });
    }

    observe(target,options={}){
      const guarded=target===document.querySelector('#app')&&options&&options.childList&&options.subtree;
      return this.native.observe(target,guarded?{...options,subtree:false}:options);
    }

    disconnect(){
      this.records.length=0;
      this.pending=false;
      return this.native.disconnect();
    }

    takeRecords(){
      return [...this.records.splice(0),...this.native.takeRecords()];
    }
  }

  window.MutationObserver=OsnovaStableObserver;

  /*
   * teacher-homework-v3 refreshes results every 8 seconds. Keep live results,
   * but do it at a sane cadence and never spend CPU/network while the tab is
   * hidden. Other intervals on the site keep their original cadence.
   */
  window.setInterval=(fn,delay,...args)=>{
    const ms=Number(delay)||0;
    let source='';
    try{source=Function.prototype.toString.call(fn)}catch{}
    if(ms<=10000&&source.includes('patchAll')){
      return nativeSetInterval(()=>{
        if(document.hidden)return;
        try{fn(...args)}catch(error){console.error(error)}
      },60000);
    }
    return nativeSetInterval(fn,delay,...args);
  };
})();
