(function(){
'use strict';

function cohortLogoSrc(){
  return window.MED25_COHORT_LOGO_B64?'data:image/jpeg;base64,'+window.MED25_COHORT_LOGO_B64:'';
}

const V2_INFO={
  about:{
    title:'About MED25',
    body:'<p>MED25 is a student-built study hub for the KAU Medicine MED25 cohort. It brings past-paper practice, lecture-grounded AI questions, spaced-repetition flashcards, mock exams, progress tracking and cohort rankings into one place.</p><h3>Purpose</h3><p>The platform is designed as a study companion. Official lecture material remains the source of truth for course content.</p>'
  },
  privacy:{
    title:'Privacy',
    body:'<p>MED25 uses account information and study activity to provide cross-device progress sync, profiles, rankings and learning analytics.</p><h3>What is stored</h3><p>This can include your account email, display profile information, question attempts, XP events, lecture progress and flashcard review progress.</p><h3>Student data</h3><p>Individual student data is not sold or shared with third parties for advertising. Public rankings use the profile information students choose to display.</p>'
  },
  terms:{
    title:'Study-use terms',
    body:'<p>MED25 is an educational study aid created for students. Question explanations, AI-generated practice and automated lecture mappings can contain mistakes.</p><h3>Course content</h3><p>Use official KAU lecture material and faculty guidance as the final reference for assessed content.</p><h3>Fair use</h3><p>Do not manipulate accounts, automated requests, XP or leaderboard systems. Ranking features are intended to reflect genuine study activity.</p>'
  },
  contact:{
    title:'Contact & feedback',
    body:'<div class="v2ContactCard"><span>MED25 site admin</span><b>Waleed Khashoggi</b><p class="v2ContactLead">For content or feedback, contact me through WhatsApp or email.</p><div class="v2ContactActions"><a class="v2ContactAction" href="https://wa.me/966550466861" target="_blank" rel="noopener noreferrer"><strong>WhatsApp</strong><small>+966 55 046 6861</small></a><a class="v2ContactAction" href="mailto:Waleed.khashoggi@icloud.com"><strong>Email</strong><small>Waleed.khashoggi@icloud.com</small></a></div></div><h3>Content corrections</h3><p>When reporting a question, include the question wording and lecture if possible so it can be checked quickly.</p>'
  }
};

function icon(name){
  const map={
    home:'<svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
    practice:'<svg viewBox="0 0 24 24"><path d="M6 3.5h12v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    flash:'<svg viewBox="0 0 24 24"><rect x="4" y="6" width="14" height="11" rx="2"/><path d="M7 3h13v11"/></svg>',
    mock:'<svg viewBox="0 0 24 24"><path d="M7 3.5h10v3H7z"/><path d="M5 6.5h14v14H5z"/><path d="M8.5 11h7M8.5 15h4"/></svg>',
    profile:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.7-4.2 3.2-6.3 7.5-6.3s6.8 2.1 7.5 6.3"/></svg>',
    progress:'<svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="m8 9 1.5 1.5L12 8"/><path d="M13.5 10H17"/><path d="m8 15 1.5 1.5L12 14"/><path d="M13.5 16H17"/></svg>'
  };
  return map[name]||'';
}

function clickId(id){
  const el=document.getElementById(id);
  if(el){el.click();return true}
  return false;
}

function cleanNav(){
  const links=document.querySelector('#studyTabs .appNavLinks');
  if(!links)return;
  if(!document.getElementById('tabProgress')){
    const btn=document.createElement('button');
    btn.className='studyTab';btn.id='tabProgress';btn.type='button';
    btn.innerHTML='<span class="navIcon">'+icon('progress')+'</span><span>Lecture Tracker</span>';
    links.appendChild(btn);
  }
  if(!document.getElementById('tabProfile')){
    const btn=document.createElement('button');
    btn.className='studyTab';btn.id='tabProfile';btn.type='button';
    btn.innerHTML='<span class="navIcon">'+icon('profile')+'</span><span>Profile</span>';
    links.appendChild(btn);
  }
  const labels={
    tabHome:'Home',
    tabQuestions:'Past Papers',
    tabAI:'AI Practice',
    tabQuiz:'Mistake Quiz',
    tabMock:'Mock Exam',
    tabFlashcards:'Flashcards',
    tabProgress:'Lecture Tracker',
    tabProfile:'Profile'
  };
  Object.entries(labels).forEach(([id,label])=>{
    const btn=document.getElementById(id);
    if(!btn)return;
    const spans=btn.querySelectorAll(':scope > span');
    const text=Array.from(spans).find(x=>!x.classList.contains('navIcon')&&!x.classList.contains('quizNavBadge'));
    if(text)text.textContent=label;
    btn.setAttribute('aria-label',label);
  });
  const flash=document.getElementById('tabFlashcards'),mock=document.getElementById('tabMock'),
        progress=document.getElementById('tabProgress'),profile=document.getElementById('tabProfile');
  if(mock&&flash&&mock.nextElementSibling!==flash)links.insertBefore(mock,flash);
  if(progress&&profile&&progress.nextElementSibling!==profile)links.insertBefore(progress,profile);

  links.querySelectorAll('.v2NavSection').forEach(x=>x.remove());
  const practice=document.createElement('div');practice.className='v2NavSection';practice.textContent='Practice';
  const tools=document.createElement('div');tools.className='v2NavSection';tools.textContent='Study tools';
  const account=document.createElement('div');account.className='v2NavSection';account.textContent='Account';
  const q=document.getElementById('tabQuestions'),f=document.getElementById('tabFlashcards'),p=document.getElementById('tabProfile');
  if(q)links.insertBefore(practice,q);
  if(f)links.insertBefore(tools,f);
  if(p)links.insertBefore(account,p);

  document.getElementById('tabProgress').onclick=()=>showV2Page('progress');
  document.getElementById('tabProfile').onclick=()=>showV2Page('profile');

  const actions=document.querySelector('#studyTabs .appNavActions');
  if(actions&&!document.querySelector('.v2SidebarMeta')){
    const meta=document.createElement('div');meta.className='v2SidebarMeta';meta.innerHTML='KAU Medicine<br>MED25 Study Hub';
    actions.insertAdjacentElement('afterend',meta);
  }
}
function installCohortIdentity(){
  const welcome=document.querySelector('.homeWelcome');
  if(welcome&&!welcome.querySelector('.v2CohortIdentity')){
    const row=document.createElement('div');
    row.className='v2CohortIdentity';
    row.innerHTML='<img src="'+cohortLogoSrc()+'" alt="MED25 cohort logo"><div><span>MED25 COHORT</span><b>King Abdulaziz University · Faculty of Medicine</b></div>';
    welcome.insertBefore(row,welcome.firstChild);
  }
}
function installStandaloneSections(){
  const shell=document.querySelector('.shell'),home=document.getElementById('homeSection');
  if(!shell||!home)return;
  if(!document.getElementById('progressSection')){
    const progress=document.createElement('section');
    progress.id='progressSection';progress.className='v2StandaloneSection hidden';
    progress.innerHTML='<div class="v2StandaloneIntro"><div><span>PROGRESS</span><h2>Lecture Tracker</h2><p>Your full lecture checklist lives here, away from the Home dashboard. Mark lectures you have studied and track completion of mapped Past Paper + AI questions.</p></div><button id="v2TrackerBack" class="v2StandaloneBack" type="button">← Home</button></div><div id="v2ProgressSlot"></div>';
    home.insertAdjacentElement('afterend',progress);
  }
  if(!document.getElementById('profileSection')){
    const profile=document.createElement('section');
    profile.id='profileSection';profile.className='v2StandaloneSection hidden';
    profile.innerHTML='<div class="v2StandaloneIntro"><div><span>ACCOUNT</span><h2>Your Profile</h2><p>Manage your MED25 identity, XP, streaks, leaderboard visibility and cross-device sync.</p></div></div><div class="v2ProfileGrid"><section class="hubCard v2ProfileCard"><div class="homeCardLabel">PROFILE & XP</div><div id="profileGameSlot"></div></section><section class="hubCard v2AccountCard"><div class="homeCardLabel">ACCOUNT & SYNC</div><div class="v2AccountIntro">Your study progress is saved locally and can sync across devices when you sign in.</div><div id="profileAuthSlot"></div><div id="profileAppearanceSlot"></div></section></div>';
    document.getElementById('progressSection').insertAdjacentElement('afterend',profile);
  }
  const trackerBack=document.getElementById('v2TrackerBack');
  if(trackerBack&&!trackerBack.dataset.bound){trackerBack.dataset.bound='1';trackerBack.onclick=()=>{hideV2Pages();clickId('tabHome')}}
  const tracker=document.querySelector('.lectureDashboardCard'),progressSlot=document.getElementById('v2ProgressSlot');
  if(tracker&&progressSlot&&tracker.parentElement!==progressSlot)progressSlot.appendChild(tracker);
  const profilePanel=document.getElementById('gameProfilePanel'),gameSlot=document.getElementById('profileGameSlot');
  if(profilePanel&&gameSlot&&profilePanel.parentElement!==gameSlot)gameSlot.appendChild(profilePanel);
  const auth=document.getElementById('authBox'),authSlot=document.getElementById('profileAuthSlot');
  if(auth&&authSlot&&auth.parentElement!==authSlot)authSlot.appendChild(auth);
  const oldAuth=document.getElementById('homeAuthSlot');if(oldAuth)oldAuth.classList.add('v2LegacyHomeAuth');
  const overall=document.querySelector('.homeOverall');
  if(overall&&!document.getElementById('v2OpenTracker')){
    const btn=document.createElement('button');btn.id='v2OpenTracker';btn.className='homeTextBtn v2OpenTracker';btn.type='button';btn.textContent='Open Lecture Tracker →';btn.onclick=()=>showV2Page('progress');overall.appendChild(btn);
  }
}

function hideV2Pages(){
  document.getElementById('profileSection')?.classList.add('hidden');
  document.getElementById('progressSection')?.classList.add('hidden');
  document.getElementById('tabProfile')?.classList.remove('active');
  document.getElementById('tabProgress')?.classList.remove('active');
}
function showV2Page(mode){
  installStandaloneSections();
  ['homeSection','questionSection','aiSection','flashcardsSection','quizSection','mockSection'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
  hideV2Pages();
  const section=document.getElementById(mode==='profile'?'profileSection':'progressSection');
  section?.classList.remove('hidden');
  document.querySelectorAll('#studyTabs .studyTab').forEach(b=>b.classList.remove('active'));
  document.getElementById(mode==='profile'?'tabProfile':'tabProgress')?.classList.add('active');
  document.getElementById('stats')?.classList.add('hidden');
  document.getElementById('questionProgressBar')?.classList.add('hidden');
  document.getElementById('flashHeroStats')?.classList.add('hidden');
  document.body.classList.remove('homeMode');
  const h=document.getElementById('heroTitle'),p=document.getElementById('heroDescription');
  if(mode==='profile'){
    if(h)h.textContent='MED25 Profile';
    if(p)p.textContent='Your account, MED25 identity, XP, streaks and leaderboard settings.';
  }else{
    if(h)h.textContent='MED25 Lecture Tracker';
    if(p)p.textContent='A dedicated view for lecture study status and question completion across the module.';
    try{window.med25RenderLectureDashboard?.()}catch{}
  }
  try{localStorage.setItem('med25-v2-view-v1',mode)}catch{}
  window.scrollTo({top:0,behavior:'smooth'});
  syncMobileNav(mode);
}
window.med25V2OpenProgress=()=>showV2Page('progress');
window.med25V2OpenProfile=()=>showV2Page('profile');

function installMobileAppearance(){
  const slot=document.getElementById('profileAppearanceSlot')||document.getElementById('homeAuthSlot');
  if(!slot||document.getElementById('v2MobileAppearance'))return;
  const btn=document.createElement('button');
  btn.id='v2MobileAppearance';btn.className='v2MobileAppearance';btn.type='button';
  btn.setAttribute('aria-label','Toggle light or dark appearance');
  btn.innerHTML='<span aria-hidden="true">◐</span><span>Appearance</span>';
  btn.onclick=()=>document.getElementById('themeToggle')?.click();
  slot.appendChild(btn);
}
function installFooter(){
  const shell=document.querySelector('.shell');
  if(!shell||document.getElementById('v2Footer'))return;
  const footer=document.createElement('footer');
  footer.id='v2Footer';footer.className='v2Footer';
  footer.innerHTML=
    '<div class="v2FooterBrand"><span class="v2FooterMark"><img src="'+cohortLogoSrc()+'" alt=""></span><span><b>MED25 Study Hub</b><span>Built for KAU Medicine students</span></span></div>'+
    '<div class="v2FooterLinks">'+
      '<button type="button" data-v2-info="about">About</button>'+
      '<button type="button" data-v2-info="privacy">Privacy</button>'+
      '<button type="button" data-v2-info="terms">Study-use terms</button>'+
      '<button type="button" data-v2-info="contact">Contact & feedback</button>'+
    '</div>';
  shell.appendChild(footer);
  footer.querySelectorAll('[data-v2-info]').forEach(b=>b.onclick=()=>openInfo(b.dataset.v2Info));
}

function installInfoSheet(){
  if(document.getElementById('v2InfoBack'))return;
  const back=document.createElement('div');back.id='v2InfoBack';back.className='v2InfoBack';back.setAttribute('aria-hidden','true');
  back.innerHTML='<section class="v2InfoSheet" role="dialog" aria-modal="true"><div class="v2InfoTop"><h2 id="v2InfoTitle">MED25</h2><button id="v2InfoClose" class="v2InfoClose" type="button" aria-label="Close">×</button></div><div id="v2InfoBody" class="v2InfoBody"></div></section>';
  document.body.appendChild(back);
  back.onclick=e=>{if(e.target===back)closeInfo()};
  document.getElementById('v2InfoClose').onclick=closeInfo;
}
function openInfo(key){
  installInfoSheet();
  const data=V2_INFO[key]||V2_INFO.about,back=document.getElementById('v2InfoBack');
  document.getElementById('v2InfoTitle').textContent=data.title;
  document.getElementById('v2InfoBody').innerHTML=(key==='about'?'<div class="v2AboutIdentity"><img src="'+cohortLogoSrc()+'" alt="MED25 cohort logo"><div><b>MED25 Cohort</b><span>King Abdulaziz University · Faculty of Medicine</span></div></div>':'')+data.body;
  back.classList.add('show');back.setAttribute('aria-hidden','false');
}
function closeInfo(){
  const back=document.getElementById('v2InfoBack');if(!back)return;
  back.classList.remove('show');back.setAttribute('aria-hidden','true');
}

function installPracticeSheet(){
  if(document.getElementById('v2PracticeBack'))return;
  const back=document.createElement('div');back.id='v2PracticeBack';back.className='v2PracticeBack';back.setAttribute('aria-hidden','true');
  back.innerHTML=
    '<section class="v2PracticeSheet" role="dialog" aria-modal="true">'+
      '<div class="v2InfoTop"><div><div class="v2PracticeTitle">Practice</div><h2 style="margin:0;font-size:22px">Choose how you want to practise</h2></div><button id="v2PracticeClose" class="v2InfoClose" type="button" aria-label="Close">×</button></div>'+
      '<div class="v2PracticeOptions" style="margin-top:16px">'+
        '<button class="v2PracticeOption" type="button" data-v2-practice="past"><span class="v2PracticeIcon">P</span><span><b>Past Papers</b><small>Original banks, repeated concepts and source-lecture links.</small></span></button>'+
        '<button class="v2PracticeOption" type="button" data-v2-practice="ai"><span class="v2PracticeIcon">AI</span><span><b>AI Practice</b><small>Lecture-grounded KAU-style questions separated from past papers.</small></span></button>'+
        '<button class="v2PracticeOption" type="button" data-v2-practice="quiz"><span class="v2PracticeIcon">↻</span><span><b>Mistake Quiz</b><small>Fresh attempts at questions you previously answered incorrectly.</small></span></button>'+
      '</div>'+
    '</section>';
  document.body.appendChild(back);
  back.onclick=e=>{if(e.target===back)closePractice()};
  document.getElementById('v2PracticeClose').onclick=closePractice;
  back.querySelectorAll('[data-v2-practice]').forEach(btn=>btn.onclick=()=>{
    const mode=btn.dataset.v2Practice;closePractice();hideV2Pages();
    if(mode==='past')clickId('tabQuestions');
    if(mode==='ai')clickId('tabAI');
    if(mode==='quiz'){
      if(typeof window.med25GameOpenQuiz==='function')window.med25GameOpenQuiz();else clickId('tabQuiz');
    }
    setTimeout(syncMobileNav,40);
  });
}
function openPractice(){installPracticeSheet();const b=document.getElementById('v2PracticeBack');b.classList.add('show');b.setAttribute('aria-hidden','false')}
function closePractice(){const b=document.getElementById('v2PracticeBack');if(!b)return;b.classList.remove('show');b.setAttribute('aria-hidden','true')}

function installMobileNav(){
  if(document.getElementById('v2MobileNav'))return;
  const nav=document.createElement('nav');nav.id='v2MobileNav';nav.setAttribute('aria-label','MED25 mobile navigation');
  const items=[
    ['home','Home'],['practice','Practice'],['flash','Cards'],['mock','Mock'],['profile','Profile']
  ];
  nav.innerHTML=items.map(([key,label])=>'<button class="v2MobileNavBtn" type="button" data-v2-mobile="'+key+'">'+icon(key)+'<span>'+label+'</span></button>').join('');
  document.body.appendChild(nav);
  nav.querySelectorAll('[data-v2-mobile]').forEach(btn=>btn.onclick=()=>{
    const key=btn.dataset.v2Mobile;
    if(key==='home'){hideV2Pages();clickId('tabHome')}
    if(key==='practice'){openPractice()}
    if(key==='flash'){hideV2Pages();clickId('tabFlashcards')}
    if(key==='mock'){
      hideV2Pages();
      if(typeof window.med25GameOpenMock==='function')window.med25GameOpenMock();else clickId('tabMock');
    }
    if(key==='profile'){showV2Page('profile');return}
    setTimeout(syncMobileNav,40);
  });
}

function currentMode(){
  if(!document.getElementById('profileSection')?.classList.contains('hidden'))return 'profile';
  if(!document.getElementById('progressSection')?.classList.contains('hidden'))return 'progress';
  if(!document.getElementById('mockSection')?.classList.contains('hidden'))return 'mock';
  if(!document.getElementById('quizSection')?.classList.contains('hidden'))return 'practice';
  if(!document.getElementById('flashcardsSection')?.classList.contains('hidden'))return 'flash';
  if(!document.getElementById('questionSection')?.classList.contains('hidden'))return 'practice';
  if(!document.getElementById('aiSection')?.classList.contains('hidden'))return 'practice';
  if(!document.getElementById('homeSection')?.classList.contains('hidden'))return 'home';
  return 'home';
}
function syncMobileNav(force){
  const mode=force||currentMode();
  document.querySelectorAll('[data-v2-mobile]').forEach(b=>{
    const active=b.dataset.v2Mobile===mode;
    b.classList.toggle('active',active);
    if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
  });
  const desktopMap={home:'tabHome',flash:'tabFlashcards',mock:'tabMock',profile:'tabProfile',progress:'tabProgress'};
  document.querySelectorAll('#studyTabs .studyTab').forEach(b=>b.removeAttribute('aria-current'));
  const current=document.getElementById(desktopMap[mode]||'');
  if(current)current.setAttribute('aria-current','page');
}

function observeSections(){
  const ids=['homeSection','questionSection','aiSection','flashcardsSection','quizSection','mockSection','profileSection','progressSection'];
  const observer=new MutationObserver(()=>syncMobileNav());
  ids.forEach(id=>{const el=document.getElementById(id);if(el)observer.observe(el,{attributes:true,attributeFilter:['class']})});
}

function polishHomeLabels(){
  const title=document.getElementById('homeGreeting');
  if(title&&!title.dataset.v2Polished){title.dataset.v2Polished='1'}
  const overall=document.querySelector('.homeOverall .homeCardLabel');if(overall)overall.textContent='MODULE COMPLETION';
  const leaderboard=document.querySelector('.gameLeaderboardCard .homeCardLabel');if(leaderboard)leaderboard.textContent='LEADERBOARD';
  const meta=document.getElementById('gameLeaderboardMeta');
  if(meta)meta.setAttribute('aria-live','polite');
}


function observeLeaderboard(){
  const tryBind=()=>{
    const list=document.getElementById('gameLeaderboardList');if(!list||list.dataset.v2Observed)return false;
    list.dataset.v2Observed='1';
    new MutationObserver(()=>polishHomeLabels()).observe(list,{childList:true,subtree:true});
    polishHomeLabels();return true;
  };
  if(!tryBind())setTimeout(tryBind,600);
}

function setupKeyboard(){
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeInfo();closePractice()}
  });
}

function init(){
  document.documentElement.classList.add('med25-v2');
  document.title='MED25 Study Hub';
  cleanNav();installStandaloneSections();installCohortIdentity();installMobileAppearance();installFooter();installInfoSheet();installPracticeSheet();installMobileNav();observeSections();observeLeaderboard();polishHomeLabels();setupKeyboard();syncMobileNav();
  ['tabHome','tabQuestions','tabAI','tabQuiz','tabMock','tabFlashcards'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>{hideV2Pages();try{localStorage.removeItem('med25-v2-view-v1')}catch{}},{capture:true}));
  const savedV2=localStorage.getItem('med25-v2-view-v1');if(savedV2==='profile'||savedV2==='progress')setTimeout(()=>showV2Page(savedV2),40);
  setTimeout(()=>{cleanNav();installStandaloneSections();polishHomeLabels();syncMobileNav()},800);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
})();