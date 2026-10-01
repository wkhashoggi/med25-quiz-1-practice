const fs=require('fs');

function readJson(path){return JSON.parse(fs.readFileSync(path,'utf8'))}
function fail(msg){console.error('CONTENT AUDIT FAIL:',msg);process.exitCode=1}
function exact(v){return String(v||'').trim().toLowerCase()}

const ai=readJson('ai_questions.json');
const map=readJson('question-study-guide-map.json');
const catalog=readJson('study-guide-lectures.json');
const flash=readJson('flashcards.json');
const html=fs.readFileSync('legacy-app.html','utf8');
const m=html.match(/const\s+QUESTIONS\s*=\s*(\[[\s\S]*?\]);\s*\n/);
if(!m)throw new Error('Could not parse QUESTIONS from legacy-app.html');
const past=JSON.parse(m[1]);

const lectures=(catalog.subjects||[]).flatMap(s=>(s.lectures||[]).map(l=>({...l,subject:s.name})));
const lectureById=new Map(lectures.map(l=>[l.id,l]));
const activeSets=(ai.lecture_sets||[]).filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass');
const activeRows=activeSets.flatMap(s=>(s.questions||[]).map(q=>({s,q,map:map.ai?.[q.id]})));

const idGroups=new Map(),stemGroups=new Map();
for(const {s,q,map:qm} of activeRows){
  if(!q.id)fail('AI question missing id in '+s.title);
  if(!q.answer)fail('AI question missing answer: '+q.id);
  const entries=Object.entries(q.options||{});
  if(entries.length!==4)fail('AI question does not have 4 options: '+q.id);
  if(!Object.prototype.hasOwnProperty.call(q.options||{},q.answer))fail('AI answer key missing from options: '+q.id);
  const vals=entries.map(([,v])=>exact(v));
  if(vals.length!==new Set(vals).size)fail('AI duplicate option text: '+q.id);
  if(!q.explanation)fail('AI missing explanation: '+q.id);
  if(!(q.source_url||s.source_url||s.source_file_id))fail('AI missing source evidence: '+q.id);
  if(q.exam_ready===false)fail('Active AI question is marked not exam-ready: '+q.id);
  if(!qm?.lecture_id||!lectureById.has(qm.lecture_id))fail('AI question unmapped to official lecture: '+q.id);
  if(!idGroups.has(q.id))idGroups.set(q.id,[]);idGroups.get(q.id).push(q.id);
  const stem=exact(q.stem);
  if(!stemGroups.has(stem))stemGroups.set(stem,[]);stemGroups.get(stem).push(q.id);
}
for(const [id,rows] of idGroups)if(rows.length>1)fail('Duplicate AI id: '+id);
for(const [stem,rows] of stemGroups)if(stem&&rows.length>1)fail('Duplicate AI stem: '+rows.join(', '));

for(const s of activeSets){
  if(!(s.questions||[]).some(q=>q.case_style==='formative_short_case'))fail('Active AI set has no explicit case: '+s.title);
}
const hiddenEligible=(ai.lecture_sets||[]).filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status!=='pass');
if(hiddenEligible.length)fail('Allowed AI sets remain hidden by quality status: '+hiddenEligible.map(s=>s.title).join(', '));
const excludedCurrent=(ai.lecture_sets||[]).filter(s=>s.archived||s.eligibility_status==='excluded');
if(excludedCurrent.length)fail('Current AI library still contains excluded/archived sets: '+excludedCurrent.map(s=>s.title).join(', '));

const pastIdGroups=new Map();
let pastMockSafe=0;
for(const q of past){
  if(!q.id)fail('Past-paper question missing id');
  if(!pastIdGroups.has(q.id))pastIdGroups.set(q.id,[]);pastIdGroups.get(q.id).push(q);
  const pm=map.past?.[q.id];
  if(!pm?.lecture_id||!lectureById.has(pm.lecture_id))fail('Past-paper question unmapped: '+q.id);
  const entries=Object.entries(q.options||{});
  const vals=entries.map(([,v])=>exact(v));
  if(q.answer&&entries.length>=4&&Object.prototype.hasOwnProperty.call(q.options||{},q.answer)&&vals.length===new Set(vals).size)pastMockSafe++;
}
for(const [id,rows] of pastIdGroups)if(rows.length>1)fail('Duplicate Past Paper id: '+id);

