const fs=require('fs'),assert=require('assert/strict'),cp=require('child_process');
const parse=h=>JSON.parse(h.match(/const QUESTIONS=(\[[\s\S]*?\]);\s*\n/)[1]);
const qs=parse(fs.readFileSync('legacy-app.html','utf8'));
const baseline=JSON.parse(fs.readFileSync('rs-module3-import.json')).previous_commit;
assert(/^[0-9a-f]{40}$/.test(baseline));
const old=parse(cp.execFileSync('git',['show',baseline+':legacy-app.html'],{maxBuffer:20e6,encoding:'utf8'}));
const byid=new Map(qs.map(q=>[q.id,q]));
const m=JSON.parse(fs.readFileSync('rs-module3-import.json'));
const review=JSON.parse(fs.readFileSync('lecture-grading-review.json'));
const aiReview=JSON.parse(fs.readFileSync('ai-answer-grading-review.json'));
const correction=JSON.parse(fs.readFileSync('bronchi-key-correction.json'));
const retirement=JSON.parse(fs.readFileSync('rs-practical-removal.json')),retired=new Set(retirement.removed_question_ids);
const medical=JSON.parse(fs.readFileSync('medical-content-review.json')),medicallyChanged=new Set(medical.reviews.filter(r=>r.source==='past').map(r=>r.id));

const reviewed=new Set([...review.reviews,...aiReview.reviews].map(q=>q.id).concat(correction.retained_id,correction.removed_id));
const map=JSON.parse(fs.readFileSync('question-study-guide-map.json'));
assert.equal(byid.size,qs.length);
assert.equal(qs.length,old.length+m.new_question_ids.length-correction.baseline_removed_ids.length-retired.size);
assert.equal(m.occurrences.length,885);assert.equal(m.written_occurrences,797);assert.equal(m.practical_occurrences,88);
assert.equal(m.merged_variants.length,374+review.merged_duplicates.length+aiReview.merged_duplicates.length);
for(const q of old){if(q.id===correction.removed_id||retired.has(q.id)||medicallyChanged.has(q.id))continue;const now=byid.get(q.id);assert(now);if(reviewed.has(q.id))continue;for(const key of ['stem','options','answer','answer_text','exam_ready','quiz','lecture_id'])assert.deepEqual(now[key],q[key],q.id+': '+key);}
assert.equal(new Set(m.occurrences.map(x=>x.source_question_id)).size,885);
for(const x of m.occurrences){if(retired.has(x.question_id)||medicallyChanged.has(x.question_id))continue;const q=byid.get(x.question_id);assert(q);assert(q.past_paper_sources.some(s=>s.source_question_id===x.source_question_id));assert(q.tags.includes(m.source_bank));}
for(const id of m.new_question_ids){if(retired.has(id)||medicallyChanged.has(id))continue;const q=byid.get(id);assert(map.past[id]);assert.equal(map.past[id].quiz,q.quiz);assert.equal(q.question_repeat_count,q.past_paper_sources.length);if(q.proofreading_status==='needs_review'){assert.equal(q.answer,null);assert.equal(q.exam_ready,false);}if(q.practical_source&&!reviewed.has(q.id))assert(!q.exam_ready);if(q.question_figure)assert(fs.existsSync(q.question_figure.url));if(q.answer)assert.equal(q.answer_text,q.options[q.answer]);}
assert.notEqual(m.occurrences.find(x=>x.page===239&&x.number==='14').question_id,m.occurrences.find(x=>x.page===240&&x.number==='16').question_id,'Different practical figures must not merge from generic stems');
assert(fs.existsSync(m.url));
for(const [concept,ids] of Object.entries(m.concept_groups)){assert(ids.length>=2);for(const id of ids){if(retired.has(id)||medicallyChanged.has(id))continue;const q=byid.get(id);assert(q.high_yield);assert(q.repeated_concepts.includes(concept));}}
console.log('PASS: 885 source entries, conservative deduplication, independent concept tags, source assets, unreviewed previous IDs/options/keys preserved, ungraded recalls excluded from exams');
