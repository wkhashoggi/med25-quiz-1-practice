
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
let aiUnansweredPagePins=new Set();
function aiClearUnansweredPins(){aiUnansweredPagePins.clear()}
function aiIsUnansweredMode(){return aiState.filter==='unanswered'||aiAdvanced.status==='unanswered'}
let aiAdvanced={status:'all',subject:'',lectures:new Set()};
let pastAdvanced={status:'all',subject:'',lectures:new Set()};

function aiProgress(){
  if(!saved.__ai_questions__||typeof saved.__ai_questions__!=='object')saved.__ai_questions__={};
  return saved.__ai_questions__;
}
function aiAllQuestions(){
  return (aiLibrary.lecture_sets||[]).filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass').flatMap(set=>(set.questions||[]).map(q=>({...q,set_id:set.id,subject:set.subject,lecture_title:set.title,source_url:set.source_url||q.source_url||'',source_validation:set.source_validation||'pending_lecture_validation'})));
}
window.med25GameBridge=window.med25GameBridge||{};
window.med25GameBridge.aiQuestions=()=>aiAllQuestions();
window.med25GameBridge.aiProgress=()=>aiProgress();
window.med25ExamReadyPast=q=>{
  if(!q?.id||!q?.answer)return false;
  const entries=Object.entries(q.options||{});
  if(entries.length<4)return false;
  if(!entries.some(([k])=>k===q.answer))return false;
  const vals=entries.map(([,v])=>String(v||'').trim().toLowerCase());
  return vals.length===new Set(vals).size;
};

