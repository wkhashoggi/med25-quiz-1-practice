const fs=require('fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('legacy-app.html','utf8'),all=JSON.parse(html.match(/const QUESTIONS=(\[[\s\S]*?\]);/)[1]);
const qs=all.filter(q=>q.bank==='Coordinator Formative Quiz 2');
const source=JSON.parse(fs.readFileSync('formative-quiz2-source.json')).questions;
const audit=JSON.parse(fs.readFileSync('formative-source-restoration.json'));
assert.equal(qs.length,30);assert.equal(new Set(all.map(q=>q.id)).size,all.length);
for(const q of qs){
 const expected=source.find(x=>x.id===q.id);assert(expected);
 for(const k of ['id','number','page','stem','options','answer'])assert.deepEqual(q[k],expected[k],q.id+' '+k+' must match supplied formative');
 assert.equal(q.answer,q.source_selected_answer);assert.equal(q.answer_text,q.options[q.answer]);
 assert.equal(q.answer_basis,'formative-source');assert(q.source_content_locked&&q.exam_ready);
 assert.equal(q.explanation,'Supplied formative answer: '+q.answer+' — '+q.answer_text);
 assert(!q.review_note&&!q.ai_grading_note&&!q.option_explanations);
}
assert.equal(qs[17].answer,'D');assert.equal(qs[15].answer,'A');assert.equal(qs[10].answer,'D');
assert(qs[3].options.B.includes('correct answer'),'Keep original source hint');
assert.equal(qs[10].options.C,'Flecainide — atrial','Keep truncated source option');
const previous=new Map(audit.previous_records.map(q=>[q.id,q]));
assert.equal(previous.size,30);
const original=require('child_process').execFileSync('git',['show','0fd231cd2a36c8700709935c7ee304caa6e390a1:legacy-app.html'],{encoding:'utf8',maxBuffer:30e6});
const originalQs=JSON.parse(original.match(/const QUESTIONS=(\[[\s\S]*?\]);/)[1]);
const grades=JSON.parse(fs.readFileSync('ai-answer-completion-20261020.json'));const preGrades=all.map(q=>grades.entries.find(e=>e.id===q.id)?.original||q);
assert.deepEqual(preGrades.filter(q=>!previous.has(q.id)),originalQs.filter(q=>!previous.has(q.id)),'Every other question remains unchanged');
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
console.log('PASS: all 30 formative questions match supplied wording, options and keys; every other question unchanged; app syntax valid');
