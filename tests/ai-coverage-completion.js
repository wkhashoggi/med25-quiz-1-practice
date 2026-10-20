const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const read=n=>JSON.parse(fs.readFileSync(n,'utf8'));
const audit=read('ai-coverage-expansion-20261020.json'),library=read('ai_questions.json'),map=read('question-study-guide-map.json');
const old=JSON.parse(cp.execFileSync('git',['show',audit.baseline_commit+':ai_questions.json'],{encoding:'utf8',maxBuffer:25e6}));
const oldMap=JSON.parse(cp.execFileSync('git',['show',audit.baseline_commit+':question-study-guide-map.json'],{encoding:'utf8',maxBuffer:20e6}));
const active=library.lecture_sets.filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass');
for(const s of old.lecture_sets)assert.deepEqual(library.lecture_sets.find(x=>x.id===s.id),s,'Preserve every original AI set and progress ID');
for(const [id,m] of Object.entries(oldMap.ai))assert.deepEqual(map.ai[id],m,'Preserve prior lecture mappings');
const guide=read('study-guide-lectures.json').subjects.flatMap(s=>s.lectures),counts=new Map();
for(const s of active)for(const q of s.questions){const id=map.ai[q.id]?.lecture_id;counts.set(id,(counts.get(id)||0)+1)}
assert.equal(counts.size,guide.length);assert.equal(guide.length,106);
assert.equal(audit.sets.length,17);assert.equal(audit.added_questions,255);
const all=active.flatMap(s=>s.questions),stems=new Set();assert.equal(all.length,1564);
for(const q of all){const norm=q.stem.toLowerCase().replace(/\s+/g,' ').trim();assert(!stems.has(norm),'Duplicate: '+q.id);stems.add(norm)}
for(const record of audit.sets){
 const set=active.find(s=>s.id===record.set_id),g=guide.find(l=>l.id===record.lecture_id);assert(set&&g);
 assert.equal(set.questions.length,15);assert(set.questions.filter(q=>q.case_style==='formative_short_case').length>=6);
 const objectives=[...g.objectives.matchAll(/(?:^|\s)(\d+)\.\s+\S/g)].map(m=>Number(m[1]));
 const covered=new Set(set.questions.flatMap(q=>q.objective_numbers));for(const n of objectives)assert(covered.has(n),g.title+' objective '+n+' missing');
 for(const q of set.questions){
  assert.equal(map.ai[q.id].lecture_id,g.id);assert.equal(map.ai[q.id].quiz,g.quiz);assert.equal(Object.keys(q.options).length,4);
  assert.equal(new Set(Object.values(q.options).map(x=>x.toLowerCase().trim())).size,4);
  assert.equal(q.answer_text,q.options[q.answer]);assert(q.explanation.length>30);assert(q.source_references.length);assert(q.source_references.every(r=>/^https:\/\//.test(r.url)));
  assert(q.exam_ready);assert(q.objective_numbers.length);
 }
 if(set.source_kind==='study_guide_reference'){assert(!set.source_drive_file_id);assert(!/lecture_verified/.test(set.source_validation));}
}
const coverage=read('source-coverage-audit.json');assert.equal(coverage.active_ai_questions,all.length);assert.equal(coverage.topics_without_ai_questions.length,0);
assert(coverage.lectures.every(l=>l.ai_questions===counts.get(l.lecture_id)));
console.log('PASS 255 new questions; all 106 topics covered; 17 objective-complete sets, cases and source provenance; all 1309 existing AI questions and mappings preserved');
