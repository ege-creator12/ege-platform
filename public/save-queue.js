(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SaveQueue=api})(typeof window==='undefined'?this:window,()=>{
  // Each caller waits for its own captured value, including edits made during a request.
  function create(write){
    let tail=Promise.resolve();
    return value=>{
      const snapshot=JSON.parse(JSON.stringify(value));
      const task=tail.catch(()=>{}).then(()=>write(snapshot));
      tail=task;
      return task;
    };
  }
  return {create};
});
