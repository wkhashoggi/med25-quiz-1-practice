(function(){
'use strict';
const KEY='med25-pending-xp-v1';
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return []}}
function write(rows){try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-500)))}catch{}}
function add(source,questionId,correct){
  if(!questionId||typeof correct!=='boolean')return;
  const rows=read();
  if(!rows.some(x=>x.source===source&&x.questionId===questionId))rows.push({source,questionId,correct});
  write(rows);
}
function drain(){
  const fn=window.med25GameRecordAttempt;
  if(typeof fn!=='function')return;
  const rows=read();if(!rows.length)return;
  write([]);
  rows.forEach(x=>{try{Promise.resolve(fn(x.source,x.questionId,x.correct)).catch(()=>add(x.source,x.questionId,x.correct))}catch{add(x.source,x.questionId,x.correct)}});
}
function install(){
  const base=window.med25GameRecordAttempt;
  if(typeof base!=='function'||base.__xpReliable)return false;
  const wrapped=function(source,questionId,correct){
    add(String(source||'').toLowerCase(),questionId,correct);
    let out;
    try{out=base.apply(this,arguments)}catch(e){return Promise.reject(e)}
    Promise.resolve(out).then(()=>setTimeout(drain,700)).catch(()=>{});
    return out;
  };
  wrapped.__xpReliable=true;
  window.med25GameRecordAttempt=wrapped;
  drain();
  return true;
}
let tries=0;
const timer=setInterval(()=>{tries++;if(install()||tries>40)clearInterval(timer)},250);
window.addEventListener('online',()=>setTimeout(drain,300));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(drain,300)});
setTimeout(drain,1500);setTimeout(drain,5000);
})();
