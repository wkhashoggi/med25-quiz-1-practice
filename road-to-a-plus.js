
(function(){
'use strict';

var ROAD_NAV_KEY='med25-active-study-section-v2';
var ROAD_EXAM_DATE_KEY='med25-road-exam-date-v1';
var roadExam={active:false,finished:false,questions:[],answers:{},index:0,strict:true,startedAt:0,endsAt:0,module:'All',result:null};
var roadExamTimer=null;

var ROAD_CHAINS=[
 {title:'Baroreceptor reflex',chain:'↓ arterial pressure → ↓ stretch of carotid sinus/aortic arch → ↓ baroreceptor firing → ↑ sympathetic + ↓ parasympathetic output → ↑ heart rate, ↑ contractility and vasoconstriction → ↑ MAP',test:'The reflex is rapid and short-term. Chronic hypertension can reset the baroreceptors.'},
 {title:'Lipoprotein pathway',chain:'Dietary TAG/cholesterol → chylomicrons → LPL removes TAG → remnants return to liver. Liver exports TAG as VLDL → IDL → LDL. LDL delivers cholesterol to tissues; HDL supports reverse cholesterol transport.',test:'Keep the direction straight: chylomicrons carry dietary lipid; VLDL begins in the liver; LDL is cholesterol-rich.'},
 {title:'Heme synthesis',chain:'Glycine + succinyl-CoA → ALA via ALA synthase → porphobilinogen → porphyrin intermediates → protoporphyrin IX → heme via ferrochelatase + Fe²⁺',test:'ALA synthase is rate-limiting. Ferrochelatase inserts ferrous iron at the final step.'},
 {title:'Primary hemostasis',chain:'Vessel injury → vWF binds exposed subendothelial collagen → platelet GPIb adhesion → platelet activation/release → GPIIb/IIIa activation → fibrinogen bridges platelets → platelet plug',test:'GPIb = adhesion to vWF. GPIIb/IIIa = aggregation via fibrinogen.'},
 {title:'Secondary hemostasis',chain:'Extrinsic/intrinsic pathways → factor X → Xa → prothrombin II → thrombin IIa → fibrinogen → fibrin → factor XIII cross-links fibrin',test:'PT emphasizes extrinsic/common pathway; aPTT emphasizes intrinsic/common pathway.'},
 {title:'Type I hypersensitivity',chain:'First exposure → Th2 response → IgE production → IgE binds mast cells. Re-exposure → allergen cross-links IgE → mast-cell degranulation → histamine and other mediators → immediate symptoms',test:'Anaphylaxis is treated first with IM epinephrine, not antihistamine alone.'},
 {title:'Coronary perfusion',chain:'Myocardial work ↑ → O₂ demand ↑ → local metabolites accumulate → coronary vasodilation → coronary blood flow ↑. Left coronary perfusion occurs mainly during diastole.',test:'Tachycardia can reduce left coronary perfusion because it shortens diastole.'},
 {title:'Erythropoiesis response',chain:'Tissue hypoxia → kidney detects low O₂ → erythropoietin ↑ → marrow erythroid production ↑ → reticulocytes ↑ → oxygen-carrying capacity ↑',test:'CKD can cause a normocytic anemia because renal EPO production falls.'}
];

var ROAD_COMPARE=[
 {title:'PT vs aPTT',headers:['Feature','PT','aPTT'],rows:[
  ['Pathway','Extrinsic + common','Intrinsic + common'],
  ['Key screening factor','VII','XII, XI, IX, VIII'],
  ['Common pathway','X, V, II, fibrinogen','X, V, II, fibrinogen'],
  ['Classic drug monitoring','Warfarin / INR','Unfractionated heparin'],
  ['Hemophilia A/B','Usually normal','Prolonged']
 ]},
 {title:'Hypersensitivity I–IV',headers:['Type','Main mechanism','Classic pattern'],rows:[
  ['I','IgE + mast cells','Immediate allergy/anaphylaxis'],
  ['II','IgG/IgM against cells or receptors','Cytotoxicity or receptor dysfunction'],
  ['III','Immune-complex deposition + complement','Serum sickness, immune-complex injury'],
  ['IV','T-cell mediated','Delayed hypersensitivity/contact dermatitis']
 ]},
 {title:'Chylomicron → VLDL → IDL → LDL → HDL',headers:['Particle','Main origin / job','Key idea'],rows:[
  ['Chylomicron','Intestine; carries dietary TAG','Largest, TAG-rich; enters lymph first'],
  ['VLDL','Liver; exports endogenous TAG','Loses TAG through LPL'],
  ['IDL','VLDL remnant','Can return to liver or become LDL'],
  ['LDL','Delivers cholesterol to tissues','ApoB-100 binds LDL receptor'],
  ['HDL','Reverse cholesterol transport','Collects cholesterol and supports return to liver']
 ]},
 {title:'Hemophilia A vs B',headers:['Feature','Hemophilia A','Hemophilia B'],rows:[
  ['Deficient factor','VIII','IX'],
  ['Pathway','Intrinsic','Intrinsic'],
  ['PT','Normal','Normal'],
  ['aPTT','Prolonged','Prolonged'],
  ['Clinical pattern','Deep tissue/joint bleeding','Deep tissue/joint bleeding']
 ]},
 {title:'Stable vs unstable angina',headers:['Feature','Stable','Unstable'],rows:[
  ['Typical mechanism','Fixed plaque stenosis','Plaque disruption ± non-occlusive thrombus'],
  ['Trigger','Predictable exertion/demand','Can occur at rest or with less exertion'],
  ['Necrosis','No','No infarction by definition'],
  ['Clinical meaning','Chronic demand ischemia','Acute coronary syndrome']
 ]},
 {title:'Primary vs secondary polycythemia',headers:['Feature','Primary','Secondary'],rows:[
  ['Core problem','Autonomous marrow RBC production','EPO-driven RBC production'],
  ['Typical EPO','Low','High'],
  ['Example','Polycythemia vera','Chronic hypoxia/high altitude'],
  ['Blood viscosity','Increased','Increased']
 ]},
 {title:'Hodgkin vs non-Hodgkin lymphoma',headers:['Feature','Hodgkin lymphoma','Non-Hodgkin lymphoma'],rows:[
  ['Signature finding','Reed–Sternberg cells in appropriate background','No single universal signature cell'],
  ['Spread','Often contiguous nodal spread','Often noncontiguous; extranodal disease more common'],
  ['Node architecture','May be effaced by characteristic infiltrate','Often effaced by clonal lymphoid proliferation'],
  ['Useful exam clue','Large binucleate cell with prominent nucleoli','Subtype-specific B/T/NK-cell features']
 ]}
];

function roadState(){
  if(!saved.__a_plus__||typeof saved.__a_plus__!=='object'){
    saved.__a_plus__={exam_history:[],created_at:new Date().toISOString()};
  }
  if(!Array.isArray(saved.__a_plus__.exam_history))saved.__a_plus__.exam_history=[];
  return saved.__a_plus__;
}
function roadConfidenceWeight(v){
  if(v==='guessing')return .55;
  if(v==='5050')return .68;
  if(v==='sure')return .88;
  if(v==='knew')return 1;
  return .8;
}
function roadQuestionScore(q){
  var p=saved[q.id]||{};
  if(!p.answered)return 0;
  if(p.correct===true)return roadConfidenceWeight(p.confidence);
  if(p.correct===false)return 0;
  if(p.revealed)return .08;
  return .15;
}
function roadFlashScore(r){
  if(!r)return 0;
  var base=.65;
  if(r.last_grade==='again')base=.12;
  else if(r.last_grade==='hard')base=.45;
  else if(r.last_grade==='good')base=.78;
  else if(r.last_grade==='easy')base=.92;
  if(Number(r.interval||0)>=21)base=Math.min(1,base+.08);
  return base;
}
function roadTopicMetrics(){
  var map={};
  QUESTIONS.forEach(function(q){
    var x=map[q.topic]||(map[q.topic]={topic:q.topic,total:0,answered:0,graded:0,correct:0,revealed:0,highYield:0,score:0});
    var p=saved[q.id]||{};
    x.total++;
    x.score+=roadQuestionScore(q);
    if(q.high_yield)x.highYield++;
    if(p.answered)x.answered++;
    if(p.correct===true||p.correct===false)x.graded++;
    if(p.correct===true)x.correct++;
    if(p.revealed)x.revealed++;
  });
  Object.keys(map).forEach(function(k){
    var x=map[k];
    x.mastery=Math.round(100*x.score/Math.max(1,x.total));
    x.accuracy=x.graded?Math.round(100*x.correct/x.graded):0;
    x.coverage=Math.round(100*x.answered/x.total);
  });
  return Object.values(map);
}
function roadMastery(){
  var qScore=QUESTIONS.reduce(function(n,q){return n+roadQuestionScore(q)},0);
  var qMastery=QUESTIONS.length?100*qScore/QUESTIONS.length:0;
  var cards=(typeof allFlashCards==='function')?allFlashCards():[];
  var fScore=cards.reduce(function(n,c){return n+roadFlashScore(cardReview(c.id))},0);
  var fMastery=cards.length?100*fScore/cards.length:0;
  var hy=QUESTIONS.filter(function(q){return q.high_yield});
  var hScore=hy.reduce(function(n,q){return n+roadQuestionScore(q)},0);
  var hMastery=hy.length?100*hScore/hy.length:0;
  var overall=.55*qMastery+.30*fMastery+.15*hMastery;
  return {overall:overall,questions:qMastery,flashcards:fMastery,highYield:hMastery,highYieldTotal:hy.length,highYieldMastered:hy.filter(function(q){return roadQuestionScore(q)>=.75}).length};
}
function roadStatus(m){
  if(m.overall>=85)return {label:'A+ zone',tone:'good'};
  if(m.overall>=70)return {label:'On track',tone:'good'};
  if(m.overall>=45)return {label:'Building',tone:'mid'};
  return {label:'Needs work',tone:'bad'};
}
function roadPctClass(v){return v>=80?'good':(v>=60?'mid':'bad')}
function roadFmtPct(v){return Math.round(v||0)+'%'}
function roadNormalize(s){
  return String(s||'').toLowerCase().replace(/&/g,' and ').replace(/\b(lecture|lect|students|student|third|year|part|dr|the|of|and|for|with|module|medicine)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function roadTitleSimilarity(a,b){
  a=roadNormalize(a);b=roadNormalize(b);
  if(!a||!b)return 0;
  if(a===b||a.indexOf(b)>=0||b.indexOf(a)>=0)return 1;
  var aa=new Set(a.split(' ').filter(Boolean)),bb=new Set(b.split(' ').filter(Boolean));
  var hit=0;aa.forEach(function(x){if(bb.has(x))hit++});
  return hit/Math.max(1,Math.min(aa.size,bb.size));
}
function roadRelatedQuestions(deck){
  return QUESTIONS.filter(function(q){
    var t=q.lecture_source&&q.lecture_source.title;
    return t&&roadTitleSimilarity(t,deck.title)>=.55;
  });
}
function roadDeckMetrics(deck){
  var cards=deck.cards||[],seen=0,fs=0;
  cards.forEach(function(c){var r=cardReview(c.id);if(r)seen++;fs+=roadFlashScore(r)});
  var flash=cards.length?100*fs/cards.length:0;
  var qs=roadRelatedQuestions(deck),answered=0,qsScore=0;
  qs.forEach(function(q){if(saved[q.id]&&saved[q.id].answered)answered++;qsScore+=roadQuestionScore(q)});
  var qMastery=qs.length?100*qsScore/qs.length:null;
  var mastery=qMastery===null?flash:(.60*flash+.40*qMastery);
  return {cards:cards.length,seen:seen,flash:flash,questions:qs.length,answered:answered,qMastery:qMastery,mastery:mastery};
}
function roadReviewReason(q){
  var p=saved[q.id]||{};
  if(p.correct===false)return 'Incorrect answer';
  if(p.revealed)return 'Answer revealed';
  if(p.correct===true&&p.confidence==='guessing')return 'Correct, but guessed';
  if(p.correct===true&&p.confidence==='5050')return 'Correct, but 50/50';
  if(p.starred)return 'Starred for review';
  if(!p.answered&&q.high_yield)return (q.repeat_count||0)>=3?'Unseen repeated concept ×'+q.repeat_count:'Unseen high-yield concept';
  return 'Needs reinforcement';
}
function roadReviewCandidates(){
  var topics=roadTopicMetrics(),weak={};
  topics.forEach(function(x){weak[x.topic]=x.mastery});
  return QUESTIONS.map(function(q){
    var p=saved[q.id]||{},score=0;
    if(p.correct===false)score+=120;
    if(p.revealed)score+=105;
    if(p.correct===true&&p.confidence==='guessing')score+=90;
    if(p.correct===true&&p.confidence==='5050')score+=65;
    if(p.starred)score+=28;
    if(!p.answered&&q.high_yield)score+=48;
    score+=Math.min(30,(q.repeat_count||0)*6);
    score+=Math.min(18,(q.topic_repeat_count||0)/3);
    if((weak[q.topic]||0)<45)score+=14;
    return {q:q,score:score,reason:roadReviewReason(q)};
  }).filter(function(x){return x.score>35}).sort(function(a,b){return b.score-a.score||highYieldPriority(b.q)-highYieldPriority(a.q)});
}
function roadReviewedDueCount(){
  if(typeof allFlashCards!=='function')return 0;
  var now=Date.now();
  return allFlashCards().filter(function(c){var r=cardReview(c.id);return r&&Number(r.due||0)<=now}).length;
}
function roadNewFlashCount(){
  if(typeof allFlashCards!=='function')return 0;
  return allFlashCards().filter(function(c){return !cardReview(c.id)}).length;
}
function roadWeakestDeck(){
  var decks=(flashLibrary&&flashLibrary.decks)||[];
  var rows=decks.map(function(d){return {deck:d,m:roadDeckMetrics(d)}}).filter(function(x){return !x.deck.archived});
  rows.sort(function(a,b){return a.m.mastery-b.m.mastery||b.m.cards-a.m.cards});
  return rows.length?rows[0]:null;
}
function roadRecommendation(){
  var queue=roadReviewCandidates(),top=queue[0],due=roadReviewedDueCount(),weakDeck=roadWeakestDeck();
  if(top&&top.score>=80)return {type:'question',title:'Fix: '+top.q.topic,detail:top.reason+' · '+(top.q.lecture_source?top.q.lecture_source.title:'Practice bank'),id:top.q.id};
  if(due>0)return {type:'flash_due',title:'Clear '+due+' due flashcard'+(due===1?'':'s'),detail:'Due reviews are time-sensitive and should be cleared before adding more new cards.'};
  if(top)return {type:'question',title:'Review: '+top.q.topic,detail:top.reason,id:top.q.id};
  if(weakDeck)return {type:'deck',title:'Start '+weakDeck.deck.title,detail:weakDeck.deck.subject+' · '+weakDeck.m.cards+' cards',deckId:weakDeck.deck.id};
  return {type:'done',title:'You are caught up',detail:'No urgent review items are waiting right now.'};
}
function roadToday(){
  var d=new Date(),start=new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();
  var qToday=QUESTIONS.filter(function(q){var t=Date.parse((saved[q.id]||{}).locked_at||'');return t>=start}).length;
  var fToday=(typeof allFlashCards==='function'?allFlashCards():[]).filter(function(c){return Number((cardReview(c.id)||{}).last_reviewed||0)>=start}).length;
  var exams=roadState().exam_history.filter(function(x){return Date.parse(x.date||'')>=start}).length;
  return {questions:qToday,flashcards:fToday,exams:exams};
}
function roadEstimatedMinutes(){
  var queue=Math.min(30,roadReviewCandidates().length);
  var due=roadReviewedDueCount();
  var newCards=Math.min(20,roadNewFlashCount());
  return Math.round(queue*1.4+due*.35+newCards*.30);
}
function roadCountdownText(){
  var raw=localStorage.getItem(ROAD_EXAM_DATE_KEY)||'';
  if(!raw)return 'Set your next quiz/exam date';
  var t=Date.parse(raw),ms=t-Date.now();
  if(!isFinite(t))return 'Set your next quiz/exam date';
  if(ms<=0)return 'Exam date has passed — update it';
  var days=Math.floor(ms/86400000),hours=Math.floor((ms%86400000)/3600000),mins=Math.floor((ms%3600000)/60000);
  if(days>0)return days+'d '+hours+'h remaining';
  return hours+'h '+mins+'m remaining';
}
function roadEvidenceRows(){
  var map={};
  QUESTIONS.forEach(function(q){
    var x=map[q.topic]||(map[q.topic]={topic:q.topic,count:0,maxRepeat:0,formative:0,phys:0,hy:0});
    x.count++;x.maxRepeat=Math.max(x.maxRepeat,q.repeat_count||0);
    if(q.bank==='Coordinator Formative Quiz 1')x.formative++;
    if(q.bank==='Physiology Important')x.phys++;
    if(q.high_yield)x.hy++;
  });
  var tm={};roadTopicMetrics().forEach(function(x){tm[x.topic]=x.mastery});
  return Object.values(map).map(function(x){
    x.mastery=tm[x.topic]||0;
    x.evidence=x.maxRepeat*10+x.formative*18+x.phys*12+x.hy*3+Math.min(20,x.count);
    return x;
  }).sort(function(a,b){return b.evidence-a.evidence}).slice(0,12);
}
function roadConfidenceHtml(q,p){
  if(!p.answered||!p.selected)return '';
  var opts=[['guessing','Guessing'],['5050','50/50'],['sure','Fairly sure'],['knew','Knew it']];
  var buttons=opts.map(function(x){return '<button class="roadInlineBtn '+(p.confidence===x[0]?'active':'')+'" data-confidence="'+x[0]+'" data-road-id="'+q.id+'">'+x[1]+'</button>'}).join('');
  return '<div class="roadInlineBlock"><div class="roadInlineLabel">How sure were you before seeing the answer?</div><div class="roadInlineBtns">'+buttons+'</div></div>';
}
function roadMistakeHtml(q,p){
  if(!(p.correct===false||p.revealed))return '';
  var tags=[['knowledge','Didn’t know it'],['confused','Mixed concepts'],['detail','Forgot detail'],['misread','Misread'],['changed','Changed answer'],['logic','Logic/calculation']];
  var buttons=tags.map(function(x){return '<button class="roadInlineBtn bad '+(p.mistake_tag===x[0]?'active':'')+'" data-mistake="'+x[0]+'" data-road-id="'+q.id+'">'+x[1]+'</button>'}).join('');
  var src='';
  if(q.lecture_source){
    src='<div class="roadRemediate"><span>Remediation: '+esc(q.lecture_source.title||'Lecture')+(q.lecture_source.slide?' · slide '+q.lecture_source.slide:'')+'</span><button class="roadTinyBtn blue" data-road-remediate="'+q.id+'">Review source ↗</button></div>';
  }
  return '<div class="roadInlineBlock"><div class="roadInlineLabel">Why did this happen?</div><div class="roadInlineBtns">'+buttons+'</div>'+src+'</div>';
}
function roadSetConfidence(id,value){
  saved[id]=Object.assign({},saved[id]||{},{confidence:value,confidence_at:new Date().toISOString()});
  save();render();
}
function roadSetMistake(id,value){
  saved[id]=Object.assign({},saved[id]||{},{mistake_tag:value,mistake_at:new Date().toISOString()});
  save();render();
}
function roadBindQuestionExtras(){
  document.querySelectorAll('[data-confidence]').forEach(function(b){b.onclick=function(){roadSetConfidence(b.dataset.roadId,b.dataset.confidence)}});
  document.querySelectorAll('[data-mistake]').forEach(function(b){b.onclick=function(){roadSetMistake(b.dataset.roadId,b.dataset.mistake)}});
  document.querySelectorAll('[data-road-remediate]').forEach(function(b){b.onclick=function(){showSource(b.dataset.roadRemediate)}});
}
function roadOpenQuestion(id){
  var q=QUESTIONS.find(function(x){return x.id===id});if(!q)return;
  switchStudySection('questions');
  document.getElementById('search').value=q.stem;
  document.getElementById('module').value='';
  document.getElementById('topic').value='';
  document.getElementById('bank').value='';
  document.getElementById('sort').value='';
  state.filter='all';state.page=1;state.shuffled=false;
  document.querySelectorAll('.chip[data-filter]').forEach(function(x){x.classList.toggle('active',x.dataset.filter==='all')});
  saveViewState();render();
  setTimeout(function(){var el=document.getElementById(id);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})},50);
}
function roadStudyNext(){
  var r=roadRecommendation();
  if(r.type==='question')return roadOpenQuestion(r.id);
  if(r.type==='flash_due'){switchStudySection('flashcards');return startFlashStudy((flashLibrary.decks||[]).map(function(d){return d.id}))}
  if(r.type==='deck'){switchStudySection('flashcards');return startFlashStudy([r.deckId])}
}
function roadRenderHero(){
  var m=roadMastery(),status=roadStatus(m),host=document.getElementById('roadHeroDynamic');if(!host)return;
  host.innerHTML='<div class="roadHeroTop"><div><h2>MED25 — Road to A+</h2><p>Your questions, flashcards, repeated concepts and lecture coverage now feed one study-priority system.</p></div><div class="roadStatus">'+status.label+'</div></div>'+
  '<div class="roadKpis">'+
  '<div class="roadKpi"><b>'+roadFmtPct(m.overall)+'</b><span>overall mastery</span></div>'+
  '<div class="roadKpi"><b>'+roadFmtPct(m.questions)+'</b><span>question mastery</span></div>'+
  '<div class="roadKpi"><b>'+roadFmtPct(m.flashcards)+'</b><span>flashcard mastery</span></div>'+
  '<div class="roadKpi"><b>'+m.highYieldMastered+'/'+m.highYieldTotal+'</b><span>high-yield mastered</span></div></div>';
}
function roadRenderAction(){
  var host=document.getElementById('roadAction');if(!host)return;
  var r=roadRecommendation();
  host.innerHTML='<div class="roadActionBox"><div class="roadActionTitle">Study next</div><b>'+esc(r.title)+'</b><p>'+esc(r.detail)+'</p><button class="roadPrimary" id="roadStudyNextBtn" '+(r.type==='done'?'disabled':'')+'>'+(r.type==='done'?'Caught up':'Start now →')+'</button></div>';
  var btn=document.getElementById('roadStudyNextBtn');if(btn)btn.onclick=roadStudyNext;
}
function roadRenderBrief(){
  var host=document.getElementById('roadBrief');if(!host)return;
  var t=roadToday(),queue=roadReviewCandidates().length,due=roadReviewedDueCount(),mins=roadEstimatedMinutes(),hour=new Date().getHours();
  var greeting=hour<12?'Morning briefing':(hour<18?'Today’s briefing':'Evening briefing');
  var raw=localStorage.getItem(ROAD_EXAM_DATE_KEY)||'';
  host.innerHTML='<div class="roadCardHead"><h3>'+greeting+'</h3><span class="small">'+mins+' min estimated priority work</span></div>'+
  '<div class="roadBriefGrid">'+
   '<div class="roadMini"><b>'+t.questions+'</b><span>questions today</span></div>'+
   '<div class="roadMini"><b>'+t.flashcards+'</b><span>cards reviewed</span></div>'+
   '<div class="roadMini"><b>'+queue+'</b><span>A+ review items</span></div>'+
   '<div class="roadMini"><b>'+due+'</b><span>flashcards due</span></div>'+
  '</div>'+
  '<div class="roadCountdown"><input id="roadExamDateInput" type="datetime-local" value="'+esc(raw)+'"><strong>'+esc(roadCountdownText())+'</strong></div>';
  var inp=document.getElementById('roadExamDateInput');if(inp)inp.onchange=function(){localStorage.setItem(ROAD_EXAM_DATE_KEY,inp.value);roadRenderBrief()};
}
function roadRenderWeakStrong(){
  var host=document.getElementById('roadWeakStrong');if(!host)return;
  var rows=roadTopicMetrics().filter(function(x){return x.total>=2});
  var weak=rows.slice().sort(function(a,b){return a.mastery-b.mastery||b.highYield-a.highYield||b.total-a.total}).slice(0,5);
  var strong=rows.filter(function(x){return x.answered>0}).sort(function(a,b){return b.mastery-a.mastery||b.answered-a.answered}).slice(0,5);
  function one(x){
    return '<div class="roadRank"><div class="roadRankMain"><b>'+esc(x.topic)+'</b><span>'+x.answered+'/'+x.total+' attempted · '+x.accuracy+'% accuracy</span><div class="roadBar"><span style="width:'+x.mastery+'%"></span></div></div><div class="roadPct '+roadPctClass(x.mastery)+'">'+x.mastery+'%</div></div>';
  }
  host.innerHTML='<div class="roadSplit"><div><h3>Weakest / unfinished</h3>'+weak.map(one).join('')+'</div><div><h3>Strongest</h3>'+(strong.length?strong.map(one).join(''):'<div class="roadEmpty">Start answering questions to build a strength profile.</div>')+'</div></div>';
}
function roadRenderQueue(){
  var host=document.getElementById('roadReviewQueue');if(!host)return;
  var q=roadReviewCandidates().slice(0,10);
  if(!q.length){host.innerHTML='<div class="roadEmpty">No urgent review items yet.</div>';return}
  host.innerHTML='<div class="roadQueue">'+q.map(function(x){
    var src=x.q.lecture_source;
    return '<div class="roadQueueItem"><div class="main"><b>'+esc(x.q.topic)+'</b><span>'+esc(x.reason)+(src?' · '+esc(src.title)+(src.slide?' · slide '+src.slide:''):'')+'</span></div><div class="roadQueueBtns"><button class="roadTinyBtn blue" onclick="roadOpenQuestion(\''+x.q.id+'\')">Question</button>'+(src?'<button class="roadTinyBtn" onclick="showSource(\''+x.q.id+'\')">Source</button>':'')+'</div></div>';
  }).join('')+'</div>';
}
function roadRenderEvidence(){
  var host=document.getElementById('roadEvidence');if(!host)return;
  host.innerHTML='<div class="roadEvidence">'+roadEvidenceRows().map(function(x){
    var tags=[];
    if(x.maxRepeat>=2)tags.push('repeat ×'+x.maxRepeat);
    if(x.formative)tags.push('formative ×'+x.formative);
    if(x.phys)tags.push('physiology bank ×'+x.phys);
    return '<div class="roadEvidenceRow"><div><b>'+esc(x.topic)+'</b><span>'+(tags.length?tags.join(' · '):x.count+' bank questions')+'</span></div><div><span>'+x.mastery+'% mastery</span></div><div class="roadEvidenceScore">Evidence '+x.evidence+'</div></div>';
  }).join('')+'</div>';
}
function roadRenderLectures(){
  var host=document.getElementById('roadLectureList');if(!host)return;
  var filter=(document.getElementById('roadSubjectFilter')||{}).value||'';
  var decks=((flashLibrary&&flashLibrary.decks)||[]).filter(function(d){return !d.archived&&(!filter||d.subject===filter)});
  var rows=decks.map(function(d){return {d:d,m:roadDeckMetrics(d)}}).sort(function(a,b){return a.d.subject.localeCompare(b.d.subject)||a.d.title.localeCompare(b.d.title)});
  var html='<div class="roadLectureRow head"><div>Lecture</div><div>Flashcards</div><div>Practice</div><div>Mastery</div><div>Source</div></div>';
  html+=rows.map(function(x){
    var d=x.d,m=x.m,status=m.seen===0&&m.answered===0?'Not started':(m.mastery>=80?'Strong':'In progress');
    return '<div class="roadLectureRow"><div class="roadLectureName"><b>'+esc(d.title)+'</b><span>'+esc(d.subject)+' · '+status+'</span></div><div class="roadStage">'+m.seen+'/'+m.cards+' seen</div><div class="roadStage">'+m.answered+'/'+m.questions+' questions</div><div class="roadMasteryBadge">'+Math.round(m.mastery)+'%</div><div>'+(d.source_url?'<button class="roadSourceLink" onclick="window.open(\''+String(d.source_url).replace(/'/g,'%27')+'\',\'_blank\',\'noopener\')">Open ↗</button>':'—')+'</div></div>';
  }).join('');
  host.innerHTML=html;
}
function roadRenderLectureTools(){
  var sel=document.getElementById('roadSubjectFilter');if(!sel)return;
  var current=sel.value,subjects=[...new Set(((flashLibrary&&flashLibrary.decks)||[]).map(function(d){return d.subject}).filter(Boolean))].sort();
  sel.innerHTML='<option value="">All subjects</option>'+subjects.map(function(s){return '<option '+(s===current?'selected':'')+'>'+esc(s)+'</option>'}).join('');
  sel.onchange=roadRenderLectures;
}
function roadRenderChain(){
  var sel=document.getElementById('roadChainSelect'),host=document.getElementById('roadChainContent');if(!sel||!host)return;
  var idx=Math.max(0,parseInt(sel.value||0,10)||0),x=ROAD_CHAINS[idx];
  host.innerHTML='<div class="roadChain"><strong>'+esc(x.title)+'</strong><br>'+esc(x.chain)+'<br><span class="small">'+esc(x.test)+'</span></div>';
}
function roadRenderCompare(){
  var sel=document.getElementById('roadCompareSelect'),host=document.getElementById('roadCompareContent');if(!sel||!host)return;
  var idx=Math.max(0,parseInt(sel.value||0,10)||0),x=ROAD_COMPARE[idx];
  var head='<tr>'+x.headers.map(function(h){return '<th>'+esc(h)+'</th>'}).join('')+'</tr>';
  var body=x.rows.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+esc(c)+'</td>'}).join('')+'</tr>'}).join('');
  host.innerHTML='<table class="roadCompareTable"><thead>'+head+'</thead><tbody>'+body+'</tbody></table>';
}
function roadSetupLearningTools(){
  var cs=document.getElementById('roadChainSelect'),ps=document.getElementById('roadCompareSelect');
  if(cs){
    var cv=cs.value;cs.innerHTML=ROAD_CHAINS.map(function(x,i){return '<option value="'+i+'">'+esc(x.title)+'</option>'}).join('');if(cv)cs.value=cv;
    cs.onchange=roadRenderChain;roadRenderChain();
  }
  if(ps){
    var pv=ps.value;ps.innerHTML=ROAD_COMPARE.map(function(x,i){return '<option value="'+i+'">'+esc(x.title)+'</option>'}).join('');if(pv)ps.value=pv;
    ps.onchange=roadRenderCompare;roadRenderCompare();
  }
}
function roadExamPool(module){
  return QUESTIONS.filter(function(q){
    if(!q.answer||q.answer==='TEXT'||!q.options||Object.keys(q.options).length<2)return false;
    if(module&&module!=='All'&&q.module!==module)return false;
    return true;
  });
}
function roadShuffle(a){
  a=a.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),t=a[i];a[i]=a[j];a[j]=t}return a;
}
function roadSelectExamQuestions(pool,count){
  var hy=roadShuffle(pool.filter(function(q){return q.high_yield})),other=roadShuffle(pool.filter(function(q){return !q.high_yield}));
  var nHy=Math.min(hy.length,Math.round(count*.35)),picked=hy.slice(0,nHy).concat(other.slice(0,Math.max(0,count-nHy)));
  if(picked.length<count){
    var ids=new Set(picked.map(function(q){return q.id}));
    picked=picked.concat(roadShuffle(pool.filter(function(q){return !ids.has(q.id)})).slice(0,count-picked.length));
  }
  return roadShuffle(picked);
}
function roadStartExam(){
  var module=document.getElementById('roadExamModule').value||'All';
  var n=parseInt(document.getElementById('roadExamCount').value||20,10);
  var mins=parseInt(document.getElementById('roadExamMinutes').value||30,10);
  var strict=document.getElementById('roadExamStrict').checked;
  var pool=roadExamPool(module);n=Math.max(1,Math.min(n,pool.length));
  roadExam={active:true,finished:false,questions:roadSelectExamQuestions(pool,n),answers:{},index:0,strict:strict,startedAt:Date.now(),endsAt:Date.now()+Math.max(1,mins)*60000,module:module,result:null};
  if(roadExamTimer)clearInterval(roadExamTimer);
  roadExamTimer=setInterval(roadExamTick,1000);
  roadRenderExamPanel();
}
function roadExamTick(){
  if(!roadExam.active||roadExam.finished)return;
  var left=roadExam.endsAt-Date.now();if(left<=0){roadFinishExam();return}
  var el=document.getElementById('roadExamTimer');if(el){var m=Math.floor(left/60000),s=Math.floor((left%60000)/1000);el.textContent=m+':'+String(s).padStart(2,'0')}
}
function roadExamChoose(letter){
  if(!roadExam.active||roadExam.finished)return;
  var q=roadExam.questions[roadExam.index];if(!q)return;
  if(roadExam.strict&&roadExam.answers[q.id])return;
  roadExam.answers[q.id]=letter;roadRenderExamPanel();
}
function roadExamMove(delta){
  if(!roadExam.active||roadExam.finished)return;
  roadExam.index=Math.max(0,Math.min(roadExam.questions.length-1,roadExam.index+delta));roadRenderExamPanel();
}
function roadFinishExam(){
  if(!roadExam.active||roadExam.finished)return;
  if(roadExamTimer){clearInterval(roadExamTimer);roadExamTimer=null}
  var correct=0,wrongByTopic={};
  roadExam.questions.forEach(function(q){
    if(roadExam.answers[q.id]===q.answer)correct++;
    else wrongByTopic[q.topic]=(wrongByTopic[q.topic]||0)+1;
  });
  var score=Math.round(100*correct/Math.max(1,roadExam.questions.length));
  var weak=Object.entries(wrongByTopic).sort(function(a,b){return b[1]-a[1]}).slice(0,4);
  roadExam.finished=true;roadExam.result={correct:correct,total:roadExam.questions.length,score:score,weak:weak};
  var st=roadState();st.exam_history.unshift({date:new Date().toISOString(),score:score,correct:correct,total:roadExam.questions.length,module:roadExam.module});st.exam_history=st.exam_history.slice(0,20);
  save();roadRenderExamPanel();
}
function roadResetExam(){
  if(roadExamTimer){clearInterval(roadExamTimer);roadExamTimer=null}
  roadExam={active:false,finished:false,questions:[],answers:{},index:0,strict:true,startedAt:0,endsAt:0,module:'All',result:null};
  roadRenderExamPanel();
}
function roadRenderExamPanel(){
  var host=document.getElementById('roadExamPanel');if(!host)return;
  if(!roadExam.active){host.innerHTML='';return}
  if(roadExam.finished){
    var r=roadExam.result,weak=r.weak.length?r.weak.map(function(x){return esc(x[0])+' ('+x[1]+' missed)'}).join(' · '):'No weak topics in this attempt.';
    host.innerHTML='<div class="roadExamResult"><div class="score">'+r.score+'%</div><b>'+r.correct+'/'+r.total+' correct</b><p class="small">Weak areas: '+weak+'</p><div class="roadExamNav"><button class="roadSecondary" onclick="roadResetExam()">New exam</button>'+(r.weak.length?'<button class="roadPrimary" onclick="roadOpenTopic(\''+String(r.weak[0][0]).replace(/'/g,"\\'")+'\')">Review weakest topic →</button>':'')+'</div></div>';
    return;
  }
  var q=roadExam.questions[roadExam.index],picked=roadExam.answers[q.id]||'',answered=Object.keys(roadExam.answers).length;
  var options=Object.entries(q.options).map(function(kv){var k=kv[0],v=kv[1],locked=roadExam.strict&&!!picked;return '<button class="roadExamOption '+(picked===k?'selected':'')+'" onclick="roadExamChoose(\''+k+'\')" '+(locked?'disabled':'')+'><b>'+k+'.</b> '+esc(v)+'</button>'}).join('');
  host.innerHTML='<div class="roadExamTop"><span>Q '+(roadExam.index+1)+' / '+roadExam.questions.length+' · '+answered+' answered</span><span id="roadExamTimer">—</span></div><div class="roadExamQ"><div class="roadExamStem">'+esc(q.stem)+'</div><div class="roadExamOptions">'+options+'</div><div class="roadExamNav"><button class="roadSecondary" onclick="roadExamMove(-1)" '+(roadExam.index===0?'disabled':'')+'>← Previous</button><button class="roadSecondary" onclick="roadFinishExam()">Finish exam</button><button class="roadPrimary" onclick="roadExamMove(1)" '+(roadExam.index===roadExam.questions.length-1?'disabled':'')+'>Next →</button></div></div>';
  roadExamTick();
}
function roadOpenTopic(topic){
  switchStudySection('questions');document.getElementById('search').value='';document.getElementById('topic').value=topic;document.getElementById('module').value='';document.getElementById('bank').value='';state.filter='all';state.page=1;document.querySelectorAll('.chip[data-filter]').forEach(function(x){x.classList.toggle('active',x.dataset.filter==='all')});render();
}
function roadSetupExam(){
  var btn=document.getElementById('roadStartExam');if(btn)btn.onclick=roadStartExam;
  roadRenderExamPanel();
}
function roadRenderReadiness(){
  var host=document.getElementById('roadReadiness');if(!host)return;
  var m=roadMastery(),queue=roadReviewCandidates(),due=roadReviewedDueCount();
  var unseen=QUESTIONS.filter(function(q){return q.high_yield&&!saved[q.id]?.answered}).length;
  var weak=roadTopicMetrics().filter(function(x){return x.total>=2&&x.mastery<60}).sort(function(a,b){return a.mastery-b.mastery}).slice(0,3);
  var hist=roadState().exam_history.slice(0,3),avg=hist.length?Math.round(hist.reduce(function(n,x){return n+x.score},0)/hist.length):null;
  host.innerHTML='<div class="roadReadiness">'+
   '<div class="roadReadyItem"><b>'+roadFmtPct(m.overall)+'</b><span>overall mastery</span></div>'+
   '<div class="roadReadyItem"><b>'+m.highYieldMastered+'/'+m.highYieldTotal+'</b><span>high-yield mastered</span></div>'+
   '<div class="roadReadyItem"><b>'+unseen+'</b><span>unseen high-yield questions</span></div>'+
   '<div class="roadReadyItem"><b>'+due+'</b><span>flashcards due now</span></div>'+
   '<div class="roadReadyItem"><b>'+(avg===null?'—':avg+'%')+'</b><span>last 3 exam average</span></div>'+
   '<div class="roadReadyItem"><b>'+queue.length+'</b><span>A+ review queue</span></div>'+
  '</div><p class="small" style="margin-top:12px">'+(weak.length?'Priority weak areas: '+weak.map(function(x){return esc(x.topic)+' '+x.mastery+'%'}).join(' · '):'No topic is currently flagged below 60% mastery.')+'</p>';
}
function renderRoadToAPlus(){
  if(!document.getElementById('roadSection'))return;
  try{
    roadRenderHero();roadRenderAction();roadRenderBrief();roadRenderWeakStrong();roadRenderQueue();roadRenderEvidence();
    roadRenderLectureTools();roadRenderLectures();roadSetupLearningTools();roadSetupExam();roadRenderReadiness();
  }catch(e){console.error('Road to A+ render error',e)}
}
function roadSwitchStudySection(mode){
  var road=mode==='road',flash=mode==='flashcards',questions=mode==='questions';
  document.getElementById('roadSection')?.classList.toggle('hidden',!road);
  document.getElementById('questionSection')?.classList.toggle('hidden',!questions);
  document.getElementById('flashcardsSection')?.classList.toggle('hidden',!flash);
  document.getElementById('tabRoad')?.classList.toggle('active',road);
  document.getElementById('tabQuestions')?.classList.toggle('active',questions);
  document.getElementById('tabFlashcards')?.classList.toggle('active',flash);
  document.getElementById('stats')?.classList.toggle('hidden',!questions);
  document.getElementById('questionProgressBar')?.classList.toggle('hidden',!questions);
  document.getElementById('flashHeroStats')?.classList.toggle('hidden',!flash);
  var h=document.getElementById('heroTitle'),p=document.getElementById('heroDescription');
  if(h)h.textContent=road?'MED25 — Road to A+':(flash?'MED25 Flashcards':'MED25 Practice Questions');
  if(p)p.textContent=road?'One dashboard that turns your lecture coverage, past-paper performance, confidence and spaced repetition into a clear next study action.':(flash?'Lecture-derived flashcards with spaced repetition, synced from the official MED25 lecture Drive.':'Past papers, coordinator formative questions and high-yield review with source-lecture remediation.');
  try{localStorage.setItem(ROAD_NAV_KEY,mode)}catch(e){}
  if(road)renderRoadToAPlus();
  if(flash){renderFlashDecks();renderFlashHeroStats()}
}
function roadSetupNavigation(){
  var tr=document.getElementById('tabRoad'),tq=document.getElementById('tabQuestions'),tf=document.getElementById('tabFlashcards');
  if(tr)tr.onclick=function(){roadSwitchStudySection('road')};
  if(tq)tq.onclick=function(){roadSwitchStudySection('questions')};
  if(tf)tf.onclick=function(){roadSwitchStudySection('flashcards')};
  var mode=localStorage.getItem(ROAD_NAV_KEY)||'road';
  if(['road','questions','flashcards'].indexOf(mode)<0)mode='road';
  roadSwitchStudySection(mode);
}

/* Preserve the existing app, then extend its behavior. */
var roadBaseCard=card;
card=function(q){
  var html=roadBaseCard(q),p=saved[q.id]||{};
  if(p.answered&&!state.review){
    var extra=roadConfidenceHtml(q,p)+roadMistakeHtml(q,p);
    if(extra)html=html.replace('<div class="explain',extra+'<div class="explain');
  }
  return html;
};
var roadBaseBindCards=bindCards;
bindCards=function(){roadBaseBindCards();roadBindQuestionExtras()};
var roadBaseSave=save;
save=function(){var out=roadBaseSave.apply(this,arguments);renderRoadToAPlus();return out};
var roadBaseLoadCloudProgress=loadCloudProgress;
loadCloudProgress=async function(){var out=await roadBaseLoadCloudProgress.apply(this,arguments);renderRoadToAPlus();return out};
switchStudySection=roadSwitchStudySection;
setupStudyNavigation=roadSetupNavigation;

window.renderRoadToAPlus=renderRoadToAPlus;
window.roadOpenQuestion=roadOpenQuestion;
window.roadOpenTopic=roadOpenTopic;
window.roadStudyNext=roadStudyNext;
window.roadStartExam=roadStartExam;
window.roadExamChoose=roadExamChoose;
window.roadExamMove=roadExamMove;
window.roadFinishExam=roadFinishExam;
window.roadResetExam=roadResetExam;

setTimeout(function(){
  roadSetupNavigation();
  renderRoadToAPlus();
  roadBindQuestionExtras();
},0);

})();
