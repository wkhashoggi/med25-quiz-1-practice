const fs=require('fs'),assert=require('assert/strict'),vm=require('vm');
const html=fs.readFileSync('legacy-app.html','utf8');const qs=JSON.parse(html.match(/const QUESTIONS=(\[[\s\S]*?\]);/)[1]);
const audit=JSON.parse(fs.readFileSync('cvs-module2-import.json'));const byId=new Map(qs.map(q=>[q.id,q]));const map=JSON.parse(fs.readFileSync('question-study-guide-map.json')).past;
assert.equal(audit.occurrences.length,308);assert.equal(new Set(audit.occurrences.map(q=>q.source_id)).size,308);assert.equal(byId.size,qs.length);
for(const o of audit.occurrences){assert(byId.has(o.question_id));assert(o.explanation);}
for(const id of audit.new_question_ids){const q=byId.get(id);if(!q)continue;assert(map[id]);assert(q.past_paper_sources.length);assert.equal(q.question_repeat_count,q.past_paper_sources.length);assert(q.explanation);if(q.answer)assert.equal(q.options[q.answer],q.answer_text);else assert.equal(q.exam_ready,false);if(q.question_figure)assert(fs.existsSync(q.question_figure.url));}
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;const hash=v=>require('crypto').createHash('sha256').update(JSON.stringify(stable(v))).digest('hex');const restored=new Map(JSON.parse(fs.readFileSync('formative-source-restoration.json')).previous_records.map(q=>[q.id,q]));assert.equal(hash(qs.filter(q=>audit.protected_question_ids.includes(q.id)).map(q=>restored.get(q.id)||q)),audit.protected_sha256,'Protected Formative and Physiology Important records changed');
const begin=html.indexOf('function quiz2PastCategory('),end=html.indexOf('function filtered(',begin),ctx={};vm.createContext(ctx);vm.runInContext(html.slice(begin,end),ctx);
const counts={};for(const q of qs){const c=ctx.quiz2PastCategory(q);if(q.quiz===2)assert(['formative2','physiology2','rsModule3','cvs2'].includes(c));else assert.equal(c,'');counts[c]=(counts[c]||0)+1;}
assert.equal(counts.formative2,30);assert.equal(counts.physiology2,40);
for(const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(m[1].trim())new vm.Script(m[1]);
for(const f of ['study-hub.js','study-hub-loader.js'])new vm.Script(fs.readFileSync(f,'utf8'));
console.log('PASS all 308 entries traced, answer/figure/mapping integrity, protected baseline verified before authorized formative restoration; 40 physiology records unchanged; exclusive Quiz 2 category counts',counts);
const aliases=JSON.parse(html.match(/const PAST_QUESTION_ALIASES=(\{[^\n]*\});/)[1]);
const migrationStart=html.indexOf('function regradeSavedProgress('),migrationEnd=html.indexOf('\nregradeSavedProgress();',migrationStart);
for(const group of audit.merged_groups)for(const old of group.variants){
 const c={QUESTIONS:qs,PAST_QUESTION_ALIASES:aliases,AI_TO_PAST_ALIASES:{},saved:{[old.id]:{answered:true,selected:old.answer||'A',correct:!!old.answer,starred:true,review_revision:old.review_revision}}};
 vm.createContext(c);vm.runInContext(html.slice(migrationStart,migrationEnd)+'\nregradeSavedProgress();',c);
 const target=c.saved[group.retained_id];assert(target?.answered&&target.starred);assert(!c.saved[old.id]);assert(target.duplicate_attempts.some(x=>x.id===old.id));const once=JSON.stringify(c.saved);vm.runInContext('regradeSavedProgress();',c);assert.equal(JSON.stringify(c.saved),once);
}
console.log('PASS all 59 merged cards preserve completion, stars, prior attempts and stable migration');
