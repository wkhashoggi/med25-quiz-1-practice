(function(){
'use strict';
const KEY='med25-pending-xp-v4';
let original=null,busy=false;
function read(){try{const rows=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(rows)?rows:[]}catch{return []}}
function write(rows){try{localStorage.setItem(KEY,JSON.stringify(rows))}catch{}}
function owner(){return typeof currentUser!=='undefined'?currentUser?.id:null}
function identity(x){return [x.userId,x.source,x.questionId].join(':')}
function add(source,questionId,correct){
  const userId=owner();if(!userId||!['past','ai'].includes(source)||!questionId||typeof correct!=='boolean')return false;
  const rows=read(),row={userId,source,questionId,correct,addedAt:Date.now()};
  if(!rows.some(x=>identity(x)===identity(row)))rows.push(row);
  write(rows);return true;
}
async function retry(){
  if(busy||typeof original!=='function'||!owner())return;
  busy=true;
  try{
    const userId=owner();
    for(const row of read().filter(x=>x.userId===userId)){
      if(owner()!==userId)break;
      let result;try{result=await original(row.source,row.questionId,row.correct)}catch{break}
      if(!result?.ok)break;
      write(read().filter(x=>identity(x)!==identity(row)));
    }
  }finally{busy=false}
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
