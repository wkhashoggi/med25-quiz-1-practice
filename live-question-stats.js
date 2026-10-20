
(function(){
'use strict';

const LIVE_STATS_PREF='med25-show-live-success-v1';
const LIVE_STATS_CACHE_KEY='med25-live-success-cache-v2';
const LIVE_STATS_CACHE_TTL=60*1000;
let liveQuestionStats={};
let liveStatsRequest=null;
const liveSortSnapshots={};

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
  const place=(sectionId,displayId,fallbackSelector)=>{
    const section=document.getElementById(sectionId);if(!section)return;
    const target=document.getElementById(displayId)||section.querySelector(fallbackSelector);
    if(!target)return;
    let toggle=section.querySelector('.liveStatsToggle');
    if(!toggle){target.insertAdjacentHTML('beforeend',toggleHtml());toggle=section.querySelector('.liveStatsToggle')}
    else if(toggle.parentElement!==target)target.appendChild(toggle);
  };
  place('questionSection','pastGuideDisplay','.chips');
  place('aiSection','aiGuideDisplay','.aiChips');
  document.querySelectorAll('[data-live-stats-choice]').forEach(b=>b.onclick=()=>setLiveStatsShown(b.dataset.liveStatsChoice==='yes'));
  syncLiveStatsToggles();
}
function syncLiveStatsToggles(){
  const show=liveStatsShown();
  document.querySelectorAll('[data-live-stats-choice]').forEach(b=>b.classList.toggle('active',(b.dataset.liveStatsChoice==='yes')===show));
}
function readStatsCache(){
  try{
    const c=JSON.parse(localStorage.getItem(LIVE_STATS_CACHE_KEY)||'null');
    if(c&&Date.now()-Number(c.saved_at||0)<LIVE_STATS_CACHE_TTL&&c.stats&&typeof c.stats==='object'){
      liveQuestionStats=c.stats;
      return true;
    }
  }catch{}
  return false;
}
function writeStatsCache(){
  try{localStorage.setItem(LIVE_STATS_CACHE_KEY,JSON.stringify({saved_at:Date.now(),stats:liveQuestionStats}))}catch{}
}
async function loadQuestionSuccessStats(force=false){
  if(liveStatsRequest)return liveStatsRequest;
  liveStatsRequest=(async()=>{
    try{
      const rows=[],limit=500;
      for(let offset=0;;offset+=limit){
        const res=await supaFetch('/rest/v1/question_success_stats?select=question_id,correct_count,wrong_count,response_count,success_rate&order=question_id&limit='+limit+'&offset='+offset);
        if(!res.ok)throw new Error('HTTP '+res.status);
        const page=await res.json();if(!Array.isArray(page))throw new Error('Invalid statistics response');
        rows.push(...page);if(page.length<limit)break;
      }
      liveQuestionStats={};
      rows.forEach(r=>{if(r.question_id)liveQuestionStats[r.question_id]=r});
      writeStatsCache();applyLiveQuestionStats();
    }catch(e){console.debug('Live success stats unavailable',e)}
  })();
  try{await liveStatsRequest}finally{liveStatsRequest=null}
}
// Keep the chosen ordering steady while a student is answering on a page.
window.med25SortByLiveSuccess=function(qs,kind,mode){
  if(!['live-hardest','live-easiest'].includes(mode)){delete liveSortSnapshots[kind];return qs}
  let snapshot=liveSortSnapshots[kind];
  if(!snapshot||snapshot.mode!==mode){
    snapshot={mode,stats:liveQuestionStats};
    if(Object.keys(liveQuestionStats).length)liveSortSnapshots[kind]=snapshot;
  }
  const stats=snapshot.stats;
  return qs.slice().sort((a,b)=>{
    const x=stats[a.id],y=stats[b.id],xn=Number(x?.response_count||0),yn=Number(y?.response_count||0);
    if(!xn||!yn)return Number(!!yn)-Number(!!xn);
    const delta=Number(x.correct_count)/xn-Number(y.correct_count)/yn;
    return (mode==='live-hardest'?delta:-delta)||yn-xn;
  });
};
function installLiveSortControls(){
  const target=document.getElementById('aiGuideOrder')||document.querySelector('#aiSection .aiControls');
  if(target&&!document.getElementById('aiLiveSort')){
    const label=document.createElement('label');label.className='liveSortControl';
    label.innerHTML='<span>Sort by student answers</span><select id="aiLiveSort"><option value="">Original order</option><option value="live-hardest">Most answered wrong → most answered right</option><option value="live-easiest">Most answered right → most answered wrong</option></select>';
    target.append(label);
  }
  for(const [kind,id] of [['past','sort'],['ai','aiLiveSort']]){
    const select=document.getElementById(id);if(!select||select.dataset.liveSortBound)continue;
    select.dataset.liveSortBound='yes';select.title='Ranks by the percentage of students answering correctly on their first attempt. Questions with no responses appear last.';
    select.addEventListener('input',()=>{delete liveSortSnapshots[kind]},true);
    if(kind==='ai')select.addEventListener('change',()=>{delete liveSortSnapshots[kind];window.med25ApplyLiveSort?.(kind)});
    const button=document.createElement('button');button.type='button';button.className='btn';button.dataset.liveRefresh=kind;button.textContent='Refresh student results';
    button.title='Refresh live first-attempt results and apply the selected order. Questions with no responses appear last.';
    button.onclick=async()=>{
      button.disabled=true;button.textContent='Refreshing…';
      await loadQuestionSuccessStats(true);delete liveSortSnapshots[kind];window.med25ApplyLiveSort?.(kind);
      button.disabled=false;button.textContent='Refresh student results';
    };
    (document.getElementById(kind==='past'?'pastGuideDisplay':'aiGuideDisplay')||select.parentElement).append(button);
  }
}
function observeQuestionLists(){
  const attach=(host)=>{
    if(!host)return;
    const obs=new MutationObserver(()=>requestAnimationFrame(()=>applyLiveQuestionStats(host)));
    obs.observe(host,{childList:true,subtree:false});
  };
  attach(document.getElementById('list'));
  attach(document.getElementById('aiQuestionList'));
}
window.loadQuestionSuccessStats=loadQuestionSuccessStats;
window.applyLiveQuestionStats=applyLiveQuestionStats;

installLiveStatsToggles();
installLiveSortControls();
readStatsCache();applyLiveQuestionStats();
observeQuestionLists();
loadQuestionSuccessStats(false);
setTimeout(()=>{installLiveStatsToggles();installLiveSortControls();applyLiveQuestionStats()},1000);
setInterval(()=>{if(!document.hidden)loadQuestionSuccessStats(true)},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadQuestionSuccessStats(true)});
})();
