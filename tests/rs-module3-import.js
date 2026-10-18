const fs=require('fs'),assert=require('assert/strict'),cp=require('child_process');
const parse=h=>JSON.parse(h.match(/const QUESTIONS=(\[[\s\S]*?\]);\s*\n/)[1]);
const qs=parse(fs.readFileSync('legacy-app.html','utf8'));
const baseline=JSON.parse(fs.readFileSync('rs-module3-import.json')).previous_commit;
assert(/^[0-9a-f]{40}$/.test(baseline));
const old=parse(cp.execFileSync('git',['show',baseline+':legacy-app.html'],{maxBuffer:20e6,encoding:'utf8'}));
const byid=new Map(qs.map(q=>[q.id,q]));
const m=JSON.parse(fs.readFileSync('rs-module3-import.json'));
const map=JSON.parse(fs.readFileSync('question-study-guide-map.json'));
assert.equal(byid.size,qs.length);
assert.equal(qs.length,old.length+m.new_question_ids.length);
assert.equal(m.occurrences.length,885);assert.equal(m.written_occurrences,797);assert.equal(m.practical_occurrences,88);
assert.equal(m.merged_variants.length,373);
for(const q of old){const now=byid.get(q.id);assert(now);for(const key of ['stem','options','answer','answer_text','exam_ready','quiz','lecture_id'])assert.deepEqual(now[key],q[key],q.id+': '+key);}
assert.equal(new Set(m.occurrences.map(x=>x.source_question_id)).size,885);
for(const x of m.occurrences){const q=byid.get(x.question_id);assert(q);assert(q.past_paper_sources.some(s=>s.source_question_id===x.source_question_id));assert(q.tags.includes(m.source_bank));}
for(const id of m.new_question_ids){const q=byid.get(id);assert(map.past[id]);assert.equal(map.past[id].quiz,q.quiz);assert.equal(q.question_repeat_count,q.past_paper_sources.length);if(q.proofreading_status==='needs_review'){assert.equal(q.answer,null);assert.equal(q.exam_ready,false);}if(q.practical_source)assert(!q.exam_ready);if(q.question_figure)assert(fs.existsSync(q.question_figure.url));if(q.answer)assert.equal(q.answer_text,q.options[q.answer]);}
assert.notEqual(m.occurrences.find(x=>x.page===239&&x.number==='14').question_id,m.occurrences.find(x=>x.page===240&&x.number==='16').question_id,'Different practical figures must not merge from generic stems');
assert(fs.existsSync(m.url));
for(const [concept,ids] of Object.entries(m.concept_groups)){assert(ids.length>=2);for(const id of ids){const q=byid.get(id);assert(q.high_yield);assert(q.repeated_concepts.includes(concept));}}
console.log('PASS: 885 source entries, conservative deduplication, independent concept tags, source assets, all previous IDs/options/keys preserved, ungraded recalls excluded from exams');
