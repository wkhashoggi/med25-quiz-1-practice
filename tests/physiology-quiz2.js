const fs=require('fs'),assert=require('node:assert/strict');
const html=fs.readFileSync('legacy-app.html','utf8'),all=JSON.parse(html.match(/const QUESTIONS=(\[[\s\S]*?\]);/)[1]);
const bank='Physiology Quiz 2 Important',select=b=>all.filter(q=>q.bank===b||(q.past_paper_sources||[]).some(ref=>ref.file===b));
const set=select(bank),added=set.filter(q=>q.id.startsWith('physiology-quiz2-resp-'));
assert.equal(set.length,40);assert.equal(added.length,24);assert.equal(select('Coordinator Formative Quiz 2').length,30);
assert.equal(added.map(q=>q.answer).join(''),'BDBACBC AABCB BCCCBCBCCBBC'.replace(/ /g,''));
const map=JSON.parse(fs.readFileSync('question-study-guide-map.json')).past;
for(const q of set){assert.equal(map[q.id].quiz,2);assert(q.options[q.answer]);assert(q.past_paper_sources.some(s=>s.file===bank&&s.page>=1&&s.url.startsWith('assets/past-papers/physiology-quiz-2-important.pdf#page=')));}
for(const name of [bank,'Coordinator Formative Quiz 2'])assert(html.includes('data-bank-shortcut="'+name+'"'));
assert.equal(new Set(all.map(q=>q.id)).size,all.length);
console.log('PASS: separate 40-question physiology and 30-question formative filters; 24 source keys, Quiz 2 mappings, source links and unique IDs');
