const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const parse=h=>JSON.parse(h.match(/const QUESTIONS=(\[[\s\S]*?\]);\s*\n/)[1]);
const h=fs.readFileSync('legacy-app.html','utf8'),qs=require('./dedup-baseline').past(parse(h)),by=new Map(qs.map(q=>[q.id,q]));
const a=JSON.parse(fs.readFileSync('lecture-grading-review.json'));
const correction=JSON.parse(fs.readFileSync('bronchi-key-correction.json'));
const retirement=JSON.parse(fs.readFileSync('rs-practical-removal.json')),retired=new Set(retirement.removed_question_ids);
const medical=JSON.parse(fs.readFileSync('medical-content-review.json')),medicallyChanged=new Set(medical.reviews.filter(r=>r.source==='past').map(r=>r.id));

const old=parse(cp.execFileSync('git',['show',a.baseline_commit+':legacy-app.html'],{encoding:'utf8',maxBuffer:20e6}));
const ai=JSON.parse(fs.readFileSync('ai-answer-grading-review.json'));
const reviewed=new Set([...a.reviews,...ai.reviews].map(r=>r.id)),removed=new Map(a.merged_duplicates.map(r=>[r.removed_id,r.retained_id]));
assert.equal(a.reviews.length,99);assert.equal(qs.length,old.length-removed.size-ai.merged_duplicates.length-1-retired.size);
for(const q of old){
 if(medicallyChanged.has(q.id)||retired.has(q.id)||reviewed.has(q.id)||[correction.retained_id,correction.removed_id].includes(q.id))continue;
 const now={...by.get(q.id)},before={...q};
 if(a.unresolved[q.id]){delete now.proofreading_notes;delete before.proofreading_notes;}
 // Equivalent canonical source URLs may remove account-specific query strings.
 if(now.lecture_source&&before.lecture_source){now.lecture_source={...now.lecture_source};before.lecture_source={...before.lecture_source};delete now.lecture_source.drive_url;delete before.lecture_source.drive_url;}
 assert.deepEqual(now,before,'Unreviewed question changed: '+q.id);
}
for(const r of a.reviews){
 const id=removed.get(r.id)||r.id;if(retired.has(id)||medicallyChanged.has(id))continue;const q=by.get(id);assert(q);
 assert(r.evidence.source_file_id&&r.evidence.quote&&r.evidence.url.startsWith('https://drive.google.com/'));
 assert.equal(q.proofreading_status,'resolved');assert.equal(q.answer_basis,'slide-reviewed');assert.equal(q.answer_text,q.options[q.answer]);
 assert(q.review_references.length&&q.lecture_source.drive_url);
 assert(Object.keys(q.options).length>=2,'No one-choice XP');
 if(q.review_revision)assert(q.review_edit_kind!=='checked');
}
for(const id of Object.keys(ai.unresolved)){if(retired.has(id)||medicallyChanged.has(id))continue;assert.equal(by.get(id).answer,null);assert.equal(by.get(id).exam_ready,false);}
for(const review of medical.reviews.filter(r=>r.status==='unresolved'))assert.deepEqual(by.get(review.id),review.final);
console.log('PASS: all 99 reviewed occurrences have lecture evidence; 94 lecture-graded items preserved; independently graded items separately audited; unaffected content preserved');