function aiSave(){save();renderAIStats();med25MarkHomeDirty()}
function aiFiltered(){
  const p=aiProgress(),query=(aiState.search||'').toLowerCase().trim();
  let qs=aiAllQuestions().filter(q=>{
    if(aiState.subject&&q.subject!==aiState.subject)return false;
    if(aiState.lecture&&q.set_id!==aiState.lecture)return false;
    if(query&&!((q.stem||'')+' '+Object.values(q.options||{}).join(' ')+' '+q.lecture_title+' '+q.subject+' '+q.concept).toLowerCase().includes(query))return false;
    if(aiState.filter==='unanswered'&&p[q.id]?.answered&&!aiUnansweredPagePins.has(q.id))return false;
    if(aiState.filter==='wrong'&&p[q.id]?.correct!==false)return false;
    if(aiState.filter==='starred'&&!p[q.id]?.starred)return false;
    if(aiAdvanced.status==='unanswered'&&p[q.id]?.answered&&!aiUnansweredPagePins.has(q.id))return false;
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
    let cls='option aiOption';
    if(answered&&k===q.answer)cls+=' correct';
    else if(answered&&selected===k&&k!==q.answer)cls+=' wrong';
    else if(selected===k)cls+=' selected';
    return '<button class="'+cls+'" data-ai-answer="'+q.id+'" data-ai-opt="'+k+'" '+(answered?'disabled aria-disabled="true"':'')+'><span class="letter aiLetter">'+k+'</span><span>'+esc(v)+'</span></button>';
  }).join('');
  const feedback=answered?'<div class="feedback show aiFeedback '+(p.correct?'correct good':'wrong bad')+'"><b>'+(p.correct?'Correct.':'Correct answer: '+q.answer+'.')+'</b> '+esc(q.explanation||'')+'</div>':'';
  const lectureLabel=(q.subject?esc(q.subject)+' · ':'')+esc(q.lecture_title||'');
  return '<article class="qcard aiCard" id="'+q.id+'">'+
    '<span class="reviewmark aiStar" data-ai-star="'+q.id+'" title="Star for review">'+(p.starred?'★':'☆')+'</span>'+
    '<div class="qtop aiTop"><div class="meta aiMeta">'+(q.case_style==='formative_short_case'?'<span class="pill caseStamp">CASE</span>':'')+'<span class="pill aiPill">'+esc(q.difficulty||'core')+'</span><span class="pill aiPill sgLecturePill">'+lectureLabel+'</span></div><span class="qnum examQuestionNumber">Question</span></div>'+
    '<div class="stem aiStem">'+esc(q.stem)+'</div><div class="options aiOptions">'+opts+'</div>'+feedback+
    '<div class="actions aiActions">'+(q.source_url?'<button class="btn aiBtn sourcebtn" data-ai-source="'+q.id+'">Open source lecture ↗</button>':'')+'<button class="btn aiBtn" data-ai-copy="'+q.id+'">Copy question</button></div></article>';
}
function bindAI(){
  document.querySelectorAll('[data-ai-answer]').forEach(b=>b.onclick=()=>answerAI(b.dataset.aiAnswer,b.dataset.aiOpt));
  document.querySelectorAll('[data-ai-star]').forEach(b=>b.onclick=()=>starAI(b.dataset.aiStar));
  document.querySelectorAll('[data-ai-source]').forEach(b=>b.onclick=()=>openAISource(b.dataset.aiSource));
  document.querySelectorAll('[data-ai-copy]').forEach(b=>b.onclick=()=>copyAI(b.dataset.aiCopy));
}
function answerAI(id,opt){
  const q=aiAllQuestions().find(x=>x.id===id),p=aiProgress();if(!q||p[id]?.answered)return;
  if(aiIsUnansweredMode())aiUnansweredPagePins.add(id);
  p[id]={...(p[id]||{}),answered:true,selected:opt,correct:opt===q.answer,locked_at:new Date().toISOString()};
  aiSave();
  trackEvent('question_answer',{question_id:id,topic:q.concept||q.lecture_title||q.subject,metadata:{correct:opt===q.answer,first_attempt:true,source:'ai_generated'}});
  try{
    if(typeof window.med25GameRecordAttempt==='function')window.med25GameRecordAttempt('ai',id,p[id].correct);
    else{
      window.med25PendingGameAttempts=window.med25PendingGameAttempts||[];
      window.med25PendingGameAttempts.push({source:'ai',questionId:id,correct:p[id].correct});
    }
    window.med25GameUpdateQuizBadge?.();
  }catch(e){console.warn('Game AI hook unavailable',e)}
  renderAI();
}
function starAI(id){const p=aiProgress();p[id]={...(p[id]||{}),starred:!p[id]?.starred};aiSave();renderAI()}
function openAISource(id){
  const q=aiAllQuestions().find(x=>x.id===id);
  if(!q?.source_url)return;
  try{trackEvent('source_open',{question_id:id,topic:q.concept||q.lecture_title||q.subject,metadata:{source:'ai_generated',lecture_id:q.set_id||'',section:'ai'}})}catch{}
  window.open(q.source_url,'_blank','noopener,noreferrer');
}
function copyAI(id){const q=aiAllQuestions().find(x=>x.id===id);if(!q)return;const txt=q.stem+'\n'+Object.entries(q.options||{}).map(([k,v])=>k+'. '+v).join('\n');try{const p=navigator.clipboard?.writeText?.(txt);if(p&&typeof p.catch==='function')p.catch(()=>{})}catch{}}
function renderAI(){
  const host=document.getElementById('aiQuestionList');if(!host)return;
  const all=aiFiltered();
  const pages=Math.max(1,Math.ceil(all.length/aiState.pageSize));if(aiState.page>pages)aiState.page=pages;
  const start=(aiState.page-1)*aiState.pageSize,qs=all.slice(start,start+aiState.pageSize);
  const pager='<div class="aiPager"><button class="aiBtn" data-ai-page="prev" '+(aiState.page===1?'disabled':'')+'>← Previous</button><span>'+(all.length?((start+1)+'–'+Math.min(start+aiState.pageSize,all.length)+' of '+all.length):'0 questions')+' · Page '+aiState.page+'/'+pages+'</span><button class="aiBtn" data-ai-page="next" '+(aiState.page===pages?'disabled':'')+'>Next →</button></div>';
  host.innerHTML=qs.length?pager+qs.map(aiCard).join('')+pager:'<div class="empty">No AI questions match these filters.</div>';
  bindAI();
  document.querySelectorAll('[data-ai-page]').forEach(b=>b.onclick=()=>{
    aiClearUnansweredPins();
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
  const subjects=[...new Set((aiLibrary.lecture_sets||[]).filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass').map(s=>s.subject))].sort();
  subject.innerHTML='<option value="">All subjects</option>'+subjects.map(s=>'<option>'+esc(s)+'</option>').join('');
  subject.value=aiState.subject;
  const sets=(aiLibrary.lecture_sets||[]).filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass'&&(!aiState.subject||s.subject===aiState.subject));
  lecture.innerHTML='<option value="">All lectures</option>'+sets.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.title)+'</option>').join('');
  if(sets.some(s=>s.id===aiState.lecture))lecture.value=aiState.lecture;else aiState.lecture='';
}
async function initAIQuestions(){
  try{
    const [aiRes,guideRes,mapRes]=await Promise.all([
      fetch(AI_LIBRARY_URL+'?v='+Date.now(),{cache:'no-store'}),
      fetch(STUDY_GUIDE_CATALOG_URL+'?v=1',{cache:'force-cache'}),
      fetch(STUDY_GUIDE_MAP_URL+'?v='+Date.now(),{cache:'no-store'})
    ]);
    if(!aiRes.ok)throw new Error('AI HTTP '+aiRes.status);
    aiLibrary=await aiRes.json();if(!Array.isArray(aiLibrary.lecture_sets))aiLibrary.lecture_sets=[];
    if(guideRes.ok)studyGuideCatalog=await guideRes.json();
    if(mapRes.ok)studyGuideQuestionMap=await mapRes.json();
  }catch(e){console.error('Study libraries unavailable',e);if(!Array.isArray(aiLibrary.lecture_sets))aiLibrary={lecture_sets:[],generated_at:null}}
  qaPastLectureCache.clear();
  const legacyTopic=document.getElementById('topic');if(legacyTopic){legacyTopic.value='';legacyTopic.style.display='none'}
  const legacyModule=document.getElementById('module');if(legacyModule){legacyModule.value='';legacyModule.style.display='none'}
  aiState.subject='';aiState.lecture='';
  populateAIFilters();setupAdvancedQuestionFilters();if(!document.getElementById('aiSection')?.classList.contains('hidden'))renderAI();if(!document.getElementById('questionSection')?.classList.contains('hidden'))render();if(med25HomeVisible())renderHome();else med25MarkHomeDirty(false);
  try{
    window.med25GameUpdateQuizBadge?.();
    window.med25GameRefreshQuiz?.();
    window.med25GameRefreshMock?.();
  }catch{}
}
function setupAIControls(){
  const search=document.getElementById('aiSearch'),subject=document.getElementById('aiSubject'),lecture=document.getElementById('aiLecture');
  if(search)search.oninput=()=>{aiClearUnansweredPins();aiState.search=search.value;aiState.page=1;renderAI()};
  if(subject)subject.onchange=()=>{aiClearUnansweredPins();aiState.subject=subject.value;aiState.lecture='';aiState.page=1;populateAIFilters();renderAI()};
  if(lecture)lecture.onchange=()=>{aiClearUnansweredPins();aiState.lecture=lecture.value;aiState.page=1;renderAI()};
  document.querySelectorAll('[data-ai-filter]').forEach(b=>b.onclick=()=>{aiClearUnansweredPins();aiState.filter=b.dataset.aiFilter;aiState.page=1;document.querySelectorAll('[data-ai-filter]').forEach(x=>x.classList.toggle('active',x===b));renderAI()});
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
function qaAvailableGuideRows(prefix){
  const kind=prefix==='past'?'past':'ai';
  const source=kind==='past'?QUESTIONS:aiAllQuestions();
  return source.map(q=>sgQuestionLecture(kind,q)).filter(g=>g?.lecture_id&&g?.subject);
}
function qaAvailableSubjects(prefix){
  return [...new Set(qaAvailableGuideRows(prefix).map(g=>g.subject))].sort();
}
function qaSubjectLectures(subject,prefix){
  const s=(studyGuideCatalog.subjects||[]).find(x=>x.name===subject);
  const lectures=(s?.lectures||[]).slice();
  if(!prefix)return lectures;
  const available=new Set(qaAvailableGuideRows(prefix).map(g=>g.lecture_id));
  return lectures.filter(l=>available.has(l.id));
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
window.med25GameBridge=window.med25GameBridge||{};
window.med25GameBridge.questionLecture=(kind,q)=>sgQuestionLecture(kind,q);
window.med25GameBridge.studyLibrariesReady=()=>!!(studyGuideCatalog?.subjects?.length);
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
  return '<div class="qaFilterBar qaUnifiedFilters" id="'+qaIds(prefix,'Filters')+'">'+
    '<div class="qaUnifiedHead"><div><b>Filters</b><span>Choose exactly what you want to practice.</span></div><button class="qaClearBtn" id="'+qaIds(prefix,'Clear')+'" type="button">Clear filters</button></div>'+
    (prefix==='past'?'<div class="qaFilterSection qaFilterWide"><span class="qaFilterLabel">Question set</span><div class="qaFilterChoices" id="'+qaIds(prefix,'Quick')+'"></div></div>':'')+
    '<div class="qaUnifiedGrid">'+
      '<label class="qaField"><span>Answer status</span><select id="'+qaIds(prefix,'Status')+'"><option value="all">All</option><option value="unanswered">Unanswered</option><option value="correct">Correct</option><option value="wrong">Wrong</option><option value="starred">Starred</option><option value="revealed">Revealed answer</option></select></label>'+
      '<label class="qaField"><span>Subject</span><select id="'+qaIds(prefix,'Subject')+'"><option value="">All subjects</option></select></label>'+
      '<div class="qaField"><span>Lecture(s)</span>'+qaLectureDropdownHtml(prefix)+'</div>'+
      '<div id="'+qaIds(prefix,'Legacy')+'" class="qaLegacyFilters"></div>'+
    '</div>'+
    '<div class="qaFilterFooter">'+
      '<div class="qaFilterSection"><span class="qaFilterLabel">Order</span><div class="qaFilterChoices" id="'+qaIds(prefix,'Order')+'"></div></div>'+
      '<div class="qaFilterSection"><span class="qaFilterLabel">Display</span><div class="qaFilterChoices" id="'+qaIds(prefix,'Display')+'"></div></div>'+
      (prefix==='past'?'<div class="qaFilterSection qaFilterTools"><span class="qaFilterLabel">Progress</span><div class="qaFilterChoices" id="'+qaIds(prefix,'Tools')+'"></div></div>':'')+
    '</div>'+
  '</div>';
}
function qaWrapMovedControl(el,label){
  if(!el)return null;
  const wrap=document.createElement('label');
  wrap.className='qaField qaMovedField';
  const span=document.createElement('span');span.textContent=label;
  wrap.appendChild(span);wrap.appendChild(el);
  return wrap;
}
function qaOrganizeUnifiedControls(prefix){
  const root=document.getElementById(qaIds(prefix,'Filters'));if(!root)return;
  const order=document.getElementById(qaIds(prefix,'Order'));
  const display=document.getElementById(qaIds(prefix,'Display'));
  const section=document.getElementById(prefix==='past'?'questionSection':'aiSection');
  const live=section?.querySelector('.liveStatsToggle');
  if(live&&display&&live.parentElement!==display)display.appendChild(live);
  if(prefix==='past'){
    const quick=document.getElementById(qaIds(prefix,'Quick'));
    const tools=document.getElementById(qaIds(prefix,'Tools'));
    const legacy=document.getElementById(qaIds(prefix,'Legacy'));
    document.querySelectorAll('#questionSection .chips > .chip').forEach(btn=>{
      if(btn.dataset.mobileFilterToggle)return;
      if(btn.id==='shuffle'){if(order&&btn.parentElement!==order)order.appendChild(btn);return}
      if(btn.id==='reset'){if(tools&&btn.parentElement!==tools)tools.appendChild(btn);return}
      if(quick&&btn.parentElement!==quick)quick.appendChild(btn);
    });
    const module=document.getElementById('module'),topic=document.getElementById('topic');
    if(module){module.value='';module.closest('.qaMovedField')?.remove();module.style.display='none'}
    if(topic){topic.value='';topic.closest('.qaMovedField')?.remove();topic.style.display='none'}
    [['bank','Source bank'],['sort','Sort by']].forEach(([id,label])=>{
      const el=document.getElementById(id);if(!el||el.closest('.qaMovedField'))return;
      const wrap=qaWrapMovedControl(el,label);if(wrap)legacy.appendChild(wrap);
    });
  }else{
    const shuffle=document.getElementById('aiShuffle');
    if(shuffle&&order&&shuffle.parentElement!==order)order.appendChild(shuffle);
  }
}
function qaClearUnified(prefix,model){
  model.status='all';model.subject='';model.lectures.clear();
  const status=document.getElementById(qaIds(prefix,'Status')),subject=document.getElementById(qaIds(prefix,'Subject'));
  if(status)status.value='all';if(subject)subject.value='';
  if(prefix==='past'){
    state.filter='all';state.shuffled=false;
    ['module','topic','bank','sort'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
    document.querySelectorAll('#questionSection .chip[data-filter]').forEach(x=>x.classList.toggle('active',x.dataset.filter==='all'));
    document.getElementById('shuffle')?.classList.remove('active');
    resetUnansweredSnapshot();
  }else{
    aiState.filter='all';aiState.shuffle=false;
    document.getElementById('aiShuffle')?.classList.remove('active');
  }
  qaRenderLecturePicker(prefix,model);qaApply(prefix);responsiveUpdateFilterLabels();
}
function qaRenderLecturePicker(prefix,model){
  const btn=document.getElementById(qaIds(prefix,'LectureBtn')),panel=document.getElementById(qaIds(prefix,'LecturePanel'));
  if(!btn||!panel)return;
  if(!model.subject){
    btn.disabled=true;btn.textContent='Select subject first';panel.classList.add('hidden');panel.innerHTML='';return;
  }
  const lectures=qaSubjectLectures(model.subject,prefix);
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
  let root=document.getElementById(qaIds(prefix,'Filters'));
  if(!root){
    host.insertAdjacentHTML('afterend',qaFilterBarHtml(prefix));
    root=document.getElementById(qaIds(prefix,'Filters'));
  }
  const subject=document.getElementById(qaIds(prefix,'Subject')),status=document.getElementById(qaIds(prefix,'Status')),btn=document.getElementById(qaIds(prefix,'LectureBtn')),panel=document.getElementById(qaIds(prefix,'LecturePanel')),clear=document.getElementById(qaIds(prefix,'Clear'));
  const availableSubjects=qaAvailableSubjects(prefix);
  subject.innerHTML='<option value="">All subjects</option>'+availableSubjects.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
  if(model.subject&&!availableSubjects.includes(model.subject)){model.subject='';model.lectures.clear()}
  subject.value=model.subject||'';status.value=model.status||'all';
  status.onchange=()=>{if(prefix==='ai')aiClearUnansweredPins();model.status=status.value;qaResetLegacyStatus(prefix);qaApply(prefix);responsiveUpdateFilterLabels()};
  subject.onchange=()=>{model.subject=subject.value;model.lectures.clear();qaRenderLecturePicker(prefix,model);qaApply(prefix);responsiveUpdateFilterLabels()};
  btn.onclick=e=>{e.stopPropagation();if(!btn.disabled)panel.classList.toggle('hidden')};
  panel.onclick=e=>e.stopPropagation();
  clear.onclick=()=>qaClearUnified(prefix,model);
  qaRenderLecturePicker(prefix,model);
  qaOrganizeUnifiedControls(prefix);
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
    if(!meta)return;
    if(kind==='past'){
      const hy=typeof highYieldBadge==='function'?highYieldBadge(q):'';
      const examReady=typeof window.med25ExamReadyPast==='function'?window.med25ExamReadyPast(q):true;
      const quality=examReady?'':'<span class="pill sourceIncompletePill" title="Authentic source-bank item, but its extracted choices are incomplete or duplicated. It is excluded from mock exams.">Source incomplete</span>';
      meta.innerHTML='<span class="pill sgSubjectPill">'+esc(g.subject||'Other')+'</span>'+
        '<span class="pill sgLecturePill">'+esc(g.title||'Unmapped lecture')+'</span>'+quality+hy;
      meta.title='Official 2026–2027 Study Guide subject and lecture. The original bank name remains shown as source provenance.';
    }else{
      meta.querySelectorAll('.sgLecturePill').forEach(x=>x.remove());
      const pill=document.createElement('span');pill.className='pill aiPill sgLecturePill';
      pill.textContent=(g.subject||q.subject||'Other')+' · '+(g.title||q.lecture_title||'Unmapped lecture');
      pill.title='Mapped from the official 2026–2027 Study Guide';
      meta.appendChild(pill);
    }
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
    let g={};try{g=sgQuestionLecture('past',q)||{}}catch{}
    const x=bucket(g.title||q.lecture_source?.title||'Past Papers');x.graded++;x.pastGraded++;if(p.correct){x.correct++;x.pastCorrect++}
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

let lectureDashState={subject:'',status:'',quiz:'',search:''};
const QUIZ2_LECTURE_TITLES=["Pathology of Hypertension","Physiology of vascular endothelium","Antihypertensive drugs 1","Cardiac cycle","Antihypertensive drugs 2","Vasculitis","Pathology of valvular Heart Diseases","Development of the heart and its great vessels","Normal ECG","Congenital anomalies and abnormal development of heart and its great vessels","Antiarrhythmic drugs","Endocarditis","Abnormal ECG and cardiac arrhythmias","Anatomy of Thoracic Wall","Anatomy of nose and paranasal sinuses","Pressure-volume relationship","Obstructive airway disease","Anatomical Relations of the lungs","Histology of the respiratory system","Drugs used for treatment of asthma","Drug therapy for cough and COPD","Development of respiratory system","Atelectasis and acute lung injury","Lower respiratory tract infections","Anatomy of the larynx","Restrictive airway disease","Upper respiratory tract neoplasm","Gas diffusion and blood flow","Drug therapy of respiratory infections","Cystic parasitic diseases of the lung","Lung immunology — innate and acquired immune responses in respiratory infections","Pulmonary infection","Transport of oxygen in blood","Pulmonary vessel disease","Transport of carbon dioxide in blood","Lung and pleural tumors","Treatment of TB","Verminous pneumonia (parasitic larvae invading lung)","Acid-base Homeostasis & the role of respiratory system","Metabolic functions of the lung and Pulmonary Surfactant","Neural control of breathing"];
const QUIZ2_LECTURE_KEYS=new Set(QUIZ2_LECTURE_TITLES.map(qaNorm));
function lectureQuizNumber(title){const k=qaNorm(title);if(QUIZ2_LECTURE_KEYS.has(k))return 2;for(const q of QUIZ2_LECTURE_KEYS){if(k&&q&&(k.includes(q)||q.includes(k)))return 2}return 1}
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
  const studied=!current;
  map[id]={...(map[id]||{}),studied,updated_at:new Date().toISOString()};
  save();
  renderLectureDashboard();
  try{
    const lecture=qaLectureCatalog().find(x=>x.id===id);
    trackEvent('lecture_study',{metadata:{lecture_id:id,lecture_title:lecture?.title||'',subject:lecture?.subject||'',studied}});
  }catch{}
}

function lectureDashboardRows(){
  const lectures=qaLectureCatalog(),rows=new Map();
  for(const l of lectures){
    rows.set(l.id,{
      id:l.id,subject:l.subject,title:l.title,quiz:lectureQuizNumber(l.title),
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
  return out.filter(r=>r.questionTotal>0||r.manualStudied);
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
    if(lectureDashState.quiz&&String(r.quiz)!==String(lectureDashState.quiz))return false;
    if(q&&!((r.title+' '+r.subject).toLowerCase().includes(q)))return false;
    return true;
  }).sort((a,b)=>{
    const order={'practicing':0,'studied':1,'questions-complete':2,'not-started':3,'complete':4};
    return (order[a.status]-order[b.status])||a.subject.localeCompare(b.subject)||a.title.localeCompare(b.title);
  });
}
function setupLectureDashboardControls(){
  const subject=document.getElementById('lectureDashSubject'),status=document.getElementById('lectureDashStatus'),quiz=document.getElementById('lectureDashQuiz'),search=document.getElementById('lectureDashSearch');
  if(!subject||!status||!quiz||!search)return;
  const subjects=qaSubjects();
  const currentSubject=lectureDashState.subject;
  subject.innerHTML='<option value="">All subjects</option>'+subjects.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
  subject.value=subjects.includes(currentSubject)?currentSubject:'';
  if(currentSubject&&!subjects.includes(currentSubject))lectureDashState.subject='';
  status.value=lectureDashState.status;
  quiz.value=lectureDashState.quiz;
  search.value=lectureDashState.search;
  if(!subject.dataset.bound){
    subject.dataset.bound='1';
    subject.onchange=()=>{lectureDashState.subject=subject.value;renderLectureDashboard()};
    status.onchange=()=>{lectureDashState.status=status.value;renderLectureDashboard()};
    quiz.onchange=()=>{lectureDashState.quiz=quiz.value;renderLectureDashboard()};
    search.oninput=()=>{lectureDashState.search=search.value;renderLectureDashboard()};
  }
}
function renderLectureDashboard(){
  const host=document.getElementById('lectureDashboard'),summary=document.getElementById('lectureDashboardSummary');
  if(!host)return;
  setupLectureDashboardControls();
  const all=lectureDashboardRows(),rows=lectureDashFiltered();
  const counts={complete:0,studied:0,practicing:0,'questions-complete':0,'not-started':0};
  all.forEach(r=>counts[r.status]=(counts[r.status]||0)+1);
  if(summary)summary.innerHTML=
    '<span><b>'+all.length+'</b> published lectures</span>'+
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
      '<div class="lectureDashLecture"><b>'+esc(r.title)+'</b><span>'+esc(r.subject)+' <i class="lectureQuizStamp quiz'+r.quiz+'">QUIZ '+r.quiz+'</i></span></div>'+
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
window.med25RenderLectureDashboard=()=>renderLectureDashboard();
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
  const sync=document.getElementById('homeSync');if(sync)sync.textContent='Drive libraries: '+(aiLibrary.lecture_sets||[]).filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass').length+' quality-checked AI lecture sets · '+(flashLibrary.decks||[]).filter(d=>!d.archived&&d.eligibility_status==='allowed').length+' eligible flashcard decks';
}
function hubGo(mode){switchStudySection(mode)}
function hubSwitch(mode){
  document.getElementById('profileSection')?.classList.add('hidden');
  document.getElementById('progressSection')?.classList.add('hidden');
  document.getElementById('tabProfile')?.classList.remove('active');
  document.getElementById('tabProgress')?.classList.remove('active');
  try{localStorage.removeItem('med25-v2-view-v1')}catch{}
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
let med25HomeDirty=true;
let med25HomeFrame=0;
function med25HomeVisible(){
  const home=document.getElementById('homeSection');
  return !!(home&&!home.classList.contains('hidden'));
}
function med25MarkHomeDirty(renderIfVisible=false){
  med25HomeDirty=true;
  if(!renderIfVisible||!med25HomeVisible()||med25HomeFrame)return;
  med25HomeFrame=requestAnimationFrame(()=>{
    med25HomeFrame=0;
    if(!med25HomeDirty||!med25HomeVisible())return;
    med25HomeDirty=false;
    try{renderHome()}catch(e){console.warn('Home refresh',e)}
  });
}
const baseSave=save;
save=function(){const r=baseSave.apply(this,arguments);med25MarkHomeDirty(true);return r};
const baseFlashSave=saveFlashReview;
saveFlashReview=function(){const r=baseFlashSave.apply(this,arguments);med25MarkHomeDirty(true);return r};

const med25BaseLoadCloudProgress=loadCloudProgress;
loadCloudProgress=async function(){
  const out=await med25BaseLoadCloudProgress.apply(this,arguments);
  med25MarkHomeDirty(true);
  return out;
};

/* 2026-09-28 responsive usability layer */
function responsiveFilterCount(mode){
  let n=0;
  if(mode==='past'){
    if(pastAdvanced.status&&pastAdvanced.status!=='all')n++;
    if(pastAdvanced.subject)n++;
    if(pastAdvanced.lectures&&pastAdvanced.lectures.size)n++;
    if(state.filter&&state.filter!=='all')n++;
    if(state.shuffled)n++;
    const module=document.getElementById('module'),bank=document.getElementById('bank'),sort=document.getElementById('sort');
    if(module?.value)n++;if(bank?.value)n++;if(sort?.value)n++;
  }else if(mode==='ai'){
    if(aiAdvanced.status&&aiAdvanced.status!=='all')n++;
    if(aiAdvanced.subject)n++;
    if(aiAdvanced.lectures&&aiAdvanced.lectures.size)n++;
    if(aiState.shuffle)n++;
  }
  return n;
}
function setupResponsiveFilterToggle(sectionId,rowSelector,mode){
  const section=document.getElementById(sectionId),row=section?.querySelector(rowSelector);
  if(!section||!row)return;
  let btn=row.querySelector('[data-mobile-filter-toggle="'+mode+'"]');
  if(!btn){
    btn=document.createElement('button');
    btn.type='button';
    btn.className='mobileFilterToggle';
    btn.dataset.mobileFilterToggle=mode;
    btn.setAttribute('aria-expanded','false');
    section.classList.add('mobileFiltersCollapsed');
    btn.onclick=()=>{
      const collapsed=section.classList.toggle('mobileFiltersCollapsed');
      btn.setAttribute('aria-expanded',collapsed?'false':'true');
      responsiveUpdateFilterLabels();
    };
    row.appendChild(btn);
  }
}
function responsiveUpdateFilterLabels(){
  [['questionSection','past'],['aiSection','ai']].forEach(([sectionId,mode])=>{
    const section=document.getElementById(sectionId);
    const btn=section?.querySelector('[data-mobile-filter-toggle="'+mode+'"]');
    if(!btn)return;
    const collapsed=section.classList.contains('mobileFiltersCollapsed');
    const count=responsiveFilterCount(mode);
    btn.innerHTML=(collapsed?'Filters':'Hide filters')+(count?' <b>'+count+' active</b>':' <b>⌄</b>');
    btn.setAttribute('aria-expanded',collapsed?'false':'true');
  });
}
function setupResponsiveFilters(){
  setupResponsiveFilterToggle('questionSection','.chips','past');
  setupResponsiveFilterToggle('aiSection','.aiChips','ai');
  responsiveUpdateFilterLabels();
}
function responsiveCurrentMode(){
  if(!document.getElementById('questionSection')?.classList.contains('hidden'))return 'past';
  if(!document.getElementById('aiSection')?.classList.contains('hidden'))return 'ai';
  return '';
}
function responsivePagerData(){
  const mode=responsiveCurrentMode();
  if(mode==='past'){
    const total=filtered().length,pages=Math.max(1,Math.ceil(total/state.pageSize));
    if(state.page>pages)state.page=pages;
    return {mode,page:state.page,pages,total};
  }
  if(mode==='ai'){
    const total=aiFiltered().length,pages=Math.max(1,Math.ceil(total/aiState.pageSize));
    if(aiState.page>pages)aiState.page=pages;
    return {mode,page:aiState.page,pages,total};
  }
  return null;
}
function ensureResponsivePager(){
  let nav=document.getElementById('med25MobilePager');
  if(nav)return nav;
  nav=document.createElement('div');
  nav.id='med25MobilePager';
  nav.className='med25MobilePager';
  nav.innerHTML='<button class="mobilePrev" type="button" data-responsive-page="prev">←</button><span id="med25MobilePagerLabel">Page</span><button class="mobileNext" type="button" data-responsive-page="next">Next →</button>';
  nav.querySelectorAll('[data-responsive-page]').forEach(btn=>btn.onclick=()=>responsivePageStep(btn.dataset.responsivePage));
  document.body.appendChild(nav);
  return nav;
}
function responsiveScrollToFirst(mode){
  requestAnimationFrame(()=>{
    const target=document.querySelector(mode==='past'?'#list .qcard':'#aiQuestionList .aiCard');
    if(!target)return;
    const tabs=document.getElementById('studyTabs');
    const offset=(tabs?.offsetHeight||0)+10;
    const top=target.getBoundingClientRect().top+window.scrollY-offset;
    window.scrollTo({top:Math.max(0,top),behavior:'smooth'});
  });
}
function responsivePageStep(direction){
  const data=responsivePagerData();if(!data)return;
  if(data.mode==='past'){
    if(direction==='prev'&&state.page>1)state.page--;
    if(direction==='next'&&state.page<data.pages)state.page++;
    try{saveViewState()}catch{}
    render();
    responsiveScrollToFirst('past');
  }else{
    if(direction==='prev'&&aiState.page>1)aiState.page--;
    if(direction==='next'&&aiState.page<data.pages)aiState.page++;
    renderAI();
    responsiveScrollToFirst('ai');
  }
}
function responsiveUpdatePager(){
  const nav=ensureResponsivePager(),data=responsivePagerData();
  const show=!!data;
  nav.classList.toggle('show',show);
  if(!show)return;
  const prev=nav.querySelector('[data-responsive-page="prev"]');
  const next=nav.querySelector('[data-responsive-page="next"]');
  const label=document.getElementById('med25MobilePagerLabel');
  prev.disabled=data.page<=1;
  next.disabled=data.page>=data.pages;
  if(label)label.innerHTML='Page '+data.page+'/'+data.pages+'<br>'+data.total+' questions';
}
function responsiveRefresh(){
  setupResponsiveFilters();
  qaOrganizeUnifiedControls('past');
  qaOrganizeUnifiedControls('ai');
  responsiveUpdateFilterLabels();
  responsiveUpdatePager();
}
let med25ResponsiveFrame=0;
function med25ScheduleResponsiveRefresh(){
  if(med25ResponsiveFrame)return;
  med25ResponsiveFrame=requestAnimationFrame(()=>{
    med25ResponsiveFrame=0;
    try{responsiveRefresh()}catch{}
  });
}
const responsiveBasePastRender=render;
render=function(){
  const out=responsiveBasePastRender.apply(this,arguments);
  med25ScheduleResponsiveRefresh();
  return out;
};
const responsiveBaseAIRender=renderAI;
renderAI=function(){
  const out=responsiveBaseAIRender.apply(this,arguments);
  med25ScheduleResponsiveRefresh();
  return out;
};
document.querySelectorAll('#studyTabs .studyTab').forEach(btn=>btn.addEventListener('click',()=>med25ScheduleResponsiveRefresh()));
window.addEventListener('resize',()=>med25ScheduleResponsiveRefresh(),{passive:true});
setTimeout(responsiveRefresh,60);
setTimeout(responsiveRefresh,1200);


/* 2026-09-28 MED25 Cobalt product redesign */
const MED25_THEME_KEY='med25-theme';
const MED25_EXAM_DATE_KEY='med25-exam-date';
let med25ContinueTarget={mode:'questions',lectureId:'',subject:'',questionId:''};

function med25ApplyTheme(theme,persist){
  const t=theme==='dark'?'dark':'light';
  document.documentElement.dataset.theme=t;
  if(persist!==false){try{localStorage.setItem(MED25_THEME_KEY,t)}catch{}}
  document.querySelectorAll('#themeToggle,#mobileThemeToggle').forEach(btn=>{
    btn.textContent=t==='dark'?'☀':'☾';
    btn.title=t==='dark'?'Use light mode':'Use dark mode';
    btn.setAttribute('aria-label',btn.title);
  });
}
function med25SetupTheme(){
  med25ApplyTheme(document.documentElement.dataset.theme||'light',false);
  const bind=btn=>{
    if(!btn||btn.dataset.bound)return;
    btn.dataset.bound='1';
    btn.onclick=()=>med25ApplyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark',true);
  };
  bind(document.getElementById('themeToggle'));
  if(!document.getElementById('mobileThemeToggle')){
    const btn=document.createElement('button');
    btn.type='button';btn.id='mobileThemeToggle';btn.className='mobileThemeToggle';btn.textContent='☾';
    document.body.appendChild(btn);bind(btn);
  }
  med25ApplyTheme(document.documentElement.dataset.theme||'light',false);
}

function med25EnsureFlashFocus(){
  const section=document.getElementById('flashcardsSection');
  if(!section||document.getElementById('flashFocus'))return;
  const shell=section.querySelector('.ankiShell');
  if(!shell)return;
  shell.insertAdjacentHTML('beforebegin','<section class="flashFocus" id="flashFocus"><div><div class="homeCardLabel">TODAY\'S REVIEW</div><h2><span id="flashFocusDue">0</span> cards due</h2><p id="flashFocusMeta">Your spaced-repetition queue is loading.</p></div><button class="flashFocusBtn" id="flashFocusStudy" type="button">Study due cards →</button></section>');
}

function med25LatestActivity(){
  let best=null;
  const consider=item=>{if(!best||item.ts>best.ts)best=item};
  QUESTIONS.forEach(q=>{
    const p=saved[q.id]||{},ts=Date.parse(p.locked_at||p.answered_at||'')||0;
    if(!ts)return;
    const g=sgQuestionLecture('past',q);
    consider({mode:'questions',ts,questionId:q.id,lectureId:g.lecture_id,subject:g.subject,title:g.title||q.topic||'Past Papers'});
  });
  const ap=aiProgress();
  aiAllQuestions().forEach(q=>{
    const p=ap[q.id]||{},ts=Date.parse(p.locked_at||p.answered_at||'')||0;
    if(!ts)return;
    const g=sgQuestionLecture('ai',q);
    consider({mode:'ai',ts,questionId:q.id,lectureId:g.lecture_id,subject:g.subject,title:g.title||q.lecture_title||'AI Questions'});
  });
  try{
    for(const d of (flashLibrary.decks||[])){
      for(const c of (d.cards||[])){
        const r=cardReview(c.id),ts=Number(r&&r.last_reviewed||0);
        if(ts)consider({mode:'flashcards',ts,deckId:d.id,subject:d.subject||'',title:d.title||'Flashcards'});
      }
    }
  }catch{}
  if(best)return best;
  const rows=lectureDashboardRows();
  const first=rows.find(r=>r.status!=='complete')||rows[0];
  return first?{mode:'questions',ts:0,lectureId:first.id,subject:first.subject,title:first.title}:{mode:'questions',ts:0,title:'Past Papers'};
}
function med25ContinueProgress(target){
  if(target&&target.lectureId){
    const r=lectureDashboardRows().find(x=>x.id===target.lectureId);
    if(r)return {pct:r.questionCoverage||0,meta:(r.questionDone||0)+'/'+(r.questionTotal||0)+' questions completed'};
  }
  if(target&&target.mode==='flashcards'){
    const fl=homeFlashMetrics();
    return {pct:fl.total?Math.round(fl.seen/fl.total*100):0,meta:fl.due+' cards due now'};
  }
  const pp=homePastMetrics();
  return {pct:pp.total?Math.round(pp.done/pp.total*100):0,meta:pp.done+'/'+pp.total+' past-paper questions attempted'};
}
function med25Continue(){
  const t=med25ContinueTarget||{mode:'questions'};
  if(t.mode==='flashcards'){
    hubSwitch('flashcards');
    setTimeout(()=>document.getElementById('flashStudyAll')&&document.getElementById('flashStudyAll').click(),80);
    return;
  }
  if(t.mode==='ai'){
    aiAdvanced.status='all';aiAdvanced.subject=t.subject||'';aiAdvanced.lectures=new Set(t.lectureId?[t.lectureId]:[]);
    aiState.page=1;hubSwitch('ai');setupAdvancedQuestionFilters();renderAI();
    setTimeout(()=>responsiveScrollToFirst('ai'),100);
  }else{
    pastAdvanced.status='all';pastAdvanced.subject=t.subject||'';pastAdvanced.lectures=new Set(t.lectureId?[t.lectureId]:[]);
    state.page=1;hubSwitch('questions');setupAdvancedQuestionFilters();render();
    setTimeout(()=>responsiveScrollToFirst('past'),100);
  }
}
window.med25Continue=med25Continue;

function med25RenderHomePolish(){
  med25EnsureFlashFocus();
  const greeting=document.getElementById('homeGreeting');
  if(greeting){
    const h=new Date().getHours();
    greeting.textContent=(h<12?'Good morning':h<18?'Good afternoon':'Good evening')+' 👋';
  }
  const context=document.getElementById('homeContext');
  if(context){
    const raw=localStorage.getItem(MED25_EXAM_DATE_KEY)||'';
    const exam=raw?new Date(raw+'T09:00:00'):null;
    const days=exam&&Number.isFinite(exam.getTime())?Math.ceil((exam.getTime()-Date.now())/86400000):null;
    context.textContent=days!==null&&days>=0?('Next exam · '+(days===0?'today':days+' day'+(days===1?'':'s')+' away')):'Circulation & Breathing · tap to set next exam date';
    context.classList.add('homeContextAction');
    context.title='Tap to set or update your next exam date';
    context.onclick=()=>{
      const next=prompt('Next exam date (YYYY-MM-DD)',raw);
      if(next===null)return;
      if(/^\\d{4}-\\d{2}-\\d{2}$/.test(next)){localStorage.setItem(MED25_EXAM_DATE_KEY,next);med25RenderHomePolish()}
      else if(next===''){localStorage.removeItem(MED25_EXAM_DATE_KEY);med25RenderHomePolish()}
    };
  }
  const rows=lectureDashboardRows(),complete=rows.filter(r=>r.status==='complete').length;
  const overall=rows.length?Math.round(rows.reduce((sum,r)=>sum+r.completion,0)/rows.length):0;
  const v=document.getElementById('homeOverallValue'),m=document.getElementById('homeOverallMeta'),bar=document.getElementById('homeOverallBar');
  if(v)v.textContent=overall+'%';
  if(m)m.textContent=complete+'/'+rows.length+' lectures fully complete';
  if(bar)bar.style.width=overall+'%';

  const pp=homePastMetrics(),ai=homeAIMetrics(),fl=homeFlashMetrics();
  const totalQ=pp.total+ai.total,doneQ=pp.done+ai.done,left=Math.max(0,totalQ-doneQ),incomplete=Math.max(0,rows.length-complete);
  const metrics=document.getElementById('homeMetrics');
  if(metrics)metrics.innerHTML=
    '<button class="hubCard hubMetric homeMetricButton" type="button" onclick="hubGo(\'flashcards\')"><span class="homeMetricIcon">▱</span><b>'+fl.due+'</b><span>flashcards due today</span><div class="hubBar"><span style="width:'+(fl.total?fl.seen/fl.total*100:0)+'%"></span></div></button>'+
    '<button class="hubCard hubMetric homeMetricButton" type="button" onclick="hubGo(\'questions\')"><span class="homeMetricIcon">▤</span><b>'+left+'</b><span>questions remaining</span><div class="hubBar"><span style="width:'+(totalQ?doneQ/totalQ*100:0)+'%"></span></div></button>'+
    '<button class="hubCard hubMetric homeMetricButton" type="button" onclick="window.med25V2OpenProgress?.()"><span class="homeMetricIcon">✓</span><b>'+incomplete+'</b><span>lectures not fully complete</span><div class="hubBar"><span style="width:'+(rows.length?complete/rows.length*100:0)+'%"></span></div></button>';

  med25ContinueTarget=med25LatestActivity();
  const cp=med25ContinueProgress(med25ContinueTarget);
  const kicker=document.getElementById('homeContinueEyebrow'),title=document.getElementById('homeContinueTitle'),meta=document.getElementById('homeContinueMeta'),cbar=document.getElementById('homeContinueBar'),btn=document.getElementById('homeContinueBtn');
  if(kicker)kicker.textContent=med25ContinueTarget.mode==='flashcards'?'CONTINUE REVIEWING':'CONTINUE STUDYING';
  if(title)title.textContent=med25ContinueTarget.title||'Continue studying';
  if(meta)meta.textContent=(med25ContinueTarget.subject?med25ContinueTarget.subject+' · ':'')+cp.meta;
  if(cbar)cbar.style.width=Math.max(4,Math.min(100,cp.pct||0))+'%';
  if(btn){btn.textContent=med25ContinueTarget.mode==='flashcards'?'Review due cards →':'Continue →';btn.onclick=med25Continue}

  const fd=document.getElementById('flashFocusDue'),fm=document.getElementById('flashFocusMeta'),fs=document.getElementById('flashFocusStudy');
  if(fd)fd.textContent=fl.due;
  if(fm)fm.textContent=fl.due?('You have '+fl.due+' reviews waiting. '+fl.seen+' of '+fl.total+' cards have been seen at least once.'):'You are caught up for now. New reviews will appear automatically when they are due.';
  if(fs){fs.disabled=!fl.due;fs.textContent=fl.due?'Study due cards →':'All caught up ✓';fs.onclick=()=>document.getElementById('flashStudyAll')&&document.getElementById('flashStudyAll').click()}
}

function med25ScrollToNextCard(card,kind){
  const list=Array.from(document.querySelectorAll(kind==='ai'?'.aiCard':'.qcard'));
  const i=list.indexOf(card),next=list[i+1];
  if(next){next.scrollIntoView({behavior:'smooth',block:'start'});return}
  const pageBtn=document.querySelector(kind==='ai'?'[data-ai-page="next"]:not([disabled])':'[data-page="next"]:not([disabled])');
  if(pageBtn)pageBtn.click();
}
function med25EnhanceQuestionCards(){
  const pastCards=Array.from(document.querySelectorAll('#list .qcard'));
  pastCards.forEach((card,i)=>{
    const q=QUESTIONS.find(x=>x.id===card.id);
    const qnum=card.querySelector('.qnum');
    if(qnum&&!qnum.dataset.original){qnum.dataset.original=qnum.textContent;qnum.title=qnum.textContent}
    if(qnum)qnum.textContent='Question '+(((state.page-1)*state.pageSize)+i+1);
    if(q&&Object.keys(q.options||{}).length<2){
      const opts=card.querySelector('.options');
      if(opts)opts.innerHTML='<div class="answerOnlyPrompt"><b>Recall item</b><span>The original bank preserved the question and correct answer, but not enough distractors for a valid MCQ. Try to answer it from memory, then use Reveal answer.</span></div>';
      const meta=card.querySelector('.meta');
      if(meta&&!meta.querySelector('.answerOnlyPill'))meta.insertAdjacentHTML('beforeend','<span class="pill answerOnlyPill">Answer-only source</span>');
    }
    if(card.querySelector('.feedback.show')&&!card.querySelector('.questionNextBtn')){
      const btn=document.createElement('button');btn.type='button';btn.className='questionNextBtn';btn.textContent='Next question →';btn.onclick=()=>med25ScrollToNextCard(card,'past');card.appendChild(btn);
    }
  });
  const aiCards=Array.from(document.querySelectorAll('#aiQuestionList .aiCard'));
  aiCards.forEach((card,i)=>{
    const n=card.querySelector('.examQuestionNumber');
    if(n)n.textContent='Question '+(((aiState.page-1)*aiState.pageSize)+i+1);
    if(card.querySelector('.aiFeedback')&&!card.querySelector('.questionNextBtn')){
      const btn=document.createElement('button');btn.type='button';btn.className='questionNextBtn';btn.textContent='Next question →';btn.onclick=()=>med25ScrollToNextCard(card,'ai');card.appendChild(btn);
    }
  });
}

const med25BaseRenderHome=renderHome;
renderHome=function(){
  const out=med25BaseRenderHome.apply(this,arguments);
  med25HomeDirty=false;
  try{med25RenderHomePolish()}catch(e){console.warn('Home polish',e)}
  return out;
};
const med25BaseHubSwitch=hubSwitch;
let med25LastTrackedSection='';
hubSwitch=function(mode){
  const out=med25BaseHubSwitch.apply(this,arguments);
  document.body.classList.toggle('homeMode',mode==='home');
  if(mode==='home')med25HomeDirty=false;
  if(mode!==med25LastTrackedSection){
    med25LastTrackedSection=mode;
    try{trackEvent('section_view',{metadata:{section:mode}})}catch{}
  }
  med25ScheduleResponsiveRefresh();
  return out;
};
switchStudySection=hubSwitch;

const med25EnhancePastRender=render;
render=function(){
  const out=med25EnhancePastRender.apply(this,arguments);
  requestAnimationFrame(()=>{try{med25EnhanceQuestionCards();responsiveUpdateFilterLabels();responsiveUpdatePager()}catch{}});
  return out;
};
const med25EnhanceAIRender=renderAI;
renderAI=function(){
  const out=med25EnhanceAIRender.apply(this,arguments);
  requestAnimationFrame(()=>{try{med25EnhanceQuestionCards();responsiveUpdateFilterLabels();responsiveUpdatePager()}catch{}});
  return out;
};


/* 2026-09-28 compact mobile account shell */
let med25AnalyticsBusy=false;
function med25AnalyticsRows(items,key,label){
  return (Array.isArray(items)?items:[]).map(x=>'<tr><td>'+esc(String(x[key]||'—'))+'</td><td>'+Number(x[label]||0).toLocaleString()+'</td></tr>').join('');
}
async function med25LoadSitewideAnalytics(){
  const body=document.getElementById('analyticsBody');
  if(!body)return;
  body.innerHTML='<div class="analyticsLoading"><span></span><b>Loading site-wide analytics…</b></div>';
  if(!authSession?.access_token||!isAdmin()){body.innerHTML='<div class="analyticsError">Admin access required.</div>';return}
  try{
    let res=await fetch(SUPA_URL+'/functions/v1/admin-analytics',{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+authSession.access_token}});
    if(res.status===401&&await refreshSession())res=await fetch(SUPA_URL+'/functions/v1/admin-analytics',{headers:{apikey:SUPA_KEY,Authorization:'Bearer '+authSession.access_token}});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.error||'Could not load analytics');
    const a=data.analytics||{};
    const emails=Array.isArray(a.registered_emails)?a.registered_emails:[];
    const topics=Array.isArray(a.top_topics)?a.top_topics:[];
    const daily=Array.isArray(a.daily)?a.daily:[];
    const sections=Array.isArray(a.section_usage)?a.section_usage:[];
    const ratings=Array.isArray(a.flashcard_ratings)?a.flashcard_ratings:[];
    const started=a.analytics_started_at?fmtAdminDate(a.analytics_started_at):'Just enabled';
    const sitewide=a.sitewide_tracking_started_at?fmtAdminDate(a.sitewide_tracking_started_at):'starting with this update';
    const sectionNames={home:'Home',questions:'Past Papers',ai:'AI Questions',flashcards:'Flashcards'};
    const sectionRows=sections.map(x=>'<tr><td>'+esc(sectionNames[x.section]||x.section||'Unknown')+'</td><td>'+Number(x.views||0).toLocaleString()+'</td></tr>').join('');
    const ratingRows=ratings.map(x=>'<tr><td>'+esc((x.rating||'Unknown').replace(/^./,c=>c.toUpperCase()))+'</td><td>'+Number(x.reviews||0).toLocaleString()+'</td></tr>').join('');
    body.innerHTML=
      '<p class="analyticsNote"><b>Whole-site dashboard.</b> Visitor analytics began '+esc(started)+'. Feature-by-feature tracking (Home, AI, Flashcards and lecture checklist) is '+esc(sitewide)+', so older activity is naturally weighted toward Past Papers.</p>'+
      '<div class="analyticsSectionTitle"><b>Overview</b><span>Entire MED25 Study Hub</span></div>'+
      '<div class="analyticsMetrics">'+
        '<div class="analyticsMetric"><b>'+Number(a.total_visitors||0).toLocaleString()+'</b><span>unique visitors</span></div>'+
        '<div class="analyticsMetric"><b>'+Number(a.total_sessions||0).toLocaleString()+'</b><span>sessions</span></div>'+
        '<div class="analyticsMetric"><b>'+Number(a.registered_users||0).toLocaleString()+'</b><span>registered accounts</span></div>'+
        '<div class="analyticsMetric"><b>'+Number(a.visitors_today||0).toLocaleString()+'</b><span>visitors today</span></div>'+
        '<div class="analyticsMetric"><b>'+Number(a.interactions_today||0).toLocaleString()+'</b><span>events today</span></div>'+
        '<div class="analyticsMetric"><b>'+Number(a.active_signed_in_users||0).toLocaleString()+'</b><span>signed-in users seen</span></div>'+
      '</div>'+
      '<div class="analyticsSectionTitle"><b>Study activity</b><span>Across every study mode</span></div>'+
      '<div class="analyticsMetrics analyticsStudyMetrics">'+
        '<div class="analyticsMetric"><b>'+Number(a.past_questions_answered||0).toLocaleString()+'</b><span>Past Paper answers</span></div>'+
        '<div class="analyticsMetric"><b>'+Number(a.ai_questions_answered||0).toLocaleString()+'</b><span>AI Question answers</span></div>'+
        '<div class="analyticsMetric"><b>'+Number(a.flashcard_reviews||0).toLocaleString()+'</b><span>flashcard reviews</span></div>'+
        '<div class="analyticsMetric"><b>'+Number(a.lecture_study_actions||0).toLocaleString()+'</b><span>lecture checklist actions</span></div>'+
        '<div class="analyticsMetric"><b>'+Number(a.source_opens||0).toLocaleString()+'</b><span>source lectures opened</span></div>'+
        '<div class="analyticsMetric"><b>'+Number(a.answer_reveals||0).toLocaleString()+'</b><span>answers revealed</span></div>'+
      '</div>'+
      '<div class="analyticsGrid">'+
        '<div class="box"><h3>Sections opened</h3><p class="small">Which parts of the site students are using.</p><div class="analyticsTableWrap"><table class="analyticsTable"><thead><tr><th>Section</th><th>Views</th></tr></thead><tbody>'+(sectionRows||'<tr><td colspan="2">Site-wide tracking has just started.</td></tr>')+'</tbody></table></div></div>'+
        '<div class="box"><h3>Flashcard ratings</h3><p class="small">Again / Hard / Good / Easy across morning reviews.</p><div class="analyticsTableWrap"><table class="analyticsTable"><thead><tr><th>Rating</th><th>Reviews</th></tr></thead><tbody>'+(ratingRows||'<tr><td colspan="2">No flashcard reviews tracked yet.</td></tr>')+'</tbody></table></div></div>'+
      '</div>'+
      '<div class="box analyticsWideBox"><h3>Last 14 days</h3><div class="analyticsTableWrap"><table class="analyticsTable"><thead><tr><th>Date</th><th>Visitors</th><th>Sessions</th><th>Answers</th><th>Flashcards</th><th>Lecture actions</th></tr></thead><tbody>'+
        (daily.map(d=>'<tr><td>'+esc(String(d.date||''))+'</td><td>'+Number(d.visitors||0).toLocaleString()+'</td><td>'+Number(d.sessions||0).toLocaleString()+'</td><td>'+Number(d.answers||0).toLocaleString()+'</td><td>'+Number(d.flashcards||0).toLocaleString()+'</td><td>'+Number(d.lecture_actions||0).toLocaleString()+'</td></tr>').join('')||'<tr><td colspan="6">No tracked activity yet.</td></tr>')+
      '</tbody></table></div></div>'+
      '<div class="analyticsGrid">'+
        '<div class="box"><h3>Most answered topics</h3><div class="analyticsTableWrap"><table class="analyticsTable"><thead><tr><th>Topic</th><th>Answers</th></tr></thead><tbody>'+
          (topics.map(t=>'<tr><td>'+esc(t.topic||'')+'</td><td>'+Number(t.answers||0).toLocaleString()+'</td></tr>').join('')||'<tr><td colspan="2">No answers tracked yet.</td></tr>')+
        '</tbody></table></div></div>'+
        '<div class="box"><h3>Registered accounts</h3><div class="analyticsTableWrap"><table class="analyticsTable"><thead><tr><th>Email</th><th>Created</th><th>Last sign-in</th></tr></thead><tbody>'+
          (emails.map(u=>'<tr><td>'+esc(u.email||'')+'</td><td>'+esc(fmtAdminDate(u.created_at))+'</td><td>'+esc(fmtAdminDate(u.last_sign_in_at))+'</td></tr>').join('')||'<tr><td colspan="3">No registered accounts.</td></tr>')+
        '</tbody></table></div></div>'+
      '</div>';
  }catch(e){body.innerHTML='<div class="analyticsError">'+esc(e.message||String(e))+'</div>'}
}
loadAdminAnalytics=med25LoadSitewideAnalytics;
async function med25OpenAdminAnalytics(){
  med25MoveGlobalOverlays();
  const back=document.getElementById('analyticsBack');
  const btn=document.getElementById('adminAnalyticsBtn');
  if(!back)return;
  back.classList.add('show');back.setAttribute('aria-hidden','false');
  if(med25AnalyticsBusy)return;
  med25AnalyticsBusy=true;
  if(btn){btn.disabled=true;btn.textContent='Loading…'}
  try{await loadAdminAnalytics()}
  finally{
    med25AnalyticsBusy=false;
    if(btn){btn.disabled=false;btn.textContent='Analytics'}
  }
}
function med25MoveGlobalOverlays(){
  const analytics=document.getElementById('analyticsBack');
  if(analytics&&analytics.parentElement!==document.body)document.body.appendChild(analytics);
  const btn=document.getElementById('adminAnalyticsBtn');
  if(btn&&!btn.dataset.med25AnalyticsBound){
    btn.dataset.med25AnalyticsBound='1';
    btn.onclick=med25OpenAdminAnalytics;
  }
}
function med25MoveAuthToHome(){
  const box=document.getElementById('authBox'),slot=document.getElementById('profileAuthSlot')||document.getElementById('homeAuthSlot');
  if(!box||!slot)return;
  if(box.parentElement!==slot)slot.appendChild(box);
  box.classList.add('homeAuthBox');
}
function med25SetupCompactMobileAuth(){
  med25MoveAuthToHome();
  const box=document.getElementById('authBox');
  if(!box)return;
  let toggle=document.getElementById('mobileAuthToggle');
  if(!toggle){
    toggle=document.createElement('button');
    toggle.id='mobileAuthToggle';
    toggle.type='button';
    toggle.className='mobileAuthToggle';
    box.insertBefore(toggle,box.firstChild);
    toggle.onclick=()=>{
      const collapsed=box.classList.toggle('mobileAuthCollapsed');
      toggle.setAttribute('aria-expanded',collapsed?'false':'true');
      med25SyncMobileAuthLabel();
    };
  }
  const signedIn=document.getElementById('authSignedIn');
  const syncState=()=>{
    const isSignedIn=!!(signedIn&&signedIn.style.display!=='none');
    box.classList.toggle('mobileAuthCollapsed',isSignedIn&&!isAdmin());
    med25SyncMobileAuthLabel();
  };
  if(signedIn&&!signedIn.dataset.mobileObserved){
    signedIn.dataset.mobileObserved='1';
    new MutationObserver(syncState).observe(signedIn,{attributes:true,attributeFilter:['style','class']});
  }
  syncState();
}
function med25SyncMobileAuthLabel(){
  const box=document.getElementById('authBox'),toggle=document.getElementById('mobileAuthToggle');
  if(!box||!toggle)return;
  const signedIn=document.getElementById('authSignedIn');
  const isSignedIn=!!(signedIn&&signedIn.style.display!=='none');
  const ident=(document.getElementById('authIdentity')?.textContent||'').trim();
  const expanded=!box.classList.contains('mobileAuthCollapsed');
  if(expanded){
    toggle.innerHTML='<span class="mobileAuthIcon">⌃</span><span><b>Account & sync</b><small>Tap to collapse</small></span>';
  }else if(isSignedIn){
    toggle.innerHTML='<span class="mobileAuthIcon">✓</span><span><b>'+esc(ident||'Progress synced')+'</b><small>Progress synced · tap for account</small></span>';
  }else{
    toggle.innerHTML='<span class="mobileAuthIcon">↻</span><span><b>Sync your progress</b><small>Optional · sign in across devices</small></span>';
  }
  toggle.setAttribute('aria-expanded',expanded?'true':'false');
}

function med25SetupProductUI(){
  med25SetupTheme();med25EnsureFlashFocus();med25MoveGlobalOverlays();med25MoveAuthToHome();med25SetupCompactMobileAuth();setupResponsiveFilters();
  const mode=localStorage.getItem(HUB_SECTION_KEY)||'home';
  document.body.classList.toggle('homeMode',mode==='home');
  if(mode==='home')med25RenderHomePolish();
  if(mode!==med25LastTrackedSection){
    med25LastTrackedSection=mode;
    try{trackEvent('section_view',{metadata:{section:mode}})}catch{}
  }
  med25EnhanceQuestionCards();med25ScheduleResponsiveRefresh();
}
setTimeout(med25SetupProductUI,80);


setupAIControls();
initAIQuestions();
setTimeout(()=>{try{setupAdvancedQuestionFilters();if(med25HomeVisible())renderHome();renderAIStats()}catch{}},1000);
})();
