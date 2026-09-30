(function(){
'use strict';

const GAME_SCORE={past:7,ai:5,wrong:1,recovery:8};
const GAME_SCOREABLE_SOURCES=new Set(['past','ai']);
const QUIZ_PROGRESS_KEY='__quiz_retries__';
const GAME_SECTION_KEY='med25-main-section-v1';
let gameProfile=null;
let gameProfileBusy=false;
let gameLeaderboard=[];
let gameLeaderboardLoadedAt=0;
let gameLeaderboardMode='weekly';
let gameQuizState={queue:[],index:0,result:null,shuffle:false};
let gameMockState={config:{minutes:30,includeAI:true,subjectCounts:{},lectureCounts:{}},exam:null,timer:null};

function gameSvg(name){
  const icons={
    home:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
    past:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    ai:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 13.8 8l5.2 1.8-5.2 1.8L12 17l-1.8-5.4L5 9.8 10.2 8z"/><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',
    quiz:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h14v17H5z"/><path d="m8.5 9 1.5 1.5L13 7.5"/><path d="M8.5 15h7"/></svg>',
    mock:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v3H7z"/><path d="M5 6.5h14v14H5z"/><path d="M8.5 11h7M8.5 15h4"/></svg>',
    flash:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="14" height="11" rx="2"/><path d="M7 3h13v11"/></svg>'
  };
  return icons[name]||'';
}

function gameNormalizeIcons(){
  const map={tabHome:'home',tabQuestions:'past',tabAI:'ai',tabQuiz:'quiz',tabMock:'mock',tabFlashcards:'flash'};
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
  }
  const quizBtn=document.getElementById('tabQuiz');
  if(quizBtn){
    quizBtn.disabled=false;
    quizBtn.removeAttribute('aria-disabled');
    quizBtn.tabIndex=0;
    quizBtn.onclick=()=>gameSwitchQuiz();
  }
  if(!document.getElementById('tabMock')){
    const quiz=document.getElementById('tabQuiz');
    const btn=document.createElement('button');
    btn.className='studyTab';
    btn.id='tabMock';
    btn.type='button';
    btn.innerHTML='<span class="navIcon"></span><span>Mock Exam</span>';
    if(quiz?.nextSibling)links.insertBefore(btn,quiz.nextSibling);else links.appendChild(btn);
  }
  const mockBtn=document.getElementById('tabMock');
  if(mockBtn){
    mockBtn.disabled=false;
    mockBtn.removeAttribute('aria-disabled');
    mockBtn.tabIndex=0;
    mockBtn.onclick=()=>gameSwitchMock();
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
      '<div class="homeCardHead"><div><div class="homeCardLabel">XP LEADERBOARD</div><h3>MED25 rankings</h3></div><button class="homeTextBtn" id="gameLeaderboardRefresh" type="button">Refresh ↻</button></div>'+
      '<div class="gameLeaderboardTabs"><button type="button" data-xp-board="weekly" class="active">Weekly</button><button type="button" data-xp-board="monthly">Monthly</button><button type="button" data-xp-board="all">All-time</button></div>'+
      '<div class="gameLeaderboardMeta" id="gameLeaderboardMeta">Loading XP rankings…</div>'+
      '<div id="gameLeaderboardList" class="gameLeaderboardList"><div class="gameEmpty">Loading leaderboard…</div></div>';
    const overall=document.querySelector('.homeOverall');
    if(overall?.nextSibling)grid.insertBefore(card,overall.nextSibling);else grid.appendChild(card);
    document.getElementById('gameLeaderboardRefresh').onclick=()=>gameLoadLeaderboard(true);
    card.querySelectorAll('[data-xp-board]').forEach(btn=>btn.onclick=()=>{
      gameLeaderboardMode=btn.dataset.xpBoard;
      card.querySelectorAll('[data-xp-board]').forEach(x=>x.classList.toggle('active',x===btn));
      gameRenderLeaderboard();
    });
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

function gameLevelInfo(xp){
  xp=Math.max(0,Number(xp||0));
  let level=Math.min(50,Math.floor(Math.sqrt(xp/12))+1);
  const floor=12*Math.pow(level-1,2),next=level>=50?floor:12*Math.pow(level,2);
  const pct=level>=50?100:Math.max(0,Math.min(100,Math.round((xp-floor)/(next-floor)*100)));
  const title=level>=50?'MED25 Legend':level>=40?'Professor':level>=30?'Consultant':level>=20?'Registrar':level>=10?'Resident':level>=5?'Clerk':'Med Student';
  return {level,title,floor,next,pct};
}
function gameAchievementMarkup(p){
  const badges=[];
  const best=Number(p?.best_streak||0),correct=Number(p?.correct_first_attempts||0);
  if(best>=10)badges.push(['🔥','Locked In','10-answer streak']);
  if(best>=25)badges.push(['⚡','On Fire','25-answer streak']);
  if(correct>=100)badges.push(['🧠','Century','100 correct answers']);
  if(correct>=250)badges.push(['👑','Question Machine','250 correct answers']);
  if(Number(p?.points||0)>=5000)badges.push(['🏆','XP Hunter','5,000 XP']);
  return badges.length?'<div class="gameAchievements">'+badges.map(b=>'<span title="'+b[2]+'"><i>'+b[0]+'</i><b>'+b[1]+'</b></span>').join('')+'</div>':'';
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
      '<div class="gamePoints"><div class="gamePointsLabel"><span>XP</span><button class="gamePointsInfoBtn" id="gamePointsInfoBtn" type="button" aria-label="How MED25 XP works" aria-haspopup="dialog">i</button></div><b>'+Number(gameProfile.points||0).toLocaleString()+'</b></div>'+
    '</div>'+
    (function(){const lv=gameLevelInfo(gameProfile.points);return '<div class="gameLevelBlock"><div class="gameLevelTop"><b>Level '+lv.level+' · '+lv.title+'</b><span>'+Number(gameProfile.current_streak||0)+'🔥 streak · best '+Number(gameProfile.best_streak||0)+'</span></div><div class="gameLevelBar"><i style="width:'+lv.pct+'%"></i></div><small>'+(lv.level>=50?'MAX LEVEL':Number(gameProfile.points||0).toLocaleString()+' / '+Math.round(lv.next).toLocaleString()+' XP')+'</small></div>'+gameAchievementMarkup(gameProfile);})()+
    '<div class="gameProfileStats">'+
      '<span><b>'+Number(gameProfile.correct_first_attempts||0).toLocaleString()+'</b> correct</span>'+
      '<span><b>'+Number(gameProfile.wrong_first_attempts||0).toLocaleString()+'</b> wrong</span>'+
      '<span><b>'+((String(gameProfile.week_start||'')===gameRiyadhPeriodStart('week'))?Number(gameProfile.weekly_xp||0):0).toLocaleString()+'</b> XP this week</span>'+
    '</div>'+
    '<label class="gameLeaderboardToggle"><span><b>Appear on leaderboard</b><small>On automatically for every registered account. You can turn this off anytime.</small></span><input id="gameLeaderboardVisible" type="checkbox" '+(gameProfile.leaderboard_visible?'checked':'')+'><i></i></label>'+
    '<div class="gameProfileStatus" id="gameProfileStatus"></div>';
  document.getElementById('gameSaveProfile').onclick=gameSaveProfile;
  document.getElementById('gameLeaderboardVisible').onchange=gameSaveProfile;
  document.getElementById('gameAvatarButton').onclick=()=>document.getElementById('gameAvatarInput')?.click();
  document.getElementById('gameAvatarInput').onchange=gameUploadAvatar;
  document.getElementById('gamePointsInfoBtn')?.addEventListener('click',gameOpenPointsInfo);
}

function gameOpenPointsInfo(){
  let modal=document.getElementById('gamePointsInfoModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='gamePointsInfoModal';
    modal.className='gamePointsInfoModal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-labelledby','gamePointsInfoTitle');
    modal.innerHTML='<div class="gamePointsInfoBackdrop" data-close-points-info></div><div class="gamePointsInfoCard"><div class="gamePointsInfoHead"><div><span class="gameMiniLabel">MED25 XP</span><h3 id="gamePointsInfoTitle">How XP works</h3></div><button class="gamePointsInfoClose" type="button" data-close-points-info aria-label="Close">×</button></div><p class="gamePointsInfoIntro">Earn XP by studying, improving and staying accurate. Repeating an already-scored question cannot be farmed for XP.</p><div class="gamePointsInfoRules"><div><b>+7 XP</b><span>Correct Past Paper</span></div><div><b>+5 XP</b><span>Correct AI question</span></div><div><b>+1 XP</b><span>Wrong first attempt</span></div><div><b>+8 XP</b><span>Recover a previous mistake</span></div></div><div class="gamePointsInfoNote"><b>🔥 Correct-answer streak multipliers</b><span>5 = 1.1× · 10 = 1.25× · 20 = 1.5× · 30 = 2×. A wrong answer resets the streak.</span></div><div class="gamePointsInfoNote"><b>🏆 Rankings</b><span>Weekly, Monthly and All-Time leaderboards. Weekly and monthly XP reset by period; your total XP and level never reset.</span></div><p class="gamePointsInfoFooter">Study. Improve. Level up. 🧠🔥</p></div>';
    document.body.appendChild(modal);
    modal.querySelectorAll('[data-close-points-info]').forEach(el=>el.addEventListener('click',gameClosePointsInfo));
  }
  modal.classList.add('open');
  document.body.classList.add('gameModalOpen');
  modal.querySelector('.gamePointsInfoClose')?.focus();
}

function gameClosePointsInfo(){
  document.getElementById('gamePointsInfoModal')?.classList.remove('open');
  document.body.classList.remove('gameModalOpen');
  document.getElementById('gamePointsInfoBtn')?.focus();
}

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('gamePointsInfoModal')?.classList.contains('open'))gameClosePointsInfo();});

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
    const p=window.med25GameBridge?.aiProgress?.()||{};
    const qs=window.med25GameBridge?.aiQuestions?.()||[];
    for(const q of qs){
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
  t.textContent=(delta>0?'+':'')+delta+' XP';
  requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(gameScoreToast._timer);
  gameScoreToast._timer=setTimeout(()=>t.classList.remove('show'),1300);
}

