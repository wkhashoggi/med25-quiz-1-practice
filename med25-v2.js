(function(){
'use strict';

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
    body:'<p>For corrections, missing questions, feature requests or account issues, contact the MED25 site admin through the cohort communication channels.</p><h3>Content corrections</h3><p>When reporting a question, include the question wording and lecture if possible so it can be checked quickly.</p>'
  }
};

function icon(name){
  const map={
    home:'<svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8"/><path d="M5.5 9.5V21h13V9.5"/><path d="M9.5 21v-6h5v6"/></svg>',
    practice:'<svg viewBox="0 0 24 24"><path d="M6 3.5h12v17H6z"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>',
    flash:'<svg viewBox="0 0 24 24"><rect x="4" y="6" width="14" height="11" rx="2"/><path d="M7 3h13v11"/></svg>',
    mock:'<svg viewBox="0 0 24 24"><path d="M7 3.5h10v3H7z"/><path d="M5 6.5h14v14H5z"/><path d="M8.5 11h7M8.5 15h4"/></svg>',
    profile:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.7-4.2 3.2-6.3 7.5-6.3s6.8 2.1 7.5 6.3"/></svg>'
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
  const labels={
    tabHome:'Home',
    tabQuestions:'Past Papers',
    tabAI:'AI Practice',
    tabQuiz:'Mistake Quiz',
    tabMock:'Mock Exam',
    tabFlashcards:'Flashcards'
  };
  Object.entries(labels).forEach(([id,label])=>{
    const btn=document.getElementById(id);
    if(!btn)return;
    const spans=btn.querySelectorAll(':scope > span');
    const text=Array.from(spans).find(x=>!x.classList.contains('navIcon')&&!x.classList.contains('quizNavBadge'));
    if(text)text.textContent=label;
    btn.setAttribute('aria-label',label);
  });
  const flash=document.getElementById('tabFlashcards'),mock=document.getElementById('tabMock');
  if(flash&&mock&&flash.nextElementSibling!==mock)links.insertBefore(flash,mock);

  links.querySelectorAll('.v2NavSection').forEach(x=>x.remove());
  const practice=document.createElement('div');practice.className='v2NavSection';practice.textContent='Practice';
  const tools=document.createElement('div');tools.className='v2NavSection';tools.textContent='Study tools';
  const q=document.getElementById('tabQuestions'),f=document.getElementById('tabFlashcards');
  if(q)links.insertBefore(practice,q);
  if(f)links.insertBefore(tools,f);

  const actions=document.querySelector('#studyTabs .appNavActions');
  if(actions&&!document.querySelector('.v2SidebarMeta')){
    const meta=document.createElement('div');meta.className='v2SidebarMeta';meta.innerHTML='KAU Medicine<br>MED25 Study Hub';
    actions.insertAdjacentElement('afterend',meta);
  }
}

function installFooter(){
  const shell=document.querySelector('.shell');
  if(!shell||document.getElementById('v2Footer'))return;
  const footer=document.createElement('footer');
  footer.id='v2Footer';footer.className='v2Footer';
  footer.innerHTML=
    '<div class="v2FooterBrand"><span class="v2FooterMark">M25</span><span><b>MED25 Study Hub</b><span>Built for KAU Medicine students</span></span></div>'+
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
  document.getElementById('v2InfoBody').innerHTML=data.body;
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
    const mode=btn.dataset.v2Practice;closePractice();
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
    if(key==='home')clickId('tabHome');
    if(key==='practice')openPractice();
    if(key==='flash')clickId('tabFlashcards');
    if(key==='mock'){
      if(typeof window.med25GameOpenMock==='function')window.med25GameOpenMock();else clickId('tabMock');
    }
    if(key==='profile'){
      clickId('tabHome');
      setTimeout(()=>{
        document.getElementById('homeAuthSlot')?.scrollIntoView({behavior:'smooth',block:'center'});
        syncMobileNav('profile');
      },80);
      return;
    }
    setTimeout(syncMobileNav,40);
  });
}

function currentMode(){
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
  document.querySelectorAll('[data-v2-mobile]').forEach(b=>b.classList.toggle('active',b.dataset.v2Mobile===mode));
}

function observeSections(){
  const ids=['homeSection','questionSection','aiSection','flashcardsSection','quizSection','mockSection'];
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
    new MutationObserver(()=>{polishHomeLabels();markCurrentRank()}).observe(list,{childList:true,subtree:true});
    markCurrentRank();return true;
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
  cleanNav();installFooter();installInfoSheet();installPracticeSheet();installMobileNav();observeSections();observeLeaderboard();polishHomeLabels();setupKeyboard();syncMobileNav();
  setTimeout(()=>{cleanNav();polishHomeLabels();syncMobileNav()},800);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0));else setTimeout(init,0);
})();