const highYield=past.filter(q=>q.high_yield);
const highYieldBySubject={};
const highYieldByLecture={};
for(const q of highYield){
  const pm=map.past?.[q.id];
  const subject=pm?.subject||'Unmapped';
  const lecture=pm?.title||q.topic||'Unknown';
  highYieldBySubject[subject]=(highYieldBySubject[subject]||0)+1;
  highYieldByLecture[lecture]=(highYieldByLecture[lecture]||0)+1;
}
if(Object.keys(highYieldBySubject).length<5)fail('High-yield pool has collapsed into too few subjects');
if(highYield.length){
  const maxSubject=Math.max(...Object.values(highYieldBySubject));
  const maxLecture=Math.max(...Object.values(highYieldByLecture));
  if(maxSubject/highYield.length>0.50)fail('More than half of the high-yield pool comes from one subject');
  if(maxLecture/highYield.length>0.25)fail('More than a quarter of the high-yield pool comes from one lecture');
}

const activeDecks=(flash.decks||[]).filter(d=>!d.archived&&d.eligibility_status==='allowed');
const visibleButExcluded=(flash.decks||[]).filter(d=>!d.archived&&d.eligibility_status!=='allowed');
if(visibleButExcluded.length)fail('Unarchived flashcard decks still logically excluded: '+visibleButExcluded.map(d=>d.title).join(', '));
const deckIds=new Set(),cardIds=new Set();
for(const d of activeDecks){
  if(deckIds.has(d.id))fail('Duplicate flashcard deck id: '+d.id);deckIds.add(d.id);
  if(!(d.cards||[]).length)fail('Active flashcard deck is empty: '+d.title);
  for(const c of d.cards||[]){
    if(!c.id||!String(c.front||'').trim()||!String(c.back||'').trim())fail('Invalid flashcard in '+d.title);
    if(cardIds.has(c.id))fail('Duplicate flashcard id: '+c.id);cardIds.add(c.id);
  }
}
const aiSources=new Set(activeSets.map(s=>s.source_file_id).filter(Boolean));
const deckSources=new Set(activeDecks.map(d=>d.source_file_id).filter(Boolean));
for(const id of aiSources)if(!deckSources.has(id))fail('AI source missing active flashcard deck: '+id);
for(const id of deckSources)if(!aiSources.has(id))fail('Active flashcard source missing AI set: '+id);

const published=new Set([
  ...past.map(q=>map.past?.[q.id]?.lecture_id),
  ...activeRows.map(x=>x.map?.lecture_id)
].filter(Boolean));

const requiredCurrent=[
  'physiology__normal-ecg',
  'pathology__infective-endocarditis',
  'hematology__hemolytic-anemia',
  'anatomy-histology__anatomy-of-mediastinum-pericardium',
  'physiology__physiology-of-vascular-endothelium',
  'physiology__cardiac-cycle'
];
for(const id of requiredCurrent)if(!published.has(id))fail('Current verified lecture has zero published content: '+id);

const subjectCounts={};
for(const {q,map:qm} of activeRows){
  const s=qm.subject;
  subjectCounts[s]??={questions:0,cases:0};
  subjectCounts[s].questions++;
  if(q.case_style==='formative_short_case')subjectCounts[s].cases++;
}
for(const subject of (catalog.subjects||[]).map(s=>s.name)){
  if(!subjectCounts[subject]?.questions)fail('Official subject has zero active AI questions: '+subject);
}

const summary={
  pastQuestions:past.length,
  pastMockSafe,
  highYieldQuestions:highYield.length,
  highYieldBySubject,
  aiSets:activeSets.length,
  aiQuestions:activeRows.length,
  aiCases:activeRows.filter(x=>x.q.case_style==='formative_short_case').length,
  flashDecks:activeDecks.length,
  flashCards:cardIds.size,
  officialLectures:lectures.length,
  publishedLectures:published.size,
  subjectCounts
};
console.log('CONTENT AUDIT PASS');
console.log(JSON.stringify(summary,null,2));
if(process.exitCode)process.exit(process.exitCode);
