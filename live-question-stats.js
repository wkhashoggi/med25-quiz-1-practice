
(function(){
'use strict';

const LIVE_STATS_PREF='med25-show-live-success-v1';
const LIVE_STATS_REFRESH_MS=300000;
const LIVE_STATS_CACHE_KEY='med25-live-success-cache-v1';
const LIVE_STATS_CACHE_TTL=120000;
let liveQuestionStats={};
let liveStatsLoading=false;

function liveStatsShown(){
  return localStorage.getItem(LIVE_STATS_PREF)!=='no';
}
function setLiveStatsShown(show){
  localStorage.setItem(LIVE_STATS_PREF,show?'yes':'no');
  syncLiveStatsToggles();
  applyLiveQuestionStats();
}
function successTone(rate){
  if(rate>=80)return 'strong';
  if(rate>=60)return 'medium';
  return 'hard';
}
function liveStatsMarkup(id){
  if(!liveStatsShown())return '';
  const s=liveQuestionStats[id];
  if(!s||Number(s.response_count||0)===0){
    return '<div class="liveSuccessEmpty">Live success rate: no graded first-attempt responses yet.</div>';
  }
  const n=Number(s.response_count||0),correct=Number(s.correct_count||0),wrong=Number(s.wrong_count||0),rate=Number(s.success_rate||0);
  return '<div class="liveSuccessInner '+successTone(rate)+'">'+
    '<div class="liveSuccessTop"><b>'+rate.toFixed(1)+'% success</b><span>'+n+' first-attempt response'+(n===1?'':'s')+'</span></div>'+
    '<div class="liveSuccessBar"><span class="liveCorrect" style="width:'+rate+'%"></span><span class="liveWrong" style="width:'+(100-rate)+'%"></span></div>'+
    '<div class="liveSuccessCounts"><span>✓ '+correct+' correct</span><span>✕ '+wrong+' wrong</span><span>Live student feedback</span></div>'+
  '</div>';
}
function applyLiveQuestionStats(root=document){
  root.querySelectorAll('.qcard[id],.aiCard[id]').forEach(card=>{
    const stem=card.querySelector('.stem,.aiStem');
    if(!stem)return;
    let box=card.querySelector(':scope > .liveSuccessRate');
    if(!box){
      box=document.createElement('div');
      box.className='liveSuccessRate';
      stem.insertAdjacentElement('afterend',box);
    }
    const show=liveStatsShown();
    box.style.display=show?'block':'none';
    if(!show)return;
    const markup=liveStatsMarkup(card.id);
    if(box.innerHTML!==markup)box.innerHTML=markup;
  });
}
function toggleHtml(){
  return '<div class="liveStatsToggle" role="group" aria-label="Show live success rate"><span>Show success rate</span><button type="button" data-live-stats-choice="yes">Yes</button><button type="button" data-live-stats-choice="no">No</button></div>';
}
function installLiveStatsToggles(){
  const past=document.querySelector('#questionSection .toolbar .chips');
  if(past&&!past.querySelector('.liveStatsToggle'))past.insertAdjacentHTML('beforeend',toggleHtml());
  const ai=document.querySelector('#aiSection .aiChips');
  if(ai&&!ai.querySelector('.liveStatsToggle'))ai.insertAdjacentHTML('beforeend',toggleHtml());
  document.querySelectorAll('[data-live-stats-choice]').forEach(b=>b.onclick=()=>setLiveStatsShown(b.dataset.liveStatsChoice==='yes'));
  syncLiveStatsToggles();
}
function syncLiveStatsToggles(){
  const show=liveStatsShown();
  document.querySelectorAll('[data-live-stats-choice]').forEach(b=>b.classList.toggle('active',(b.dataset.liveStatsChoice==='yes')===show));
}
function readStatsCache(){
  try{
    const c=JSON.parse(sessionStorage.getItem(LIVE_STATS_CACHE_KEY)||'null');
    if(c&&Date.now()-Number(c.saved_at||0)<LIVE_STATS_CACHE_TTL&&c.stats&&typeof c.stats==='object'){
      liveQuestionStats=c.stats;
      return true;
    }
  }catch{}
  return false;
}
function writeStatsCache(){
  try{sessionStorage.setItem(LIVE_STATS_CACHE_KEY,JSON.stringify({saved_at:Date.now(),stats:liveQuestionStats}))}catch{}
}
async function loadQuestionSuccessStats(force=false){
  if(liveStatsLoading)return;
  if(!force&&readStatsCache()){applyLiveQuestionStats();return}
  liveStatsLoading=true;
  try{
    const res=await supaFetch('/rest/v1/question_success_stats?select=question_id,correct_count,wrong_count,response_count,success_rate');
    if(!res.ok)throw new Error('HTTP '+res.status);
    const rows=await res.json();
    liveQuestionStats={};
    rows.forEach(r=>{if(r.question_id)liveQuestionStats[r.question_id]=r});
    writeStatsCache();
    applyLiveQuestionStats();
  }catch(e){
    console.debug('Live success stats unavailable',e);
  }finally{
    liveStatsLoading=false;
  }
}
async function refreshOneQuestionStat(id){
  if(!id)return;
  try{
    const res=await supaFetch('/rest/v1/question_success_stats?question_id=eq.'+encodeURIComponent(id)+'&select=question_id,correct_count,wrong_count,response_count,success_rate');
    if(!res.ok)return;
    const rows=await res.json();
    if(rows[0])liveQuestionStats[id]=rows[0];
    writeStatsCache();
    const card=document.getElementById(id);
    if(card)applyLiveQuestionStats(card.parentElement||document);
  }catch(e){console.debug('Question success refresh unavailable',e)}
}
function scheduleStatsRefresh(id){
  setTimeout(()=>refreshOneQuestionStat(id),1200);
}
function observeQuestionLists(){
  const past=document.getElementById('list');
  const ai=document.getElementById('aiQuestionList');
  if(past){
    const pastObs=new MutationObserver(()=>requestAnimationFrame(()=>applyLiveQuestionStats(past)));
    pastObs.observe(past,{childList:true,subtree:false});
  }
  if(ai){
    const aiObs=new MutationObserver(()=>requestAnimationFrame(()=>applyLiveQuestionStats(ai)));
    aiObs.observe(ai,{childList:true,subtree:false});
  }
}
function bindRefreshAfterAnswers(){
  document.addEventListener('click',e=>{
    const past=e.target.closest('.option[data-id]');
    const ai=e.target.closest('[data-ai-answer]');
    const id=past?.dataset.id||ai?.dataset.aiAnswer;
    if(id)scheduleStatsRefresh(id);
  },true);
}
window.loadQuestionSuccessStats=loadQuestionSuccessStats;
window.applyLiveQuestionStats=applyLiveQuestionStats;

installLiveStatsToggles();
observeQuestionLists();
bindRefreshAfterAnswers();
loadQuestionSuccessStats(false);
setInterval(()=>loadQuestionSuccessStats(true),LIVE_STATS_REFRESH_MS);
setTimeout(()=>{installLiveStatsToggles();applyLiveQuestionStats()},1000);
})();
