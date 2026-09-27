
(function(){
'use strict';

const FSRS_LIB_URL='https://cdn.jsdelivr.net/npm/ts-fsrs@5.4.2/+esm';
const ANKI_CONFIG_KEY='__config__';
const ANKI_DAILY_KEY='__daily__';
const ANKI_LOG_KEY='__review_log__';
const DAY_MS=86400000;
const LOOKAHEAD_MS=20*60*1000;
let FSRS=null,fsrsReady=false,fsrsLoadError=null;

function ankiTodayKey(){
  try{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const g=t=>parts.find(x=>x.type===t)?.value||'';
    return g('year')+'-'+g('month')+'-'+g('day');
  }catch{return new Date().toISOString().slice(0,10)}
}
function ankiConfig(){
  const root=flashReview||{};
  if(!root[ANKI_CONFIG_KEY]||typeof root[ANKI_CONFIG_KEY]!=='object'){
    root[ANKI_CONFIG_KEY]={
      desiredRetention:0.90,
      newPerDay:20,
      reviewsPerDay:200,
      learningSteps:['5m'],
      relearningSteps:['5m'],
      initialIntervals:{again:5*60*1000,hard:DAY_MS,good:3*DAY_MS,easy:5*DAY_MS},
      maximumInterval:36500,
      fuzz:true,
      version:'fsrs-custom-learning-v1'
    };
  }
  const c=root[ANKI_CONFIG_KEY];
  c.learningSteps=['5m'];
  c.relearningSteps=['5m'];
  c.initialIntervals={again:5*60*1000,hard:DAY_MS,good:3*DAY_MS,easy:5*DAY_MS};
  c.version='fsrs-custom-learning-v1';
  return c;
}
function ankiDaily(){
  const root=flashReview||{},key=ankiTodayKey();
  if(!root[ANKI_DAILY_KEY]||root[ANKI_DAILY_KEY].date!==key){
    root[ANKI_DAILY_KEY]={date:key,newIntroduced:0,reviewCards:0,totalAnswers:0,again:0,hard:0,good:0,easy:0,seconds:0};
  }
  return root[ANKI_DAILY_KEY];
}
function ankiReviewLog(){
  const root=flashReview||{};
  if(!Array.isArray(root[ANKI_LOG_KEY]))root[ANKI_LOG_KEY]=[];
  return root[ANKI_LOG_KEY];
}
function fsrsParams(){
  const c=ankiConfig();
  return {
    request_retention:Math.min(.97,Math.max(.70,Number(c.desiredRetention)||.90)),
    maximum_interval:Math.min(36500,Math.max(30,Number(c.maximumInterval)||36500)),
    enable_fuzz:c.fuzz!==false,
    enable_short_term:true,
    learning_steps:Array.isArray(c.learningSteps)?c.learningSteps:['1m','10m'],
    relearning_steps:Array.isArray(c.relearningSteps)?c.relearningSteps:['10m']
  };
}
function ankiSerializeCard(c){
  if(!c)return null;
  return {
    due:c.due instanceof Date?c.due.getTime():Date.parse(c.due)||Number(c.due)||Date.now(),
    stability:Number(c.stability||0),
    difficulty:Number(c.difficulty||0),
    elapsed_days:Number(c.elapsed_days||0),
    scheduled_days:Number(c.scheduled_days||0),
    reps:Number(c.reps||0),
    lapses:Number(c.lapses||0),
    state:Number(c.state||0),
    last_review:c.last_review?(c.last_review instanceof Date?c.last_review.getTime():Date.parse(c.last_review)||Number(c.last_review)):null
  };
}
function ankiDeserializeCard(r,now=new Date()){
  if(!FSRS)return null;
  if(r?.fsrs_card){
    const c={...r.fsrs_card};
    c.due=new Date(Number(c.due)||Date.parse(c.due)||now.getTime());
    c.last_review=c.last_review?new Date(Number(c.last_review)||Date.parse(c.last_review)):undefined;
    return c;
  }
  if(!r)return FSRS.createEmptyCard(now);
  const iv=Math.max(.1,Number(r.interval||1));
  const due=new Date(Number(r.due)||now.getTime());
  const last=Number(r.last_reviewed)||now.getTime()-Math.max(1,iv)*DAY_MS;
  const ease=Number(r.ease||2.5);
  return {
    due,
    stability:iv,
    difficulty:Math.min(10,Math.max(1,5.5+(2.5-ease)*2)),
    elapsed_days:Math.max(0,Math.round((now.getTime()-last)/DAY_MS)),
    scheduled_days:Math.max(0,Math.round(iv)),
    reps:Number(r.reps||0),
    lapses:Number(r.lapses||0),
    state:Number(r.reps||0)>=2?2:1,
    last_review:new Date(last)
  };
}
function ankiHash(s){let h=7;for(let i=0;i<String(s).length;i++)h=(h*31+String(s).charCodeAt(i))|0;return Math.abs(h)}
function ankiDueMs(r){
  if(!r)return Infinity;
  if(r.fsrs_card)return Number(r.fsrs_card.due)||Date.parse(r.fsrs_card.due)||Infinity;
  return Number(r.due)||Infinity;
}
function ankiState(r){
  if(!r)return 0;
  if(r.fsrs_card)return Number(r.fsrs_card.state||0);
  return Number(r.reps||0)>=2?2:1;
}
function ankiScheduledDays(r){
  if(!r)return 0;
  if(r.fsrs_card)return Number(r.fsrs_card.scheduled_days||0);
  return Number(r.interval||0);
}
function ankiFormatDelay(ms){
  if(ms<=0)return '<1m';
  const min=Math.max(1,Math.round(ms/60000));
  if(min<60)return min+'m';
  const h=Math.round(min/60);
  if(h<24)return h+'h';
  const d=Math.round(h/24);
  if(d<30)return d+'d';
  const mo=Math.round(d/30.44);
  if(mo<12)return mo+'mo';
  const y=(d/365.25);
  return (y<10?y.toFixed(1):Math.round(y))+'y';
}
function ankiRating(grade){
  if(!FSRS)return null;
  const R=FSRS.Rating;
  return grade==='again'?R.Again:grade==='hard'?R.Hard:grade==='good'?R.Good:R.Easy;
}
function ankiCustomLearningDelay(grade){
  const c=ankiConfig(),m=c.initialIntervals||{};
  return Number(m[grade])||({again:5*60*1000,hard:DAY_MS,good:3*DAY_MS,easy:5*DAY_MS}[grade]);
}
function ankiUsesCustomLearning(r,grade){
  if(!r)return true;
  const st=ankiState(r);
  if(st===1||st===3)return true;
  return st===2&&grade==='again';
}
function ankiCustomLearningPreview(grade){
  const ms=ankiCustomLearningDelay(grade);
  return {result:null,label:ankiFormatDelay(ms),days:ms>=DAY_MS?Math.round(ms/DAY_MS):0,custom:true};
}
function ankiPreview(card,grade,now=new Date()){
  const current=cardReview(card.id);
  if(ankiUsesCustomLearning(current,grade))return ankiCustomLearningPreview(grade);
  if(!fsrsReady||!FSRS)return null;
  try{
    const scheduler=FSRS.fsrs(fsrsParams());
    const c=ankiDeserializeCard(cardReview(card.id),now);
    const all=scheduler.repeat(c,now);
    const result=all[ankiRating(grade)];
    if(!result?.card)return null;
    const due=result.card.due instanceof Date?result.card.due:new Date(result.card.due);
    return {result,label:ankiFormatDelay(due.getTime()-now.getTime()),days:Number(result.card.scheduled_days||0)};
  }catch(e){console.error('FSRS preview failed',e);return null}
}
function ankiRetrievability(r,now=new Date()){
  if(!fsrsReady||!FSRS||!r)return null;
  try{
    const c=ankiDeserializeCard(r,now);
    if(!c?.last_review||!c.stability)return null;
    const days=Math.max(0,(now.getTime()-new Date(c.last_review).getTime())/DAY_MS);
    if(typeof FSRS.forgetting_curve==='function')return FSRS.forgetting_curve(days,Number(c.stability));
    return null;
  }catch{return null}
}
function ankiRemainingLimits(){
  const cfg=ankiConfig(),d=ankiDaily();
  return {
    newLeft:Math.max(0,(Number(cfg.newPerDay)||20)-Number(d.newIntroduced||0)),
    reviewsLeft:Math.max(0,(Number(cfg.reviewsPerDay)||200)-Number(d.reviewCards||0))
  };
}
function ankiSelectedCards(deckIds){
  const ids=new Set(deckIds);
  return (flashLibrary.decks||[]).filter(d=>ids.has(d.id)&&!d.archived).flatMap(d=>(d.cards||[]).map(c=>({...c,deck_id:d.id,deck_title:d.title,subject:d.subject,source_url:d.source_url||c.source_url||''})));
}
function ankiQueue(deckIds){
  const now=Date.now(),limits=ankiRemainingLimits(),dueLearning=[],dueReview=[],soonLearning=[],fresh=[];
  for(const card of ankiSelectedCards(deckIds)){
    const r=cardReview(card.id),state=ankiState(r),due=ankiDueMs(r);
    if(!r){fresh.push(card);continue}
    if((state===1||state===3)&&due<=now)dueLearning.push(card);
    else if(state===2&&due<=now)dueReview.push(card);
    else if((state===1||state===3)&&due<=now+LOOKAHEAD_MS)soonLearning.push(card);
  }
  dueLearning.sort((a,b)=>ankiDueMs(cardReview(a.id))-ankiDueMs(cardReview(b.id)));
  dueReview.sort((a,b)=>ankiDueMs(cardReview(a.id))-ankiDueMs(cardReview(b.id))||ankiHash(a.id)-ankiHash(b.id));
  fresh.sort((a,b)=>ankiHash(a.id)-ankiHash(b.id));
  soonLearning.sort((a,b)=>ankiDueMs(cardReview(a.id))-ankiDueMs(cardReview(b.id)));
  const reviews=dueReview.slice(0,limits.reviewsLeft);
  const cfg=ankiConfig();
  const capacity=Math.max(0,(Number(cfg.reviewsPerDay)||200)-Number(ankiDaily().reviewCards||0)-reviews.length);
  const newLimit=Math.min(limits.newLeft,capacity);
  return [...dueLearning,...reviews,...fresh.slice(0,newLimit),...soonLearning];
}
function ankiDeckCounts(deck){
  const now=Date.now();let n=0,l=0,d=0;
  for(const c of deck.cards||[]){
    const r=cardReview(c.id),state=ankiState(r),due=ankiDueMs(r);
    if(!r)n++;
    else if((state===1||state===3)&&due<=now)l++;
    else if(state===2&&due<=now)d++;
  }
  return {new:n,learn:l,due:d};
}
function ankiSessionCounts(){
  const remaining=flashSession.queue.slice(flashSession.index),now=Date.now();
  const counts={new:0,learn:0,due:0};
  remaining.forEach(c=>{
    const r=cardReview(c.id),s=ankiState(r);
    if(!r)counts.new++;
    else if(s===1||s===3)counts.learn++;
    else if(s===2&&ankiDueMs(r)<=now)counts.due++;
  });
  return counts;
}
function ankiInjectOptions(){
  const bar=document.querySelector('#flashcardsSection .ankiBar > div:last-child');
  if(bar&&!document.getElementById('ankiOptionsBtn')){
    const b=document.createElement('button');b.id='ankiOptionsBtn';b.className='ankiBtn';b.type='button';b.textContent='Options';b.onclick=ankiToggleOptions;bar.prepend(b);
    const study=document.getElementById('flashStudyAll');if(study)study.textContent='Study Now';
  }
  if(!document.getElementById('ankiOptionsPanel')){
    const stats=document.getElementById('flashStatsPanel');
    if(stats){
      const panel=document.createElement('div');panel.id='ankiOptionsPanel';panel.className='ankiOptionsPanel hidden';
      stats.insertAdjacentElement('afterend',panel);
    }
  }
  ankiRenderOptions();
}
function ankiRenderOptions(){
  const host=document.getElementById('ankiOptionsPanel');if(!host)return;
  const c=ankiConfig(),d=ankiDaily();
  host.innerHTML='<div class="ankiOptionsHead"><div><b>Deck Options</b><span>FSRS scheduling for long-term retention</span></div><button class="ankiBtn" id="ankiCloseOptions">Close</button></div>'+
  '<div class="ankiOptionsGrid">'+
  '<label><span>Desired retention</span><input id="ankiRetention" type="number" min="70" max="97" step="1" value="'+Math.round((Number(c.desiredRetention)||.9)*100)+'"><small>90% is Anki’s default balance.</small></label>'+
  '<label><span>New cards/day</span><input id="ankiNewLimit" type="number" min="0" max="999" value="'+(Number(c.newPerDay)||20)+'"><small>Today: '+d.newIntroduced+' introduced</small></label>'+
  '<label><span>Maximum reviews/day</span><input id="ankiReviewLimit" type="number" min="1" max="9999" value="'+(Number(c.reviewsPerDay)||200)+'"><small>Today: '+d.reviewCards+' review cards</small></label>'+
  '<label><span>Maximum interval</span><input id="ankiMaxInterval" type="number" min="30" max="36500" value="'+(Number(c.maximumInterval)||36500)+'"><small>days</small></label>'+
  '</div>'+
  '<div class="ankiOptionNote"><b>Initial learning schedule:</b> Again 5m · Hard 1d · Good 3d · Easy 5d. Once a card reaches normal review, FSRS takes over the longer-term spacing. Again on a failed review returns it in 5 minutes.</div>'+
  '<div class="ankiOptionFoot"><span>Scheduler: custom 5m / 1d / 3d / 5d learning · FSRS long-term reviews · interval fuzzing on</span><button class="ankiBtn primary" id="ankiSaveOptions">Save</button></div>';
  document.getElementById('ankiCloseOptions').onclick=()=>host.classList.add('hidden');
  document.getElementById('ankiSaveOptions').onclick=()=>{
    c.desiredRetention=Math.min(.97,Math.max(.70,Number(document.getElementById('ankiRetention').value)/100||.90));
    c.newPerDay=Math.max(0,Number(document.getElementById('ankiNewLimit').value)||0);
    c.reviewsPerDay=Math.max(1,Number(document.getElementById('ankiReviewLimit').value)||200);
    c.maximumInterval=Math.min(36500,Math.max(30,Number(document.getElementById('ankiMaxInterval').value)||36500));
    saveFlashReview();ankiRenderOptions();renderFlashDecks();renderFlashHeroStats();
  };
}
function ankiToggleOptions(){
  const host=document.getElementById('ankiOptionsPanel');if(!host)return;
  host.classList.toggle('hidden');if(!host.classList.contains('hidden'))ankiRenderOptions();
}
function ankiRenderStats(){
  const cards=allFlashCards(),now=Date.now(),d=ankiDaily(),cfg=ankiConfig();
  const newCount=cards.filter(c=>!cardReview(c.id)).length;
  const dueCount=cards.filter(c=>{const r=cardReview(c.id);return r&&ankiState(r)===2&&ankiDueMs(r)<=now}).length;
  const learning=cards.filter(c=>{const r=cardReview(c.id);const s=ankiState(r);return r&&(s===1||s===3)&&ankiDueMs(r)<=now}).length;
  const reviewed=cards.filter(c=>cardReview(c.id)).length;
  const mature=cards.filter(c=>ankiScheduledDays(cardReview(c.id))>=21).length;
  const host=document.getElementById('flashHeroStats');
  if(host)host.innerHTML='<div class="stat"><b>'+((flashLibrary.decks||[]).filter(x=>!x.archived).length)+'</b><span>lecture decks</span></div><div class="stat"><b>'+cards.length+'</b><span>flashcards</span></div><div class="stat"><b>'+dueCount+'</b><span>review due</span></div><div class="stat"><b>'+mature+'</b><span>mature cards</span></div>';
  const stats=document.getElementById('flashStatsPanel');
  if(stats)stats.innerHTML='<div class="flashStatBox"><b>'+newCount+'</b><span>New</span></div><div class="flashStatBox"><b>'+learning+'</b><span>Learning due</span></div><div class="flashStatBox"><b>'+dueCount+'</b><span>Review due</span></div><div class="flashStatBox"><b>'+reviewed+'</b><span>Seen</span></div><div class="flashStatBox"><b>'+mature+'</b><span>Mature ≥21d</span></div><div class="flashStatBox"><b>'+Math.round((cfg.desiredRetention||.9)*100)+'%</b><span>Target retention</span></div><div class="flashStatBox"><b>'+d.totalAnswers+'</b><span>Answers today</span></div><div class="flashStatBox"><b>'+d.again+'</b><span>Again today</span></div>';
}
function ankiRenderDecks(){
  const host=document.getElementById('flashDeckList');if(!host)return;
  const query=(document.getElementById('flashSearch')?.value||'').trim().toLowerCase();
  const decks=(flashLibrary.decks||[]).filter(d=>!d.archived&&(!query||((d.title||'')+' '+(d.subject||'')).toLowerCase().includes(query)));
  const meta=document.getElementById('flashSyncMeta');
  if(meta){
    const lim=ankiRemainingLimits();
    meta.textContent=(flashLibrary.decks||[]).length?((flashLibrary.decks||[]).filter(d=>!d.archived).length+' decks · '+allFlashCards().length+' cards · FSRS '+Math.round(ankiConfig().desiredRetention*100)+'% retention · '+lim.newLeft+' new left today'):'Drive sync is initializing.';
  }
  if(!decks.length){host.innerHTML='<div class="ankiEmpty"><b>No matching decks.</b>Try another search.</div>';return}
  const groups={};for(const d of decks)(groups[d.subject||'Other']??=[]).push(d);
  host.innerHTML=Object.keys(groups).sort().map(subject=>'<div class="flashSubject">'+esc(subject)+'</div>'+groups[subject].sort((a,b)=>(a.title||'').localeCompare(b.title||'')).map(d=>{
    const x=ankiDeckCounts(d);
    return '<div class="ankiDeckRow" data-flash-deck="'+esc(d.id)+'"><div class="ankiDeckTitle"><b>'+esc(d.title||'Untitled lecture')+'</b><span>'+(d.cards||[]).length+' cards'+(d.source_modified_time?' · lecture updated '+prettyFlashDate(d.source_modified_time):'')+'</span></div><div class="ankiCount ankiNew">'+x.new+'</div><div class="ankiCount ankiLearn">'+x.learn+'</div><div class="ankiCount ankiDue">'+x.due+'</div></div>';
  }).join('')).join('');
  host.querySelectorAll('[data-flash-deck]').forEach(row=>row.onclick=()=>startFlashStudy([row.dataset.flashDeck]));
}
function ankiStart(deckIds){
  const queue=ankiQueue(deckIds);
  if(!queue.length){ankiShowCongrats(deckIds);return}
  const decks=(flashLibrary.decks||[]).filter(d=>deckIds.includes(d.id));
  flashSession={deckIds:[...deckIds],queue,index:0,revealed:false,currentDeckLabel:deckIds.length===1?(decks[0]?.title||'Deck'):'All decks',started:true};
  document.getElementById('flashDeckBrowser').classList.add('hidden');
  document.getElementById('flashStudy').classList.remove('hidden');
  const show=document.getElementById('flashShowAnswer');if(show){show.textContent='Show Answer';show.onclick=revealFlashAnswer}
  ankiRenderStudyCard();
}
function ankiShowCongrats(deckIds=flashSession.deckIds||[]){
  const decks=(flashLibrary.decks||[]).filter(d=>deckIds.includes(d.id));
  flashSession={deckIds:[...deckIds],queue:[],index:0,revealed:false,currentDeckLabel:deckIds.length===1?(decks[0]?.title||'Deck'):'All decks',started:false};
  document.getElementById('flashDeckBrowser').classList.add('hidden');
  document.getElementById('flashStudy').classList.remove('hidden');
  document.getElementById('flashStudyDeck').textContent=flashSession.currentDeckLabel;
  document.getElementById('flashFront').innerHTML='<div class="ankiCongrats">Congratulations!<small>You have finished this deck for now. Come back tomorrow and the scheduler will show you what is due.</small></div>';
  const ans=document.getElementById('flashAnswer');ans.textContent='';ans.classList.remove('show');
  document.getElementById('flashDivider').classList.remove('show');
  document.getElementById('flashRatings').classList.remove('show');
  document.getElementById('flashSource').innerHTML='';
  ['flashRemainNew','flashRemainLearn','flashRemainDue'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='0'});
  const show=document.getElementById('flashShowAnswer');show.style.display='block';show.textContent='Back to Decks';show.onclick=leaveFlashStudy;
}
function ankiRenderStudyCard(){
  const card=currentFlashCard();if(!card){ankiShowCongrats(flashSession.deckIds);return}
  flashSession.revealed=false;
  document.getElementById('flashStudyDeck').textContent=flashSession.currentDeckLabel;
  document.getElementById('flashFront').textContent=card.front||'';
  const ans=document.getElementById('flashAnswer');ans.textContent=card.back||'';ans.classList.remove('show');
  document.getElementById('flashDivider').classList.remove('show');
  const show=document.getElementById('flashShowAnswer');show.style.display='block';show.textContent='Show Answer';show.onclick=revealFlashAnswer;
  document.getElementById('flashRatings').classList.remove('show');
  const src=document.getElementById('flashSource'),r=cardReview(card.id),ret=ankiRetrievability(r);
  src.innerHTML=(card.tags?.length?'Tags: '+card.tags.map(esc).join(' · ')+'<br>':'')+(r?.fsrs_card?('Stability '+Number(r.fsrs_card.stability||0).toFixed(1)+'d · Difficulty '+Number(r.fsrs_card.difficulty||0).toFixed(1)+(ret!==null?' · Recall '+Math.round(ret*100)+'%':'')+'<br>'):'')+(card.source_url?'<a href="'+esc(card.source_url)+'" target="_blank" rel="noopener">Open source lecture in Drive ↗</a>':'');
  const counts=ankiSessionCounts();
  document.getElementById('flashRemainNew').textContent=counts.new;
  document.getElementById('flashRemainLearn').textContent=counts.learn;
  document.getElementById('flashRemainDue').textContent=counts.due;
  const now=new Date();
  ['again','hard','good','easy'].forEach(g=>{
    const p=ankiPreview(card,g,now),id='flash'+g[0].toUpperCase()+g.slice(1)+'Interval',el=document.getElementById(id);
    if(el)el.textContent=p?.label||(ankiUsesCustomLearning(cardReview(card.id),g)?ankiCustomLearningPreview(g).label:flashIntervalPreview(card,g).label);
  });
  flashSession.cardStartedAt=Date.now();
}
function ankiGrade(grade){
  const card=currentFlashCard();if(!card||!flashSession.revealed)return;
  if(!fsrsReady||!FSRS){console.warn('FSRS not ready; using legacy scheduler');return legacyGrade(grade)}
  const now=new Date(),before=cardReview(card.id),wasNew=!before;
  try{
    const scheduler=FSRS.fsrs(fsrsParams()),input=ankiDeserializeCard(before,now),rating=ankiRating(grade);
    const rawResult=scheduler.next? scheduler.next(input,now,rating) : scheduler.repeat(input,now)[rating];
    const next=rawResult.card||rawResult;
    let serialized=ankiSerializeCard(next);
    const custom=ankiUsesCustomLearning(before,grade);
    if(custom){
      const delay=ankiCustomLearningDelay(grade);
      serialized.due=now.getTime()+delay;
      serialized.scheduled_days=delay>=DAY_MS?Math.round(delay/DAY_MS):0;
      if(grade==='again'){
        serialized.state=before&&ankiState(before)===2?3:(before&&ankiState(before)===3?3:1);
      }else{
        serialized.state=2;
      }
    }
    const daily=ankiDaily(),elapsedSec=Math.min(60,Math.max(0,Math.round((Date.now()-(flashSession.cardStartedAt||Date.now()))/1000)));
    if(wasNew)daily.newIntroduced++;
    else if(ankiState(before)===2)daily.reviewCards++;
    daily.totalAnswers++;daily[grade]=(daily[grade]||0)+1;daily.seconds+=elapsedSec;
    flashReview[card.id]={
      fsrs_card:serialized,
      due:serialized.due,
      interval:serialized.scheduled_days,
      reps:serialized.reps,
      lapses:serialized.lapses,
      last_reviewed:now.getTime(),
      last_grade:grade,
      scheduler:'fsrs',
      scheduler_version:'custom-learning-v1',
      desired_retention:ankiConfig().desiredRetention
    };
    const log=ankiReviewLog();
    log.push({card_id:card.id,ts:now.getTime(),grade,rating,scheduled_days:serialized.scheduled_days,stability:serialized.stability,difficulty:serialized.difficulty,elapsed_seconds:elapsedSec,custom_learning:custom});
    if(log.length>20000)log.splice(0,log.length-20000);
    saveFlashReview();
    flashSession.index++;
    if((serialized.state===1||serialized.state===3)&&serialized.due<=Date.now()+LOOKAHEAD_MS){
      const already=flashSession.queue.slice(flashSession.index).some(c=>c.id===card.id);
      if(!already)flashSession.queue.push(card);
    }
    ankiRenderStats();ankiRenderDecks();ankiRenderStudyCard();
  }catch(e){console.error('FSRS grade failed',e);legacyGrade(grade)}
}
let legacyGrade=gradeFlashCard;
async function ankiInitFSRS(){
  try{
    FSRS=await import(FSRS_LIB_URL);
    fsrsReady=!!(FSRS?.fsrs&&FSRS?.createEmptyCard&&FSRS?.Rating);
  }catch(e){fsrsLoadError=e;console.error('Could not load FSRS library',e)}
  try{
    ankiConfig();ankiDaily();ankiInjectOptions();
    dueCardsForDecks=ankiQueue;
    deckCounts=ankiDeckCounts;
    renderFlashDecks=ankiRenderDecks;
    renderFlashHeroStats=ankiRenderStats;
    startFlashStudy=ankiStart;
    renderFlashStudyCard=ankiRenderStudyCard;
    gradeFlashCard=ankiGrade;
    const study=document.getElementById('flashStudyAll');if(study)study.onclick=()=>startFlashStudy((flashLibrary.decks||[]).filter(d=>!d.archived).map(d=>d.id));
    renderFlashDecks();renderFlashHeroStats();
    if(!fsrsReady){
      const meta=document.getElementById('flashSyncMeta');
      if(meta)meta.textContent+=' · FSRS library unavailable; legacy scheduling fallback active';
    }
  }catch(e){console.error('FSRS integration init failed',e)}
}
ankiInitFSRS();
})();
