const fs=require('fs');

function readJson(path){return JSON.parse(fs.readFileSync(path,'utf8'))}
function fail(msg){throw new Error(msg)}
function normExact(v){return String(v??'').toLowerCase().replace(/\s+/g,' ').trim()}
function isCase(q){return q?.case_style==='formative_short_case'||/formcase|case/i.test(String(q?.id||''))}
function activeSet(s){return !s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass'}

const ai=readJson('ai_questions.json');
const map=readJson('question-study-guide-map.json');
const cat=readJson('study-guide-lectures.json');
const flash=readJson('flashcards.json');
const manifest=readJson('content-coverage-manifest.json');
const legacy=fs.readFileSync('legacy-app.html','utf8');

const lectures=(cat.subjects||[]).flatMap(s=>(s.lectures||[]).map(l=>({...l,subject:s.name})));
const lectureById=new Map();
for(const l of lectures){
  if(lectureById.has(l.id))fail('Duplicate official lecture id: '+l.id);
  lectureById.set(l.id,l);
}

const seenAiIds=new Set(), seenAiStems=new Map();
const active=(ai.lecture_sets||[]).filter(activeSet);
const activeBySource=new Map(active.map(s=>[s.source_file_id,s]));
const lectureStats=new Map();
let activeQuestions=0,activeCases=0;

function structuralIssue(q,s){
  const reasons=[];
  const entries=Object.entries(q.options||{});
  const vals=entries.map(([,v])=>normExact(v));
  if(!q.id)reasons.push('missing id');
  if(!String(q.stem||'').trim())reasons.push('missing stem');
  if(entries.length!==4)reasons.push('not exactly 4 options');
  if(!q.answer||!Object.prototype.hasOwnProperty.call(q.options||{},q.answer))reasons.push('invalid answer key');
  if(vals.length!==new Set(vals).size)reasons.push('duplicate option text');
  if(!String(q.explanation||'').trim())reasons.push('missing explanation');
  if(!String(q.source_url||s.source_url||s.source_file_id||'').trim())reasons.push('missing source');
  if(q.exam_ready===false)reasons.push('exam_ready=false');
  return reasons;
}

for(const s of active){
  const qs=s.questions||[];
  if(!qs.length)fail('Active AI set has zero questions: '+s.title);
  if(!qs.some(isCase))fail('Active AI set has no case question: '+s.title);
  for(const q of qs){
    activeQuestions++;
    if(isCase(q))activeCases++;
    const issues=structuralIssue(q,s);
    if(issues.length)fail('Invalid active AI question '+q.id+' in '+s.title+': '+issues.join(', '));
    if(seenAiIds.has(q.id))fail('Duplicate active AI id: '+q.id);
    seenAiIds.add(q.id);
    const stemKey=normExact(q.stem);
    if(seenAiStems.has(stemKey))fail('Duplicate active AI stem: '+q.id+' and '+seenAiStems.get(stemKey));
    seenAiStems.set(stemKey,q.id);

    const m=map.ai?.[q.id];
    if(!m?.lecture_id||!lectureById.has(m.lecture_id))fail('Active AI question is not mapped to official lecture: '+q.id);
    const st=lectureStats.get(m.lecture_id)||{ai:0,cases:0,mock:0,sources:new Set()};
    st.ai++;
    if(isCase(q))st.cases++;
    st.mock++;
    st.sources.add(s.source_file_id);
    lectureStats.set(m.lecture_id,st);
  }
}

// Detect the exact bug that caused many fake zero-count lectures: a complete, mapped set stuck on hold.
for(const s of ai.lecture_sets||[]){
  if(s.archived||s.eligibility_status!=='allowed'||s.quality_status==='pass')continue;
  const qs=s.questions||[];
  const structurallyComplete=qs.length>0&&qs.every(q=>structuralIssue({...q,exam_ready:true},s).length===0);
  const fullyMapped=qs.length>0&&qs.every(q=>map.ai?.[q.id]?.lecture_id&&lectureById.has(map.ai[q.id].lecture_id));
  if(structurallyComplete&&fullyMapped)fail('Valid mapped AI set is hidden by quality hold: '+s.title);
}

// Current Drive coverage gate.
const seenDrive=new Set();
for(const item of manifest.current_drive_sources||[]){
  if(seenDrive.has(item.drive_file_id))fail('Duplicate Drive file in coverage manifest: '+item.drive_file_id);
  seenDrive.add(item.drive_file_id);
  const s=activeBySource.get(item.ai_source_file_id);
  if(!s)fail('Current Drive source has no active AI set: '+item.title+' ['+item.ai_source_file_id+']');
  if((s.questions||[]).length<(item.minimum_ai_questions||1))fail('Current Drive source has too few AI questions: '+item.title);
  for(const lid of item.lecture_ids||[]){
    const st=lectureStats.get(lid);
    if(!st||st.ai<(item.minimum_ai_questions||1))fail('Current Drive lecture has zero AI: '+lid+' ('+item.title+')');
    if(st.mock<1)fail('Current Drive lecture has zero Mock-ready AI: '+lid+' ('+item.title+')');
    if(st.cases<(item.minimum_cases_per_lecture||1))fail('Current Drive lecture has no case: '+lid+' ('+item.title+')');
  }
}

// Required current non-Drive sources (for example a directly uploaded current lecture).
for(const item of manifest.current_non_drive_sources||[]){
  const s=activeBySource.get(item.source_file_id);
  if(!s)fail('Current required non-Drive source has no active AI set: '+item.title);
  if((s.questions||[]).length<(item.minimum_ai_questions||1))fail('Current required non-Drive source has too few AI questions: '+item.title);
  for(const lid of item.lecture_ids||[]){
    const st=lectureStats.get(lid);
    if(!st||st.ai<(item.minimum_ai_questions||1))fail('Current required non-Drive lecture has zero AI: '+lid+' ('+item.title+')');
    if(st.mock<1)fail('Current required non-Drive lecture has zero Mock-ready AI: '+lid+' ('+item.title+')');
    if(st.cases<(item.minimum_cases_per_lecture||1))fail('Current required non-Drive lecture has no case: '+lid+' ('+item.title+')');
  }
}

// Flashcards must stay in sync with active source material.
const activeDecks=(flash.decks||[]).filter(d=>!d.archived);
const deckBySource=new Map();
const cardIds=new Set();
let flashCards=0;
for(const d of activeDecks){
  if(deckBySource.has(d.source_file_id))fail('Duplicate active flashcard deck source: '+d.source_file_id);
  deckBySource.set(d.source_file_id,d);
  if(!(d.cards||[]).length)fail('Active flashcard deck is empty: '+d.title);
  for(const c of d.cards||[]){
    flashCards++;
    if(!c.id||!String(c.front||'').trim()||!String(c.back||'').trim())fail('Invalid flashcard in '+d.title);
    if(cardIds.has(c.id))fail('Duplicate flashcard id: '+c.id);
    cardIds.add(c.id);
  }
}
for(const s of active){
  if(!deckBySource.has(s.source_file_id))fail('Active AI source missing active flashcard deck: '+s.title);
}
for(const d of activeDecks){
  if(!activeBySource.has(d.source_file_id))fail('Active flashcard deck has no active AI source: '+d.title);
}

// Past-paper integrity: preserve authentic incomplete rows, but every row must have identity + official mapping.
const match=legacy.match(/const\s+QUESTIONS\s*=\s*(\[[\s\S]*?\]);\s*\n/);
if(!match)fail('Could not parse Past Paper QUESTIONS from legacy-app.html');
const past=JSON.parse(match[1]);
const pastIds=new Set();
let pastMockReady=0,pastIncomplete=0;
for(const q of past){
  if(!q.id)fail('Past Paper row missing id');
  if(pastIds.has(q.id))fail('Duplicate Past Paper id: '+q.id);
  pastIds.add(q.id);
  const m=map.past?.[q.id];
  if(!m?.lecture_id||!lectureById.has(m.lecture_id))fail('Past Paper question is not mapped to official lecture: '+q.id);
  const entries=Object.entries(q.options||{});
  const valid=entries.length===4&&q.answer&&Object.prototype.hasOwnProperty.call(q.options||{},q.answer)&&entries.map(([,v])=>normExact(v)).length===new Set(entries.map(([,v])=>normExact(v))).size;
  if(valid)pastMockReady++; else pastIncomplete++;
}
if(!pastMockReady)fail('No Mock-ready Past Paper questions remain');

// Required headline checks for previously broken subjects.
for(const lid of ['biochemistry__diagnostic-cardiac-markers','hematology__hemolytic-anemia','anatomy-histology__anatomy-of-mediastinum-pericardium']){
  if((lectureStats.get(lid)?.ai||0)<1)fail('Previously broken lecture regressed to zero AI: '+lid);
}

const subjects={};
for(const [lid,st] of lectureStats){
  const sub=lectureById.get(lid)?.subject||'Unknown';
  subjects[sub]??={ai:0,cases:0,lectures:new Set()};
  subjects[sub].ai+=st.ai;subjects[sub].cases+=st.cases;subjects[sub].lectures.add(lid);
}

console.log('CONTENT LOGICAL AUDIT PASS');
console.log(JSON.stringify({
  currentDriveSources:(manifest.current_drive_sources||[]).length,
  currentNonDriveSources:(manifest.current_non_drive_sources||[]).length,
  activeAiSets:active.length,
  activeAiQuestions:activeQuestions,
  activeCases,
  mappedActiveLectures:lectureStats.size,
  activeFlashcardDecks:activeDecks.length,
  flashCards,
  pastPaperQuestions:past.length,
  pastMockReady,
  pastIncompletePreserved:pastIncomplete,
  subjects:Object.fromEntries(Object.entries(subjects).map(([k,v])=>[k,{ai:v.ai,cases:v.cases,lectures:v.lectures.size}]))
},null,2));
