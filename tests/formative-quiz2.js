const fs=require('fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const html=fs.readFileSync('legacy-app.html','utf8');
const match=html.match(/const QUESTIONS=(\[[\s\S]*?\]);/);
assert(match,'Question bank must be parseable');
const all=JSON.parse(match[1]),qs=all.filter(q=>q.bank==='Coordinator Formative Quiz 2');
const map=JSON.parse(fs.readFileSync('question-study-guide-map.json','utf8')).past;
assert.equal(qs.length,30);
assert.equal(new Set(all.map(q=>q.id)).size,all.length);
assert.deepEqual(qs.map(q=>q.number),Array.from({length:30},(_,i)=>i+1));
assert.equal(qs.filter(q=>q.exam_ready).length,28);
for(const q of qs){
  assert.equal(map[q.id].quiz,2);assert.equal(map[q.id].lecture_id,q.lecture_id);
  assert.equal(q.quiz,2);assert.equal(Object.keys(q.options).length,4);
  assert(q.explanation);assert(q.page>=1&&q.page<=9);
  assert(!Object.values(q.options).some(x=>/correct answer|Selected/.test(x)),'No answer hints in options');
  assert.equal(q.bank_source_url,'assets/past-papers/formative-quiz-2-bcr.pdf#page='+q.page);
  if(q.exam_ready)assert(q.options[q.answer]);
  else {assert.equal(q.answer,null);assert.equal(q.proofreading_status,'needs_review');}
}
assert.equal(qs[17].answer,'B');assert.equal(qs[17].source_selected_answer,'D');
assert.equal(qs[10].options.C,'Flecainide — atrial','Do not invent truncated source text');
assert.deepEqual(qs.filter(q=>!q.exam_ready).map(q=>q.number),[11,16]);
assert(fs.readFileSync('assets/past-papers/formative-quiz-2-bcr.pdf').subarray(0,4).equals(Buffer.from('%PDF')));
for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(script[1].trim())new vm.Script(script[1]);
console.log('PASS: all 30 formative questions, original numbering, Quiz 2 mappings, 28 graded, 2 ungraded, source PDF, and app syntax');
