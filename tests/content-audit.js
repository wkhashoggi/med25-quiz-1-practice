const fs=require('fs');

function fail(msg){throw new Error(msg)}
function readJson(path){return JSON.parse(fs.readFileSync(path,'utf8'))}
function norm(s){return String(s||'').trim().toLowerCase()}

const ai=readJson('ai_questions.json');
const map=readJson('question-study-guide-map.json');
const catalog=readJson('study-guide-lectures.json');
const flash=readJson('flashcards.json');
const legacy=fs.readFileSync('legacy-app.html','utf8');
const m=legacy.match(/const\s+QUESTIONS\s*=\s*(\[[\s\S]*?\]);\s*\n/);
if(!m)fail('Past-paper QUESTIONS array not found');
const past=JSON.parse(m[1]);

const lectureIds=new Set((catalog.subjects||[]).flatMap(s=>(s.lectures||[]).map(l=>l.id)));
const activeSets=(ai.lecture_sets||[]).filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass');
const inactiveCurrent=(ai.lecture_sets||[]).filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status!=='pass');
if(inactiveCurrent.length)fail('Allowed AI sets still hidden/hold: '+inactiveCurrent.map(s=>s.title).join(', '));

const ids=new Set(),stems=new Map();
let activeQuestions=0,cases=0;
for(const set of activeSets){
  if(!(set.questions||[]).length)fail('Active AI set has zero questions: '+set.title);
  if(!(set.questions||[]).some(q=>q.case_style==='formative_short_case'))fail('Active AI set has no case coverage: '+set.title);
  for(const q of set.questions||[]){
    activeQuestions++;
    if(ids.has(q.id))fail('Duplicate AI question id: '+q.id);
    ids.add(q.id);
    if(!q.answer||!q.options||Object.keys(q.options).length!==4||!Object.prototype.hasOwnProperty.call(q.options,q.answer))fail('Invalid AI answer/options: '+q.id);
    const vals=Object.values(q.options).map(norm);
    if(new Set(vals).size!==vals.length)fail('Duplicate AI option text: '+q.id);
    if(!q.explanation)fail('Missing AI explanation: '+q.id);
    if(!(q.source_url||set.source_url))fail('Missing AI source: '+q.id);
    const gm=map.ai?.[q.id];
    if(!gm?.lecture_id||!lectureIds.has(gm.lecture_id))fail('Unmapped AI question: '+q.id);
    const stemKey=norm(q.stem);
    if(stemKey){
      if(stems.has(stemKey))fail('Duplicate active AI stem: '+q.id+' / '+stems.get(stemKey));
      stems.set(stemKey,q.id);
    }
    if(q.case_style==='formative_short_case')cases++;
  }
}

const requiredLectureIds=[
  'biochemistry__diagnostic-cardiac-markers',
  'pharmacology__antiarrhythmic-drugs',
  'physiology__white-bood-cells-wbcs',
  'pharmacology__treatment-of-anemia',
  'anatomy-histology__radiological-anatomy-of-the-heart-and-its-great-vessels',
  'hematology__hemolytic-anemia',
  'pathology__infective-endocarditis',
  'physiology__physiology-of-vascular-endothelium'
];
const counts={};
for(const set of activeSets)for(const q of set.questions||[]){
  const id=map.ai?.[q.id]?.lecture_id;
  if(id)counts[id]=(counts[id]||0)+1;
}
for(const id of requiredLectureIds)if(!(counts[id]>0))fail('Required current lecture has zero AI questions: '+id);

const pastIds=new Set();
for(const q of past){
  if(!q.id)fail('Past-paper question missing id');
  if(pastIds.has(q.id))fail('Duplicate past-paper id: '+q.id);
  pastIds.add(q.id);
  const gm=map.past?.[q.id];
  if(!gm?.lecture_id||!lectureIds.has(gm.lecture_id))fail('Unmapped past-paper question: '+q.id);
}

const cardIds=new Set();
let cards=0;
for(const deck of (flash.decks||[]).filter(d=>!d.archived)){
  if(!(deck.cards||[]).length)fail('Active flashcard deck is empty: '+deck.title);
  for(const c of deck.cards||[]){
    cards++;
    if(!c.id||!String(c.front||'').trim()||!String(c.back||'').trim())fail('Invalid flashcard in '+deck.title);
    if(cardIds.has(c.id))fail('Duplicate flashcard id: '+c.id);
    cardIds.add(c.id);
  }
}

console.log(JSON.stringify({
  status:'PASS',
  activeAISets:activeSets.length,
  activeAIQuestions:activeQuestions,
  clinicalCases:cases,
  pastQuestions:past.length,
  flashcards:cards,
  requiredCurrentLectures:requiredLectureIds.map(id=>({id,ai:counts[id]||0}))
},null,2));
