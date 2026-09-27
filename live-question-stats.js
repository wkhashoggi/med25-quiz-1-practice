
(function(){
'use strict';

const LIVE_STATS_PREF='med25-show-live-success-v1';
const LIVE_STATS_REFRESH_MS=60000;
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
function applyLiveQuestionStats(){
  document.querySelectorAll('.qcard[id],.aiCard[id]').forEach(card=>{
    const stem=card.querySelector('.stem,.aiStem');
    if(!stem)return;
    let box=card.querySelector(':scope > .liveSuccessRate');
    if(!box){
      box=document.createElement('div');
      box.className='liveSuccessRate';
      stem.insertAdjacentElement('afterend',box);
    }
    box.style.display=liveStatsShown()?'block':'none';
    box.innerHTML=liveStatsMarkup(card.id);
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
async function loadQuestionSuccessStats(){
  if(liveStatsLoading)return;
  liveStatsLoading=true;
  try{
    const res=await supaFetch('/rest/v1/question_success_stats?select=question_id,correct_count,wrong_count,response_count,success_rate');
    if(!res.ok)throw new Error('HTTP '+res.status);
    const rows=await res.json();
    liveQuestionStats={};
    rows.forEach(r=>{if(r.question_id)liveQuestionStats[r.question_id]=r});
    applyLiveQuestionStats();
  }catch(e){
    console.debug('Live success stats unavailable',e);
  }finally{
    liveStatsLoading=false;
  }
}
function scheduleStatsRefresh(){
  setTimeout(loadQuestionSuccessStats,900);
}
function observeQuestionLists(){
  const obs=new MutationObserver(()=>applyLiveQuestionStats());
  const past=document.getElementById('list');
  const ai=document.getElementById('aiQuestionList');
  if(past)obs.observe(past,{childList:true,subtree:true});
  if(ai)obs.observe(ai,{childList:true,subtree:true});
}
function bindRefreshAfterAnswers(){
  document.addEventListener('click',e=>{
    if(e.target.closest('.option[data-id]')||e.target.closest('[data-ai-answer]'))scheduleStatsRefresh();
  },true);
}
window.loadQuestionSuccessStats=loadQuestionSuccessStats;
window.applyLiveQuestionStats=applyLiveQuestionStats;

installLiveStatsToggles();
observeQuestionLists();
bindRefreshAfterAnswers();
loadQuestionSuccessStats();
setInterval(loadQuestionSuccessStats,LIVE_STATS_REFRESH_MS);
setTimeout(()=>{installLiveStatsToggles();applyLiveQuestionStats()},1000);
})();
