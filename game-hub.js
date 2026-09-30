(function(){
'use strict';

const GAME_SCORE={correct:5,wrong:-10};
const QUIZ_PROGRESS_KEY='__quiz_retries__';
let gameProfile=null;
let gameProfileBusy=false;
let gameLeaderboard=[];
let gameLeaderboardLoadedAt=0;
let gameQuizState={queue:[],index:0,result:null,shuffle:false};

function gameSvg(name){
  const icons={
    home:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
    past:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    ai:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 13.8 8l5.2 1.8-5.2 1.8L12 17l-1.8-5.4L5 9.8 10.2 8z"/><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',
    quiz:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h14v17H5z"/><path d="m8.5 9 1.5 1.5L13 7.5"/><path d="M8.5 15h7"/></svg>',
    flash:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="14" height="11" rx="2"/><path d="M7 3h13v11"/></svg>'
  };
  return icons[name]||'';
}

function gameNormalizeIcons(){
  const map={tabHome:'home',tabQuestions:'past',tabAI:'ai',tabQuiz:'quiz',tabFlashcards:'flash'};
  Object.entries(map).forEach(([id,name])=>{
    const btn=document.getElementById(id),span=btn?.querySelector('.navIcon');
    if(span&&span.dataset.iconNormalized!=='1'){
      span.innerHTML=gameSvg(name);
      span.dataset.iconNormalized='1';
    }
  });
}

function gameInstallNav(){
  const links=document.querySelector('#studyTabs .appNavLinks');
  if(!links)return;
  if(!document.getElementById('tabQuiz')){
    const ai=document.getElementById('tabAI');
    const btn=document.createElement('button');
    btn.className='studyTab';
    btn.id='tabQuiz';
    btn.type='button';
    btn.innerHTML='<span class="navIcon"></span><span class="quizNavLabel">Quiz</span><small class="quizNavBadge" id="quizNavBadge">0</small>';
    if(ai?.nextSibling)links.insertBefore(btn,ai.nextSibling);else links.appendChild(btn);
    btn.onclick=()=>hubSwitch('quiz');
  }
  gameNormalizeIcons();
}

function gameInstallQuizSection(){
  if(document.getElementById('quizSection'))return;
  const flash=document.getElementById('flashcardsSection');
  if(!flash)return;
  const section=document.createElement('section');
  section.id='quizSection';
  section.className='quizSection hidden';
  section.innerHTML=
    '<div class="quizHero">'+
      '<div><div class="homeCardLabel">MISTAKE QUIZ</div><h2>Turn wrong answers into wins.</h2><p>Every Past Paper or AI question you get wrong lands here as a fresh attempt. Your original answer stays untouched.</p></div>'+
      '<div class="quizHeroActions"><button class="quizShuffleBtn" id="quizShuffleBtn" type="button"><span aria-hidden="true">⇄</span> Shuffle</button></div>'+
    '</div>'+
    '<div class="quizStats" id="quizStats"></div>'+
    '<div class="quizStage" id="quizStage"></div>';
  flash.parentNode.insertBefore(section,flash);
  document.getElementById('quizShuffleBtn').onclick=()=>{
    gameQuizState.shuffle=!gameQuizState.shuffle;
    gameBuildQuizQueue();
    gameRenderQuiz();
  };
}

function gameInstallHome(){
  const slot=document.getElementById('homeAuthSlot');
  if(slot&&!document.getElementById('gameProfilePanel')){
    const panel=document.createElement('div');
    panel.id='gameProfilePanel';
    panel.className='gameProfilePanel';
    slot.appendChild(panel);
  }
  const panel=document.getElementById('gameProfilePanel'),auth=document.getElementById('authBox');
  if(slot&&panel&&auth?.parentElement===slot&&panel.previousElementSibling!==auth)slot.appendChild(panel);
  const grid=document.querySelector('.homeDashboardGrid');
  if(grid&&!document.getElementById('gameLeaderboardCard')){
    const card=document.createElement('section');
    card.id='gameLeaderboardCard';
    card.className='hubCard gameLeaderboardCard';
    card.innerHTML=
      '<div class="homeCardHead"><div><div class="homeCardLabel">LEADERBOARD</div><h3>MED25 standings</h3></div><button class="homeTextBtn" id="gameLeaderboardRefresh" type="button">Refresh ↻</button></div>'+
      '<div class="gameLeaderboardMeta" id="gameLeaderboardMeta">+5 correct · −10 wrong · first attempts only</div>'+
      '<div id="gameLeaderboardList" class="gameLeaderboardList"><div class="gameEmpty">Loading leaderboard…</div></div>';
    const overall=document.querySelector('.homeOverall');
    if(overall?.nextSibling)grid.insertBefore(card,overall.nextSibling);else grid.appendChild(card);
    document.getElementById('gameLeaderboardRefresh').onclick=()=>gameLoadLeaderboard(true);
  }
}

function gameAvatarMarkup(profile,size='normal'){
  const username=profile?.username||'MED25';
  const initials=(username.replace(/[^A-Za-z0-9]/g,'').slice(0,2)||'M').toUpperCase();
  if(profile?.avatar_url){
    return '<span class="gameAvatar '+size+'"><img src="'+esc(profile.avatar_url)+'" alt="" loading="lazy" decoding="async"></span>';
  }
  return '<span class="gameAvatar '+size+'"><span>'+esc(initials)+'</span></span>';
}

function gameRenderProfile(){
  const host=document.getElementById('gameProfilePanel');
  if(!host)return;
  if(!currentUser){
    host.innerHTML='<div class="gameProfileGuest"><span class="gameProfileGuestIcon">'+gameSvg('quiz')+'</span><div><b>Game profile unlocks when you sign in</b><span>Your existing answers will be counted once you sign in.</span></div></div>';
    return;
  }
  if(!gameProfile){
    host.innerHTML='<div class="gameProfileLoading">Loading your game profile…</div>';
    return;
  }
  host.innerHTML=
    '<div class="gameProfileTop">'+
      '<button class="gameAvatarButton" id="gameAvatarButton" type="button" aria-label="Change profile picture">'+gameAvatarMarkup(gameProfile,'large')+'<span>Change</span></button>'+
      '<input id="gameAvatarInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>'+
      '<div class="gameIdentity"><span class="gameMiniLabel">USERNAME</span><div class="gameUsernameRow"><input id="gameUsernameInput" maxlength="24" value="'+esc(gameProfile.username||'')+'" aria-label="Username"><button id="gameSaveProfile" type="button">Save</button></div><small>3–24 characters: letters, numbers, . _ -</small></div>'+
      '<div class="gamePoints"><b>'+Number(gameProfile.points||0).toLocaleString()+'</b><span>points</span></div>'+
    '</div>'+
    '<div class="gameProfileStats">'+
      '<span><b>'+Number(gameProfile.correct_first_attempts||0).toLocaleString()+'</b> correct</span>'+
      '<span><b>'+Number(gameProfile.wrong_first_attempts||0).toLocaleString()+'</b> wrong</span>'+
      '<span><b>+5 / −10</b> scoring</span>'+
    '</div>'+
    '<label class="gameLeaderboardToggle"><span><b>Appear on leaderboard</b><small>On by default. Turn this off for private progress.</small></span><input id="gameLeaderboardVisible" type="checkbox" '+(gameProfile.leaderboard_visible?'checked':'')+'><i></i></label>'+
    '<div class="gameProfileStatus" id="gameProfileStatus"></div>';
  document.getElementById('gameSaveProfile').onclick=gameSaveProfile;
  document.getElementById('gameLeaderboardVisible').onchange=gameSaveProfile;
  document.getElementById('gameAvatarButton').onclick=()=>document.getElementById('gameAvatarInput')?.click();
  document.getElementById('gameAvatarInput').onchange=gameUploadAvatar;
}

function gameSetProfileStatus(msg,error=false){
  const el=document.getElementById('gameProfileStatus');
  if(el){el.textContent=msg||'';el.classList.toggle('error',!!error)}
}

async function gameEnsureProfile(){
  if(!currentUser||!authSession?.access_token)return null;
  const res=await supaFetch('/rest/v1/game_profiles?user_id=eq.'+encodeURIComponent(currentUser.id)+'&select=*');
  if(!res.ok)throw new Error(await res.text());
  let rows=await res.json();
  if(!rows.length){
    const username='med25_'+String(currentUser.id).replace(/-/g,'').slice(0,10);
    const create=await supaFetch('/rest/v1/game_profiles',{
      method:'POST',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify({user_id:currentUser.id,username,leaderboard_visible:true})
    });
    if(!create.ok)throw new Error(await create.text());
    rows=await create.json();
  }
  gameProfile=rows[0]||null;
  gameRenderProfile();
  return gameProfile;
}

async function gameRefreshProfile(){
  if(!currentUser)return;
  const res=await supaFetch('/rest/v1/game_profiles?user_id=eq.'+encodeURIComponent(currentUser.id)+'&select=*');
  if(res.ok){
    const rows=await res.json();
    if(rows[0])gameProfile=rows[0];
    gameRenderProfile();
  }
}

async function gameSaveProfile(){
  if(!currentUser||!gameProfile)return;
  const username=(document.getElementById('gameUsernameInput')?.value||gameProfile.username||'').trim();
  const visible=!!document.getElementById('gameLeaderboardVisible')?.checked;
  if(!/^[A-Za-z0-9_.-]{3,24}$/.test(username)){
    gameSetProfileStatus('Use 3–24 letters, numbers, dots, underscores or hyphens.',true);return;
  }
  gameSetProfileStatus('Saving…');
  const res=await supaFetch('/rest/v1/game_profiles?user_id=eq.'+encodeURIComponent(currentUser.id),{
    method:'PATCH',
    headers:{Prefer:'return=representation'},
    body:JSON.stringify({username,leaderboard_visible:visible,updated_at:new Date().toISOString()})
  });
  if(!res.ok){
    const txt=await res.text();
    gameSetProfileStatus(res.status===409?'That username is already taken.':'Could not save profile.',true);
    console.warn(txt);return;
  }
  const rows=await res.json();if(rows[0])gameProfile=rows[0];
  gameRenderProfile();
  gameSetProfileStatus('Saved ✓');
  gameLoadLeaderboard(true);
}

async function gameUploadAvatar(e){
  const file=e.target.files?.[0];
  if(!file||!currentUser||!authSession?.access_token)return;
  if(file.size>2*1024*1024){gameSetProfileStatus('Profile picture must be 2 MB or smaller.',true);return}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){gameSetProfileStatus('Use a JPG, PNG or WebP image.',true);return}
  gameSetProfileStatus('Uploading photo…');
  const path=encodeURIComponent(currentUser.id)+'/avatar';
  const res=await fetch(SUPA_URL+'/storage/v1/object/avatars/'+path,{
    method:'POST',
    headers:{
      apikey:SUPA_KEY,
      Authorization:'Bearer '+authSession.access_token,
      'Content-Type':file.type,
      'x-upsert':'true',
      'cache-control':'3600'
    },
    body:file
  });
  if(!res.ok){gameSetProfileStatus('Could not upload profile picture.',true);console.warn(await res.text());return}
  const avatarUrl=SUPA_URL+'/storage/v1/object/public/avatars/'+path+'?v='+Date.now();
  const saveRes=await supaFetch('/rest/v1/game_profiles?user_id=eq.'+encodeURIComponent(currentUser.id),{
    method:'PATCH',
    headers:{Prefer:'return=representation'},
    body:JSON.stringify({avatar_url:avatarUrl,updated_at:new Date().toISOString()})
  });
  if(!saveRes.ok){gameSetProfileStatus('Photo uploaded, but profile could not update.',true);return}
  const rows=await saveRes.json();if(rows[0])gameProfile=rows[0];
  gameRenderProfile();gameLoadLeaderboard(true);
}

function gameHistoricalAttempts(){
  if(!currentUser)return [];
  const rows=[];
  for(const q of QUESTIONS){
    const p=saved[q.id];
    if(typeof p?.correct==='boolean')rows.push({user_id:currentUser.id,source:'past',question_id:q.id,correct:p.correct});
  }
  try{
    const p=aiProgress();
    for(const q of aiAllQuestions()){
      if(typeof p[q.id]?.correct==='boolean')rows.push({user_id:currentUser.id,source:'ai',question_id:q.id,correct:p[q.id].correct});
    }
  }catch{}
  return rows;
}

async function gameBackfillAttempts(){
  if(!currentUser||!authSession?.access_token)return;
  const rows=gameHistoricalAttempts();
  for(let i=0;i<rows.length;i+=150){
    const chunk=rows.slice(i,i+150);
    if(!chunk.length)continue;
    const res=await supaFetch('/rest/v1/game_attempts?on_conflict=user_id,source,question_id',{
      method:'POST',
      headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
      body:JSON.stringify(chunk)
    });
    if(!res.ok)console.warn('Game score backfill failed',await res.text());
  }
  await gameRefreshProfile();
  await gameLoadLeaderboard(true);
}

function gameScoreToast(delta){
  let t=document.getElementById('gameScoreToast');
  if(!t){
    t=document.createElement('div');t.id='gameScoreToast';t.className='gameScoreToast';document.body.appendChild(t);
  }
  t.className='gameScoreToast '+(delta>0?'plus':'minus');
  t.textContent=(delta>0?'+':'')+delta+' points';
  requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(gameScoreToast._timer);
  gameScoreToast._timer=setTimeout(()=>t.classList.remove('show'),1300);
}

async function gameRecordAttempt(source,questionId,correct){
  gameUpdateQuizBadge();
  if(!currentUser||!authSession?.access_token||typeof correct!=='boolean')return;
  try{
    await gameEnsureProfile();
    const res=await supaFetch('/rest/v1/game_attempts?on_conflict=user_id,source,question_id',{
      method:'POST',
      headers:{Prefer:'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify({user_id:currentUser.id,source,question_id:questionId,correct})
    });
    if(!res.ok)return;
    const rows=await res.json();
    if(rows.length){
      gameScoreToast(correct?GAME_SCORE.correct:GAME_SCORE.wrong);
      await gameRefreshProfile();
      gameLoadLeaderboard(true);
    }
  }catch(e){console.warn('Game score unavailable',e)}
}

async function gameLoadLeaderboard(force=false){
  const host=document.getElementById('gameLeaderboardList');
  if(!host)return;
  if(!force&&Date.now()-gameLeaderboardLoadedAt<30000&&gameLeaderboard.length){gameRenderLeaderboard();return}
  try{
    const res=await supaFetch('/rest/v1/leaderboard_entries?select=username,avatar_url,points&order=points.desc&limit=50');
    if(!res.ok)throw new Error(await res.text());
    gameLeaderboard=await res.json();
    gameLeaderboardLoadedAt=Date.now();
    gameRenderLeaderboard();
  }catch(e){
    host.innerHTML='<div class="gameEmpty">Leaderboard is temporarily unavailable.</div>';
    console.warn(e);
  }
}

function gameRenderLeaderboard(){
  const host=document.getElementById('gameLeaderboardList'),meta=document.getElementById('gameLeaderboardMeta');
  if(!host)return;
  if(meta)meta.textContent=(gameProfile&&!gameProfile.leaderboard_visible?'You are hidden · ':'')+'+5 correct · −10 wrong · first attempts only';
  if(!gameLeaderboard.length){
    host.innerHTML='<div class="gameEmpty">No ranked players yet. Be the first.</div>';return;
  }
  host.innerHTML=gameLeaderboard.slice(0,10).map((r,i)=>{
    const rank=Number(r.rank||i+1);
    const medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':String(rank);
    const isMe=!!gameProfile&&String(r.username).toLowerCase()===String(gameProfile.username).toLowerCase();
    return '<div class="gameLeaderboardRow '+(isMe?'me':'')+'">'+
      '<span class="gameRank">'+medal+'</span>'+gameAvatarMarkup(r,'small')+
      '<b>'+esc(r.username||'Student')+(isMe?' <small>you</small>':'')+'</b>'+
      '<strong>'+Number(r.points||0).toLocaleString()+' pts</strong>'+
    '</div>';
  }).join('');
}

function gameQuizProgress(){
  if(!saved[QUIZ_PROGRESS_KEY]||typeof saved[QUIZ_PROGRESS_KEY]!=='object')saved[QUIZ_PROGRESS_KEY]={};
  return saved[QUIZ_PROGRESS_KEY];
}

function gameAllMistakes(){
  const out=[];
  for(const q of QUESTIONS){
    if(saved[q.id]?.correct===false)out.push({key:'past:'+q.id,source:'past',q});
  }
  try{
    const p=aiProgress();
    for(const q of aiAllQuestions()){
      if(p[q.id]?.correct===false)out.push({key:'ai:'+q.id,source:'ai',q});
    }
  }catch{}
  return out;
}

function gameUnresolvedMistakes(){
  const qp=gameQuizProgress();
  return gameAllMistakes().filter(x=>!qp[x.key]?.recovered);
}

function gameShuffle(items){
  const a=[...items];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}

function gameBuildQuizQueue(){
  let items=gameUnresolvedMistakes();
  if(gameQuizState.shuffle)items=gameShuffle(items);
  gameQuizState.queue=items.map(x=>x.key);
  gameQuizState.index=0;
  gameQuizState.result=null;
  gameUpdateQuizBadge();
}

function gameResolveQuizKey(key){
  const [source,id]=String(key||'').split(':');
  if(source==='past'){
    const q=QUESTIONS.find(x=>x.id===id);return q?{key,source,q}:null;
  }
  if(source==='ai'){
    const q=aiAllQuestions().find(x=>x.id===id);return q?{key,source,q}:null;
  }
  return null;
}

function gameUpdateQuizBadge(){
  const badge=document.getElementById('quizNavBadge');
  if(!badge)return;
  const n=gameUnresolvedMistakes().length;
  badge.textContent=String(n);
  badge.classList.toggle('zero',n===0);
}

function gameQuizSourceLabel(item){
  return item.source==='ai'?'AI Question':'Past Paper';
}

function gameQuizSourceUrl(item){
  const q=item.q;
  return q.source_url||q.lecture_source?.drive_url||'';
}

function gameQuizExplanation(item){
  return item.q.explanation||item.q.rationale||'Review the keyed answer and the source lecture before your next attempt.';
}

function gameRenderQuiz(){
  const stats=document.getElementById('quizStats'),stage=document.getElementById('quizStage'),shuffle=document.getElementById('quizShuffleBtn');
  if(!stats||!stage)return;
  const all=gameAllMistakes(),qp=gameQuizProgress(),recovered=all.filter(x=>qp[x.key]?.recovered).length,unresolved=all.length-recovered;
  stats.innerHTML=
    '<div class="quizStat"><b>'+all.length+'</b><span>mistakes collected</span></div>'+
    '<div class="quizStat"><b>'+unresolved+'</b><span>still to recover</span></div>'+
    '<div class="quizStat"><b>'+recovered+'</b><span>recovered</span></div>';
  if(shuffle)shuffle.classList.toggle('active',gameQuizState.shuffle);

  if(!gameQuizState.queue.length&&unresolved>0)gameBuildQuizQueue();
  if(!gameQuizState.queue.length){
    stage.innerHTML='<div class="quizComplete"><span>✓</span><h3>'+(!all.length?'No mistakes yet':'Mistake quiz complete')+'</h3><p>'+(!all.length?'Questions you get wrong in Past Papers or AI Questions will automatically appear here.':'You recovered every mistake currently in the queue. Your original attempts are still preserved in their original sections.')+'</p></div>';
    return;
  }
  if(gameQuizState.index>=gameQuizState.queue.length)gameQuizState.index=0;
  const item=gameResolveQuizKey(gameQuizState.queue[gameQuizState.index]);
  if(!item){gameBuildQuizQueue();return gameRenderQuiz()}
  const q=item.q,options=q.options||{},result=gameQuizState.result&&gameQuizState.result.key===item.key?gameQuizState.result:null;
  const optionHtml=Object.entries(options).map(([k,v])=>{
    let cls='quizOption';
    if(result){
      if(k===q.answer)cls+=' correct';
      else if(k===result.selected)cls+=' wrong';
    }
    return '<button class="'+cls+'" type="button" data-quiz-opt="'+esc(k)+'" '+(result?'disabled':'')+'><span class="quizLetter">'+esc(k)+'</span><span>'+esc(v)+'</span></button>';
  }).join('');
  const sourceUrl=gameQuizSourceUrl(item);
  const feedback=result?(
    '<div class="quizFeedback '+(result.correct?'good':'bad')+'"><b>'+(result.correct?'Recovered ✓':'Not yet — keep it in the quiz')+'</b>'+
    '<span>Correct answer: '+esc(q.answer)+' · '+esc(options[q.answer]||'')+'</span><p>'+esc(gameQuizExplanation(item))+'</p></div>'+
    '<button class="quizNextBtn" id="quizNextBtn" type="button">'+(result.correct?'Next mistake →':'Try another mistake →')+'</button>'
  ):'';
  stage.innerHTML=
    '<article class="quizCard">'+
      '<div class="quizCardTop"><div><span class="quizSource">'+gameQuizSourceLabel(item)+'</span><span class="quizCount">Mistake '+(gameQuizState.index+1)+' of '+gameQuizState.queue.length+'</span></div><span class="quizFresh">Fresh attempt</span></div>'+
      '<h3>'+esc(q.stem||'')+'</h3>'+
      '<div class="quizOptions">'+optionHtml+'</div>'+
      feedback+
      (sourceUrl?'<a class="quizSourceLink" href="'+esc(sourceUrl)+'" target="_blank" rel="noopener">Open source lecture ↗</a>':'')+
    '</article>';
  stage.querySelectorAll('[data-quiz-opt]').forEach(btn=>btn.onclick=()=>gameAnswerQuiz(btn.dataset.quizOpt));
  document.getElementById('quizNextBtn')?.addEventListener('click',gameQuizNext);
}

function gameAnswerQuiz(opt){
  if(gameQuizState.result)return;
  const item=gameResolveQuizKey(gameQuizState.queue[gameQuizState.index]);if(!item)return;
  const correct=opt===item.q.answer;
  const qp=gameQuizProgress(),old=qp[item.key]||{};
  qp[item.key]={
    attempts:Number(old.attempts||0)+1,
    recovered:correct?true:false,
    last_correct:correct,
    last_at:new Date().toISOString()
  };
  gameQuizState.result={key:item.key,selected:opt,correct};
  save();
  try{trackEvent('question_answer',{question_id:item.q.id,topic:item.q.topic||item.q.concept||item.q.lecture_title||null,metadata:{correct,source:'mistake_quiz',retry:true}})}catch{}
  gameUpdateQuizBadge();
  gameRenderQuiz();
}

function gameQuizNext(){
  if(!gameQuizState.result)return;
  const idx=gameQuizState.index,key=gameQuizState.queue[idx];
  if(gameQuizState.result.correct){
    gameQuizState.queue.splice(idx,1);
    if(gameQuizState.index>=gameQuizState.queue.length)gameQuizState.index=0;
  }else{
    gameQuizState.queue.splice(idx,1);
    gameQuizState.queue.push(key);
    if(gameQuizState.index>=gameQuizState.queue.length)gameQuizState.index=0;
  }
  gameQuizState.result=null;
  gameRenderQuiz();
}

function gameEnterQuiz(){
  gameBuildQuizQueue();
  gameRenderQuiz();
}

function gameSwitchQuiz(){
  document.getElementById('homeSection')?.classList.add('hidden');
  document.getElementById('questionSection')?.classList.add('hidden');
  document.getElementById('aiSection')?.classList.add('hidden');
  document.getElementById('flashcardsSection')?.classList.add('hidden');
  document.getElementById('quizSection')?.classList.remove('hidden');
  ['tabHome','tabQuestions','tabAI','tabFlashcards'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
  document.getElementById('tabQuiz')?.classList.add('active');
  document.getElementById('stats')?.classList.add('hidden');
  document.getElementById('questionProgressBar')?.classList.add('hidden');
  document.getElementById('flashHeroStats')?.classList.add('hidden');
  document.body.classList.remove('homeMode');
  const h=document.getElementById('heroTitle'),p=document.getElementById('heroDescription');
  if(h)h.textContent='MED25 Mistake Quiz';
  if(p)p.textContent='Fresh retries of the Past Paper and AI questions you previously got wrong.';
  try{localStorage.setItem(HUB_SECTION_KEY,'quiz')}catch{}
  try{trackEvent('section_view',{metadata:{section:'quiz'}})}catch{}
  gameEnterQuiz();
}

function gamePatchNavigation(){
  if(typeof hubSwitch!=='function')return;
  const baseHubSwitch=hubSwitch;
  hubSwitch=function(mode){
    if(mode==='quiz')return gameSwitchQuiz();
    document.getElementById('quizSection')?.classList.add('hidden');
    document.getElementById('tabQuiz')?.classList.remove('active');
    return baseHubSwitch.apply(this,arguments);
  };
  switchStudySection=hubSwitch;
  hubGo=function(mode){hubSwitch(mode)};
  window.hubGo=hubGo;
  document.getElementById('tabQuiz').onclick=()=>hubSwitch('quiz');
}

function gamePatchScoring(){
  if(typeof answer==='function'&&!answer.__gameWrapped){
    const base=answer;
    const wrapped=function(id,opt){
      const before=!!saved[id]?.answered;
      const out=base.apply(this,arguments);
      if(!before&&typeof saved[id]?.correct==='boolean')gameRecordAttempt('past',id,saved[id].correct);
      gameUpdateQuizBadge();
      return out;
    };
    wrapped.__gameWrapped=true;answer=wrapped;
  }
  if(typeof answerAI==='function'&&!answerAI.__gameWrapped){
    const base=answerAI;
    const wrapped=function(id,opt){
      const p=aiProgress(),before=!!p[id]?.answered;
      const out=base.apply(this,arguments);
      const after=aiProgress()[id];
      if(!before&&typeof after?.correct==='boolean')gameRecordAttempt('ai',id,after.correct);
      gameUpdateQuizBadge();
      return out;
    };
    wrapped.__gameWrapped=true;answerAI=wrapped;
  }
}

function gamePatchAuth(){
  if(typeof updateAuthUI==='function'&&!updateAuthUI.__gameWrapped){
    const base=updateAuthUI;
    const wrapped=function(){
      const out=base.apply(this,arguments);
      setTimeout(()=>gameSyncAuth(),0);
      return out;
    };
    wrapped.__gameWrapped=true;updateAuthUI=wrapped;
  }
  if(typeof signOutUser==='function'&&!signOutUser.__gameWrapped){
    const base=signOutUser;
    const wrapped=async function(){
      const out=await base.apply(this,arguments);
      gameProfile=null;gameRenderProfile();gameLoadLeaderboard(true);return out;
    };
    wrapped.__gameWrapped=true;signOutUser=wrapped;
  }
}

async function gameSyncAuth(){
  gameInstallHome();
  gameRenderProfile();
  if(!currentUser||!authSession?.access_token){gameProfile=null;gameRenderProfile();gameLoadLeaderboard();return}
  if(gameProfileBusy)return;
  gameProfileBusy=true;
  try{
    await gameEnsureProfile();
    await gameBackfillAttempts();
  }catch(e){console.warn('Game profile sync failed',e)}
  finally{gameProfileBusy=false}
}

function gamePatchHome(){
  if(typeof renderHome==='function'&&!renderHome.__gameWrapped){
    const base=renderHome;
    const wrapped=function(){
      const out=base.apply(this,arguments);
      gameInstallHome();gameRenderProfile();gameNormalizeIcons();gameLoadLeaderboard();
      return out;
    };
    wrapped.__gameWrapped=true;renderHome=wrapped;
  }
}

function gameInit(){
  gameInstallNav();
  gameInstallQuizSection();
  gameInstallHome();
  gamePatchNavigation();
  gamePatchScoring();
  gamePatchAuth();
  gamePatchHome();
  gameNormalizeIcons();
  gameUpdateQuizBadge();
  gameRenderProfile();
  gameLoadLeaderboard();
  setTimeout(gameSyncAuth,300);
  setTimeout(()=>{gameNormalizeIcons();gameUpdateQuizBadge()},1200);
  const stored=localStorage.getItem(HUB_SECTION_KEY);
  if(stored==='quiz')hubSwitch('quiz');
}

try{gameInit()}catch(e){console.error('MED25 game layer failed',e)}

})();