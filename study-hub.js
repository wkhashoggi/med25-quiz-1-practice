
(function(){
'use strict';
const HUB_SECTION_KEY='med25-main-section-v1';
const AI_LIBRARY_URL='ai_questions.json';
let aiLibrary={lecture_sets:[],generated_at:null};
let aiState={subject:'',lecture:'',search:'',filter:'all',page:1,pageSize:20,shuffle:false};

function aiProgress(){
  if(!saved.__ai_questions__||typeof saved.__ai_questions__!=='object')saved.__ai_questions__={};
  return saved.__ai_questions__;
}
function aiAllQuestions(){
  return (aiLibrary.lecture_sets||[]).filter(s=>!s.archived).flatMap(set=>(set.questions||[]).map(q=>({...q,set_id:set.id,subject:set.subject,lecture_title:set.title,source_url:set.source_url||q.source_url||'',source_validation:set.source_validation||'pending_lecture_validation'})));
}
function aiSave(){save();renderAIStats();renderHome()}
function aiFiltered(){
  const p=aiProgress(),query=(aiState.search||'').toLowerCase().trim();
  let qs=aiAllQuestions().filter(q=>{
    if(aiState.subject&&q.subject!==aiState.subject)return false;
    if(aiState.lecture&&q.set_id!==aiState.lecture)return false;
    if(query&&!((q.stem||'')+' '+Object.values(q.options||{}).join(' ')+' '+q.lecture_title+' '+q.subject+' '+q.concept).toLowerCase().includes(query))return false;
    if(aiState.filter==='unanswered'&&p[q.id]?.answered)return false;
    if(aiState.filter==='wrong'&&p[q.id]?.correct!==false)return false;
    if(aiState.filter==='starred'&&!p[q.id]?.starred)return false;
    return true;
  });
  if(aiState.shuffle)qs=qs.slice().sort((a,b)=>hubHash(a.id)-hubHash(b.id));
  return qs;
}
function hubHash(s){let h=7;for(let i=0;i<String(s).length;i++)h=(h*31+String(s).charCodeAt(i))|0;return Math.abs(h)}
function aiCard(q){
  const p=aiProgress()[q.id]||{},answered=!!p.answered,selected=p.selected;
  const opts=Object.entries(q.options||{}).map(([k,v])=>{
    let cls='aiOption';
    if(answered&&k===q.answer)cls+=' correct';
    else if(answered&&selected===k&&k!==q.answer)cls+=' wrong';
    else if(selected===k)cls+=' selected';
    return '<button class="'+cls+'" data-ai-answer="'+q.id+'" data-ai-opt="'+k+'" '+(answered?'disabled':'')+'><span class="aiLetter">'+k+'</span><span>'+esc(v)+'</span></button>';
  }).join('');
  const feedback=answered?'<div class="aiFeedback '+(p.correct?'good':'bad')+'"><b>'+(p.correct?'Correct.':'Correct answer: '+q.answer+'.')+'</b> '+esc(q.explanation||'')+'</div>':'';
  const validation=q.source_validation==='lecture_validated'?'source':'pending';
  const validationText=q.source_validation==='lecture_validated'?'Lecture validated':(q.source_validation==='lecture_validated_seed'?'Lecture-linked seed':'Validation pending');
  return '<article class="aiCard" id="'+q.id+'">'+
    '<button class="aiStar" data-ai-star="'+q.id+'" title="Star">'+(p.starred?'★':'☆')+'</button>'+
    '<div class="aiTop"><div class="aiMeta"><span class="aiPill">'+esc(q.subject)+'</span><span class="aiPill">'+esc(q.lecture_title)+'</span><span class="aiPill">'+esc(q.difficulty||'core')+'</span><span class="aiPill '+validation+'">'+validationText+'</span></div></div>'+
    '<div class="aiStem">'+esc(q.stem)+'</div><div class="aiOptions">'+opts+'</div>'+feedback+
    '<div class="aiActions">'+(q.source_url?'<button class="aiBtn" data-ai-source="'+q.id+'">Open source lecture ↗</button>':'')+'<button class="aiBtn" data-ai-copy="'+q.id+'">Copy question</button></div></article>';
}
function bindAI(){
  document.querySelectorAll('[data-ai-answer]').forEach(b=>b.onclick=()=>answerAI(b.dataset.aiAnswer,b.dataset.aiOpt));
  document.querySelectorAll('[data-ai-star]').forEach(b=>b.onclick=()=>starAI(b.dataset.aiStar));
  document.querySelectorAll('[data-ai-source]').forEach(b=>b.onclick=()=>openAISource(b.dataset.aiSource));
  document.querySelectorAll('[data-ai-copy]').forEach(b=>b.onclick=()=>copyAI(b.dataset.aiCopy));
}
function answerAI(id,opt){
  const q=aiAllQuestions().find(x=>x.id===id),p=aiProgress();if(!q||p[id]?.answered)return;
  p[id]={...(p[id]||{}),answered:true,selected:opt,correct:opt===q.answer,locked_at:new Date().toISOString()};
  aiSave();trackEvent('question_answer',{question_id:id,topic:q.concept||q.lecture_title||q.subject,metadata:{correct:opt===q.answer,first_attempt:true,source:'ai_generated'}});renderAI();
}
function starAI(id){const p=aiProgress();p[id]={...(p[id]||{}),starred:!p[id]?.starred};aiSave();renderAI()}
function openAISource(id){const q=aiAllQuestions().find(x=>x.id===id);if(q?.source_url)window.open(q.source_url,'_blank','noopener,noreferrer')}
function copyAI(id){const q=aiAllQuestions().find(x=>x.id===id);if(!q)return;const txt=q.stem+'\n'+Object.entries(q.options||{}).map(([k,v])=>k+'. '+v).join('\n');navigator.clipboard?.writeText(txt)}
function renderAI(){
  const host=document.getElementById('aiQuestionList');if(!host)return;
  const all=aiFiltered();
  const pages=Math.max(1,Math.ceil(all.length/aiState.pageSize));if(aiState.page>pages)aiState.page=pages;
  const start=(aiState.page-1)*aiState.pageSize,qs=all.slice(start,start+aiState.pageSize);
  const pager='<div class="aiPager"><button class="aiBtn" data-ai-page="prev" '+(aiState.page===1?'disabled':'')+'>← Previous</button><span>'+(all.length?((start+1)+'–'+Math.min(start+aiState.pageSize,all.length)+' of '+all.length):'0 questions')+' · Page '+aiState.page+'/'+pages+'</span><button class="aiBtn" data-ai-page="next" '+(aiState.page===pages?'disabled':'')+'>Next →</button></div>';
  host.innerHTML=qs.length?pager+qs.map(aiCard).join('')+pager:'<div class="empty">No AI questions match these filters.</div>';
  bindAI();
  document.querySelectorAll('[data-ai-page]').forEach(b=>b.onclick=()=>{
    if(b.dataset.aiPage==='prev'&&aiState.page>1)aiState.page--;
    if(b.dataset.aiPage==='next'&&aiState.page<pages)aiState.page++;
    renderAI();window.scrollTo({top:document.getElementById('aiSection').offsetTop,behavior:'smooth'});
  });
  renderAIStats();
}
function renderAIStats(){
  const p=aiProgress(),qs=aiAllQuestions(),answered=qs.filter(q=>p[q.id]?.answered).length,graded=qs.filter(q=>p[q.id]?.correct===true||p[q.id]?.correct===false),right=graded.filter(q=>p[q.id]?.correct===true).length;
  const host=document.getElementById('aiStats');
  if(host)host.innerHTML='<div class="aiStatGrid"><div class="aiStat"><b>'+qs.length+'</b><span>AI questions</span></div><div class="aiStat"><b>'+((aiLibrary.lecture_sets||[]).filter(s=>!s.archived).length)+'</b><span>lecture sets</span></div><div class="aiStat"><b>'+answered+'</b><span>answered</span></div><div class="aiStat"><b>'+(graded.length?Math.round(right/graded.length*100):0)+'%</b><span>accuracy</span></div></div>';
  const meta=document.getElementById('aiSyncMeta');if(meta)meta.textContent=(aiLibrary.lecture_sets||[]).filter(s=>!s.archived).length+' lecture sets · '+qs.length+' questions · updated '+prettyHubDate(aiLibrary.generated_at);
}
function prettyHubDate(v){if(!v)return 'not synced yet';try{return new Date(v).toLocaleString('en-GB',{timeZone:'Asia/Riyadh',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}catch{return v}}
function populateAIFilters(){
  const subject=document.getElementById('aiSubject'),lecture=document.getElementById('aiLecture');if(!subject||!lecture)return;
  const subjects=[...new Set((aiLibrary.lecture_sets||[]).filter(s=>!s.archived).map(s=>s.subject))].sort();
  subject.innerHTML='<option value="">All subjects</option>'+subjects.map(s=>'<option>'+esc(s)+'</option>').join('');
  subject.value=aiState.subject;
  const sets=(aiLibrary.lecture_sets||[]).filter(s=>!s.archived&&(!aiState.subject||s.subject===aiState.subject));
  lecture.innerHTML='<option value="">All lectures</option>'+sets.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.title)+'</option>').join('');
  if(sets.some(s=>s.id===aiState.lecture))lecture.value=aiState.lecture;else aiState.lecture='';
}
async function initAIQuestions(){
  try{const res=await fetch(AI_LIBRARY_URL+'?v='+Date.now(),{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);aiLibrary=await res.json();if(!Array.isArray(aiLibrary.lecture_sets))aiLibrary.lecture_sets=[]}
  catch(e){console.error('AI question library unavailable',e);aiLibrary={lecture_sets:[],generated_at:null}}
  populateAIFilters();renderAI();renderHome();
}
function setupAIControls(){
  const search=document.getElementById('aiSearch'),subject=document.getElementById('aiSubject'),lecture=document.getElementById('aiLecture');
  if(search)search.oninput=()=>{aiState.search=search.value;aiState.page=1;renderAI()};
  if(subject)subject.onchange=()=>{aiState.subject=subject.value;aiState.lecture='';aiState.page=1;populateAIFilters();renderAI()};
  if(lecture)lecture.onchange=()=>{aiState.lecture=lecture.value;aiState.page=1;renderAI()};
  document.querySelectorAll('[data-ai-filter]').forEach(b=>b.onclick=()=>{aiState.filter=b.dataset.aiFilter;aiState.page=1;document.querySelectorAll('[data-ai-filter]').forEach(x=>x.classList.toggle('active',x===b));renderAI()});
  const sh=document.getElementById('aiShuffle');if(sh)sh.onclick=()=>{aiState.shuffle=!aiState.shuffle;sh.classList.toggle('active',aiState.shuffle);aiState.page=1;renderAI()};
}
function homePastMetrics(){
  const done=QUESTIONS.filter(q=>saved[q.id]?.answered).length,graded=QUESTIONS.filter(q=>saved[q.id]?.correct===true||saved[q.id]?.correct===false),right=graded.filter(q=>saved[q.id]?.correct===true).length;
  return {done,total:QUESTIONS.length,accuracy:graded.length?Math.round(right/graded.length*100):0};
}
function homeAIMetrics(){
  const p=aiProgress(),qs=aiAllQuestions(),done=qs.filter(q=>p[q.id]?.answered).length,graded=qs.filter(q=>p[q.id]?.correct===true||p[q.id]?.correct===false),right=graded.filter(q=>p[q.id]?.correct===true).length;
  return {done,total:qs.length,accuracy:graded.length?Math.round(right/graded.length*100):0};
}
function homeFlashMetrics(){
  const cards=typeof allFlashCards==='function'?allFlashCards():[],now=Date.now(),seen=cards.filter(c=>cardReview(c.id)).length,due=cards.filter(c=>cardReview(c.id)&&Number(cardReview(c.id).due||0)<=now).length;
  const decks=(flashLibrary.decks||[]).filter(d=>!d.archived),started=decks.filter(d=>(d.cards||[]).some(c=>cardReview(c.id))).length;
  return {seen,total:cards.length,due,decks:decks.length,started};
}
function homeWeakTopics(){if(typeof topicPerformance!=='function')return [];return Object.values(topicPerformance()).filter(x=>x.graded>0).sort((a,b)=>a.accuracy-b.accuracy||b.graded-a.graded).slice(0,7)}
function homeSubjectRows(){
  const p=aiProgress(),sets=(aiLibrary.lecture_sets||[]).filter(s=>!s.archived),map={};
  sets.forEach(s=>{const x=map[s.subject]||(map[s.subject]={subject:s.subject,aiTotal:0,aiDone:0,aiRight:0,aiGraded:0,cards:0,seen:0});(s.questions||[]).forEach(q=>{x.aiTotal++;if(p[q.id]?.answered)x.aiDone++;if(p[q.id]?.correct===true){x.aiRight++;x.aiGraded++}else if(p[q.id]?.correct===false)x.aiGraded++})});
  (flashLibrary.decks||[]).filter(d=>!d.archived).forEach(d=>{const x=map[d.subject]||(map[d.subject]={subject:d.subject,aiTotal:0,aiDone:0,aiRight:0,aiGraded:0,cards:0,seen:0});(d.cards||[]).forEach(c=>{x.cards++;if(cardReview(c.id))x.seen++})});
  return Object.values(map).sort((a,b)=>a.subject.localeCompare(b.subject));
}
function renderHome(){
  const home=document.getElementById('homeSection');if(!home)return;
  const pp=homePastMetrics(),ai=homeAIMetrics(),fl=homeFlashMetrics(),metrics=document.getElementById('homeMetrics');
  if(metrics)metrics.innerHTML=
    '<div class="hubCard hubMetric"><b>'+pp.accuracy+'%</b><span>past-paper accuracy · '+pp.done+'/'+pp.total+' attempted</span><div class="hubBar"><span style="width:'+(pp.total?pp.done/pp.total*100:0)+'%"></span></div></div>'+
    '<div class="hubCard hubMetric"><b>'+ai.accuracy+'%</b><span>AI-question accuracy · '+ai.done+'/'+ai.total+' attempted</span><div class="hubBar"><span style="width:'+(ai.total?ai.done/ai.total*100:0)+'%"></span></div></div>'+
    '<div class="hubCard hubMetric"><b>'+fl.due+'</b><span>flashcards due now · '+fl.seen+'/'+fl.total+' seen</span><div class="hubBar"><span style="width:'+(fl.total?fl.seen/fl.total*100:0)+'%"></span></div></div>'+
    '<div class="hubCard hubMetric"><b>'+fl.started+'/'+fl.decks+'</b><span>lecture decks started</span><div class="hubBar"><span style="width:'+(fl.decks?fl.started/fl.decks*100:0)+'%"></span></div></div>';
  const weak=document.getElementById('homeWeak');
  if(weak){const rows=homeWeakTopics();weak.innerHTML=rows.length?'<div class="hubRows">'+rows.map(x=>'<div class="hubRow"><div class="hubRowMain"><b>'+esc(x.topic)+'</b><span>'+x.correct+'/'+x.graded+' correct'+(x.revealed?' · '+x.revealed+' revealed':'')+'</span></div><div class="hubRowScore">'+Math.round(x.accuracy*100)+'%</div></div>').join('')+'</div>':'<p>No graded past-paper data yet.</p>'}
  const subjects=document.getElementById('homeSubjects');
  if(subjects)subjects.innerHTML='<div class="hubRows">'+homeSubjectRows().map(x=>{const aiPct=x.aiGraded?Math.round(x.aiRight/x.aiGraded*100):0,flashPct=x.cards?Math.round(x.seen/x.cards*100):0;return '<div class="hubRow"><div class="hubRowMain"><b>'+esc(x.subject)+'</b><span>AI '+x.aiDone+'/'+x.aiTotal+' · Flashcards '+x.seen+'/'+x.cards+'</span><div class="hubBar"><span style="width:'+Math.round((aiPct+flashPct)/2)+'%"></span></div></div><div class="hubRowScore">'+aiPct+'% AI</div></div>'}).join('')+'</div>';
  const sync=document.getElementById('homeSync');if(sync)sync.textContent='Drive libraries: '+(aiLibrary.lecture_sets||[]).filter(s=>!s.archived).length+' AI lecture sets · '+(flashLibrary.decks||[]).filter(d=>!d.archived).length+' flashcard decks';
}
function hubGo(mode){switchStudySection(mode)}
function hubSwitch(mode){
  const home=mode==='home',past=mode==='questions',ai=mode==='ai',flash=mode==='flashcards';
  document.getElementById('homeSection')?.classList.toggle('hidden',!home);
  document.getElementById('questionSection')?.classList.toggle('hidden',!past);
  document.getElementById('aiSection')?.classList.toggle('hidden',!ai);
  document.getElementById('flashcardsSection')?.classList.toggle('hidden',!flash);
  document.getElementById('tabHome')?.classList.toggle('active',home);
  document.getElementById('tabQuestions')?.classList.toggle('active',past);
  document.getElementById('tabAI')?.classList.toggle('active',ai);
  document.getElementById('tabFlashcards')?.classList.toggle('active',flash);
  document.getElementById('stats')?.classList.toggle('hidden',!past);
  document.getElementById('questionProgressBar')?.classList.toggle('hidden',!past);
  document.getElementById('flashHeroStats')?.classList.toggle('hidden',!flash);
  const h=document.getElementById('heroTitle'),p=document.getElementById('heroDescription');
  if(home){if(h)h.textContent='MED25 Study Hub';if(p)p.textContent='Your progress across past papers, lecture-grounded AI questions, and spaced-repetition flashcards.';renderHome()}
  if(past){if(h)h.textContent='MED25 Past Papers';if(p)p.textContent='Previous-year questions and the coordinator formative, with repeated-concept sorting and source-lecture links.'}
  if(ai){if(h)h.textContent='MED25 AI-Generated Questions';if(p)p.textContent='KAU-style MCQs generated lecture-by-lecture from the official MED25 Drive, kept separate from past papers.';renderAI()}
  if(flash){if(h)h.textContent='MED25 Flashcards';if(p)p.textContent='Anki-style deck browser and spaced repetition, automatically synced lecture-by-lecture from the official MED25 Drive.';renderFlashDecks();renderFlashHeroStats()}
  try{localStorage.setItem(HUB_SECTION_KEY,mode)}catch{}
}
function hubSetupNavigation(){
  document.getElementById('tabHome').onclick=()=>hubSwitch('home');
  document.getElementById('tabQuestions').onclick=()=>hubSwitch('questions');
  document.getElementById('tabAI').onclick=()=>hubSwitch('ai');
  document.getElementById('tabFlashcards').onclick=()=>hubSwitch('flashcards');
  const mode=localStorage.getItem(HUB_SECTION_KEY)||'home';
  hubSwitch(['home','questions','ai','flashcards'].includes(mode)?mode:'home');
}
switchStudySection=hubSwitch;
setupStudyNavigation=hubSetupNavigation;
window.hubGo=hubGo;

/* One dhikr only at the bottom of each question page. */
const hubOriginalDhikrBox=typeof dhikrBox==='function'?dhikrBox:null;
if(hubOriginalDhikrBox)dhikrBox=function(){return ''};
function hubBottomDhikr(host,pageNumber,pageSize){
  if(!host||!hubOriginalDhikrBox)return;
  host.querySelectorAll('.dhikrbox').forEach(x=>x.remove());
  const last=host.lastElementChild;
  if(!last)return;
  const n=Math.max(1,Number(pageNumber)||1)*Math.max(1,Number(pageSize)||20);
  last.insertAdjacentHTML('beforebegin',hubOriginalDhikrBox(n));
}
const hubBasePastRender=render;
render=function(){
  const out=hubBasePastRender.apply(this,arguments);
  hubBottomDhikr(document.getElementById('list'),state.page,state.pageSize);
  return out;
};
const hubBaseAIRender=renderAI;
renderAI=function(){
  const out=hubBaseAIRender.apply(this,arguments);
  hubBottomDhikr(document.getElementById('aiQuestionList'),aiState.page,aiState.pageSize);
  return out;
};
const baseSave=save;
save=function(){const r=baseSave.apply(this,arguments);try{renderHome()}catch{}return r};
const baseFlashSave=saveFlashReview;
saveFlashReview=function(){const r=baseFlashSave.apply(this,arguments);try{renderHome()}catch{}return r};
setupAIControls();
initAIQuestions();
setTimeout(()=>{try{renderHome();renderAIStats()}catch{}},1000);
})();
