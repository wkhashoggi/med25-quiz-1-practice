const fs=require('fs'),assert=require('node:assert/strict'),vm=require('node:vm'),cp=require('child_process');
const read=n=>JSON.parse(fs.readFileSync(n,'utf8'));
const html=fs.readFileSync('legacy-app.html','utf8'),parse=h=>JSON.parse(h.match(/const QUESTIONS=(\[[\s\S]*?\]);/)[1]);
const past=parse(html),audit=read('question-deduplication-audit.json'),byId=new Map(past.map(q=>[q.id,q]));
const base=parse(cp.execFileSync('git',['show',audit.baseline_commit+':legacy-app.html'],{encoding:'utf8',maxBuffer:20e6}));
const norm=s=>String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases=JSON.parse(html.match(/const PAST_QUESTION_ALIASES=(\{[^\n]*\});/)[1]);
const aiAliases=JSON.parse(html.match(/const AI_TO_PAST_ALIASES=(\{[^\n]*\});/)[1]);
assert.equal(past.length,audit.after_past);assert.equal(base.length-past.length,215);assert.equal(byId.size,past.length);
const reconstructed=require('./dedup-baseline').past(past).sort((a,b)=>a.id.localeCompare(b.id));
assert.deepEqual(reconstructed,base.slice().sort((a,b)=>a.id.localeCompare(b.id)),'Every removed copy must be archived verbatim');
const clean=q=>Object.fromEntries(Object.entries(q).filter(([key])=>!audit.preserved_metadata_fields.includes(key)));
for(const group of audit.groups){
  assert.deepEqual(clean(byId.get(group.retained_id)),clean(group.original_retained),'Retained medical content and answer must not change');
  for(const q of group.variants){assert(!byId.has(q.id));assert.equal(aliases[q.id].id,group.retained_id);assert(aliases[q.id].preserve_progress);}
}
const refs=qs=>new Set(qs.flatMap(q=>(q.past_paper_sources||[]).map(r=>r.source_question_id||JSON.stringify([r.file,r.page,r.number]))));
assert.deepEqual([...refs(past)].sort(),[...refs(base)].sort(),'All original source copies must survive');
const exact=new Map();
for(const q of past){
  assert.equal(q.question_repeat_count,q.past_paper_sources.length||1);
  const image=q.question_figure||q.figure_required||/picture|image|diagram|marked|labelled|labeled|this x.ray|this slide|shown|specimen/i.test(q.stem);
  if(!image){const key=norm(q.stem);assert(!exact.has(key),'Written duplicate remains: '+q.id+' / '+exact.get(key));exact.set(key,q.id);}
}
const resolve=id=>audit.aliases[id]||id;
for(const pair of audit.reviewed_near_pairs)assert.equal(resolve(pair.a)===resolve(pair.b),pair.decision==='merge','Reviewed pair: '+pair.a+' / '+pair.b);
for(const group of audit.visually_confirmed_duplicates)assert.equal(new Set(group.map(resolve)).size,1);
const ai=read('ai_questions.json').lecture_sets.filter(s=>!s.archived&&s.eligibility_status==='allowed'&&s.quality_status==='pass').flatMap(s=>s.questions);
assert.equal(ai.length,1308);assert.equal(new Set(ai.map(q=>norm(q.stem))).size,ai.length);
assert(!ai.some(q=>past.some(p=>norm(p.stem)===norm(q.stem))));
function extract(text,name){const start=text.indexOf('function '+name+'(');assert(start>=0,name);let end=text.indexOf('\nfunction ',start+1);if(name==='regradeSavedProgress')end=text.indexOf('\nregradeSavedProgress();',start);return text.slice(start,end<0?undefined:end);}
const migration=extract(html,'regradeSavedProgress');
function migrate(saved){const c={QUESTIONS:past,PAST_QUESTION_ALIASES:aliases,AI_TO_PAST_ALIASES:aiAliases,saved};vm.createContext(c);vm.runInContext(migration+'\nregradeSavedProgress();',c);return c;}
for(const group of audit.groups)for(const q of group.variants){
  const before={answered:true,selected:q.answer||Object.keys(q.options)[0],correct:!!q.answer,starred:true,locked_at:'2026-10-19T09:00:00Z',review_revision:q.review_revision};
  const c=migrate({[q.id]:before,__ai_questions__:{unrelated:{starred:true}}});
  const target=c.saved[group.retained_id];assert(target?.answered,'Keep completion: '+q.id);assert(target.starred,'Keep star: '+q.id);assert(!c.saved[q.id]);
  assert(target.duplicate_attempts.some(r=>r.id===q.id&&r.attempt.correct===before.correct),'Keep the original attempt, even when a choice has no equivalent');
  if(target.selected)assert.equal(target.correct,byId.get(group.retained_id).answer?target.selected===byId.get(group.retained_id).answer:null);
  assert(c.saved.__ai_questions__.unrelated.starred);
  const once=JSON.stringify(c.saved);vm.runInContext('regradeSavedProgress();',c);assert.equal(JSON.stringify(c.saved),once,'Migration is idempotent');
}
const cross=audit.removed_ai_questions[0],crossAlias=aiAliases[cross.question.id];
let c=migrate({__ai_questions__:{[cross.question.id]:{answered:true,selected:'A',correct:true,starred:true}}});
assert(c.saved[crossAlias.id].correct);assert(c.saved[crossAlias.id].starred);assert(!c.saved.__ai_questions__[cross.question.id]);
const bankContext={QUESTIONS:past,state:{filter:'formative2',shuffled:false},$:()=>({value:''})};vm.createContext(bankContext);vm.runInContext(extract(html,'filtered')+'\nvar selected=filtered();',bankContext);assert.equal(bankContext.selected.length,30);bankContext.state.filter='physiology2';vm.runInContext('selected=filtered();',bankContext);assert.equal(bankContext.selected.length,40);
// Recovery queues and an in-progress mock must resolve old IDs and shuffled choices.
const game=fs.readFileSync('game-hub.js','utf8'),pair=audit.groups.flatMap(g=>g.variants.map(q=>({old:q,target:byId.get(g.retained_id)}))).find(({old,target})=>old.answer&&target.answer&&aliases[old.id].option_map[old.answer]===target.answer&&old.answer!==target.answer);
assert(pair,'Exercise a real reordered-choice duplicate');
const oldKey='past:'+pair.old.id,newKey='past:'+pair.target.id;
const stored={version:1,exam:{questions:[oldKey,newKey],answers:{[oldKey]:pair.old.answer},endsAt:Date.now()+60000,submitted:true,index:1}};
const ctx={QUESTIONS:past,PAST_QUESTION_ALIASES:aliases,AI_TO_PAST_ALIASES:aiAliases,window:{med25GameBridge:{studyLibrariesReady:()=>true,aiQuestions:()=>ai}},gameMockRestorePending:true,gameMockState:{},GAME_MOCK_KEY:'test',gameMockQuestionRows:()=>[{key:newKey,q:pair.target}],sessionStorage:{getItem:()=>JSON.stringify(stored),removeItem:()=>assert.fail('Do not discard a saved mock')},console};
vm.createContext(ctx);vm.runInContext(extract(game,'gameResolveQuizKey')+'\n'+extract(game,'gameMockRestore')+'\ngameMockRestore();',ctx);
assert.equal(ctx.gameMockState.exam.questions.length,1);assert.equal(ctx.gameMockState.exam.answers[newKey],pair.target.answer);
for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(script[1].trim())new vm.Script(script[1]);
for(const f of ['study-hub.js','game-hub.js','study-hub-loader.js'])new vm.Script(fs.readFileSync(f,'utf8'));
console.log('PASS: 215 past duplicates and 1 AI/past copy removed; all source links and clinical content preserved; every alias migrates progress/stars; shuffled choices and saved mocks migrate; exact written duplicates absent; distinct questions and 30/40 source filters preserved');