async function gameAwardBonus(eventKey,eventType,xp){
  if(!currentUser||!authSession?.access_token)return false;
  try{
    const res=await supaFetch('/rest/v1/game_xp_events?on_conflict=user_id,event_key',{
      method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify({user_id:currentUser.id,event_key:eventKey,event_type:eventType,xp})
    });
    if(!res.ok)return false;
    const rows=await res.json();
    if(rows.length){gameScoreToast(xp);await gameRefreshProfile();gameLoadLeaderboard(true);return true}
  }catch(e){console.warn('Bonus XP unavailable',e)}
  return false;
}

async function gameRecordAttempt(source,questionId,correct){
  gameUpdateQuizBadge();
  source=String(source||'').toLowerCase();
  if(!GAME_SCOREABLE_SOURCES.has(source))return;
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
      gameScoreToast(Number(rows[0]?.points_delta ?? (correct?(GAME_SCORE[source]||5):GAME_SCORE.wrong)));
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
    const res=await supaFetch('/rest/v1/leaderboard_entries?select=username,avatar_url,points,weekly_xp,monthly_xp,current_streak,best_streak,week_start,month_start&visible=eq.true&limit=500');
    if(!res.ok)throw new Error(await res.text());
    gameLeaderboard=await res.json();
    gameLeaderboardLoadedAt=Date.now();
    gameRenderLeaderboard();
  }catch(e){
    host.innerHTML='<div class="gameEmpty">Leaderboard is temporarily unavailable.</div>';
    console.warn(e);
  }
}

