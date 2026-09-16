(()=>{
  'use strict';
  const NativeObserver=window.MutationObserver;
  const nativeSetInterval=window.setInterval.bind(window);
  if(!NativeObserver)return;

  class ThrottledObserver{
    constructor(callback){
      this.callback=callback;
      this.pending=false;
      this.records=[];
      this.lastRun=0;
      this.native=new NativeObserver(records=>{
        this.records.push(...records);
        this.schedule();
      });
    }
    schedule(){
      if(this.pending)return;
      this.pending=true;
      const wait=Math.max(0,220-(performance.now()-this.lastRun));
      setTimeout(()=>{
        this.pending=false;
        this.lastRun=performance.now();
        const records=this.records.splice(0);
        requestAnimationFrame(()=>this.callback(records,this));
      },wait);
    }
    observe(...args){return this.native.observe(...args)}
    disconnect(){this.records.length=0;this.pending=false;return this.native.disconnect()}
    takeRecords(){return [...this.records.splice(0),...this.native.takeRecords()]}
  }

  window.MutationObserver=ThrottledObserver;
  window.setInterval=(fn,delay,...args)=>nativeSetInterval(fn,Math.max(30000,Number(delay)||0),...args);

  setTimeout(()=>{
    if(window.MutationObserver===ThrottledObserver)window.MutationObserver=NativeObserver;
    window.setInterval=nativeSetInterval;
  },0);
})();
