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
let gameLeaderboardExpanded=false;
let gameQuizState={queue:[],index:0,result:null,shuffle:false};
let gameMockState={config:{minutes:30,includeAI:true,subjectCounts:{},lectureCounts:{}},exam:null,timer:null};
const GAME_MOCK_KEY='med25-active-mock-v1';
let gameMockRestorePending=true;
function gameMockSave(){
  try{
    const e=gameMockState.exam;
    if(!e){sessionStorage.removeItem(GAME_MOCK_KEY);return}
    sessionStorage.setItem(GAME_MOCK_KEY,JSON.stringify({version:1,config:gameMockState.config,exam:{...e,questions:e.questions.map(x=>x.key)}}));
  }catch(e){console.warn('Could not save mock session',e)}
}
function gameMockRestore(){
  if(!gameMockRestorePending||!window.med25GameBridge?.studyLibrariesReady?.())return;
  gameMockRestorePending=false;
  try{
    const stored=JSON.parse(sessionStorage.getItem(GAME_MOCK_KEY)||'null');
    if(!stored||stored.version!==1)return;
    const e=stored.exam,pool=new Map(gameMockQuestionRows().map(x=>[x.key,x]));
    if(!e||!Array.isArray(e.questions)||!e.questions.length||!Number.isFinite(e.endsAt))throw new Error('Invalid saved mock');
    const questions=[],answers={},seen=new Set();
    for(const oldKey of e.questions){
      const resolved=gameResolveQuizKey(oldKey),item=resolved&&pool.get(resolved.key);
      if(!item)throw new Error('Saved mock content has changed');
      if(!seen.has(item.key)){questions.push(item);seen.add(item.key);}
      let pick=e.answers?.[oldKey];
      if(oldKey!==item.key){
        const [kind,id]=oldKey.split(':');
        const alias=kind==='past'?PAST_QUESTION_ALIASES[id]:AI_TO_PAST_ALIASES[id];
        const text=alias?.options?.[pick];
        pick=alias?.option_map?.[pick]||(text?Object.entries(item.q.options).find(([,v])=>String(v).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'')===String(text).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,''))?.[0]:null);
      }
      if(!Object.hasOwn(answers,item.key)&&Object.hasOwn(item.q.options,pick))answers[item.key]=pick;
    }
    gameMockState.exam={...e,...(!e.submitted&&!e.xpEnabled?{xpEnabled:true,xpOwner:currentUser?.id||'guest'}:{}),questions,answers,index:Math.min(questions.length-1,Math.max(0,Math.trunc(e.index)||0))};
    if(stored.config)gameMockState.config=stored.config;
    if(!e.submitted){if(Date.now()>=e.endsAt)gameMockSubmit(true);else gameMockStartTimer()}else gameMockScoreXP();
  }catch(e){sessionStorage.removeItem(GAME_MOCK_KEY);console.warn('Saved mock could not be restored',e)}
}

function gameSvg(name){
  const icons={
    home:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
    past:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h12v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    ai:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8 13.8 8l5.2 1.8-5.2 1.8L12 17l-1.8-5.4L5 9.8 10.2 8z"/><path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/></svg>',
    quiz:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5h14v17H5z"/><path d="m8.5 9 1.5 1.5L13 7.5"/><path d="M8.5 15h7"/></svg>',
    mock:'<svg class="navSvg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v3H7z"/><path d="M5 6.5h14v14H5z"/><path d="M8.5 11h7M8.5 15h4"/></svg>',
  };
  return icons[name]||'';
}

function gameNormalizeIcons(){
  const map={tabHome:'home',tabQuestions:'past',tabAI:'ai',tabQuiz:'quiz',tabMock:'mock'};
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
  const anchor=document.getElementById('aiSection');
  if(!anchor)return;
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
  anchor.parentNode.insertBefore(section,anchor);
  document.getElementById('quizShuffleBtn').onclick=()=>{
    gameQuizState.shuffle=!gameQuizState.shuffle;
    gameBuildQuizQueue();
    gameRenderQuiz();
  };
}

function gameInstallHome(){
  const slot=document.getElementById('profileGameSlot')||document.getElementById('homeAuthSlot');
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
      '<div id="gameLeaderboardPrivacy" class="gameLeaderboardPrivacy"></div>'+
      '<div class="gameLeaderboardTabs"><button type="button" data-xp-board="weekly" class="active">Weekly</button><button type="button" data-xp-board="monthly">Monthly</button><button type="button" data-xp-board="all">All-time</button></div>'+
      '<div class="gameLeaderboardMeta" id="gameLeaderboardMeta">Loading XP rankings…</div>'+
      '<div id="gameLeaderboardList" class="gameLeaderboardList"><div class="gameEmpty">Loading leaderboard…</div></div>';
    const overall=document.querySelector('.homeOverall');
    if(overall?.nextSibling)grid.insertBefore(card,overall.nextSibling);else grid.appendChild(card);
    document.getElementById('gameLeaderboardRefresh').onclick=()=>gameLoadLeaderboard(true);
    gameRenderLeaderboardPrivacy();
    card.querySelectorAll('[data-xp-board]').forEach(btn=>btn.onclick=()=>{
      gameLeaderboardMode=btn.dataset.xpBoard;
      card.querySelectorAll('[data-xp-board]').forEach(x=>x.classList.toggle('active',x===btn));
      gameRenderLeaderboard();
    });
  }
}

function gameRenderLeaderboardPrivacy(){
  const host=document.getElementById('gameLeaderboardPrivacy');
  if(!host)return;
  if(!currentUser){
    host.innerHTML='<div class="gameLeaderboardPrivacyGuest"><span><b>Leaderboard visibility</b><small>Sign in to control whether your account appears in rankings.</small></span><em>SIGN IN</em></div>';
    return;
  }
  if(!gameProfile){
    host.innerHTML='<div class="gameLeaderboardPrivacyGuest"><span><b>Leaderboard visibility</b><small>Loading your privacy setting…</small></span><em>…</em></div>';
    return;
  }
  const hidden=!gameProfile.leaderboard_visible;
  host.innerHTML=
    '<label class="gameLeaderboardPrivacyToggle">'+
      '<span class="gameLeaderboardPrivacyCopy"><span class="gameLeaderboardPrivacyTitle"><b>Hide me from leaderboard</b><em class="'+(hidden?'hidden':'visible')+'">'+(hidden?'HIDDEN':'VISIBLE')+'</em></span>'+
      '<small>'+(hidden?'You are hidden from MED25 rankings. Your XP and study progress are still saved.':'Your account is currently shown in MED25 rankings. Turn this on to hide it.')+'</small></span>'+
      '<input id="gameLeaderboardHiddenHome" type="checkbox" '+(hidden?'checked':'')+' aria-label="Hide me from leaderboard">'+
      '<i></i>'+
    '</label>'+
    '<div class="gameLeaderboardPrivacyStatus" id="gameLeaderboardPrivacyStatus"></div>';
  document.getElementById('gameLeaderboardHiddenHome').onchange=e=>gameSetLeaderboardVisibility(!e.target.checked,'home');
}

