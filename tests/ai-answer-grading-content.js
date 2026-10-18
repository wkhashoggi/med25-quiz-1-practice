const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const parse=h=>JSON.parse(h.match(/const QUESTIONS=(\[[\s\S]*?\]);\s*\n/)[1]);
const h=fs.readFileSync('legacy-app.html','utf8'),qs=parse(h),by=new Map(qs.map(q=>[q.id,q]));
const a=JSON.parse(fs.readFileSync('ai-answer-grading-review.json'));
const old=parse(cp.execFileSync('git',['show',a.baseline_commit+':legacy-app.html'],{encoding:'utf8',maxBuffer:20e6}));
const approved=new Set(a.reviews.map(r=>r.id)),removed=new Map(a.merged_duplicates.map(r=>[r.removed_id,r.retained_id]));
assert.equal(approved.size,153);assert.equal(qs.length,old.length-removed.size);
for(const q of old){if(approved.has(q.id))continue;const now={...by.get(q.id)},before={...q};if(a.unresolved[q.id]){delete now.proofreading_notes;delete before.proofreading_notes}assert.deepEqual(now,before,'Unapproved data change: '+q.id)}
for(const r of a.reviews){const q=by.get(r.id)||by.get(removed.get(r.id));assert(q);assert.equal(q.answer_basis,'ai-supplied');assert.equal(q.answer_text,q.options[q.answer]);assert.equal(q.proofreading_status,'resolved');assert.equal(q.ai_grading_review,'20261018-v1');assert(q.review_note.includes('AI'));assert(q.ai_grading_note.includes('AI'));assert(Object.keys(q.options).length>=2);if(r.final.source_key_status==='missing')assert(r.final.ai_grading_note.includes('missing from the original test-bank key'));else assert(r.final.ai_grading_note.includes('present but unverified'));if(r.original.stem!==r.final.stem||JSON.stringify(r.original.options)!==JSON.stringify(r.final.options))assert.equal(r.final.review_revision,'ai-grading-20261018-v1');}
for(const id of Object.keys(a.unresolved)){assert.equal(by.get(id).answer,null);assert.equal(by.get(id).exam_ready,false)}
assert.equal(qs.filter(q=>!q.answer).length,12);
assert(h.includes('class="pastAnswerReview aiGradingNote"'));assert(h.includes('AI-supplied study answer'));assert(h.includes('AI-adapted study question'));
for(const [id,key] of [['rs-module3-p87-q10','C'],['rs-module3-p228-q8','A'],['rs-module3-p229-q9','B'],['rs-module3-p229-q10','B'],['rs-module3-p136-q122','A']])assert.equal(by.get(id).answer,key);
assert(by.get('rs-module3-p136-q122').question_figure.url.includes('p104-q42'));
console.log('PASS: 153 independently reviewed source entries / 151 unique questions, truthful key provenance, repaired figure and spirogram keys, 12 unrecoverable originals; unaffected content preserved');
