(function(){
'use strict';
const KEY='med25-pending-xp-v3';
let original=null;
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return []}}
function write(rows){try{localStorage.setItem(KEY,JSON.stringify(rows.slice(-500)))}catch{}}
function add(source,questionId,correct){
  if(!questionId||typeof correct!=='boolean')return;
  const rows=read(),now=Date.now();
  if(!rows.some(x=>x.source===source&&x.questionId===questionId))rows.push({source,questionId,correct,addedAt:now});
  write(rows);
}
async function refreshVisibleXP(){
  try{
    if(typeof currentUser==='undefined'||!currentUser||typeof authSession==='undefined'||!authSession?.access_token||typeof supaFetch!=='function')return;
    const res=await supaFetch('/rest/v1/game_profiles?user_id=eq.'+encodeURIComponent(currentUser.id)+'&select=points,weekly_xp,monthly_xp,correct_first_attempts,wrong_first_attempts,current_streak,best_streak&limit=1');
    if(!res.ok)return;
    const rows=await res.json(),p=rows&&rows[0];if(!p)return;
    const xp=document.querySelector('.gamePoints b');if(xp)xp.textContent=Number(p.points||0).toLocaleString();
    const stats=document.querySelectorAll('.gameProfileStats span b');
    if(stats[0])stats[0].textContent=Number(p.correct_first_attempts||0).toLocaleString();
    if(stats[1])stats[1].textContent=Number(p.wrong_first_attempts||0).toLocaleString();
    if(stats[2])stats[2].textContent=Number(p.weekly_xp||0).toLocaleString();
    document.getElementById('gameLeaderboardRefresh')?.click();
  }catch(e){console.warn('XP display refresh unavailable',e)}
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
    let out;
    try{out=original(source,questionId,correct)}catch(e){throw e}
    Promise.resolve(out).finally(()=>{setTimeout(refreshVisibleXP,100);setTimeout(refreshVisibleXP,700);});
    return out;
  };
  wrapped.__xpReliable=true;
  window.med25GameRecordAttempt=wrapped;
  retry();refreshVisibleXP();
  return true;
}
let tries=0;
const installTimer=setInterval(()=>{tries++;if(install()||tries>80)clearInterval(installTimer)},250);
const retryTimer=setInterval(retry,2500);
setTimeout(()=>clearInterval(retryTimer),125000);
window.addEventListener('online',()=>{setTimeout(retry,250);setTimeout(refreshVisibleXP,700)});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){setTimeout(retry,250);setTimeout(refreshVisibleXP,500)}});
document.addEventListener('click',e=>{if(e.target?.closest?.('#tabHome'))setTimeout(refreshVisibleXP,300)},true);
})();