function gameSetLeaderboardPrivacyStatus(msg,error=false){
  const el=document.getElementById('gameLeaderboardPrivacyStatus');
  if(el){el.textContent=msg||'';el.classList.toggle('error',!!error)}
}

async function gameSetLeaderboardVisibility(visible,source='home'){
  if(!currentUser||!gameProfile||!authSession?.access_token)return;
  gameSetLeaderboardPrivacyStatus(visible?'Showing you on leaderboard…':'Hiding you from leaderboard…');
  const res=await supaFetch('/rest/v1/game_profiles?user_id=eq.'+encodeURIComponent(currentUser.id),{
    method:'PATCH',
    headers:{Prefer:'return=representation'},
    body:JSON.stringify({leaderboard_visible:!!visible,updated_at:new Date().toISOString()})
  });
  if(!res.ok){
    gameSetLeaderboardPrivacyStatus('Could not change leaderboard visibility.',true);
    console.warn(await res.text());
    gameRenderLeaderboardPrivacy();
    return;
  }
  const rows=await res.json();
  if(rows[0])gameProfile=rows[0];
  if(visible)await gameActivateLeaderboard();
  gameRenderProfile();
  gameRenderLeaderboardPrivacy();
  gameSetLeaderboardPrivacyStatus(visible?'You are visible on the leaderboard.':'You are hidden from the leaderboard.');
  await gameLoadLeaderboard(true);
}

function gameDefaultIconColor(profile){
  const palette=['#315bd6','#7c3aed','#be185d','#0f766e','#b45309','#334155'];
  const name=String(profile?.username||'MED25').normalize('NFKC').toLowerCase();
  let hash=2166136261;
  for(const letter of name)hash=Math.imul(hash^letter.codePointAt(0),16777619)>>>0;
  return palette[hash%palette.length];
}

function gameAvatarMarkup(profile,size='normal'){
  const username=profile?.username||'MED25';
  const initials=(username.replace(/[^A-Za-z0-9]/g,'').slice(0,2)||'M').toUpperCase();
  const custom=gameSavedIconSettings(profile);
  if(profile?.avatar_url&&!custom){
    return '<span class="gameAvatar '+size+'"><img src="'+esc(profile.avatar_url)+'" alt="" loading="lazy" decoding="async"></span>';
  }
  const color=custom?.color||gameDefaultIconColor(profile),letters=custom?.letters||initials,textColor=gameIconTextColor(color);
  return '<span class="gameAvatar '+size+'" data-letter-icon style="--icon-bg:'+color+';--icon-text:'+textColor+';background:'+color+';color:'+textColor+'"><span class="gameAvatarLetters">'+esc(letters)+'</span></span>';
}

