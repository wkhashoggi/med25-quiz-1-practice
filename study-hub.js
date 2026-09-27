
(function(){
'use strict';
const HUB_SECTION_KEY='med25-main-section-v1';
const AI_LIBRARY_URL='ai_questions.json';
let aiLibrary={lecture_sets:[],generated_at:null};
let aiState={subject:'',lecture:'',search:'',filter:'all',page:1,pageSize:20,shuffle:false};
let aiAdvanced={status:'all',subject:'',lectures:new Set(),topic:''};
let pastAdvanced={status:'all',subject:'',lectures:new Set(),topic:''};

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
    if(aiAdvanced.subject&&q.subject!==aiAdvanced.subject)return false;
    if(aiAdvanced.lectures.size&& !aiAdvanced.lectures.has(q.set_id))return false;
    if(aiAdvanced.topic&&String(q.concept||'')!==aiAdvanced.topic)return false;
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
  populateAIFilters();setupAdvancedQuestionFilters();renderAI();renderHome();
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
  return String(v||'').toLowerCase().replace(/&/g,' and ').replace(/\b(lecture|slides?|student|third|year|dr|the|of|and|for|with)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function qaOverlap(a,b){
  const A=new Set(qaNorm(a).split(' ').filter(Boolean)),B=new Set(qaNorm(b).split(' ').filter(Boolean));
  if(!A.size||!B.size)return 0;
  let hit=0;A.forEach(x=>{if(B.has(x))hit++});
  return hit/Math.max(1,Math.min(A.size,B.size));
}
function qaLectureCatalog(){
  return (aiLibrary.lecture_sets||[]).filter(x=>!x.archived).map(x=>({id:x.id,subject:x.subject,title:x.title,source_file_id:x.source_file_id||'',source_url:x.source_url||''}));
}
const qaPastLectureCache=new Map();
function qaPastLecture(q){
  if(qaPastLectureCache.has(q.id))return qaPastLectureCache.get(q.id);
  const title=q.lecture_source?.title||'',url=q.lecture_source?.drive_url||'',cat=qaLectureCatalog();
  let hit=cat.find(x=>x.source_file_id&&url.includes(x.source_file_id));
  if(!hit){
    const nt=qaNorm(title);
    hit=cat.find(x=>qaNorm(x.title)===nt);
  }
  if(!hit&&title){
    let best=null,score=0;
    for(const x of cat){const sc=qaOverlap(title,x.title);if(sc>score){best=x;score=sc}}
    if(score>=.55)hit=best;
  }
  const out=hit||{id:'past:'+qaNorm(title),subject:'Other',title:title||'Unmatched lecture'};
  qaPastLectureCache.set(q.id,out);return out;
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
function qaLectureDropdownHtml(prefix){
  return '<div class="qaMulti" id="'+prefix+'LectureMulti">'+
    '<button class="qaMultiBtn" id="'+prefix+'LectureBtn" type="button" disabled>Select subject first</button>'+
    '<div class="qaMultiPanel hidden" id="'+prefix+'LecturePanel"></div>'+
  '</div>';
}
function qaFilterBarHtml(prefix){
  return '<div class="qaFilterBar" id="'+prefix+'AdvancedFilters">'+
    '<label class="qaField"><span>Answer status</span><select id="'+prefix+'Status"><option value="all">All</option><option value="unanswered">Unanswered</option><option value="correct">Correct</option><option value="wrong">Wrong</option><option value="starred">Starred</option><option value="revealed">Revealed answer</option></select></label>'+
    '<label class="qaField"><span>Subject</span><select id="'+prefix+'Subject"><option value="">All subjects</option></select></label>'+
    '<div class="qaField"><span>Lecture</span>'+qaLectureDropdownHtml(prefix)+'</div>'+
    '<label class="qaField"><span>Topic</span><select id="'+prefix+'Topic" disabled><option value="">Select subject first</option></select></label>'+
    '<button class="qaClearBtn" id="'+prefix+'Clear" type="button">Clear filters</button>'+
  '</div>';
}
function qaSubjects(){
  return [...new Set(qaLectureCatalog().map(x=>x.subject).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
function qaSubjectLectures(subject){
  return qaLectureCatalog().filter(x=>x.subject===subject).sort((a,b)=>a.title.localeCompare(b.title));
}
function qaPastTopics(subject,lectures){
  const out=new Set();
  QUESTIONS.forEach(q=>{
    const li=qaPastLecture(q);
    if(subject&&li.subject!==subject)return;
    if(lectures.size&&!lectures.has(li.id))return;
    if(q.topic)out.add(q.topic);
  });
  return [...out].sort((a,b)=>a.localeCompare(b));
}
function qaAITopics(subject,lectures){
  const out=new Set();
  aiAllQuestions().forEach(q=>{
    if(subject&&q.subject!==subject)return;
    if(lectures.size&&!lectures.has(q.set_id))return;
    if(q.concept)out.add(String(q.concept));
  });
  return [...out].sort((a,b)=>a.localeCompare(b));
}
function qaRenderLecturePicker(prefix,model){
  const btn=document.getElementById(prefix+'LectureBtn'),panel=document.getElementById(prefix+'LecturePanel');
  if(!btn||!panel)return;
  if(!model.subject){
    btn.disabled=true;btn.textContent='Select subject first';panel.classList.add('hidden');panel.innerHTML='';return;
  }
  const lectures=qaSubjectLectures(model.subject);
  btn.disabled=false;
  btn.textContent=model.lectures.size?(model.lectures.size===1?(lectures.find(x=>model.lectures.has(x.id))?.title||'1 lecture'):(model.lectures.size+' lectures selected')):('All '+model.subject+' lectures');
  panel.innerHTML='<div class="qaMultiHead"><b>'+model.subject+' lectures</b><button type="button" data-qa-clear-lectures="'+prefix+'">Clear</button></div>'+
    lectures.map(x=>'<label class="qaCheck"><input type="checkbox" value="'+esc(x.id)+'" '+(model.lectures.has(x.id)?'checked':'')+'><span>'+esc(x.title)+'</span></label>').join('');
  panel.querySelectorAll('input[type="checkbox"]').forEach(cb=>cb.onchange=()=>{
    if(cb.checked)model.lectures.add(cb.value);else model.lectures.delete(cb.value);
    model.topic='';
    qaRenderLecturePicker(prefix,model);qaRenderTopicPicker(prefix,model);qaApply(prefix);
  });
  panel.querySelector('[data-qa-clear-lectures]')?.addEventListener('click',e=>{
    e.stopPropagation();model.lectures.clear();model.topic='';qaRenderLecturePicker(prefix,model);qaRenderTopicPicker(prefix,model);qaApply(prefix);
  });
}
function qaRenderTopicPicker(prefix,model){
  const sel=document.getElementById(prefix+'Topic');if(!sel)return;
  if(!model.subject){
    sel.disabled=true;sel.innerHTML='<option value="">Select subject first</option>';return;
  }
  const topics=prefix==='past'?qaPastTopics(model.subject,model.lectures):qaAITopics(model.subject,model.lectures);
  sel.disabled=false;
  sel.innerHTML='<option value="">All topics</option>'+topics.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
  if(topics.includes(model.topic))sel.value=model.topic;else model.topic='';
}
function qaApply(prefix){
  if(prefix==='past'){
    state.page=1;resetUnansweredSnapshot();render();
  }else{
    aiState.page=1;renderAI();
  }
}
function qaResetLegacyStatus(prefix){
  if(prefix==='past'){
    state.filter='all';
    document.querySelectorAll('#questionSection .chip[data-filter]').forEach(x=>x.classList.toggle('active',x.dataset.filter==='all'));
  }else{
    aiState.filter='all';
    document.querySelectorAll('#aiSection [data-ai-filter]').forEach(x=>x.classList.toggle('active',x.dataset.aiFilter==='all'));
  }
}
function qaSetupOne(prefix,model,host){
  if(!host)return;
  const existing=document.getElementById(prefix+'AdvancedFilters');
  if(existing){
    const subject=document.getElementById(prefix+'Subject');
    if(subject){
      const current=model.subject;
      subject.innerHTML='<option value="">All subjects</option>'+qaSubjects().map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
      subject.value=current;
    }
    qaRenderLecturePicker(prefix,model);qaRenderTopicPicker(prefix,model);
    return;
  }
  host.insertAdjacentHTML('afterend',qaFilterBarHtml(prefix));
  const subject=document.getElementById(prefix+'Subject'),status=document.getElementById(prefix+'Status'),topic=document.getElementById(prefix+'Topic'),btn=document.getElementById(prefix+'LectureBtn'),panel=document.getElementById(prefix+'LecturePanel'),clear=document.getElementById(prefix+'Clear');
  subject.innerHTML='<option value="">All subjects</option>'+qaSubjects().map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
  status.onchange=()=>{model.status=status.value;qaResetLegacyStatus(prefix);qaApply(prefix)};
  subject.onchange=()=>{model.subject=subject.value;model.lectures.clear();model.topic='';qaRenderLecturePicker(prefix,model);qaRenderTopicPicker(prefix,model);qaApply(prefix)};
  topic.onchange=()=>{model.topic=topic.value;qaApply(prefix)};
  btn.onclick=e=>{e.stopPropagation();if(!btn.disabled)panel.classList.toggle('hidden')};
  panel.onclick=e=>e.stopPropagation();
  clear.onclick=()=>{
    model.status='all';model.subject='';model.lectures.clear();model.topic='';
    status.value='all';subject.value='';qaRenderLecturePicker(prefix,model);qaRenderTopicPicker(prefix,model);qaResetLegacyStatus(prefix);qaApply(prefix);
  };
  qaRenderLecturePicker(prefix,model);qaRenderTopicPicker(prefix,model);
}
function setupAdvancedQuestionFilters(){
  qaPastLectureCache.clear();
  qaSetupOne('past',pastAdvanced,document.querySelector('#questionSection .toolbar'));
  qaSetupOne('ai',aiAdvanced,document.querySelector('#aiSection .aiToolbar'));
  if(!window.__med25QaFilterGlobalBound){
    window.__med25QaFilterGlobalBound=true;
    document.addEventListener('click',()=>document.querySelectorAll('.qaMultiPanel').forEach(x=>x.classList.add('hidden')));
  }
  document.querySelectorAll('#questionSection .chip[data-filter]').forEach(b=>{if(!b.dataset.qaBound){b.dataset.qaBound='1';b.addEventListener('click',()=>{
    pastAdvanced.status='all';const s=document.getElementById('pastStatus');if(s)s.value='all';
  })}});
  document.querySelectorAll('#aiSection [data-ai-filter]').forEach(b=>{if(!b.dataset.qaBound){b.dataset.qaBound='1';b.addEventListener('click',()=>{
    aiAdvanced.status='all';const s=document.getElementById('aiStatus');if(s)s.value='all';
  })}});
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
  if(weak){const rows=homeWeakTopics();weak.innerHTML=rows.length?'<div class="hubRows">'+rows.map(x=>'<div class="hubRow"><div class="hubRowMain"><b>'+esc(x.topic)+'</b><span>'+(x.pastGraded?'Past papers '+x.pastCorrect+'/'+x.pastGraded:'')+(x.pastGraded&&x.aiGraded?' · ':'')+(x.aiGraded?'AI '+x.aiCorrect+'/'+x.aiGraded:'')+' · '+x.correct+'/'+x.graded+' combined</span></div><div class="hubRowScore">'+Math.round(x.accuracy*100)+'%</div></div>').join('')+'</div>':'<p>Answer some Past Paper or AI questions and your weakest topics will appear here.</p>'}
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

const qaBasePastFiltered=filtered;
filtered=function(){
  let qs=qaBasePastFiltered.apply(this,arguments);
  return qs.filter(q=>{
    const p=saved[q.id]||{},li=qaPastLecture(q);
    if(!qaStatusPass(p,pastAdvanced.status))return false;
    if(pastAdvanced.subject&&li.subject!==pastAdvanced.subject)return false;
    if(pastAdvanced.lectures.size&&!pastAdvanced.lectures.has(li.id))return false;
    if(pastAdvanced.topic&&q.topic!==pastAdvanced.topic)return false;
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

/* Advanced stacked question filters: status + Subject → Lecture → Topic + custom multi-select */
const QF_KEY='med25-question-filter-state-v2';
let qfState={
  past:{status:'all',subject:'',lecture:'',customMode:'include',customSubjects:new Set(),customLectures:new Set(),customActive:false},
  ai:{status:'all',topic:'',customMode:'include',customSubjects:new Set(),customLectures:new Set(),customActive:false}
};
let pastStatusSnapshot=null,aiStatusSnapshot=null,pastStatusPage=state.page,aiStatusPage=aiState.page;

function qfLoad(){
  try{
    const raw=JSON.parse(localStorage.getItem(QF_KEY)||'{}');
    ['past','ai'].forEach(k=>{
      if(!raw[k])return;
      Object.assign(qfState[k],raw[k]);
      qfState[k].customSubjects=new Set(raw[k].customSubjects||[]);
      qfState[k].customLectures=new Set(raw[k].customLectures||[]);
    });
  }catch{}
}
function qfSave(){
  try{
    const out={};
    ['past','ai'].forEach(k=>out[k]={...qfState[k],customSubjects:[...qfState[k].customSubjects],customLectures:[...qfState[k].customLectures]});
    localStorage.setItem(QF_KEY,JSON.stringify(out));
  }catch{}
}
function qfNorm(s){return String(s||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()}
function qfSubjectMap(){
  const map={};
  try{(flashLibrary.decks||[]).filter(d=>!d.archived).forEach(d=>{if(d.title&&d.subject)map[qfNorm(d.title)]=d.subject})}catch{}
  try{(aiLibrary.lecture_sets||[]).filter(x=>!x.archived).forEach(x=>{if(x.title&&x.subject)map[qfNorm(x.title)]=x.subject})}catch{}
  return map;
}
function qfPastLecture(q){return q?.lecture_source?.title||'Unmapped lecture'}
function qfPastSubject(q){
  const title=qfPastLecture(q),map=qfSubjectMap(),exact=map[qfNorm(title)];
  if(exact)return exact;
  const n=qfNorm(title);
  for(const [k,v] of Object.entries(map)){if(k&&n&&(k.includes(n)||n.includes(k)))return v}
  return q.module==='CVS'?'CVS / Other':q.module==='IBLS'?'IBLS / Other':q.module==='Formative'?'Formative / Other':'Other';
}
function qfAIlecture(q){return q.lecture_title||'Unmapped lecture'}
function qfStatusPass(progress,status){
  if(status==='all')return true;
  if(status==='unanswered')return !progress?.answered;
  if(status==='correct')return progress?.correct===true;
  if(status==='wrong')return progress?.correct===false;
  if(status==='starred')return !!progress?.starred;
  if(status==='revealed')return !!progress?.revealed;
  return true;
}
function qfCustomPass(subject,lecture,cfg){
  if(!cfg.customActive)return true;
  const has=cfg.customSubjects.size||cfg.customLectures.size;
  if(!has)return true;
  const selected=cfg.customSubjects.has(subject)||cfg.customLectures.has(lecture);
  return cfg.customMode==='exclude'?!selected:selected;
}
function qfStatusOptions(includeRevealed=true){
  return '<option value="all">Status: All</option><option value="unanswered">Status: Unanswered</option><option value="correct">Status: Correct</option><option value="wrong">Status: Wrong</option><option value="starred">Status: Starred</option>'+(includeRevealed?'<option value="revealed">Status: Revealed answer</option>':'');
}
function qfUnique(arr){return [...new Set(arr.filter(Boolean))].sort((a,b)=>a.localeCompare(b))}
function qfSetOptions(select,placeholder,items,value){
  if(!select)return;
  select.innerHTML='<option value="">'+placeholder+'</option>'+items.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');
  select.value=items.includes(value)?value:'';
}
function qfPastBase(){
  let qs=QUESTIONS.slice();
  const m=document.getElementById('module')?.value||'',b=document.getElementById('bank')?.value||'';
  if(m)qs=qs.filter(q=>q.module===m);
  if(b)qs=qs.filter(q=>q.bank===b);
  return qs;
}
function qfRefreshPastCascade(changed){
  const cfg=qfState.past,subject=document.getElementById('pastSubject'),lecture=document.getElementById('pastLecture'),topic=document.getElementById('topic');
  if(!subject||!lecture||!topic)return;
  let qs=qfPastBase();
  const subjects=qfUnique(qs.map(q=>qfPastSubject(q)));
  if(changed==='module'||changed==='bank'){if(cfg.subject&&!subjects.includes(cfg.subject)){cfg.subject='';cfg.lecture=''}}
  qfSetOptions(subject,'All subjects',subjects,cfg.subject);
  if(cfg.subject)qs=qs.filter(q=>qfPastSubject(q)===cfg.subject);
  const lectures=qfUnique(qs.map(q=>qfPastLecture(q)));
  if(changed==='subject'&&cfg.lecture&&!lectures.includes(cfg.lecture))cfg.lecture='';
  qfSetOptions(lecture,'All lectures',lectures,cfg.lecture);
  if(cfg.lecture)qs=qs.filter(q=>qfPastLecture(q)===cfg.lecture);
  const topics=qfUnique(qs.map(q=>q.topic));
  const current=topic.value;
  qfSetOptions(topic,'All topics',topics,topics.includes(current)?current:'');
}
function qfRefreshAICascade(changed){
  const cfg=qfState.ai,subject=document.getElementById('aiSubject'),lecture=document.getElementById('aiLecture'),topic=document.getElementById('aiTopic');
  if(!subject||!lecture||!topic)return;
  let qs=aiAllQuestions();
  const subjects=qfUnique(qs.map(q=>q.subject));
  if(changed==='reload'&&!subjects.includes(aiState.subject))aiState.subject='';
  qfSetOptions(subject,'All subjects',subjects,aiState.subject);
  if(aiState.subject)qs=qs.filter(q=>q.subject===aiState.subject);
  const sets=qfUnique(qs.map(q=>q.set_id));
  const lectureData=(aiLibrary.lecture_sets||[]).filter(x=>sets.includes(x.id)).sort((a,b)=>(a.title||'').localeCompare(b.title||''));
  lecture.innerHTML='<option value="">All lectures</option>'+lectureData.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+'</option>').join('');
  if(!lectureData.some(x=>x.id===aiState.lecture))aiState.lecture='';
  lecture.value=aiState.lecture;
  if(aiState.lecture)qs=qs.filter(q=>q.set_id===aiState.lecture);
  const topics=qfUnique(qs.map(q=>q.concept));
  if(cfg.topic&&!topics.includes(cfg.topic))cfg.topic='';
  qfSetOptions(topic,'All topics',topics,cfg.topic);
}
function qfCustomPanel(scope){
  const cfg=qfState[scope],isPast=scope==='past';
  let subjects=[],lectures=[];
  if(isPast){
    subjects=qfUnique(QUESTIONS.map(q=>qfPastSubject(q)));
    lectures=qfUnique(QUESTIONS.map(q=>qfPastLecture(q)));
  }else{
    subjects=qfUnique(aiAllQuestions().map(q=>q.subject));
    lectures=qfUnique(aiAllQuestions().map(q=>qfAIlecture(q)));
  }
  const checked=(set,v)=>set.has(v)?' checked':'';
  return '<div class="qfCustomHead"><div><b>Custom filter</b><span>Select multiple subjects and/or lectures.</span></div><button type="button" class="qfClose" data-qf-close="'+scope+'">×</button></div>'+
    '<div class="qfMode"><label><input type="radio" name="'+scope+'CustomMode" value="include" '+(cfg.customMode!=='exclude'?'checked':'')+'> Include only selected</label><label><input type="radio" name="'+scope+'CustomMode" value="exclude" '+(cfg.customMode==='exclude'?'checked':'')+'> Exclude selected</label></div>'+
    '<div class="qfMultiGrid"><div><div class="qfListTitle">Subjects</div><div class="qfCheckList">'+subjects.map(v=>'<label><input type="checkbox" data-qf-scope="'+scope+'" data-qf-kind="subject" value="'+esc(v)+'"'+checked(cfg.customSubjects,v)+'> <span>'+esc(v)+'</span></label>').join('')+'</div></div>'+
    '<div><div class="qfListTitle">Lectures</div><div class="qfCheckList">'+lectures.map(v=>'<label><input type="checkbox" data-qf-scope="'+scope+'" data-qf-kind="lecture" value="'+esc(v)+'"'+checked(cfg.customLectures,v)+'> <span>'+esc(v)+'</span></label>').join('')+'</div></div></div>'+
    '<div class="qfCustomFoot"><button type="button" class="qfBtn" data-qf-clear="'+scope+'">Clear</button><button type="button" class="qfBtn primary" data-qf-apply="'+scope+'">Apply filter</button></div>';
}
function qfUpdateButton(scope){
  const cfg=qfState[scope],btn=document.getElementById(scope+'CustomFilterBtn');if(!btn)return;
  const n=cfg.customSubjects.size+cfg.customLectures.size;
  btn.textContent='Custom filter'+(cfg.customActive&&n?' · '+n:'');
  btn.classList.toggle('active',cfg.customActive&&n>0);
}
function qfBindPanel(scope){
  const panel=document.getElementById(scope+'CustomPanel');if(!panel)return;
  panel.querySelector('[data-qf-close]')?.addEventListener('click',()=>panel.classList.add('hidden'));
  panel.querySelectorAll('input[type="radio"]').forEach(r=>r.addEventListener('change',()=>{qfState[scope].customMode=r.value}));
  panel.querySelectorAll('input[type="checkbox"]').forEach(c=>c.addEventListener('change',()=>{
    const set=c.dataset.qfKind==='subject'?qfState[scope].customSubjects:qfState[scope].customLectures;
    c.checked?set.add(c.value):set.delete(c.value);
  }));
  panel.querySelector('[data-qf-clear]')?.addEventListener('click',()=>{
    const cfg=qfState[scope];cfg.customSubjects.clear();cfg.customLectures.clear();cfg.customActive=false;qfSave();qfRenderCustom(scope);qfApply(scope);
  });
  panel.querySelector('[data-qf-apply]')?.addEventListener('click',()=>{
    const cfg=qfState[scope];cfg.customActive=!!(cfg.customSubjects.size||cfg.customLectures.size);qfSave();qfUpdateButton(scope);panel.classList.add('hidden');qfApply(scope);
  });
}
function qfRenderCustom(scope){
  const panel=document.getElementById(scope+'CustomPanel');if(!panel)return;
  panel.innerHTML=qfCustomPanel(scope);qfBindPanel(scope);qfUpdateButton(scope);
}
function qfApply(scope){
  if(scope==='past'){pastStatusSnapshot=null;state.page=1;render()}
  else{aiStatusSnapshot=null;aiState.page=1;renderAI()}
}
function qfInstallPast(){
  const controls=document.querySelector('#questionSection .toolbar .controls'),chips=document.querySelector('#questionSection .toolbar .chips');
  if(!controls||document.getElementById('pastStatus'))return;
  const module=document.getElementById('module');
  const subject=document.createElement('select');subject.id='pastSubject';subject.className='control';subject.innerHTML='<option value="">All subjects</option>';
  const lecture=document.createElement('select');lecture.id='pastLecture';lecture.className='control';lecture.innerHTML='<option value="">All lectures</option>';
  const status=document.createElement('select');status.id='pastStatus';status.className='control';status.innerHTML=qfStatusOptions(true);status.value=qfState.past.status;
  module.insertAdjacentElement('afterend',subject);subject.insertAdjacentElement('afterend',lecture);
  document.getElementById('sort').insertAdjacentElement('afterend',status);
  const custom=document.createElement('button');custom.type='button';custom.id='pastCustomFilterBtn';custom.className='chip qfCustomTrigger';custom.textContent='Custom filter';
  chips.prepend(custom);
  const panel=document.createElement('div');panel.id='pastCustomPanel';panel.className='qfCustomPanel hidden';document.querySelector('#questionSection .toolbar').appendChild(panel);
  ['unanswered','wrong','starred'].forEach(v=>chips.querySelector('[data-filter="'+v+'"]')?.remove());
  if(['unanswered','wrong','starred'].includes(state.filter)){state.filter='all';chips.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x.dataset.filter==='all'))}
  subject.onchange=()=>{qfState.past.subject=subject.value;qfState.past.lecture='';qfRefreshPastCascade('subject');qfSave();qfApply('past')};
  lecture.onchange=()=>{qfState.past.lecture=lecture.value;qfRefreshPastCascade('lecture');qfSave();qfApply('past')};
  status.onchange=()=>{qfState.past.status=status.value;pastStatusSnapshot=null;qfSave();qfApply('past')};
  module.addEventListener('change',()=>{qfRefreshPastCascade('module')});
  document.getElementById('bank').addEventListener('change',()=>{qfRefreshPastCascade('bank')});
  custom.onclick=()=>{qfRenderCustom('past');panel.classList.toggle('hidden')};
  qfRefreshPastCascade('reload');qfRenderCustom('past');
}
function qfInstallAI(){
  const controls=document.querySelector('#aiSection .aiControls'),chips=document.querySelector('#aiSection .aiChips');
  if(!controls||document.getElementById('aiStatus'))return;
  const topic=document.createElement('select');topic.id='aiTopic';topic.className='aiControl';topic.innerHTML='<option value="">All topics</option>';
  const status=document.createElement('select');status.id='aiStatus';status.className='aiControl';status.innerHTML=qfStatusOptions(false);status.value=qfState.ai.status;
  document.getElementById('aiLecture').insertAdjacentElement('afterend',topic);topic.insertAdjacentElement('afterend',status);
  const custom=document.createElement('button');custom.type='button';custom.id='aiCustomFilterBtn';custom.className='aiChip qfCustomTrigger';custom.textContent='Custom filter';chips.prepend(custom);
  ['all','unanswered','wrong','starred'].forEach(v=>chips.querySelector('[data-ai-filter="'+v+'"]')?.remove());
  aiState.filter='all';
  topic.onchange=()=>{qfState.ai.topic=topic.value;qfSave();qfApply('ai')};
  status.onchange=()=>{qfState.ai.status=status.value;aiStatusSnapshot=null;qfSave();qfApply('ai')};
  const subject=document.getElementById('aiSubject'),lecture=document.getElementById('aiLecture');
  subject.onchange=()=>{aiState.subject=subject.value;aiState.lecture='';qfRefreshAICascade('subject');aiState.page=1;renderAI()};
  lecture.onchange=()=>{aiState.lecture=lecture.value;qfRefreshAICascade('lecture');aiState.page=1;renderAI()};
  const panel=document.createElement('div');panel.id='aiCustomPanel';panel.className='qfCustomPanel hidden';document.querySelector('#aiSection .aiToolbar').appendChild(panel);
  custom.onclick=()=>{qfRenderCustom('ai');panel.classList.toggle('hidden')};
  qfRefreshAICascade('reload');qfRenderCustom('ai');
}
function setupAdvancedQuestionFilters(){
  qfInstallPast();qfInstallAI();
  qfRefreshPastCascade('reload');qfRefreshAICascade('reload');
  qfRenderCustom('past');qfRenderCustom('ai');
}
qfLoad();

const qfBaseFiltered=filtered;
filtered=function(){
  let qs=qfBaseFiltered();
  const cfg=qfState.past;
  if(cfg.subject)qs=qs.filter(q=>qfPastSubject(q)===cfg.subject);
  if(cfg.lecture)qs=qs.filter(q=>qfPastLecture(q)===cfg.lecture);
  qs=qs.filter(q=>qfCustomPass(qfPastSubject(q),qfPastLecture(q),cfg));
  if(cfg.status==='unanswered'){
    if(pastStatusPage!==state.page){pastStatusSnapshot=null;pastStatusPage=state.page}
    if(!pastStatusSnapshot)pastStatusSnapshot=new Set(qs.filter(q=>!saved[q.id]?.answered).map(q=>q.id));
    qs=qs.filter(q=>pastStatusSnapshot.has(q.id));
  }else qs=qs.filter(q=>qfStatusPass(saved[q.id],cfg.status));
  return qs;
};
const qfBaseAIFiltered=aiFiltered;
aiFiltered=function(){
  let qs=qfBaseAIFiltered(),cfg=qfState.ai,p=aiProgress();
  if(cfg.topic)qs=qs.filter(q=>q.concept===cfg.topic);
  qs=qs.filter(q=>qfCustomPass(q.subject,qfAIlecture(q),cfg));
  if(cfg.status==='unanswered'){
    if(aiStatusPage!==aiState.page){aiStatusSnapshot=null;aiStatusPage=aiState.page}
    if(!aiStatusSnapshot)aiStatusSnapshot=new Set(qs.filter(q=>!p[q.id]?.answered).map(q=>q.id));
    qs=qs.filter(q=>aiStatusSnapshot.has(q.id));
  }else qs=qs.filter(q=>qfStatusPass(p[q.id],cfg.status));
  return qs;
};

setupAIControls();
initAIQuestions();
setTimeout(()=>{try{setupAdvancedQuestionFilters();renderHome();renderAIStats()}catch{}},1000);
})();
