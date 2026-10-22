const fs=require('node:fs'),assert=require('node:assert/strict');
const data=JSON.parse(fs.readFileSync('quiz2-prequiz.json'));
const catalog=JSON.parse(fs.readFileSync('study-guide-lectures.json')).subjects.flatMap(s=>s.lectures).filter(l=>l.quiz===2);
const past=JSON.parse(fs.readFileSync('legacy-app.html','utf8').match(/const QUESTIONS=(\[[\s\S]*?\]);/)[1]);
const ai=JSON.parse(fs.readFileSync('ai_questions.json')).lecture_sets.flatMap(s=>s.questions);
const lookup=new Map([...past,...ai].map(q=>[q.id,q]));
assert.equal(data.lecture_count,catalog.length);
assert.deepEqual(data.lectures.map(l=>l.id).sort(),catalog.map(l=>l.id).sort());
const questions=data.lectures.flatMap(l=>{assert.equal(l.questions.length,2,l.title);return l.questions});
assert.equal(questions.length,98);assert.equal(data.question_count,questions.length);assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
const counts={};
for(const q of questions){const original=lookup.get(q.id);assert(original,q.id);for(const field of ['stem','options','answer','explanation'])assert.deepEqual(q[field],original[field],q.id+' '+field+' preserves source');assert.deepEqual(Object.keys(q.options).sort(),['A','B','C','D']);assert(q.options[q.answer]);assert(q.source_url);assert(q.selection_reason);counts[q.source_kind]=(counts[q.source_kind]||0)+1;if(q.source_url.startsWith('assets/'))assert(fs.existsSync(q.source_url.split('#')[0]),q.source_url);}
assert.deepEqual(counts,data.source_counts);
const loader=fs.readFileSync('study-hub-loader.js','utf8');assert(loader.includes('quiz2-prequiz.js'));assert(loader.includes('quiz2-prequiz.css'));assert(fs.readFileSync('study-hub.js','utf8').includes('window.med25PrequizMount?.()'));
console.log('PASS: 49 Quiz 2 lectures, exactly two unique questions each; 98 intact source snapshots; all source links and home integration valid');