function gameLevelInfo(xp){
  xp=Math.max(0,Number(xp||0));
  let level=Math.min(50,Math.floor(Math.sqrt(xp/12))+1);
  const floor=12*Math.pow(level-1,2),next=level>=50?floor:12*Math.pow(level,2);
  const pct=level>=50?100:Math.max(0,Math.min(100,Math.round((xp-floor)/(next-floor)*100)));
  const title=level>=50?'MED25 Legend':level>=40?'Professor':level>=30?'Consultant':level>=20?'Fellow':level>=10?'Resident':level>=5?'Clerk':'Med Student';
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
      '<button class="gameAvatarButton" id="gameAvatarButton" type="button" aria-label="Customize account icon">'+gameAvatarMarkup(gameProfile,'large')+'<span>Customize</span></button>'+
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
  document.getElementById('gameAvatarButton').onclick=gameOpenAvatarEditor;
  document.getElementById('gameAvatarInput').onchange=gameUploadAvatar;
  document.getElementById('gamePointsInfoBtn')?.addEventListener('click',gameOpenPointsInfo);
  gameRenderLeaderboardPrivacy();
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
    modal.innerHTML='<div class="gamePointsInfoBackdrop" data-close-points-info></div><div class="gamePointsInfoCard"><div class="gamePointsInfoHead"><div><span class="gameMiniLabel">MED25 XP</span><h3 id="gamePointsInfoTitle">How XP works</h3></div><button class="gamePointsInfoClose" type="button" data-close-points-info aria-label="Close">×</button></div><p class="gamePointsInfoIntro">Earn XP by studying, improving and staying accurate. Every section can earn XP, including revision and submitted mocks. Each question earns its first-attempt XP once across all sections. Repeated answers do not earn duplicate XP.</p><div class="gamePointsInfoRules"><div><b>+7 XP</b><span>Correct Past Paper</span></div><div><b>+5 XP</b><span>Correct AI question</span></div><div><b>+1 XP</b><span>Wrong first attempt</span></div><div><b>+8 XP</b><span>Recover a previous mistake</span></div></div><div class="gamePointsInfoNote"><b>🔥 Correct-answer streak multipliers</b><span>5 = 1.1× · 10 = 1.25× · 20 = 1.5× · 30 = 2×. A wrong answer resets the streak.</span></div><div class="gamePointsInfoNote"><b>🏆 Rankings</b><span>Weekly, Monthly and All-Time leaderboards. Weekly XP runs Sunday–Saturday and resets Sunday at 12:00 AM Saudi time. Monthly XP resets each calendar month; your total XP and level never reset.</span></div><p class="gamePointsInfoFooter">Study. Improve. Level up. 🧠🔥</p></div>';
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

function gameDefaultUsername(user,fallback=false){
  const rawLocal=String(user?.email||'').split('@')[0];
  const clean=rawLocal.replace(/[^A-Za-z0-9_.-]+/g,'_').replace(/^[._-]+|[._-]+$/g,'');
  const id=String(user?.id||'').replace(/-/g,'');
  if(fallback){
    const stem=(clean||id||'student').slice(0,11);
    return 'MED25_'+stem+'_'+(id.slice(0,6)||'user01');
  }
  return 'MED25_'+(clean||id||'student').slice(0,18);
}

async function gameEnsureProfile(){
  if(!currentUser||!authSession?.access_token)return null;
  const res=await supaFetch('/rest/v1/game_profiles?user_id=eq.'+encodeURIComponent(currentUser.id)+'&select=*');
  if(!res.ok)throw new Error(await res.text());
  let rows=await res.json();
  if(!rows.length){
    let username=gameDefaultUsername(currentUser);
    let create=await supaFetch('/rest/v1/game_profiles',{
      method:'POST',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify({user_id:currentUser.id,username,leaderboard_visible:true})
    });
    if(create.status===409){
      username=gameDefaultUsername(currentUser,true);
      create=await supaFetch('/rest/v1/game_profiles',{
        method:'POST',
        headers:{Prefer:'return=representation'},
        body:JSON.stringify({user_id:currentUser.id,username,leaderboard_visible:true})
      });
    }
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


function gameIconTextColor(hex){
  const rgb=hex.match(/[a-f\d]{2}/gi).map(v=>parseInt(v,16)/255);
  const l=rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
  return (l+.05)/.05>=1.05/(l+.05)?'#000000':'#ffffff';
}
function gameSavedIconSettings(profile){
  try{
    const data=JSON.parse(new URLSearchParams(new URL(profile?.avatar_url).hash.slice(1)).get('med25-icon'));
    if(/^[\p{L}\p{N}]{1,3}$/u.test(data.letters)&&/^#[a-f\d]{6}$/i.test(data.color))return data;
  }catch{}
  return null;
}
function gameIconSettings(profile){
  return gameSavedIconSettings(profile)||{letters:Array.from((profile?.username||'M').replace(/[^\p{L}\p{N}]/gu,'')).slice(0,2).join('').toUpperCase()||'M',color:gameDefaultIconColor(profile)};
}
function gameAvatarEditorStatus(message,error=false){
  gameSetProfileStatus(message,error);
  const el=document.getElementById('gameIconStatus');if(el){el.textContent=message;el.classList.toggle('error',error)}
}
function gameOpenAvatarEditor(){
  if(!currentUser||!gameProfile)return;
  let dialog=document.getElementById('gameIconDialog');
  if(!dialog){
    dialog=document.createElement('dialog');dialog.id='gameIconDialog';dialog.className='gameIconDialog';
    dialog.setAttribute('aria-labelledby','gameIconTitle');
    dialog.innerHTML=`<h2 id="gameIconTitle">Customize your icon</h2><p>Choose letters and a color, or use a photo.</p>
      <div id="gameIconPreview" class="gameIconPreview" aria-label="Icon preview"></div>
      <label for="gameIconLetters">Icon letters</label><input id="gameIconLetters" type="text" maxlength="3" autocomplete="off" spellcheck="false" aria-describedby="gameIconHint">
      <small id="gameIconHint">Use 1–3 letters or numbers. Your username stays the same.</small>
      <label for="gameIconColor">Icon color</label><div class="gameIconColors"><div id="gameIconSwatches"></div><input id="gameIconColor" type="color" aria-label="Choose a custom icon color"></div>
      <small>Letter color adjusts automatically for readability.</small>
      <p id="gameIconStatus" role="status" aria-live="polite"></p>
      <div class="gameIconActions"><button type="button" id="gameIconCancel">Cancel</button><button type="button" id="gameIconSave">Save initials icon</button></div>
      <div class="gameIconPhoto"><span>Prefer a picture?</span><button type="button" id="gameIconPhoto">Choose a photo</button><small>JPG, PNG or WebP · up to 2 MB</small></div>`;
    document.body.appendChild(dialog);
    const swatches=[['Blue','#315bd6'],['Purple','#7c3aed'],['Rose','#be185d'],['Teal','#0f766e'],['Amber','#b45309'],['Slate','#334155']];
    document.getElementById('gameIconSwatches').innerHTML=swatches.map(([name,color])=>'<button type="button" data-icon-color="'+color+'" style="--icon-swatch:'+color+'" aria-label="'+name+' icon" aria-pressed="false"></button>').join('');
    dialog.addEventListener('cancel',e=>{if(dialog.dataset.saving==='true')e.preventDefault()});
    document.getElementById('gameIconCancel').onclick=()=>dialog.close();
    const preview=()=>{
      const letters=document.getElementById('gameIconLetters').value.trim().toUpperCase(),color=document.getElementById('gameIconColor').value;
      const valid=/^[\p{L}\p{N}]{1,3}$/u.test(letters),el=document.getElementById('gameIconPreview');
      el.textContent=letters||'M';el.style.background=color;el.style.color=gameIconTextColor(color);
      document.getElementById('gameIconSave').disabled=!valid||dialog.dataset.saving==='true';
      document.getElementById('gameIconLetters').setAttribute('aria-invalid',String(!valid));
      dialog.querySelectorAll('[data-icon-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.iconColor===color)));
    };
    document.getElementById('gameIconLetters').oninput=preview;document.getElementById('gameIconColor').oninput=preview;
    dialog.querySelectorAll('[data-icon-color]').forEach(b=>b.onclick=()=>{document.getElementById('gameIconColor').value=b.dataset.iconColor;preview()});
    document.getElementById('gameIconPhoto').onclick=()=>document.getElementById('gameAvatarInput')?.click();
    document.getElementById('gameIconSave').onclick=async()=>{
      const letters=document.getElementById('gameIconLetters').value.trim().toUpperCase(),color=document.getElementById('gameIconColor').value;
      if(!/^[\p{L}\p{N}]{1,3}$/u.test(letters))return;
      gameSetIconBusy(true);
      try{
        const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
        const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,512,512);ctx.fillStyle=gameIconTextColor(color);
        ctx.font='700 '+(Array.from(letters).length===3?190:230)+'px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(letters,256,270,440);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('Could not create the icon. Please try again.');
        await gameStoreAvatar(blob,'#med25-icon='+encodeURIComponent(JSON.stringify({letters,color})));
      }catch(e){gameAvatarEditorStatus(e.message||'Could not save icon. Please try again.',true)}finally{gameSetIconBusy(false)}
    };
    dialog.updateIconPreview=preview;
  }
  const settings=gameIconSettings(gameProfile);
  document.getElementById('gameIconLetters').value=settings.letters;document.getElementById('gameIconColor').value=settings.color;
  document.getElementById('gameIconStatus').textContent='';gameSetIconBusy(false);dialog.updateIconPreview();
  if(!dialog.open)dialog.showModal();document.getElementById('gameIconLetters').focus();
}
function gameSetIconBusy(busy){
  const dialog=document.getElementById('gameIconDialog');if(!dialog)return;
  dialog.dataset.saving=String(busy);dialog.setAttribute('aria-busy',String(busy));
  dialog.querySelectorAll('button,input').forEach(el=>el.disabled=busy);
  if(!busy)dialog.updateIconPreview?.();
}
async function gameStoreAvatar(file,suffix=''){
  if(!currentUser||!authSession?.access_token)throw new Error('Please sign in again to save your icon.');
  const owner=currentUser.id;gameAvatarEditorStatus('Saving icon…');
  const objectPath=encodeURIComponent(owner)+'/avatar';
  const res=await fetch(SUPA_URL+'/storage/v1/object/avatars/'+objectPath,{
    method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+authSession.access_token,'Content-Type':file.type,'x-upsert':'true','cache-control':'3600'},body:file
  });
  if(!res.ok)throw new Error('Could not upload your icon. Please try again.');
  if(currentUser?.id!==owner)throw new Error('Your account changed. Open your profile again.');
  const avatarUrl=SUPA_URL+'/storage/v1/object/public/avatars/'+objectPath+'?v='+Date.now()+suffix;
  const saveRes=await supaFetch('/rest/v1/game_profiles?user_id=eq.'+encodeURIComponent(owner),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({avatar_url:avatarUrl,updated_at:new Date().toISOString()})});
  if(!saveRes.ok)throw new Error('Icon uploaded, but your profile could not be updated. Please try saving again.');
  const rows=await saveRes.json();if(currentUser?.id!==owner)return;
  if(!rows[0])throw new Error('Your profile could not be updated. Please sign in again.');
  gameProfile=rows[0];document.getElementById('gameIconDialog')?.close();gameRenderProfile();document.getElementById('gameAvatarButton')?.focus();gameSetProfileStatus('Icon saved ✓');gameLoadLeaderboard(true);
}

async function gameUploadAvatar(e){
  const file=e.target.files?.[0];
  if(!file||!currentUser||!authSession?.access_token)return;
  if(file.size>2*1024*1024){gameAvatarEditorStatus('Profile picture must be 2 MB or smaller.',true);return}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){gameAvatarEditorStatus('Use a JPG, PNG or WebP image.',true);return}
  gameSetIconBusy(true);
  try{await gameStoreAvatar(file)}catch(error){gameAvatarEditorStatus(error.message||'Could not upload profile picture.',true)}finally{gameSetIconBusy(false);e.target.value=''}
}

function gameHistoricalAttempts(){
  if(!currentUser)return [];
  const candidates=[];
  for(const q of QUESTIONS){const p=saved[q.id];if(typeof p?.correct==='boolean')candidates.push({source:'past',question_id:q.id,correct:p.correct,at:p.locked_at||''})}
  try{
    const p=window.med25GameBridge?.aiProgress?.()||{};
    for(const q of window.med25GameBridge?.aiQuestions?.()||[]){if(typeof p[q.id]?.correct==='boolean')candidates.push({source:'ai',question_id:q.id,correct:p[q.id].correct,at:p[q.id].locked_at||''})}
  }catch{}
  for(const [key,history] of Object.entries(saved.__revision_practice__||{})){
    const p=history.xp_first_attempt,[source,id]=key.split(':');
    if(!p||!GAME_SCOREABLE_SOURCES.has(source)||typeof p.correct!=='boolean'||(p.owner&&p.owner!=='guest'&&p.owner!==currentUser.id))continue;
    candidates.push({source,question_id:id,correct:p.correct,at:p.locked_at||''});
  }
  const unique=new Map();
  for(const row of candidates.sort((a,b)=>String(a.at).localeCompare(String(b.at)))){const key=row.source+':'+row.question_id;if(!unique.has(key))unique.set(key,{user_id:currentUser.id,source:row.source,question_id:row.question_id,correct:row.correct})}
  return [...unique.values()];
}

// Revision and submitted mocks share the same question identity and durable XP queue as bank practice.
function gameRecordPracticeAttempt(source,id,selected,mode){
  const item=gameResolveQuizKey(source+':'+id);
  if(!item||!Object.hasOwn(item.q.options||{},selected)||!item.q.answer)return;
  const key=item.key,history=saved.__revision_practice__||(saved.__revision_practice__={}),old=history[key]||{};
  if(!old.xp_first_attempt){history[key]={...old,revision_attempt:true,xp_first_attempt:{selected,correct:selected===item.q.answer,locked_at:new Date().toISOString(),owner:currentUser?.id||'guest',mode}};save()}
  const first=history[key].xp_first_attempt;
  if(first.owner&&first.owner!=='guest'&&first.owner!==currentUser?.id)return;
  return (window.med25GameRecordAttempt||gameRecordAttempt)(item.source,item.q.id,first.correct);
}
window.med25GameRecordPracticeAttempt=gameRecordPracticeAttempt;

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

// Account-scoped confirmations stay beside their question after the brief toast fades.
const gameXPStates=new Map();
function gameXPIdentity(source,id,userId=currentUser?.id||'guest'){return userId+':'+source+':'+id}
function gameSetQuestionXP(source,id,state,userId=currentUser?.id||'guest'){
  gameXPStates.set(gameXPIdentity(source,id,userId),state);
  if((currentUser?.id||'guest')===userId)gameRenderQuestionXP();
}
function gameRenderQuestionXP(root=document){
  root.querySelectorAll('#list .qcard,#aiQuestionList .aiCard,[data-xp-source][data-xp-question]').forEach(card=>{
    const source=card.dataset.xpSource||(card.classList.contains('aiCard')?'ai':'past'),id=card.dataset.xpQuestion||card.id;
    const p=source==='past'?saved[id]:window.med25GameBridge?.aiProgress?.()[id];
    let status=gameXPStates.get(gameXPIdentity(source,id));
    const practice=saved.__revision_practice__?.[source+':'+id]?.xp_first_attempt;
    if(!status&&p?.revealed)status={kind:'info',text:'Answer revealed · no XP'};
    if(!status&&!currentUser&&(typeof p?.correct==='boolean'||practice))status={kind:'info',text:'Sign in to save your XP'};
    let badge=card.querySelector('.questionXPStatus');
    if(!status){badge?.remove();return}
    if(!badge){badge=document.createElement('p');badge.className='questionXPStatus';badge.setAttribute('role','status');const anchor=card.querySelector('.feedback')||card.querySelector('.options')||card.querySelector('[data-xp-anchor]');if(anchor)anchor.after(badge);else card.append(badge)}
    badge.dataset.xpStatus=status.kind;
    if(badge.textContent!==status.text)badge.textContent=status.text;
  });
}
window.med25SetQuestionXP=gameSetQuestionXP;
window.med25RenderQuestionXP=gameRenderQuestionXP;

function gameScoreToast(delta){
  let t=document.getElementById('gameScoreToast');
  if(!t){
    t=document.createElement('div');t.id='gameScoreToast';t.className='gameScoreToast';document.body.appendChild(t);
  }
  const surface=document.querySelector('dialog[open]')||document.body;if(t.parentElement!==surface)surface.append(t);
  t.setAttribute('role','status');t.setAttribute('aria-live','polite');
  t.className='gameScoreToast '+(delta>0?'plus':'minus');
  t.textContent=(delta>0?'+':'')+delta+' XP';
  requestAnimationFrame(()=>t.classList.add('show'));
  clearTimeout(gameScoreToast._timer);
  gameScoreToast._timer=setTimeout(()=>t.classList.remove('show'),2800);
}

async function gameAwardBonus(eventKey,eventType,xp){
  const userId=currentUser?.id;
  if(!userId||!authSession?.access_token)return false;
  try{
    await gameEnsureProfile();
    if(currentUser?.id!==userId)return false;
    const res=await supaFetch('/rest/v1/game_xp_events?on_conflict=user_id,event_key',{
      method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify({user_id:userId,event_key:eventKey,event_type:eventType,xp})
    });
    if(!res.ok)return false;
    const rows=await res.json();
    if(currentUser?.id!==userId)return false;
    if(rows.length)gameScoreToast(Number(rows[0].xp||xp));
    await gameRefreshProfile();gameLoadLeaderboard(true);
    return true; // Duplicate means the server already credited this recovery.
  }catch(e){console.warn('Recovery XP sync pending',e)}
  return false;
}
let recoverySyncBusy=false;
async function gameSyncRecoveryAwards(){
  if(recoverySyncBusy||!currentUser||!authSession?.access_token)return;
  const userId=currentUser.id;recoverySyncBusy=true;
  try{
    for(const [key,p] of Object.entries(gameQuizProgress())){
      if(currentUser?.id!==userId)break;
      if(!p.recovered||p.xp_synced_user===userId)continue;
      const ok=await gameAwardBonus('recovery:'+key,'recovery',GAME_SCORE.recovery);
      if(!ok)break;
      if(currentUser?.id!==userId)break;
      gameQuizProgress()[key]={...gameQuizProgress()[key],xp_synced_user:userId};save();
    }
  }finally{recoverySyncBusy=false}
}
async function gameRestoreRecoveries(){
  if(!currentUser||!authSession?.access_token)return;
  const userId=currentUser.id;let changed=false;
  try{
    for(let offset=0;;offset+=500){
      const res=await supaFetch('/rest/v1/game_xp_events?user_id=eq.'+encodeURIComponent(userId)+'&event_type=eq.recovery&select=event_key&order=event_key&limit=500&offset='+offset);
      if(!res.ok||currentUser?.id!==userId)break;
      const rows=await res.json();
      for(const row of rows){
        if(!row.event_key?.startsWith('recovery:'))continue;
        let key=row.event_key.slice(9);
        if(key.startsWith('past:')&&typeof PAST_QUESTION_ALIASES!=='undefined')key='past:'+(PAST_QUESTION_ALIASES[key.slice(5)]?.id||key.slice(5));
        const resolved=gameResolveQuizKey(key);if(!resolved)continue;key=resolved.key;
        const p=gameQuizProgress()[key]||{};
        if(!p.recovered||p.xp_synced_user!==userId){gameQuizProgress()[key]={...p,recovered:true,xp_synced_user:userId};changed=true}
      }
      if(rows.length<500)break;
    }
    if(changed){save();gameBuildQuizQueue();gameRenderQuiz()}
  }catch(e){console.warn('Recovery history sync pending',e)}
}
window.addEventListener('online',()=>gameSyncRecoveryAwards());
setInterval(()=>gameSyncRecoveryAwards(),15000);

async function gameRecordAttempt(source,questionId,correct){
  gameUpdateQuizBadge();
  source=String(source||'').toLowerCase();
  if(!GAME_SCOREABLE_SOURCES.has(source)||!questionId||typeof correct!=='boolean')return {ok:false};
  const userId=currentUser?.id;
  if(!userId||!authSession?.access_token){gameSetQuestionXP(source,questionId,{kind:'info',text:'Sign in to save your XP'});return {ok:false}}
  gameSetQuestionXP(source,questionId,{kind:'pending',text:'XP syncing…'},userId);
  try{
    await gameEnsureProfile();
    if(currentUser?.id!==userId)return {ok:false};
    const filter='user_id=eq.'+encodeURIComponent(userId)+'&source=eq.'+encodeURIComponent(source)+'&question_id=eq.'+encodeURIComponent(questionId);
    const res=await supaFetch('/rest/v1/game_attempts?on_conflict=user_id,source,question_id',{
      method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},
      body:JSON.stringify({user_id:userId,source,question_id:questionId,correct})
    });
    if(!res.ok)throw new Error('XP save returned HTTP '+res.status);
    const rows=await res.json();
    if(currentUser?.id!==userId)return {ok:true};
    let delta=Number(rows[0]?.points_delta||0);
    // Confirm both new and duplicate inserts: an earlier request or login backfill may already have credited this answer.
    if(delta<=0){
      const award=await supaFetch('/rest/v1/game_attempts?'+filter+'&select=points_delta&limit=1');
      if(!award.ok)throw new Error('XP confirmation returned HTTP '+award.status);
      const scored=await award.json();delta=Number(scored[0]?.points_delta||0);
    }
    if(currentUser?.id!==userId)return {ok:true};
    if(delta<=0)throw new Error('XP award is not confirmed yet');
    gameSetQuestionXP(source,questionId,{kind:'awarded',text:rows.length?'+'+delta+' XP earned':'XP already awarded · '+delta+' XP'},userId);
    if(rows.length)gameScoreToast(delta);
    await gameRefreshProfile();gameLoadLeaderboard(true);
    return {ok:true,inserted:rows.length>0,delta};
  }catch(e){
    gameSetQuestionXP(source,questionId,{kind:'pending',text:'XP pending · your answer is saved; retrying automatically'},userId);
    if(currentUser?.id===userId)gameSetProfileStatus('XP sync pending — your answer is saved and will retry.',true);
    console.warn('Game score sync pending',e);
    return {ok:false};
  }
}

