(function(){
'use strict';
const KEY='med25-pending-xp-v4';
let original=null,inFlight=null;
function read(){try{const rows=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return []}}
function write(rows){try{localStorage.setItem(KEY,JSON.stringify(rows))}catch{}}
function owner(){return typeof currentUser!=='undefined'?currentUser?.id:null}
function identity(x){return [x.userId,x.source,x.questionId].join(':')}
function add(source,questionId,correct){
  const userId=owner();if(!userId||!['past','ai'].includes(source)||!questionId||typeof correct!=='boolean')return false;
  const rows=read(),row={userId,source,questionId,correct,addedAt:Date.now()};
  if(!rows.some(x=>identity(x)===identity(row)))rows.push(row);
  write(rows);window.med25SetQuestionXP?.(source,questionId,{kind:'pending',text:'XP queued · syncing…'},userId);return true;
}
function retry(){
  if(inFlight)return inFlight;
  if(typeof original!=='function'||!owner())return Promise.resolve();
  const userId=owner();
  inFlight=(async()=>{
    const tried=new Set();
    while(owner()===userId){
      // Read again after each request so answers added during a slow sync are drained immediately.
      const row=read().find(x=>x.userId===userId&&!tried.has(identity(x)));
      if(!row)break;
      tried.add(identity(row));
      let result;try{result=await original(row.source,row.questionId,row.correct)}catch{continue}
      if(result?.ok)write(read().filter(x=>identity(x)!==identity(row)));
    }
  })().finally(()=>{inFlight=null});
  return inFlight;
}

function install(){
  const base=window.med25GameRecordAttempt;
  if(typeof base!=='function')return false;
  if(base.__xpReliable)return true;
  original=base;
  const wrapped=function(source,questionId,correct){
    source=String(source||'').toLowerCase();
    // Guest study stays in ordinary progress and is backfilled by the account sync on sign-in.
    // Account-bound pending rows must never be replayed into a different user's account.
    if(!add(source,questionId,correct))return original(source,questionId,correct);
    return retry();
  };
  wrapped.__xpReliable=true;window.med25GameRecordAttempt=wrapped;retry();return true;
}
if(!install()){let tries=0;const timer=setInterval(()=>{if(install()||++tries>80)clearInterval(timer)},250)}
// Retain pending attempts until acknowledged; never expire an unconfirmed award by age.
setInterval(retry,15000);
window.addEventListener('online',retry);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')retry()});
document.addEventListener('click',e=>{if(e.target?.closest?.('#tabHome'))retry()},true);
window.med25RetryPendingXP=retry;
})();
