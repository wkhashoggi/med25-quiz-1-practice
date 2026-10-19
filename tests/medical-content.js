const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const read=n=>JSON.parse(fs.readFileSync(n));const parse=h=>JSON.parse(h.match(/const QUESTIONS=(\[[\s\S]*?\]);\s*\n/)[1]);
const beforeDedup=require('./dedup-baseline');
const audit=read('medical-content-review.json'),past=beforeDedup.past(parse(fs.readFileSync('legacy-app.html','utf8'))),ai=beforeDedup.ai(read('ai_questions.json')),supp=beforeDedup.ai(read('med25-daily-supplement.json')),overrides=read('question-explanations.json');
const active=d=>d.lecture_sets.filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass').flatMap(s=>s.questions);
const all=new Map([...past.map(q=>['past:'+q.id,q]),...active(ai).map(q=>['ai:'+q.id,q])]);
const changed=new Map(audit.reviews.map(r=>[r.source+':'+r.id,r]));
assert.equal(audit.corrected_count,488);assert.equal(audit.held_count,45);
assert.equal(changed.size,533);assert.equal(audit.pending_visual_review_ids.length,41);
for(const [key,q] of all){
 if(q.answer)assert(q.options[q.answer],key+' invalid answer');
 if(key.startsWith('past:')&&q.answer)assert.equal(q.answer_text,q.options[q.answer],key);
 if(changed.has(key)){const r=changed.get(key);assert.deepEqual(q,r.final,key);assert(!overrides[q.id],key+' stale override');assert(r.reason);if(r.status==='unresolved'){assert.equal(q.answer,null);assert.equal(q.exam_ready,false);assert.equal(q.proofreading_status,'needs_review');}else assert(r.references.length,key+' no reference');}
 else if(!q.question_figure)assert(audit.reviewed_ids.includes(key),'Written question not reviewed: '+key);
}
const baseline=parse(cp.execFileSync('git',['show',audit.baseline_commit+':legacy-app.html'],{encoding:'utf8',maxBuffer:20e6}));const retired=new Set(read('rs-practical-removal.json').removed_question_ids);
for(const q of baseline){if(retired.has(q.id)){assert(!all.has('past:'+q.id));continue;}const review=changed.get('past:'+q.id);if(review)assert.deepEqual(review.original,q);else assert.deepEqual(all.get('past:'+q.id),q);}
const oldAI=JSON.parse(cp.execFileSync('git',['show',audit.baseline_commit+':ai_questions.json'],{encoding:'utf8',maxBuffer:20e6}));for(const q of active(oldAI)){const r=changed.get('ai:'+q.id);assert.deepEqual(r?r.original:all.get('ai:'+q.id),q);}
for(const s of supp.ai_sets)assert.deepEqual(s,ai.lecture_sets.find(x=>x.id===s.id));
assert(!past.some(q=>q.practical_source));console.log('PASS exact before/after audit for 488 corrections, 45 ungraded recalls, no stale overrides, complete written-question review coverage, unchanged unaffected questions and synchronized runtime AI mirrors');