function gameRiyadhPeriodStart(period){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(new Date());
  const get=t=>parts.find(x=>x.type===t)?.value;const y=Number(get('year')),m=Number(get('month')),d=Number(get('day'));
  const today=new Date(Date.UTC(y,m-1,d));
  if(period==='month')return y+'-'+String(m).padStart(2,'0')+'-01';
  const dow=today.getUTCDay(),back=(dow+6)%7;today.setUTCDate(today.getUTCDate()-back);
  return today.toISOString().slice(0,10);
}
function gameLeaderboardValue(r,mode){
  if(mode==='weekly')return String(r.week_start||'')===gameRiyadhPeriodStart('week')?Number(r.weekly_xp||0):0;
  if(mode==='monthly')return String(r.month_start||'')===gameRiyadhPeriodStart('month')?Number(r.monthly_xp||0):0;
  return Number(r.points||0);
}
function gameRenderLeaderboard(){
  const host=document.getElementById('gameLeaderboardList'),meta=document.getElementById('gameLeaderboardMeta');
  if(!host)return;
  const label=gameLeaderboardMode==='weekly'?'this week':gameLeaderboardMode==='monthly'?'this month':'all-time';
  const rows=[...gameLeaderboard].sort((a,b)=>gameLeaderboardValue(b,gameLeaderboardMode)-gameLeaderboardValue(a,gameLeaderboardMode));
  if(meta)meta.textContent=rows.length+' MED25 accounts · ranked by XP '+label+' · streak bonuses included';
  if(!rows.length){host.innerHTML='<div class="gameEmpty">No ranked players yet. Be the first.</div>';return}
  host.innerHTML=rows.map((r,i)=>{
    const rank=i+1,medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':String(rank);
    const isMe=!!gameProfile&&String(r.username).toLowerCase()===String(gameProfile.username).toLowerCase();
    const lv=gameLevelInfo(r.points);
    return '<div class="gameLeaderboardRow '+(isMe?'me':'')+'"><span class="gameRank">'+medal+'</span>'+gameAvatarMarkup(r,'small')+
      '<b>'+esc(r.username||'Student')+(isMe?' <small>you</small>':'')+'<em>Lv '+lv.level+' · '+lv.title+'</em></b>'+
      '<strong>'+gameLeaderboardValue(r,gameLeaderboardMode).toLocaleString()+' XP</strong></div>';
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
    const p=window.med25GameBridge?.aiProgress?.()||{};
    const qs=window.med25GameBridge?.aiQuestions?.()||[];
    for(const q of qs){
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
    const q=(window.med25GameBridge?.aiQuestions?.()||[]).find(x=>x.id===id);return q?{key,source,q}:null;
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
  if(correct&&!old.recovered)gameAwardBonus('recovery:'+item.key,'recovery',GAME_SCORE.recovery);
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


function gameMockStemKey(q){
  return String(q?.stem||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function gameMockQuestionRows(){
  const rows=[],seenStems=new Set();
  for(const q of QUESTIONS){
    const ready=typeof window.med25ExamReadyPast==='function'
      ? window.med25ExamReadyPast(q)
      : (!!q?.id&&!!q?.answer&&Object.keys(q.options||{}).length>=4&&Object.prototype.hasOwnProperty.call(q.options||{},q.answer));
    if(!ready)continue;
    let g={};
    try{g=sgQuestionLecture('past',q)||{}}catch{}
    if(!g.lecture_id||!g.subject||!g.title)continue;
    const stemKey=gameMockStemKey(q);if(!stemKey||seenStems.has(stemKey))continue;
    seenStems.add(stemKey);
    rows.push({
      key:'past:'+q.id,source:'past',q,
      subject:g.subject,
      lectureId:g.lecture_id,
      lectureTitle:g.title
    });
  }
  try{
    const qs=window.med25GameBridge?.aiQuestions?.()||[];
    for(const q of qs){
      if(!q?.id||!q?.answer||q.exam_ready===false||Object.keys(q.options||{}).length!==4||!Object.prototype.hasOwnProperty.call(q.options||{},q.answer))continue;
      let g={};
      try{g=sgQuestionLecture('ai',q)||{}}catch{}
      if(!g.lecture_id||!g.subject||!g.title)continue;
      const stemKey=gameMockStemKey(q);if(!stemKey||seenStems.has(stemKey))continue;
      seenStems.add(stemKey);
      rows.push({
        key:'ai:'+q.id,source:'ai',q,
        subject:g.subject,
        lectureId:g.lecture_id,
        lectureTitle:g.title
      });
    }
  }catch{}
  return rows;
}
function gameMockAvailableRows(){
  return gameMockQuestionRows().filter(x=>gameMockState.config.includeAI||x.source==='past');
}
function gameMockCatalog(){
  const subjects=new Map();
  for(const x of gameMockAvailableRows()){
    if(!subjects.has(x.subject))subjects.set(x.subject,{subject:x.subject,total:0,past:0,ai:0,lectures:new Map()});
    const s=subjects.get(x.subject);s.total++;s[x.source]++;
    if(!s.lectures.has(x.lectureId))s.lectures.set(x.lectureId,{id:x.lectureId,title:x.lectureTitle,total:0,past:0,ai:0});
    const l=s.lectures.get(x.lectureId);l.total++;l[x.source]++;
  }
  return [...subjects.values()].sort((a,b)=>a.subject.localeCompare(b.subject)).map(x=>({...x,lectures:[...x.lectures.values()].sort((a,b)=>a.title.localeCompare(b.title))}));
}
function gameMockClampConfig(){
  const cat=gameMockCatalog();
  const subjectIds=new Set(cat.map(x=>x.subject));
  Object.keys(gameMockState.config.subjectCounts).forEach(k=>{if(!subjectIds.has(k))delete gameMockState.config.subjectCounts[k]});
  const lectureIds=new Set(cat.flatMap(x=>x.lectures.map(l=>l.id)));
  Object.keys(gameMockState.config.lectureCounts).forEach(k=>{if(!lectureIds.has(k))delete gameMockState.config.lectureCounts[k]});
  for(const s of cat){
    gameMockState.config.subjectCounts[s.subject]=Math.min(s.total,Math.max(0,Number(gameMockState.config.subjectCounts[s.subject]||0)));
    for(const l of s.lectures)gameMockState.config.lectureCounts[l.id]=Math.min(l.total,Math.max(0,Number(gameMockState.config.lectureCounts[l.id]||0)));
  }
}
function gameMockRequestedTotal(){
  return Object.values(gameMockState.config.subjectCounts).reduce((a,b)=>a+Number(b||0),0)+
    Object.values(gameMockState.config.lectureCounts).reduce((a,b)=>a+Number(b||0),0);
}
function gameMockValidation(){
  const cat=gameMockCatalog(),issues=[];
  let total=0;
  for(const s of cat){
    const subjectN=Number(gameMockState.config.subjectCounts[s.subject]||0);
    const lectureN=s.lectures.reduce((sum,l)=>sum+Number(gameMockState.config.lectureCounts[l.id]||0),0);
    const requested=subjectN+lectureN;total+=requested;
    if(requested>s.total)issues.push(s.subject+': requested '+requested+', only '+s.total+' available.');
    for(const l of s.lectures){
      const n=Number(gameMockState.config.lectureCounts[l.id]||0);
      if(n>l.total)issues.push(l.title+': requested '+n+', only '+l.total+' available.');
    }
  }
  if(total<1)issues.push('Choose at least one question.');
  const minutes=Number(gameMockState.config.minutes||0);
  if(minutes<1||minutes>240)issues.push('Choose an exam time between 1 and 240 minutes.');
  return {ok:issues.length===0,issues,total};
}
function gameMockRenderSetup(){
  const host=document.getElementById('mockStage');if(!host)return;
  gameMockClampConfig();
  const cat=gameMockCatalog(),validation=gameMockValidation();
  const sourceText=gameMockState.config.includeAI?'Past Papers + AI Questions':'Past Papers only';
  host.innerHTML=
    '<div class="mockBuilder">'+
      '<section class="mockSetupTop">'+
        '<div><div class="homeCardLabel">CUSTOM MOCK EXAM</div><h2>Build your exam.</h2><p>Choose the time, question source, official subjects, official lectures and exact question counts. IBLS/CVS/Formative are treated only as provenance, never as subjects. Answers stay hidden until you submit.</p></div>'+
      '</section>'+
      '<section class="mockControls">'+
        '<label class="mockField"><span>Exam time</span><div class="mockTimeInput"><input id="mockMinutes" type="number" min="1" max="240" step="1" value="'+Number(gameMockState.config.minutes||30)+'"><b>minutes</b></div></label>'+
        '<div class="mockField"><span>Question source</span><div class="mockSourceChoice">'+
          '<button type="button" data-mock-source="past" class="'+(!gameMockState.config.includeAI?'active':'')+'">Past Papers only</button>'+
          '<button type="button" data-mock-source="both" class="'+(gameMockState.config.includeAI?'active':'')+'">Past + AI</button>'+
        '</div></div>'+
        '<div class="mockSummary"><b id="mockRequested">'+validation.total+'</b><span>questions selected</span><small>'+esc(sourceText)+'</small></div>'+
      '</section>'+
      '<section class="mockMap">'+
        '<div class="mockMapHead"><div><div class="homeCardLabel">EXAM MAP</div><h3>Subjects & lectures</h3><p>Add a subject-wide pool, specific lecture questions, or both.</p></div><button id="mockClearCounts" type="button">Clear all</button></div>'+
        '<div class="mockSubjectList">'+cat.map(sub=>{
          const subjectCount=Number(gameMockState.config.subjectCounts[sub.subject]||0);
          const lectureSelected=sub.lectures.reduce((sum,l)=>sum+Number(gameMockState.config.lectureCounts[l.id]||0),0);
          return '<article class="mockSubjectCard">'+
            '<div class="mockSubjectMain"><div><b>'+esc(sub.subject)+'</b><span>'+sub.total+' available · '+sub.past+' past'+(gameMockState.config.includeAI?' · '+sub.ai+' AI':'')+'</span></div>'+
              '<label><span>Subject pool</span><input type="number" min="0" max="'+sub.total+'" value="'+subjectCount+'" data-mock-subject-count="'+esc(sub.subject)+'"></label>'+
            '</div>'+
            '<details '+(lectureSelected?'open':'')+'><summary>Choose individual lectures <span>'+lectureSelected+' selected</span></summary>'+
              '<div class="mockLectureList">'+sub.lectures.map(l=>
                '<label class="mockLectureRow"><span><b>'+esc(l.title)+'</b><small>'+l.total+' available · '+l.past+' past'+(gameMockState.config.includeAI?' · '+l.ai+' AI':'')+'</small></span>'+
                '<input type="number" min="0" max="'+l.total+'" value="'+Number(gameMockState.config.lectureCounts[l.id]||0)+'" data-mock-lecture-count="'+esc(l.id)+'"></label>'
              ).join('')+'</div>'+
            '</details>'+
          '</article>';
        }).join('')+'</div>'+
      '</section>'+
      '<div class="mockBuildFoot">'+
        '<div class="mockValidation '+(validation.ok?'ok':'bad')+'" id="mockValidation">'+
          (validation.ok?'<b>Ready to build.</b><span>'+validation.total+' questions · '+Number(gameMockState.config.minutes||30)+' minutes · '+esc(sourceText)+'</span>':'<b>Check your setup.</b><span>'+esc(validation.issues.join(' '))+'</span>')+
        '</div>'+
        '<button class="mockStartBtn" id="mockStartBtn" type="button" '+(validation.ok?'':'disabled')+'>Start mock exam →</button>'+
      '</div>'+
    '</div>';
  document.getElementById('mockMinutes').oninput=e=>{gameMockState.config.minutes=Math.min(240,Math.max(1,Number(e.target.value)||1));gameMockRenderSetup()};
  host.querySelectorAll('[data-mock-source]').forEach(btn=>btn.onclick=()=>{
    gameMockState.config.includeAI=btn.dataset.mockSource==='both';gameMockRenderSetup();
  });
  host.querySelectorAll('[data-mock-subject-count]').forEach(inp=>inp.onchange=()=>{
    gameMockState.config.subjectCounts[inp.dataset.mockSubjectCount]=Math.max(0,Number(inp.value)||0);gameMockRenderSetup();
  });
  host.querySelectorAll('[data-mock-lecture-count]').forEach(inp=>inp.onchange=()=>{
    gameMockState.config.lectureCounts[inp.dataset.mockLectureCount]=Math.max(0,Number(inp.value)||0);gameMockRenderSetup();
  });
  document.getElementById('mockClearCounts').onclick=()=>{gameMockState.config.subjectCounts={};gameMockState.config.lectureCounts={};gameMockRenderSetup()};
  document.getElementById('mockStartBtn')?.addEventListener('click',gameMockStart);
}
function gameMockPick(items,n,used){
  const available=gameShuffle(items.filter(x=>!used.has(x.key)));
  const picked=available.slice(0,n);picked.forEach(x=>used.add(x.key));return picked;
}
function gameMockBuildSelection(){
  const rows=gameMockAvailableRows(),cat=gameMockCatalog(),used=new Set(),selected=[];
  for(const s of cat){
    for(const l of s.lectures){
      const n=Number(gameMockState.config.lectureCounts[l.id]||0);
      if(n>0)selected.push(...gameMockPick(rows.filter(x=>x.subject===s.subject&&x.lectureId===l.id),n,used));
    }
    const n=Number(gameMockState.config.subjectCounts[s.subject]||0);
    if(n>0)selected.push(...gameMockPick(rows.filter(x=>x.subject===s.subject),n,used));
  }
  return gameShuffle(selected);
}
function gameMockStart(){
  const validation=gameMockValidation();if(!validation.ok){gameMockRenderSetup();return}
  const questions=gameMockBuildSelection();
  if(questions.length!==validation.total){
    const host=document.getElementById('mockStage');
    if(host)host.insertAdjacentHTML('afterbegin','<div class="mockInlineError">Could not build that exact mix without repeating questions. Reduce one of the overlapping subject/lecture counts.</div>');
    return;
  }
  const now=Date.now(),minutes=Number(gameMockState.config.minutes||30);
  gameMockState.exam={questions,answers:{},index:0,startedAt:now,endsAt:now+minutes*60000,submitted:false,submittedAt:null};
  gameMockStartTimer();
  gameMockRenderExam();
  try{trackEvent('section_view',{metadata:{section:'mock_exam_started',questions:questions.length,minutes,include_ai:gameMockState.config.includeAI}})}catch{}
}
function gameMockStartTimer(){
  clearInterval(gameMockState.timer);
  gameMockState.timer=setInterval(()=>{
    const exam=gameMockState.exam;if(!exam||exam.submitted){clearInterval(gameMockState.timer);return}
    if(Date.now()>=exam.endsAt){gameMockSubmit(true);return}
    gameMockUpdateTimer();
  },1000);
  gameMockUpdateTimer();
}
function gameMockTimeText(ms){
  const sec=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(sec/60),s=sec%60;
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}
function gameMockUpdateTimer(){
  const exam=gameMockState.exam,el=document.getElementById('mockTimer');
  if(exam&&el)el.textContent=gameMockTimeText(exam.endsAt-Date.now());
}
function gameMockRenderExam(){
  const host=document.getElementById('mockStage'),exam=gameMockState.exam;if(!host||!exam)return;
  if(exam.submitted)return gameMockRenderResults();
  const item=exam.questions[exam.index],q=item.q,selected=exam.answers[item.key]||'';
  const answered=Object.keys(exam.answers).length;
  host.innerHTML=
    '<div class="mockExamShell">'+
      '<div class="mockExamTop"><div><span class="mockExamLabel">MOCK EXAM</span><b>'+answered+'/'+exam.questions.length+' answered</b></div>'+
      '<div class="mockTimerBox"><span>Time left</span><strong id="mockTimer">'+gameMockTimeText(exam.endsAt-Date.now())+'</strong></div>'+
      '<button id="mockFinishBtn" class="mockFinishBtn" type="button">Finish exam</button></div>'+
      '<div class="mockProgress"><span style="width:'+Math.round((exam.index+1)/exam.questions.length*100)+'%"></span></div>'+
      '<div class="mockQuestionMap">'+exam.questions.map((x,i)=>'<button type="button" data-mock-jump="'+i+'" class="'+(i===exam.index?'current ':'')+(exam.answers[x.key]?'answered':'')+'">'+(i+1)+'</button>').join('')+'</div>'+
      '<article class="mockQuestionCard">'+
        '<div class="mockQuestionMeta"><span>'+(item.source==='ai'?'AI Question':'Past Paper')+'</span><span>'+esc(item.subject)+'</span><span>'+esc(item.lectureTitle)+'</span><b>Question '+(exam.index+1)+' of '+exam.questions.length+'</b></div>'+
        '<h3>'+esc(q.stem||'')+'</h3>'+
        '<div class="mockOptions">'+Object.entries(q.options||{}).map(([k,v])=>
          '<button type="button" data-mock-answer="'+esc(k)+'" class="mockOption '+(selected===k?'selected':'')+'"><span>'+esc(k)+'</span><b>'+esc(v)+'</b></button>'
        ).join('')+'</div>'+
      '</article>'+
      '<div class="mockExamNav"><button id="mockPrev" type="button" '+(exam.index===0?'disabled':'')+'>← Previous</button><button id="mockNext" type="button">'+(exam.index===exam.questions.length-1?'Review map':'Next →')+'</button></div>'+
    '</div>';
  host.querySelectorAll('[data-mock-answer]').forEach(btn=>btn.onclick=()=>{
    exam.answers[item.key]=btn.dataset.mockAnswer;gameMockRenderExam();
  });
  host.querySelectorAll('[data-mock-jump]').forEach(btn=>btn.onclick=()=>{exam.index=Number(btn.dataset.mockJump);gameMockRenderExam()});
  document.getElementById('mockPrev').onclick=()=>{if(exam.index>0){exam.index--;gameMockRenderExam()}};
  document.getElementById('mockNext').onclick=()=>{if(exam.index<exam.questions.length-1)exam.index++;gameMockRenderExam()};
  document.getElementById('mockFinishBtn').onclick=()=>gameMockSubmit(false);
  gameMockUpdateTimer();
}
function gameMockSubmit(auto=false){
  const exam=gameMockState.exam;if(!exam||exam.submitted)return;
  if(!auto){
    const unanswered=exam.questions.filter(x=>!exam.answers[x.key]).length;
    const msg=unanswered?'You still have '+unanswered+' unanswered question'+(unanswered===1?'':'s')+'. Finish anyway?':'Submit this mock exam?';
    if(!confirm(msg))return;
  }
  exam.submitted=true;exam.submittedAt=Date.now();exam.autoSubmitted=auto;
  clearInterval(gameMockState.timer);
  const sc=gameMockScore();
  gameMockRenderResults();
  try{trackEvent('section_view',{metadata:{section:'mock_exam_finished',questions:exam.questions.length,score:gameMockScore().correct,auto_submit:auto}})}catch{}
}
function gameMockScore(){
  const exam=gameMockState.exam;if(!exam)return {correct:0,wrong:0,unanswered:0,total:0,pct:0};
  let correct=0,wrong=0,unanswered=0;
  for(const item of exam.questions){
    const pick=exam.answers[item.key];
    if(!pick)unanswered++;else if(pick===item.q.answer)correct++;else wrong++;
  }
  const total=exam.questions.length,pct=total?Math.round(correct/total*100):0;
  return {correct,wrong,unanswered,total,pct};
}
function gameMockRenderResults(){
  const host=document.getElementById('mockStage'),exam=gameMockState.exam;if(!host||!exam)return;
  const sc=gameMockScore();
  host.innerHTML=
    '<div class="mockResults">'+
      '<section class="mockResultHero"><div><span class="mockExamLabel">RESULT</span><h2>'+sc.pct+'%</h2><p>'+sc.correct+' correct · '+sc.wrong+' wrong · '+sc.unanswered+' unanswered'+(exam.autoSubmitted?' · time expired':'')+'</p></div>'+
      '<button id="mockBuildAnother" type="button">Build another exam</button></section>'+
      '<div class="mockResultStats"><div><b>'+sc.correct+'</b><span>Correct</span></div><div><b>'+sc.wrong+'</b><span>Wrong</span></div><div><b>'+sc.unanswered+'</b><span>Unanswered</span></div><div><b>'+sc.total+'</b><span>Total</span></div></div>'+
      '<p class="mockNoPoints">Mock exams are for practice only and do not award bonus XP.</p>'+
      '<section class="mockReview"><div class="homeCardLabel">REVIEW</div>'+
      exam.questions.map((item,i)=>{
        const q=item.q,pick=exam.answers[item.key]||'',ok=pick===q.answer;
        return '<article class="mockReviewCard '+(pick?(ok?'correct':'wrong'):'unanswered')+'">'+
          '<div class="mockReviewTop"><b>Q'+(i+1)+' · '+(item.source==='ai'?'AI':'Past Paper')+'</b><span>'+esc(item.lectureTitle)+'</span></div>'+
          '<h3>'+esc(q.stem||'')+'</h3>'+
          '<p><b>Your answer:</b> '+(pick?esc(pick+' · '+(q.options?.[pick]||'')):'Unanswered')+'</p>'+
          '<p><b>Correct answer:</b> '+esc(q.answer+' · '+(q.options?.[q.answer]||''))+'</p>'+
          (q.explanation||q.rationale?'<small>'+esc(q.explanation||q.rationale)+'</small>':'')+
        '</article>';
      }).join('')+'</section>'+
    '</div>';
  document.getElementById('mockBuildAnother').onclick=()=>{gameMockState.exam=null;gameMockRenderSetup()};
}
function gameInstallMockSection(){
  if(document.getElementById('mockSection'))return;
  const quiz=document.getElementById('quizSection'),flash=document.getElementById('flashcardsSection');
  const parent=quiz?.parentNode||flash?.parentNode;if(!parent)return;
  const section=document.createElement('section');
  section.id='mockSection';section.className='mockSection hidden';
  section.innerHTML='<div id="mockStage"></div>';
  if(flash)parent.insertBefore(section,flash);else parent.appendChild(section);
}
function gameSwitchMock(){
  gameInstallMockSection();
  const mock=document.getElementById('mockSection');if(!mock)return;
  document.getElementById('homeSection')?.classList.add('hidden');
  document.getElementById('questionSection')?.classList.add('hidden');
  document.getElementById('aiSection')?.classList.add('hidden');
  document.getElementById('flashcardsSection')?.classList.add('hidden');
  document.getElementById('quizSection')?.classList.add('hidden');
  mock.classList.remove('hidden');
  ['tabHome','tabQuestions','tabAI','tabQuiz','tabFlashcards'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
  document.getElementById('tabMock')?.classList.add('active');
  document.getElementById('stats')?.classList.add('hidden');
  document.getElementById('questionProgressBar')?.classList.add('hidden');
  document.getElementById('flashHeroStats')?.classList.add('hidden');
  document.body.classList.remove('homeMode');
  const h=document.getElementById('heroTitle'),p=document.getElementById('heroDescription');
  if(h)h.textContent='MED25 Mock Exam';
  if(p)p.textContent='Build a timed custom exam from Past Papers, AI Questions, or both.';
  try{localStorage.setItem(GAME_SECTION_KEY,'mock')}catch{}
  try{trackEvent('section_view',{metadata:{section:'mock_exam'}})}catch{}
  if(gameMockState.exam)gameMockState.exam.submitted?gameMockRenderResults():gameMockRenderExam();
  else gameMockRenderSetup();
}
function gameLeaveMockUI(){
  document.getElementById('mockSection')?.classList.add('hidden');
  document.getElementById('tabMock')?.classList.remove('active');
}

function gameEnterQuiz(){
  gameBuildQuizQueue();
  gameRenderQuiz();
}

function gameSwitchQuiz(){
  gameInstallQuizSection();
  const quizSection=document.getElementById('quizSection');
  if(!quizSection)return;
  document.getElementById('homeSection')?.classList.add('hidden');
  document.getElementById('questionSection')?.classList.add('hidden');
  document.getElementById('aiSection')?.classList.add('hidden');
  document.getElementById('flashcardsSection')?.classList.add('hidden');
  document.getElementById('mockSection')?.classList.add('hidden');
  quizSection.classList.remove('hidden');
  ['tabHome','tabQuestions','tabAI','tabMock','tabFlashcards'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
  document.getElementById('tabQuiz')?.classList.add('active');
  document.getElementById('stats')?.classList.add('hidden');
  document.getElementById('questionProgressBar')?.classList.add('hidden');
  document.getElementById('flashHeroStats')?.classList.add('hidden');
  document.body.classList.remove('homeMode');
  const h=document.getElementById('heroTitle'),p=document.getElementById('heroDescription');
  if(h)h.textContent='MED25 Mistake Quiz';
  if(p)p.textContent='Fresh retries of the Past Paper and AI questions you previously got wrong.';
  try{localStorage.setItem(GAME_SECTION_KEY,'quiz')}catch{}
  try{trackEvent('section_view',{metadata:{section:'quiz'}})}catch{}
  gameEnterQuiz();
}

function gameLeaveQuizUI(){
  document.getElementById('quizSection')?.classList.add('hidden');
  document.getElementById('tabQuiz')?.classList.remove('active');
}
function gameBindQuizNavigation(){
  const nav=document.getElementById('studyTabs');
  if(!nav||nav.dataset.gameQuizDelegated==='1')return;
  nav.dataset.gameQuizDelegated='1';
  nav.addEventListener('click',e=>{
    const quiz=e.target?.closest?.('#tabQuiz');
    const mock=e.target?.closest?.('#tabMock');
    if(!quiz&&!mock)return;
    e.preventDefault();
    e.stopPropagation();
    if(quiz)gameSwitchQuiz();else gameSwitchMock();
  },true);
}
function gamePatchNavigation(){
  gameInstallNav();
  gameInstallQuizSection();
  gameInstallMockSection();
  gameBindQuizNavigation();
  const quizBtn=document.getElementById('tabQuiz');
  if(quizBtn){
    quizBtn.disabled=false;
    quizBtn.removeAttribute('aria-disabled');
    quizBtn.onclick=()=>gameSwitchQuiz();
  }
  const mockBtn=document.getElementById('tabMock');
  if(mockBtn){
    mockBtn.disabled=false;
    mockBtn.removeAttribute('aria-disabled');
    mockBtn.onclick=()=>gameSwitchMock();
  }
  ['tabHome','tabQuestions','tabAI','tabFlashcards'].forEach(id=>{
    const btn=document.getElementById(id);
    if(btn&&!btn.dataset.gameQuizExitBound){
      btn.dataset.gameQuizExitBound='1';
      btn.addEventListener('click',()=>{gameLeaveQuizUI();gameLeaveMockUI()},{capture:true});
    }
  });
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
  // AI answers are reported through the study-hub bridge because answerAI lives in that module's private scope.
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
  gameInstallMockSection();
  gameInstallHome();
  gamePatchNavigation();
  gameBindQuizNavigation();
  gamePatchScoring();
  gamePatchAuth();
  gamePatchHome();
  gameNormalizeIcons();
  gameUpdateQuizBadge();
  gameRenderProfile();
  gameLoadLeaderboard();
  setTimeout(gameSyncAuth,300);
  setTimeout(()=>{gameNormalizeIcons();gameUpdateQuizBadge()},1200);
  window.med25GameRecordAttempt=gameRecordAttempt;
  window.med25GameUpdateQuizBadge=gameUpdateQuizBadge;
  window.med25GameRefreshQuiz=()=>{
    gameUpdateQuizBadge();
    if(!document.getElementById('quizSection')?.classList.contains('hidden')){
      gameBuildQuizQueue();
      gameRenderQuiz();
    }
  };
  const stored=localStorage.getItem(GAME_SECTION_KEY);
  if(stored==='quiz')setTimeout(gameSwitchQuiz,0);
  if(stored==='mock')setTimeout(gameSwitchMock,0);
}


window.med25GameOpenQuiz=gameSwitchQuiz;
window.med25GameOpenMock=gameSwitchMock;
try{gameInit()}catch(e){console.error('MED25 game layer failed',e)}

})();