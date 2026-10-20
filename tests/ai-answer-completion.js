const fs=require('fs'),assert=require('assert/strict'),cp=require('child_process');
const read=n=>JSON.parse(fs.readFileSync(n));
const parse=s=>JSON.parse(s.match(/const QUESTIONS=(\[[\s\S]*?\]);/)[1]);
const audit=read('ai-answer-completion-20261020.json'),qs=parse(fs.readFileSync('legacy-app.html','utf8')),before=parse(cp.execFileSync('git',['show',audit.baseline_commit+':legacy-app.html'],{encoding:'utf8',maxBuffer:30e6}));
assert.equal(audit.entries.length,79);assert.equal(qs.length,before.length);
const map=read('question-study-guide-map.json'),overrides=read('question-explanations.json');
for(const old of before){const q=qs.find(q=>q.id===old.id),e=audit.entries.find(e=>e.id===q.id);if(!e){assert.deepEqual(q,old,q.id+' unchanged');continue}assert.deepEqual(e.original,old);assert.deepEqual(q,e.final);assert.equal(q.answer_basis,'ai-supplied');assert(q.ai_grading_note.includes('AI'));assert(q.options[q.answer]);assert.equal(q.options[q.answer],q.answer_text);assert.equal(Object.keys(q.options).length,4);assert.equal(new Set(Object.values(q.options)).size,4);assert(q.explanation&&q.exam_ready);assert.deepEqual(q.source_original_question.stem,old.stem);assert.deepEqual(q.source_original_question.options,old.options);assert.deepEqual(map.past[q.id],e.final_mapping);assert.deepEqual(q.past_paper_sources,old.past_paper_sources);assert(!overrides[q.id]);}
assert.deepEqual(qs.filter(q=>!q.answer).map(q=>q.id),['coordinator-formative-q11']);
console.log('PASS all 79 AI completions have unique choices, valid keys, original wording and source provenance; every other past question including all formative/physiology records unchanged');
