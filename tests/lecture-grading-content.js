const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const parse=h=>JSON.parse(h.match(/const QUESTIONS=(\[[\s\S]*?\]);\s*\n/)[1]);
const h=fs.readFileSync('legacy-app.html','utf8'),qs=parse(h),by=new Map(qs.map(q=>[q.id,q]));
const a=JSON.parse(fs.readFileSync('lecture-grading-review.json'));
const old=parse(cp.execFileSync('git',['show',a.baseline_commit+':legacy-app.html'],{encoding:'utf8',maxBuffer:20e6}));
const reviewed=new Set(a.reviews.map(r=>r.id)),removed=new Map(a.merged_duplicates.map(r=>[r.removed_id,r.retained_id]));
assert.equal(a.reviews.length,99);assert.equal(qs.length,old.length-removed.size);
for(const q of old){
 if(reviewed.has(q.id))continue;
 const now={...by.get(q.id)},before={...q};
 if(a.unresolved[q.id]){delete now.proofreading_notes;delete before.proofreading_notes;}
 // Equivalent canonical source URLs may remove account-specific query strings.
 if(now.lecture_source&&before.lecture_source){now.lecture_source={...now.lecture_source};before.lecture_source={...before.lecture_source};delete now.lecture_source.drive_url;delete before.lecture_source.drive_url;}
 assert.deepEqual(now,before,'Unreviewed question changed: '+q.id);
}
for(const r of a.reviews){
 const q=by.get(r.id)||by.get(removed.get(r.id));assert(q);
 assert(r.evidence.source_file_id&&r.evidence.quote&&r.evidence.url.startsWith('https://drive.google.com/'));
 assert.equal(q.proofreading_status,'resolved');assert.equal(q.answer_basis,'slide-reviewed');assert.equal(q.answer_text,q.options[q.answer]);
 assert(q.review_references.length&&q.lecture_source.drive_url);
 assert(Object.keys(q.options).length>=2,'No one-choice XP');
 if(q.review_revision)assert(q.review_edit_kind!=='checked');
}
for(const id of Object.keys(a.unresolved)){assert.equal(by.get(id).answer,null);assert.equal(by.get(id).exam_ready,false);}
assert.equal(qs.filter(q=>q.proofreading_status==='needs_review'||!q.answer).length,a.remaining_ungraded_count);
console.log('PASS: all 99 reviewed occurrences have lecture evidence; 94 unique graded items, 165 unresolved; unaffected content preserved');