async function gameLoadLeaderboard(force=false){
  const host=document.getElementById('gameLeaderboardList');
  if(!host)return;
  if(!force&&Date.now()-gameLeaderboardLoadedAt<30000&&gameLeaderboard.length){gameRenderLeaderboard();return}
  try{
    const rows=[];
    for(let offset=0;;offset+=500){
      const res=await supaFetch('/rest/v1/leaderboard_entries?select=username,avatar_url,points,weekly_xp,monthly_xp,current_streak,best_streak,week_start,month_start&visible=eq.true&order=points.desc,username.asc&limit=500&offset='+offset);
      if(!res.ok)throw new Error(await res.text());
      const batch=await res.json();if(!Array.isArray(batch))throw new Error('Invalid leaderboard response');
      rows.push(...batch);if(batch.length<500)break;
    }
    gameLeaderboard=rows;
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
  const dow=today.getUTCDay(),back=dow;today.setUTCDate(today.getUTCDate()-back);
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
  const label=gameLeaderboardMode==='weekly'?'this week (Sun–Sat, Saudi time)':gameLeaderboardMode==='monthly'?'this month':'all-time';
  const rows=[...gameLeaderboard].sort((a,b)=>gameLeaderboardValue(b,gameLeaderboardMode)-gameLeaderboardValue(a,gameLeaderboardMode)||String(a.username).localeCompare(String(b.username)));
  if(meta)meta.textContent=rows.length+' MED25 accounts · ranked by XP '+label+' · streak bonuses included';
  if(!rows.length){host.innerHTML='<div class="gameEmpty">No ranked players yet. Be the first.</div>';return}
  const visibleRows=gameLeaderboardExpanded?rows:rows.slice(0,10);
  const renderRow=(r,rank,extra='')=>{
    const medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':String(rank);
    const isMe=!!gameProfile&&String(r.username).toLowerCase()===String(gameProfile.username).toLowerCase();
    const lv=gameLevelInfo(r.points);
    return '<div class="gameLeaderboardRow '+(isMe?'me ':'')+extra+'"><span class="gameRank">'+medal+'</span>'+gameAvatarMarkup(r,'small')+
      '<b>'+esc(r.username||'Student')+(isMe?' <small>you</small>':'')+'<em>Lv '+lv.level+' · '+lv.title+'</em></b>'+
      '<strong>'+gameLeaderboardValue(r,gameLeaderboardMode).toLocaleString()+' XP</strong></div>';
  };
  let html=visibleRows.map((r,i)=>renderRow(r,i+1)).join('');
  if(!gameLeaderboardExpanded&&gameProfile){
    const myIndex=rows.findIndex(r=>String(r.username).toLowerCase()===String(gameProfile.username).toLowerCase());
    if(myIndex>=10){
      html+='<div class="gameLeaderboardYouDivider"><span>Your position</span></div>'+renderRow(rows[myIndex],myIndex+1,'outsideTop');
    }
  }
  html+=(rows.length>10?'<button type="button" id="gameLeaderboardExpand" class="gameLeaderboardExpand">'+(gameLeaderboardExpanded?'Show top 10 ↑':'Show all ↓')+'</button>':'');
  host.innerHTML=html;
  document.getElementById('gameLeaderboardExpand')?.addEventListener('click',()=>{gameLeaderboardExpanded=!gameLeaderboardExpanded;gameRenderLeaderboard()});
}

function gameQuizProgress(){
  if(!saved[QUIZ_PROGRESS_KEY]||typeof saved[QUIZ_PROGRESS_KEY]!=='object')saved[QUIZ_PROGRESS_KEY]={};
  const progress=saved[QUIZ_PROGRESS_KEY];
  for(const oldKey of Object.keys(progress)){
    const resolved=gameResolveQuizKey(oldKey);if(!resolved||resolved.key===oldKey)continue;
    const old=progress[oldKey],prior=progress[resolved.key]||{};
    progress[resolved.key]={...old,...prior,recovered:!!(old.recovered||prior.recovered),attempts:Math.max(Number(old.attempts||0),Number(prior.attempts||0))};
    delete progress[oldKey];
  }
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
  return gameAllMistakes().filter(x=>!qp[x.key]?.recovered&&saved.__revision_practice__?.[x.key]?.correct!==true);
}

function gameShuffle(items){
  const a=[...items];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}

function gameBuildQuizQueue(){
  let items=gameUnresolvedMistakes();
  const progress=gameQuizProgress();
  items.sort((a,b)=>(Date.parse(progress[a.key]?.last_at||'')||0)-(Date.parse(progress[b.key]?.last_at||'')||0));
  if(gameQuizState.shuffle)items=gameShuffle(items);
  gameQuizState.queue=items.map(x=>x.key);
  gameQuizState.index=0;
  gameQuizState.result=null;
  gameUpdateQuizBadge();
}

function gameResolveQuizKey(key){
  let [source,id]=String(key||'').split(':');
  if(source==='past'&&typeof PAST_QUESTION_ALIASES!=='undefined')id=PAST_QUESTION_ALIASES[id]?.id||id;
  if(source==='ai'&&typeof AI_TO_PAST_ALIASES!=='undefined'&&AI_TO_PAST_ALIASES[id]){source='past';id=AI_TO_PAST_ALIASES[id].id;}
  key=source+':'+id;
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
  return q.review_references?.[0]?.url||q.source_url||q.lecture_source?.drive_url||'';
}

function gameQuizExplanation(item){
  return item.q.explanation||item.q.rationale||'Review the keyed answer and the source lecture before your next attempt.';
}

function gameRenderQuiz(){
  const stats=document.getElementById('quizStats'),stage=document.getElementById('quizStage'),shuffle=document.getElementById('quizShuffleBtn');
  if(!stats||!stage)return;
  const all=gameAllMistakes(),qp=gameQuizProgress(),recovered=all.filter(x=>qp[x.key]?.recovered||saved.__revision_practice__?.[x.key]?.correct===true).length,unresolved=all.length-recovered;
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
        (typeof pastQuestionFigure==='function'?pastQuestionFigure(q):'')+
        (typeof pastAIGradingNote==='function'?pastAIGradingNote(q):'')+
      '<div class="quizOptions">'+optionHtml+'</div>'+
      feedback+
      (sourceUrl?'<a class="quizSourceLink" href="'+esc(sourceUrl)+'" target="_blank" rel="noopener">Open supporting source ↗</a>':'')+
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
  if(correct&&!old.recovered)gameSyncRecoveryAwards();
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
    try{g=window.med25GameBridge?.questionLecture?.('past',q)||{}}catch{}
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
      try{g=window.med25GameBridge?.questionLecture?.('ai',q)||{}}catch{}
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
  return gameMockQuestionRows().filter(x=>(gameMockState.config.includeAI||x.source==='past')&&(!window.med25RevisionScope||Number(window.med25GameBridge.questionLecture(x.source,x.q).quiz)===Number(window.med25RevisionScope)));
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
    gameMockState.config.subjectCounts[s.subject]??=0;
    for(const l of s.lectures)gameMockState.config.lectureCounts[l.id]??=0;
  }
}
function gameMockRequestedTotal(){
  return Object.values(gameMockState.config.subjectCounts).reduce((a,b)=>a+Number(b||0),0)+
    Object.values(gameMockState.config.lectureCounts).reduce((a,b)=>a+Number(b||0),0);
}
function gameMockValidation(){
  const cat=gameMockCatalog(),issues=[];
  let total=0;
  for(const n of [...Object.values(gameMockState.config.subjectCounts),...Object.values(gameMockState.config.lectureCounts)]){
    if(!Number.isInteger(Number(n))||Number(n)<0)issues.push('Question counts must be non-negative whole numbers.');
  }
  for(const s of cat){
    const subjectN=Number(gameMockState.config.subjectCounts[s.subject]||0);
    const lectureN=s.lectures.reduce((sum,l)=>sum+Number(gameMockState.config.lectureCounts[l.id]||0),0);
    const requested=subjectN+lectureN;total+=requested;
    if(requested>s.total)issues.push(s.subject+': requested '+requested+', only '+s.total+' available.');
    const reserved=s.lectures.reduce((sum,l)=>sum+Number(gameMockState.config.lectureCounts[l.id]||0),0);
    const remainingForSubject=Math.max(0,s.total-reserved);
    if(subjectN>remainingForSubject)issues.push(s.subject+': subject pool asks for '+subjectN+' more questions after '+reserved+' lecture-specific selections, but only '+remainingForSubject+' non-repeating questions remain.');
    for(const l of s.lectures){
      const n=Number(gameMockState.config.lectureCounts[l.id]||0);
      if(n>l.total)issues.push(l.title+': requested '+n+', only '+l.total+' available.');
    }
  }
  if(total<1)issues.push('Choose at least one question.');
  const minutes=Number(gameMockState.config.minutes||0);
  if(!Number.isInteger(minutes)||minutes<1||minutes>240)issues.push('Choose a whole-number exam time between 1 and 240 minutes.');
  return {ok:issues.length===0,issues,total};
}
function gameMockUpdateSetupSummary(){
  const validation=gameMockValidation(),el=document.getElementById('mockValidation');
  const sourceText=gameMockState.config.includeAI?'Past Papers + AI Questions':'Past Papers only';
  if(el){el.className='mockValidation '+(validation.ok?'ok':'bad');el.innerHTML=validation.ok?'<b>Ready to build.</b><span>'+validation.total+' questions · '+gameMockState.config.minutes+' minutes · '+esc(sourceText)+'</span>':'<b>Check your setup.</b><span>'+esc(validation.issues.join(' '))+'</span>'}
  const start=document.getElementById('mockStartBtn');if(start)start.disabled=!validation.ok;
  const total=document.getElementById('mockRequested');if(total)total.textContent=String(validation.total);
  document.querySelectorAll('.mockSubjectCard').forEach(card=>{
    const ids=[...card.querySelectorAll('[data-mock-lecture-count]')].map(x=>x.dataset.mockLectureCount);
    const count=ids.reduce((n,id)=>n+Number(gameMockState.config.lectureCounts[id]||0),0);
    const summary=card.querySelector('summary span');if(summary)summary.textContent=count+' selected';
  });
}
function gameMockRenderSetup(){
  const host=document.getElementById('mockStage');if(!host)return;
  gameMockClampConfig();
  const cat=gameMockCatalog(),validation=gameMockValidation();
  const sourceText=gameMockState.config.includeAI?'Past Papers + AI Questions':'Past Papers only';
  host.innerHTML=
    '<div class="mockBuilder">'+
      '<section class="mockSetupTop">'+
        '<div><div class="homeCardLabel">CUSTOM MOCK EXAM</div><h2>Build your exam exactly how you want.</h2><p>Set your own time, choose the question source, then choose exact question counts by subject and/or by a specific lecture or topic. IBLS/CVS/Formative are treated only as provenance, never as subjects. Answers stay hidden until you submit.</p><p class="mockNoPoints">Answered questions earn their first XP on submission. Each question earns XP once across all sections; unanswered questions earn none.</p></div>'+
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
        '<div class="mockMapHead"><div><div class="homeCardLabel">EXAM MAP</div><h3>Subjects, lectures & topics</h3><p>Choose a mixed subject pool, exact questions from specific lectures/topics, or combine both.</p></div><button id="mockClearCounts" type="button">Clear all</button></div>'+
        '<div class="mockSubjectList">'+cat.map(sub=>{
          const subjectCount=Number(gameMockState.config.subjectCounts[sub.subject]||0);
          const lectureSelected=sub.lectures.reduce((sum,l)=>sum+Number(gameMockState.config.lectureCounts[l.id]||0),0);
          return '<article class="mockSubjectCard">'+
            '<div class="mockSubjectMain"><div><b>'+esc(sub.subject)+'</b><span>'+sub.total+' available · '+sub.past+' past'+(gameMockState.config.includeAI?(sub.ai?' · '+sub.ai+' AI':' · Past only'):'')+'</span></div>'+
              '<label><span>Mixed questions from subject</span><input type="number" min="0" max="'+sub.total+'" value="'+subjectCount+'" data-mock-subject-count="'+esc(sub.subject)+'"></label>'+
            '</div>'+
            '<details '+(lectureSelected?'open':'')+'><summary>Choose specific lectures / topics <span>'+lectureSelected+' selected</span></summary>'+
              '<div class="mockLectureList">'+sub.lectures.map(l=>
                '<label class="mockLectureRow"><span><b>'+esc(l.title)+'</b><small>'+l.total+' available · '+l.past+' past'+(gameMockState.config.includeAI?(l.ai?' · '+l.ai+' AI':' · Past only'):'')+'</small></span>'+
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
  document.getElementById('mockMinutes').oninput=e=>{gameMockState.config.minutes=Number(e.target.value);gameMockUpdateSetupSummary()};
  host.querySelectorAll('[data-mock-source]').forEach(btn=>btn.onclick=()=>{
    gameMockState.config.includeAI=btn.dataset.mockSource==='both';gameMockRenderSetup();
  });
  host.querySelectorAll('[data-mock-subject-count]').forEach(inp=>inp.oninput=()=>{
    gameMockState.config.subjectCounts[inp.dataset.mockSubjectCount]=Number(inp.value);gameMockUpdateSetupSummary();
  });
  host.querySelectorAll('[data-mock-lecture-count]').forEach(inp=>inp.oninput=()=>{
    gameMockState.config.lectureCounts[inp.dataset.mockLectureCount]=Number(inp.value);gameMockUpdateSetupSummary();
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
  gameMockState.exam={xpEnabled:true,xpOwner:currentUser?.id||'guest',questions,answers:{},index:0,startedAt:now,endsAt:now+minutes*60000,submitted:false,submittedAt:null};
  gameMockSave();
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
        (typeof pastQuestionFigure==='function'?pastQuestionFigure(q):'')+
        (typeof pastAIGradingNote==='function'?pastAIGradingNote(q):'')+
        '<div class="mockOptions">'+Object.entries(q.options||{}).map(([k,v])=>
          '<button type="button" data-mock-answer="'+esc(k)+'" class="mockOption '+(selected===k?'selected':'')+'"><span>'+esc(k)+'</span><b>'+esc(v)+'</b></button>'
        ).join('')+'</div>'+
      '</article>'+
      '<div class="mockExamNav"><button id="mockPrev" type="button" '+(exam.index===0?'disabled':'')+'>← Previous</button><button id="mockNext" type="button">'+(exam.index===exam.questions.length-1?'Review map':'Next →')+'</button></div>'+
    '</div>';
  host.querySelectorAll('[data-mock-answer]').forEach(btn=>btn.onclick=()=>{
    if(Date.now()>=exam.endsAt){gameMockSubmit(true);return}
    exam.answers[item.key]=btn.dataset.mockAnswer;gameMockSave();gameMockRenderExam();
  });
  host.querySelectorAll('[data-mock-jump]').forEach(btn=>btn.onclick=()=>{exam.index=Number(btn.dataset.mockJump);gameMockSave();gameMockRenderExam()});
  document.getElementById('mockPrev').onclick=()=>{if(exam.index>0){exam.index--;gameMockSave();gameMockRenderExam()}};
  document.getElementById('mockNext').onclick=()=>{if(exam.index<exam.questions.length-1)exam.index++;gameMockSave();gameMockRenderExam()};
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
  if(exam.xpOwner==='guest')exam.xpOwner=currentUser?.id||'guest';
  exam.submitted=true;exam.submittedAt=Date.now();exam.autoSubmitted=auto;
  clearInterval(gameMockState.timer);
  exam.bonusXp=0;
  gameMockSave();
  gameMockRenderResults();
  gameMockScoreXP();
  try{trackEvent('section_view',{metadata:{section:'mock_exam_finished',questions:exam.questions.length,score:gameMockScore().correct,auto_submit:auto}})}catch{}
}
function gameMockScoreXP(){
  const exam=gameMockState.exam;
  if(!exam?.submitted||!exam.xpEnabled||exam.xpOwner!==(currentUser?.id||'guest'))return;
  for(const item of exam.questions){const pick=exam.answers[item.key];if(pick)gameRecordPracticeAttempt(item.source,item.q.id,pick,'mock')}
  gameRenderQuestionXP();
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
      '<p class="mockNoPoints">Previously unscored answers earn XP after submission. Questions already credited in another section do not earn duplicate XP. Unanswered questions earn none.</p>'+
      '<section class="mockReview"><div class="homeCardLabel">REVIEW</div>'+
      exam.questions.map((item,i)=>{
        const q=item.q,pick=exam.answers[item.key]||'',ok=pick===q.answer;
        return '<article class="mockReviewCard '+(pick?(ok?'correct':'wrong'):'unanswered')+'"'+(pick?' data-xp-source="'+esc(item.source)+'" data-xp-question="'+esc(q.id)+'"':'')+'>'+
          '<div class="mockReviewTop"><b>Q'+(i+1)+' · '+(item.source==='ai'?'AI':'Past Paper')+'</b><span>'+esc(item.lectureTitle)+'</span></div>'+
          '<h3>'+esc(q.stem||'')+'</h3>'+
        (typeof pastQuestionFigure==='function'?pastQuestionFigure(q):'')+
        (typeof pastAIGradingNote==='function'?pastAIGradingNote(q):'')+
          '<p><b>Your answer:</b> '+(pick?esc(pick+' · '+(q.options?.[pick]||'')):'Unanswered')+'</p>'+
          '<p><b>Correct answer:</b> '+esc(q.answer+' · '+(q.options?.[q.answer]||''))+'</p>'+
          (q.explanation||q.rationale?'<small>'+esc(q.explanation||q.rationale)+'</small>':'')+
        '</article>';
      }).join('')+'</section>'+
    '</div>';
  window.med25Revision?.mockReview(exam);
  gameRenderQuestionXP();
  document.getElementById('mockBuildAnother').onclick=()=>{gameMockState.exam=null;gameMockSave();gameMockRenderSetup()};
}
function gameInstallMockSection(){
  if(document.getElementById('mockSection'))return;
  const quiz=document.getElementById('quizSection');
  const parent=quiz?.parentNode;if(!parent)return;
  const section=document.createElement('section');
  section.id='mockSection';section.className='mockSection hidden';
  section.innerHTML='<div id="mockStage"></div>';
  parent.insertBefore(section,quiz);
}
function gameSwitchMock(){
  try{localStorage.removeItem('med25-v2-view-v1')}catch{}
  gameMockRestore();
  gameInstallMockSection();
  const mock=document.getElementById('mockSection');if(!mock)return;
  document.getElementById('homeSection')?.classList.add('hidden');
  document.getElementById('questionSection')?.classList.add('hidden');
  document.getElementById('aiSection')?.classList.add('hidden');
  document.getElementById('quizSection')?.classList.add('hidden');
  document.getElementById('profileSection')?.classList.add('hidden');
  document.getElementById('progressSection')?.classList.add('hidden');
  mock.classList.remove('hidden');
  ['tabHome','tabQuestions','tabAI','tabQuiz','tabProfile','tabProgress'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
  document.getElementById('tabMock')?.classList.add('active');
  document.getElementById('stats')?.classList.add('hidden');
  document.getElementById('questionProgressBar')?.classList.add('hidden');
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
  try{localStorage.removeItem('med25-v2-view-v1')}catch{}
  gameInstallQuizSection();
  const quizSection=document.getElementById('quizSection');
  if(!quizSection)return;
  document.getElementById('homeSection')?.classList.add('hidden');
  document.getElementById('questionSection')?.classList.add('hidden');
  document.getElementById('aiSection')?.classList.add('hidden');
  document.getElementById('mockSection')?.classList.add('hidden');
  document.getElementById('profileSection')?.classList.add('hidden');
  document.getElementById('progressSection')?.classList.add('hidden');
  quizSection.classList.remove('hidden');
  ['tabHome','tabQuestions','tabAI','tabMock','tabProfile','tabProgress'].forEach(id=>document.getElementById(id)?.classList.remove('active'));
  document.getElementById('tabQuiz')?.classList.add('active');
  document.getElementById('stats')?.classList.add('hidden');
  document.getElementById('questionProgressBar')?.classList.add('hidden');
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
  ['tabHome','tabQuestions','tabAI'].forEach(id=>{
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
      if(!before&&typeof saved[id]?.correct==='boolean')(window.med25GameRecordAttempt||gameRecordAttempt)('past',id,saved[id].correct);
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
      gameRenderQuestionXP();
      setTimeout(()=>{gameSyncAuth();window.med25RetryPendingXP?.()},0);
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

async function gameActivateLeaderboard(){
  if(!currentUser||!authSession?.access_token)return false;
  try{
    const res=await supaFetch('/rest/v1/leaderboard_activations?on_conflict=user_id',{
      method:'POST',
      headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
      body:JSON.stringify({user_id:currentUser.id})
    });
    if(!res.ok){
      console.warn('Leaderboard activation unavailable',await res.text());
      return false;
    }
    return true;
  }catch(e){
    console.warn('Leaderboard activation unavailable',e);
    return false;
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
    await gameActivateLeaderboard();
    await gameBackfillAttempts();
    await gameRestoreRecoveries();
    await gameSyncRecoveryAwards();
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
  const pending=Array.isArray(window.med25PendingGameAttempts)?window.med25PendingGameAttempts.splice(0):[];
  pending.forEach(x=>gameRecordAttempt(x.source,x.questionId,x.correct));
  window.med25GameUpdateQuizBadge=gameUpdateQuizBadge;
  window.med25GameRefreshQuiz=()=>{
    gameUpdateQuizBadge();
    if(!document.getElementById('quizSection')?.classList.contains('hidden')){
      gameBuildQuizQueue();
      gameRenderQuiz();
    }
  };
  window.med25GameRefreshMock=()=>{
    gameMockRestore();
    const section=document.getElementById('mockSection');
    if(!section||section.classList.contains('hidden'))return;
    if(gameMockState.exam)gameMockState.exam.submitted?gameMockRenderResults():gameMockRenderExam();else gameMockRenderSetup();
  };
  // Content can finish loading before this layer installs its refresh hook.
  gameMockRestore();
  const stored=localStorage.getItem(GAME_SECTION_KEY);
  if(stored==='quiz')setTimeout(gameSwitchQuiz,0);
  if(stored==='mock')setTimeout(gameSwitchMock,0);
}


window.med25GameOpenQuiz=gameSwitchQuiz;
window.med25CompletedMock=()=>gameMockState.exam?.submitted?gameMockState.exam:null;
window.med25GameOpenMock=gameSwitchMock;
try{gameInit()}catch(e){console.error('MED25 game layer failed',e)}

})();
