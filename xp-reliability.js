(function(){
'use strict';
const KEY='med25-pending-xp-v2';
let original=null;
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return []}}
function write(rows){try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-500)))}catch{}}
function add(source,questionId,correct){
  if(!questionId||typeof correct!=='boolean')return;
  const rows=read(),now=Date.now();
  if(!rows.some(x=>x.source===source&&x.questionId===questionId))rows.push({source,questionId,correct,addedAt:now});
  write(rows);
}
function retry(){
  if(typeof original!=='function')return;
  const rows=read();if(!rows.length)return;
  rows.forEach(x=>{try{original(x.source,x.questionId,x.correct)}catch{}});
  write(rows.filter(x=>Date.now()-Number(x.addedAt||0)<120000));
}
function install(){
  const base=window.med25GameRecordAttempt;
  if(typeof base!=='function'||base.__xpReliable)return false;
  original=base;
  const wrapped=function(source,questionId,correct){
    source=String(source||'').toLowerCase();
    add(source,questionId,correct);
    try{return original(source,questionId,correct)}catch(e){throw e}
  };
  wrapped.__xpReliable=true;
  window.med25GameRecordAttempt=wrapped;
  retry();
  return true;
}
let tries=0;
const installTimer=setInterval(()=>{tries++;if(install()||tries>60)clearInterval(installTimer)},250);
const retryTimer=setInterval(retry,2500);
setTimeout(()=>clearInterval(retryTimer),125000);
window.addEventListener('online',()=>setTimeout(retry,250));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(retry,250)});
})();
