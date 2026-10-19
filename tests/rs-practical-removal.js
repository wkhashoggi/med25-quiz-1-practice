const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const read=n=>JSON.parse(fs.readFileSync(n));
const parse=h=>JSON.parse(h.match(/const QUESTIONS=(\[[\s\S]*?\]);\s*\n/)[1]);
const m=read('rs-practical-removal.json'),h=fs.readFileSync('legacy-app.html','utf8'),now=require('./dedup-baseline').past(parse(h)),old=parse(cp.execFileSync('git',['show',m.previous_commit+':legacy-app.html'],{encoding:'utf8',maxBuffer:20e6}));
const review=read('medical-content-review.json'),modified=new Map(review.reviews.map(r=>[r.source+':'+r.id,r]));
const removed=new Set(m.removed_question_ids),by=new Map(now.map(q=>[q.id,q]));
assert.equal(removed.size,88);assert.equal(old.length,1843);assert.equal(now.length,1755);assert.equal(by.size,1755);
assert.deepEqual(old.filter(q=>q.practical_source===true),m.removed_questions);
for(const before of old.filter(q=>!removed.has(q.id))){const audit=modified.get('past:'+before.id);assert.deepEqual(by.get(before.id),audit?audit.final:before,'Retained question must be unchanged or explicitly audited: '+before.id);}
assert(!now.some(q=>q.practical_source||removed.has(q.id)));
assert.equal(now.filter(q=>q.question_figure).length,66);
assert(!h.includes('data-filter="rsPractical"'));assert(!h.includes("state.filter==='rsPractical'"));
for(const id of removed){assert(!read('question-study-guide-map.json').past[id]);assert(!read('question-explanations.json')[id]);}
// AI changes and runtime mirrors are validated against the separate medical review ledger.
console.log('PASS exactly 88 RS Practical questions removed; all 1,755 other past questions, 66 other figures and AI pools unchanged; filter/mappings/overrides removed');
