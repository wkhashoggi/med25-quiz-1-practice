
(function(){
'use strict';
const HUB_SECTION_KEY='med25-main-section-v1';
const AI_LIBRARY_URL='ai_questions.json';
const STUDY_GUIDE_CATALOG_URL='study-guide-lectures.json';
const STUDY_GUIDE_MAP_URL='question-study-guide-map.json';
let aiLibrary={lecture_sets:[],generated_at:null};
let studyGuideCatalog={subjects:[]};
let studyGuideQuestionMap={past:{},ai:{}};
let aiState={subject:'',lecture:'',search:'',filter:'all',page:1,pageSize:20,shuffle:false};
let aiAdvanced={status:'all',subject:'',lectures:new Set()};
let pastAdvanced={status:'all',subject:'',lectures:new Set()};

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
    if(aiAdvanced.status==='unanswered'&&p[q.id]?.answered)return false;
    if(aiAdvanced.status==='correct'&&p[q.id]?.correct!==true)return false;
    if(aiAdvanced.status==='wrong'&&p[q.id]?.correct!==false)return false;
    if(aiAdvanced.status==='starred'&&!p[q.id]?.starred)return false;
    if(aiAdvanced.status==='revealed'&&!p[q.id]?.revealed)return false;
    const guide=sgQuestionLecture('ai',q);
    if(aiAdvanced.subject&&guide.subject!==aiAdvanced.subject)return false;
    if(aiAdvanced.lectures.size&&!aiAdvanced.lectures.has(guide.lecture_id))return false;
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
    '<div class="aiTop"><div class="aiMeta"><span class="aiPill">'+esc(q.difficulty||'core')+'</span><span class="aiPill '+validation+'">'+validationText+'</span></div></div>'+
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
  try{
    const [aiRes,guideRes,mapRes]=await Promise.all([
      fetch(AI_LIBRARY_URL+'?v='+Date.now(),{cache:'no-store'}),
      fetch(STUDY_GUIDE_CATALOG_URL+'?v=1',{cache:'force-cache'}),
      fetch(STUDY_GUIDE_MAP_URL+'?v=1',{cache:'force-cache'})
    ]);
    if(!aiRes.ok)throw new Error('AI HTTP '+aiRes.status);
    aiLibrary=await aiRes.json();if(!Array.isArray(aiLibrary.lecture_sets))aiLibrary.lecture_sets=[];
    if(guideRes.ok)studyGuideCatalog=await guideRes.json();
    if(mapRes.ok)studyGuideQuestionMap=await mapRes.json();
  }catch(e){console.error('Study libraries unavailable',e);if(!Array.isArray(aiLibrary.lecture_sets))aiLibrary={lecture_sets:[],generated_at:null}}
  qaPastLectureCache.clear();
  const legacyTopic=document.getElementById('topic');if(legacyTopic)legacyTopic.value='';
  aiState.subject='';aiState.lecture='';
  populateAIFilters();setupAdvancedQuestionFilters();renderAI();render();renderHome();
}
function setupAIControls(){
  const search=document.getElementById('aiSearch'),subject=document.getElementById('aiSubject'),lecture=document.getElementById('aiLecture');
  if(search)search.oninput=()=>{aiState.search=search.value;aiState.page=1;renderAI()};
  if(subject)subject.onchange=()=>{aiState.subject=subject.value;aiState.lecture='';aiState.page=1;populateAIFilters();renderAI()};
  if(lecture)lecture.onchange=()=>{aiState.lecture=lecture.value;aiState.page=1;renderAI()};
  document.querySelectorAll('[data-ai-filter]').forEach(b=>b.onclick=()=>{aiState.filter=b.dataset.aiFilter;aiState.page=1;document.querySelectorAll('[data-ai-filter]').forEach(x=>x.classList.toggle('active',x===b));renderAI()});
  const sh=document.getElementById('aiShuffle');if(sh)sh.onclick=()=>{aiState.shuffle=!aiState.shuffle;sh.classList.toggle('active',aiState.shuffle);aiState.page=1;renderAI()};
}


function qaNorm(v){
  return String(v||'').toLowerCase().replace(/haem/g,'heme').replace(/&/g,' and ').replace(/\b(lecture|slides?|student|third|year|dr|the|of|and|for|with|part)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function qaOverlap(a,b){
  const A=new Set(qaNorm(a).split(' ').filter(x=>x.length>2)),B=new Set(qaNorm(b).split(' ').filter(x=>x.length>2));
  if(!A.size||!B.size)return 0;
  let hit=0;A.forEach(x=>{if(B.has(x))hit++});
  return hit/Math.max(1,Math.min(A.size,B.size));
}
function qaLectureCatalog(){
  return (studyGuideCatalog.subjects||[]).flatMap(s=>(s.lectures||[]).map(l=>({...l,subject:s.name||l.subject})));
}
function qaSubjects(){
  return (studyGuideCatalog.subjects||[]).map(s=>s.name).filter(Boolean);
}
function qaSubjectLectures(subject){
  const s=(studyGuideCatalog.subjects||[]).find(x=>x.name===subject);
  return (s?.lectures||[]).slice();
}
const qaPastLectureCache=new Map();
const qaAILectureCache=new Map();
const SG_SUBJECT_MAP={Physiology:'Physiology',Biochemistry:'Biochemistry',Pathology:'Pathology',Pharmacology:'Pharmacology',Microbiology:'Microbiology',Hematology:'Hematology',Anatomy:'Anatomy & Histology',Histology:'Anatomy & Histology'};
function sgFallback(kind,q){
  const cache=kind==='past'?qaPastLectureCache:qaAILectureCache;
  if(cache.has(q.id))return cache.get(q.id);
  const catalog=qaLectureCatalog();
  const source=kind==='past'?(q.lecture_source?.title||''):(q.lecture_title||'');
  const hinted=kind==='ai'?SG_SUBJECT_MAP[q.subject]:null;
  const candidates=hinted?catalog.filter(x=>x.subject===hinted):catalog;
  const query=[source,q.topic,(q.concepts||[]).join(' '),q.concept,q.stem,q.answer_text,q.explanation,Object.values(q.options||{}).join(' ')].join(' ');
  let best=null,bestScore=-1;
  for(const l of candidates){
    let score=8*qaOverlap(source,l.title)+5*qaOverlap(query,l.title)+3*qaOverlap(query,l.objectives||'');
    const ns=qaNorm(source),nt=qaNorm(l.title);
    if(ns&&nt&&(ns.includes(nt)||nt.includes(ns)))score+=7;
    if(score>bestScore){bestScore=score;best=l}
  }
  const out=best?{lecture_id:best.id,subject:best.subject,title:best.title,method:'objectives-runtime'}:{lecture_id:'',subject:hinted||'Other',title:source||'Unmapped lecture',method:'unmapped'};
  cache.set(q.id,out);return out;
}
function sgQuestionLecture(kind,q){
  const mapped=studyGuideQuestionMap?.[kind]?.[q.id];
  return mapped&&mapped.lecture_id?mapped:sgFallback(kind,q);
}
function qaStatusPass(p,status){
  if(status==='all')return true;
  if(status==='unanswered')return !p?.answered;
  if(status==='correct')return p?.correct===true;
  if(status==='wrong')return p?.correct===false;
  if(status==='starred')return !!p?.starred;
  if(status==='revealed')return !!p?.revealed||(!!p?.answered&&!p?.selected&&p?.correct==null);
  return true;
}
function qaIds(prefix,name){return prefix+'Guide'+name}
function qaLectureDropdownHtml(prefix){
  return '<div class="qaMulti" id="'+qaIds(prefix,'LectureMulti')+'">'+
    '<button class="qaMultiBtn" id="'+qaIds(prefix,'LectureBtn')+'" type="button" disabled>Select subject first</button>'+
    '<div class="qaMultiPanel hidden" id="'+qaIds(prefix,'LecturePanel')+'"></div>'+
  '</div>';
}
function qaFilterBarHtml(prefix){
  return '<div class="qaFilterBar qaFilterBarSimple" id="'+qaIds(prefix,'Filters')+'">'+
    '<label class="qaField"><span>Answer status</span><select id="'+qaIds(prefix,'Status')+'"><option value="all">All</option><option value="unanswered">Unanswered</option><option value="correct">Correct</option><option value="wrong">Wrong</option><option value="starred">Starred</option><option value="revealed">Revealed answer</option></select></label>'+
    '<label class="qaField"><span>Subject</span><select id="'+qaIds(prefix,'Subject')+'"><option value="">All subjects</option></select></label>'+
    '<div class="qaField"><span>Lecture(s)</span>'+qaLectureDropdownHtml(prefix)+'</div>'+
    '<button class="qaClearBtn" id="'+qaIds(prefix,'Clear')+'" type="button">Clear filters</button>'+
  '</div>';
}
function qaRenderLecturePicker(prefix,model){
  const btn=document.getElementById(qaIds(prefix,'LectureBtn')),panel=document.getElementById(qaIds(prefix,'LecturePanel'));
  if(!btn||!panel)return;
  if(!model.subject){
    btn.disabled=true;btn.textContent='Select subject first';panel.classList.add('hidden');panel.innerHTML='';return;
  }
  const lectures=qaSubjectLectures(model.subject);
  btn.disabled=false;
  if(model.lectures.size===1){
    const one=lectures.find(x=>model.lectures.has(x.id));btn.textContent=one?.title||'1 lecture selected';
  }else if(model.lectures.size>1)btn.textContent=model.lectures.size+' lectures selected';
  else btn.textContent='All '+model.subject+' lectures';
  panel.innerHTML='<div class="qaMultiHead"><b>'+esc(model.subject)+' lectures</b><button type="button" data-qa-clear-lectures="'+prefix+'">Clear</button></div>'+
    lectures.map(x=>'<label class="qaCheck"><input type="checkbox" value="'+esc(x.id)+'" '+(model.lectures.has(x.id)?'checked':'')+'><span>'+esc(x.title)+'</span></label>').join('');
  panel.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.onchange=()=>{
    cb.checked?model.lectures.add(cb.value):model.lectures.delete(cb.value);
    qaRenderLecturePicker(prefix,model);qaApply(prefix);
  });
  panel.querySelector('[data-qa-clear-lectures]')?.addEventListener('click',e=>{
    e.stopPropagation();model.lectures.clear();qaRenderLecturePicker(prefix,model);qaApply(prefix);
  });
}
function qaApply(prefix){
  if(prefix==='past'){state.page=1;resetUnansweredSnapshot();render()}
  else{aiState.page=1;renderAI()}
}
function qaResetLegacyStatus(prefix){
  if(prefix==='past'){
    state.filter='all';
    document.querySelectorAll('#questionSection .chip[data-filter]').forEach(x=>x.classList.toggle('active',x.dataset.filter==='all'));
  }else aiState.filter='all';
}
function qaSetupOne(prefix,model,host){
  if(!host)return;
  const old=document.getElementById(qaIds(prefix,'Filters'));if(old)old.remove();
  host.insertAdjacentHTML('afterend',qaFilterBarHtml(prefix));
  const subject=document.getElementById(qaIds(prefix,'Subject')),status=document.getElementById(qaIds(prefix,'Status')),btn=document.getElementById(qaIds(prefix,'LectureBtn')),panel=document.getElementById(qaIds(prefix,'LecturePanel')),clear=document.getElementById(qaIds(prefix,'Clear'));
  subject.innerHTML='<option value="">All subjects</option>'+qaSubjects().map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
  subject.value=model.subject||'';status.value=model.status||'all';
  status.onchange=()=>{model.status=status.value;qaResetLegacyStatus(prefix);qaApply(prefix)};
  subject.onchange=()=>{model.subject=subject.value;model.lectures.clear();qaRenderLecturePicker(prefix,model);qaApply(prefix)};
  btn.onclick=e=>{e.stopPropagation();if(!btn.disabled)panel.classList.toggle('hidden')};
  panel.onclick=e=>e.stopPropagation();
  clear.onclick=()=>{
    model.status='all';model.subject='';model.lectures.clear();status.value='all';subject.value='';qaRenderLecturePicker(prefix,model);qaResetLegacyStatus(prefix);qaApply(prefix);
  };
  qaRenderLecturePicker(prefix,model);
}
function setupAdvancedQuestionFilters(){
  qaPastLectureCache.clear();qaAILectureCache.clear();
  const legacyTopic=document.getElementById('topic');if(legacyTopic){legacyTopic.value='';legacyTopic.style.display='none'}
  const oldAISub=document.getElementById('aiSubject'),oldAILec=document.getElementById('aiLecture');if(oldAISub)oldAISub.style.display='none';if(oldAILec)oldAILec.style.display='none';
  document.querySelectorAll('#questionSection .chip[data-filter="unanswered"],#questionSection .chip[data-filter="wrong"],#questionSection .chip[data-filter="starred"]').forEach(x=>x.remove());
  document.querySelectorAll('#aiSection [data-ai-filter]').forEach(x=>x.remove());
  qaSetupOne('past',pastAdvanced,document.querySelector('#questionSection .toolbar'));
  qaSetupOne('ai',aiAdvanced,document.querySelector('#aiSection .aiToolbar'));
  if(!window.__med25GuideFiltersBound){
    window.__med25GuideFiltersBound=true;
    document.addEventListener('click',()=>document.querySelectorAll('.qaMultiPanel').forEach(x=>x.classList.add('hidden')));
  }
}
function sgLabelVisible(root,kind){
  if(!root)return;
  root.querySelectorAll(kind==='past'?'.qcard[id]':'.aiCard[id]').forEach(card=>{
    const id=card.id,q=kind==='past'?QUESTIONS.find(x=>x.id===id):aiAllQuestions().find(x=>x.id===id);
    if(!q)return;
    const g=sgQuestionLecture(kind,q),meta=card.querySelector(kind==='past'?'.qtop .meta':'.aiMeta');
    if(!meta||meta.querySelector('.sgLecturePill'))return;
    const pill=document.createElement('span');pill.className=kind==='past'?'pill sgLecturePill':'aiPill sgLecturePill';
    pill.textContent=g.subject+' · '+g.title;pill.title='Mapped from the official 2026–2027 study-guide learning objectives';
    meta.appendChild(pill);
  });
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
function weakKey(s){return String(s||'').toLowerCase().replace(/&/g,' and ').replace(/\b(lecture|part|physiology|pathology|pharmacology|histology|anatomy|the|of|and|in|to)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function weakSimilarity(a,b){
  const aa=new Set(weakKey(a).split(' ').filter(Boolean)),bb=new Set(weakKey(b).split(' ').filter(Boolean));
  if(!aa.size||!bb.size)return 0;
  let hit=0;aa.forEach(x=>{if(bb.has(x))hit++});
  return hit/Math.max(aa.size,bb.size);
}
function homeWeakTopics(){
  const rows=[];
  function bucket(label){
    const key=weakKey(label);
    let hit=rows.find(x=>x.key===key);
    if(!hit){
      let best=null,bestScore=0;
      for(const x of rows){const sc=weakSimilarity(label,x.topic);if(sc>bestScore){best=x;bestScore=sc}}
      if(bestScore>=0.67)hit=best;
    }
    if(!hit){hit={key,topic:label,graded:0,correct:0,pastGraded:0,pastCorrect:0,aiGraded:0,aiCorrect:0};rows.push(hit)}
    return hit;
  }
  QUESTIONS.forEach(q=>{
    const p=saved[q.id];if(p?.correct!==true&&p?.correct!==false)return;
    const x=bucket(q.topic);x.graded++;x.pastGraded++;if(p.correct){x.correct++;x.pastCorrect++}
  });
  const ap=aiProgress();
  aiAllQuestions().forEach(q=>{
    const p=ap[q.id];if(p?.correct!==true&&p?.correct!==false)return;
    const label=q.lecture_title||q.concept||q.subject||'AI Questions';
    const x=bucket(label);x.graded++;x.aiGraded++;if(p.correct){x.correct++;x.aiCorrect++}
  });
  rows.forEach(x=>x.accuracy=x.graded?x.correct/x.graded:0);
  const eligible=rows.filter(x=>x.graded>=2);
  return (eligible.length?eligible:rows).sort((a,b)=>a.accuracy-b.accuracy||b.graded-a.graded||a.topic.localeCompare(b.topic)).slice(0,8);
}

let lectureDashState={subject:'',status:'',search:''};
const lectureDeckMapCache=new Map();

function lectureGuideDeck(deck){
  if(!deck)return null;
  if(lectureDeckMapCache.has(deck.id))return lectureDeckMapCache.get(deck.id);
  const cat=qaLectureCatalog();
  const hinted=SG_SUBJECT_MAP[deck.subject]||deck.subject||'';
  const candidates=hinted?cat.filter(x=>x.subject===hinted):cat;
  const source=[deck.title,deck.subject,(deck.cards||[]).slice(0,8).map(c=>(c.front||'')+' '+(c.back||'')).join(' ')].join(' ');
  let best=null,bestScore=-1;
  for(const l of candidates){
    let score=8*qaOverlap(deck.title,l.title)+3*qaOverlap(source,l.title)+2*qaOverlap(source,l.objectives||'');
    const a=qaNorm(deck.title),b=qaNorm(l.title);
    if(a&&b&&(a.includes(b)||b.includes(a)))score+=8;
    if(score>bestScore){bestScore=score;best=l}
  }
  lectureDeckMapCache.set(deck.id,best||null);
  return best||null;
}
function lectureDateValue(v){
  if(!v)return 0;
  const n=Number(v);if(Number.isFinite(n)&&n>0)return n;
  const d=Date.parse(v);return Number.isFinite(d)?d:0;
}
function lectureLastStudiedLabel(ts){
  if(!ts)return 'Never';
  const diff=Math.max(0,Date.now()-ts),day=86400000;
  if(diff<day)return 'Today';
  if(diff<2*day)return 'Yesterday';
  if(diff<7*day)return Math.floor(diff/day)+'d ago';
  try{return new Date(ts).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}catch{return '—'}
}

function lectureStudyProgress(){
  if(!saved.__lecture_study__||typeof saved.__lecture_study__!=='object')saved.__lecture_study__={};
  return saved.__lecture_study__;
}
function lectureStudied(id){
  return !!lectureStudyProgress()[id]?.studied;
}
function toggleLectureStudied(id){
  const map=lectureStudyProgress(),current=!!map[id]?.studied;
  map[id]={...(map[id]||{}),studied:!current,updated_at:new Date().toISOString()};
  save();
  renderLectureDashboard();
}

function lectureDashboardRows(){
  const lectures=qaLectureCatalog(),rows=new Map();
  for(const l of lectures){
    rows.set(l.id,{
      id:l.id,subject:l.subject,title:l.title,
      pastTotal:0,pastDone:0,pastCorrect:0,pastGraded:0,
      aiTotal:0,aiDone:0,aiCorrect:0,aiGraded:0,
      lastStudied:lectureDateValue(lectureStudyProgress()[l.id]?.updated_at),manualStudied:lectureStudied(l.id)
    });
  }
  QUESTIONS.forEach(q=>{
    const g=sgQuestionLecture('past',q),r=rows.get(g.lecture_id);if(!r)return;
    r.pastTotal++;
    const p=saved[q.id];
    if(p?.answered)r.pastDone++;
    if(p?.correct===true){r.pastCorrect++;r.pastGraded++}
    else if(p?.correct===false)r.pastGraded++;
    r.lastStudied=Math.max(r.lastStudied,lectureDateValue(p?.locked_at||p?.answered_at));
  });
  const ap=aiProgress();
  aiAllQuestions().forEach(q=>{
    const g=sgQuestionLecture('ai',q),r=rows.get(g.lecture_id);if(!r)return;
    r.aiTotal++;
    const p=ap[q.id];
    if(p?.answered)r.aiDone++;
    if(p?.correct===true){r.aiCorrect++;r.aiGraded++}
    else if(p?.correct===false)r.aiGraded++;
    r.lastStudied=Math.max(r.lastStudied,lectureDateValue(p?.locked_at||p?.answered_at));
  });
  const out=[...rows.values()];
  out.forEach(r=>{
    const qTotal=r.pastTotal+r.aiTotal,qDone=r.pastDone+r.aiDone,qGraded=r.pastGraded+r.aiGraded,qCorrect=r.pastCorrect+r.aiCorrect;
    r.questionTotal=qTotal;
    r.questionDone=qDone;
    r.questionCoverage=qTotal?Math.round(qDone/qTotal*100):0;
    r.questionsComplete=qTotal>0&&qDone===qTotal;
    r.accuracy=qGraded?Math.round(qCorrect/qGraded*100):null;
    r.studyComplete=r.manualStudied;
    r.completion=Math.round(((r.manualStudied?1:0)+(r.questionsComplete?1:0))/2*100);
    const anyQuestions=qDone>0;
    if(r.questionsComplete&&r.manualStudied)r.status='complete';
    else if(r.questionsComplete)r.status='questions-complete';
    else if(r.manualStudied)r.status='studied';
    else if(anyQuestions)r.status='practicing';
    else r.status='not-started';
  });
  return out;
}
function lectureStatusLabel(s){
  return s==='not-started'?'Not started':
    s==='practicing'?'Practicing':
    s==='studied'?'Studied':
    s==='questions-complete'?'Questions complete':
    s==='complete'?'Complete':'Learning';
}
function lectureDashFiltered(){
  const q=(lectureDashState.search||'').toLowerCase().trim();
  return lectureDashboardRows().filter(r=>{
    if(lectureDashState.subject&&r.subject!==lectureDashState.subject)return false;
    if(lectureDashState.status&&r.status!==lectureDashState.status)return false;
    if(q&&!((r.title+' '+r.subject).toLowerCase().includes(q)))return false;
    return true;
  }).sort((a,b)=>{
    const order={'practicing':0,'studied':1,'questions-complete':2,'not-started':3,'complete':4};
    return (order[a.status]-order[b.status])||a.subject.localeCompare(b.subject)||a.title.localeCompare(b.title);
  });
}
function setupLectureDashboardControls(){
  const subject=document.getElementById('lectureDashSubject'),status=document.getElementById('lectureDashStatus'),search=document.getElementById('lectureDashSearch');
  if(!subject||subject.dataset.bound)return;
  subject.dataset.bound='1';
  subject.innerHTML='<option value="">All subjects</option>'+qaSubjects().map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
  subject.value=lectureDashState.subject;
  status.value=lectureDashState.status;
  search.value=lectureDashState.search;
  subject.onchange=()=>{lectureDashState.subject=subject.value;renderLectureDashboard()};
  status.onchange=()=>{lectureDashState.status=status.value;renderLectureDashboard()};
  search.oninput=()=>{lectureDashState.search=search.value;renderLectureDashboard()};
}
function renderLectureDashboard(){
  const host=document.getElementById('lectureDashboard'),summary=document.getElementById('lectureDashboardSummary');
  if(!host)return;
  setupLectureDashboardControls();
  const all=lectureDashboardRows(),rows=lectureDashFiltered();
  const counts={complete:0,studied:0,practicing:0,'questions-complete':0,'not-started':0};
  all.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);
  if(summary)summary.innerHTML=
    '<span><b>'+all.length+'</b> official lectures</span>'+
    '<span><b>'+counts.complete+'</b> fully complete</span>'+
    '<span><b>'+all.filter(r=>r.manualStudied).length+'</b> studied by you</span>'+
    '<span><b>'+all.filter(r=>r.questionsComplete).length+'</b> question-complete</span>'+
    '<span><b>'+counts.practicing+'</b> practicing</span>'+
    '<span><b>'+counts['not-started']+'</b> not started</span>';
  if(!rows.length){host.innerHTML='<div class="lectureDashEmpty">No lectures match these filters.</div>';return}
  const head='<div class="lectureDashRow lectureDashColumns">'+
    '<div>Lecture</div><div>Your study</div><div>Questions</div><div>Past papers</div><div>AI</div><div>Question progress</div><div>Accuracy</div><div>Last activity</div><div>Status</div></div>';
  host.innerHTML=head+rows.map(r=>
    '<div class="lectureDashRow">'+
      '<div class="lectureDashLecture"><b>'+esc(r.title)+'</b><span>'+esc(r.subject)+'</span></div>'+
      '<div class="lectureDashCheckCell"><button class="lectureManualCheck '+(r.manualStudied?'checked':'')+'" type="button" data-lecture-study="'+esc(r.id)+'" title="'+(r.manualStudied?'Mark lecture as not studied':'Mark lecture as studied')+'"><span>✓</span></button><small>'+ (r.manualStudied?'Studied':'Mark studied') +'</small></div>'+
      '<div class="lectureDashCheckCell"><div class="lectureAutoCheck '+(r.questionsComplete?'checked':'')+'" title="'+(r.questionsComplete?'All mapped Past Paper and AI questions answered':'Complete every mapped Past Paper and AI question to earn this check')+'"><span>✓</span></div><small>'+(r.questionsComplete?'Complete':r.questionDone+'/'+r.questionTotal)+'</small></div>'+
      '<div class="lectureDashCell"><b>'+r.pastDone+'/'+r.pastTotal+'</b><span>answered</span></div>'+
      '<div class="lectureDashCell"><b>'+r.aiDone+'/'+r.aiTotal+'</b><span>answered</span></div>'+
      '<div class="lectureDashProgress"><b>'+r.questionCoverage+'%</b><div class="lectureMiniBar"><span style="width:'+r.questionCoverage+'%"></span></div></div>'+
      '<div class="lectureDashCell"><b>'+(r.accuracy===null?'—':r.accuracy+'%')+'</b><span>'+(r.pastGraded+r.aiGraded)+' graded</span></div>'+
      '<div class="lectureDashCell"><b>'+lectureLastStudiedLabel(r.lastStudied)+'</b></div>'+
      '<div><span class="lectureStatus '+r.status+'">'+lectureStatusLabel(r.status)+'</span></div>'+
    '</div>'
  ).join('');
  host.querySelectorAll('[data-lecture-study]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    toggleLectureStudied(btn.dataset.lectureStudy);
  });
}
function homeSubjectRows(){
  const rows=lectureDashboardRows(),map={};
  rows.forEach(r=>{
    const x=map[r.subject]||(map[r.subject]={subject:r.subject,lectures:0,studied:0,questionComplete:0,questions:0,done:0,right:0,graded:0});
    x.lectures++;if(r.manualStudied)x.studied++;if(r.questionsComplete)x.questionComplete++;
    x.questions+=r.questionTotal;x.done+=r.questionDone;x.right+=r.pastCorrect+r.aiCorrect;x.graded+=r.pastGraded+r.aiGraded;
  });
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
  if(weak){const rows=homeWeakTopics();weak.innerHTML=rows.length?'<div class="hubRows">'+rows.map(x=>'<div class="hubRow"><div class="hubRowMain"><b>'+esc(x.topic)+'</b><span>'+(x.pastGraded?'Past papers '+x.pastCorrect+'/'+x.pastGraded:'')+(x.pastGraded&&x.aiGraded?' · ':'')+(x.aiGraded?'AI '+x.aiCorrect+'/'+x.aiGraded:'')+' · '+x.correct+'/'+x.graded+' combined</span></div><div class="hubRowScore">'+Math.round(x.accuracy*100)+'%</div></div>').join('')+'</div>':'<p>Answer some Past Paper or AI questions and your weakest topics will appear here.</p>'}
  const subjects=document.getElementById('homeSubjects');
  if(subjects)subjects.innerHTML='<div class="hubRows">'+homeSubjectRows().map(x=>{const qPct=x.questions?Math.round(x.done/x.questions*100):0;return '<div class="hubRow"><div class="hubRowMain"><b>'+esc(x.subject)+'</b><span>Studied '+x.studied+'/'+x.lectures+' lectures · Questions '+x.done+'/'+x.questions+'</span><div class="hubBar"><span style="width:'+qPct+'%"></span></div></div><div class="hubRowScore">'+x.questionComplete+'/'+x.lectures+' complete</div></div>'}).join('')+'</div>';
  renderLectureDashboard();
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

const qaBasePastFiltered=filtered;
filtered=function(){
  let qs=qaBasePastFiltered.apply(this,arguments);
  return qs.filter(q=>{
    const p=saved[q.id]||{},g=sgQuestionLecture('past',q);
    if(!qaStatusPass(p,pastAdvanced.status))return false;
    if(pastAdvanced.subject&&g.subject!==pastAdvanced.subject)return false;
    if(pastAdvanced.lectures.size&&!pastAdvanced.lectures.has(g.lecture_id))return false;
    return true;
  });
};

switchStudySection=hubSwitch;
setupStudyNavigation=hubSetupNavigation;
window.hubGo=hubGo;

function removeLegacyAnalysisBoxes(){
  const weakBox=document.getElementById('weakTopicStats')?.closest('.box');
  const repeatedBox=document.getElementById('topicStats')?.closest('.box');
  if(weakBox)weakBox.remove();
  if(repeatedBox)repeatedBox.remove();
  try{renderTopicStats=function(){}}catch{}
}
removeLegacyAnalysisBoxes();

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
  sgLabelVisible(document.getElementById('list'),'past');
  hubBottomDhikr(document.getElementById('list'),state.page,state.pageSize);
  return out;
};
const hubBaseAIRender=renderAI;
renderAI=function(){
  const out=hubBaseAIRender.apply(this,arguments);
  sgLabelVisible(document.getElementById('aiQuestionList'),'ai');
  hubBottomDhikr(document.getElementById('aiQuestionList'),aiState.page,aiState.pageSize);
  return out;
};
const baseSave=save;
save=function(){const r=baseSave.apply(this,arguments);try{renderHome()}catch{}return r};
const baseFlashSave=saveFlashReview;
saveFlashReview=function(){const r=baseFlashSave.apply(this,arguments);try{renderHome()}catch{}return r};

setupAIControls();
initAIQuestions();
setTimeout(()=>{try{setupAdvancedQuestionFilters();renderHome();renderAIStats()}catch{}},1000);
})();
