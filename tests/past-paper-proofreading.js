const fs=require('fs'),assert=require('assert/strict'),path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'legacy-app.html'),'utf8');
const qs=JSON.parse(html.match(/const QUESTIONS=(\[[\s\S]*?\]);\s*\n/)[1]);
const audit=JSON.parse(fs.readFileSync(path.join(root,'past-paper-proofreading-audit.json')));
const byId=new Map(qs.map(q=>[q.id,q]));
assert.equal(qs.length,1292);assert.equal(audit.removed_duplicate_rows,208);
assert.equal(qs.reduce((n,q)=>n+q.question_repeat_count,0),1558);
for(const [oldId,newId] of Object.entries(audit.question_id_aliases)){
 assert(!byId.has(oldId));assert(byId.has(newId));
}
for(const q of qs){
 assert.equal(q.question_repeat_count,q.past_paper_sources.length);
 assert.equal(new Set(q.past_paper_sources.map(s=>s.source_question_id)).size,q.past_paper_sources.length);
 if(q.proofreading_status==='needs_review'){assert.equal(q.answer,null);assert.equal(q.exam_ready,false)}
 if(q.answer&&q.answer!=='TEXT')assert.equal(q.answer_text,q.options[q.answer]);
}
const source=(file,page,number)=>qs.find(q=>q.past_paper_sources.some(s=>s.file===file&&s.page===page&&s.number===number));
assert.equal(source('Final  2.pdf',26,1).answer,'A');
assert.equal(source('Final  2.pdf',14,1).answer,'A');
assert.equal(source('FinalNight RS - MED24.pdf',29,8).options.A,'Remodeling of airways with smooth muscle hyperplasia');
assert.equal(source('FinalNight RS - MED24.pdf',22,11).answer,'C');
assert(qs.some(q=>/mediated primarily by IgE/.test(q.stem)));
assert(qs.some(q=>/mediated primarily by T cells/.test(q.stem)));
assert(qs.some(q=>/curve to the left/.test(q.stem)));
assert(qs.some(q=>/curve to the right/.test(q.stem)));
console.log('PASS corrected keys, source coverage, deduplication and distinct concepts');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.route('https://**.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:r.request().method()==='GET'?'[]':'{}'}));
  const variant=audit.merged_variants.find(v=>v.variant.answer&&byId.get(v.kept_id)?.answer&&v.variant.options[v.variant.answer]===byId.get(v.kept_id).options[byId.get(v.kept_id).answer]);
  await page.addInitScript(({id,key})=>localStorage.setItem('cb-bank-progress',JSON.stringify({[id]:{answered:true,selected:key,correct:true,starred:true}})),{id:variant.removed_id,key:variant.variant.answer});
  await page.goto(process.env.MED25_BASE_URL||'http://127.0.0.1:4173');
  await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.());
  const migrated=await page.evaluate(({oldId,newId})=>({old:saved[oldId],current:saved[newId]}),{oldId:variant.removed_id,newId:variant.kept_id});
  assert.equal(migrated.old,undefined);assert(migrated.current?.starred);assert(migrated.current?.correct);
  const notice=page.locator('#updateNoticeClose');if(await notice.isVisible())await notice.click();
  await page.evaluate(()=>hubGo('questions'));
  const q=qs.find(q=>q.proofreading_status==='needs_review'&&Object.keys(q.options).length===4);
  await page.evaluate(id=>{document.getElementById('search').value=QUESTIONS.find(q=>q.id===id).stem;state.page=1;render()},q.id);
  const card=page.locator('#'+q.id);assert(await card.locator('.pastReviewWarning').isVisible());
  await page.evaluate(({id,key})=>answer(id,key),{id:q.id,key:Object.keys(q.options)[0]});
  assert.equal(await page.evaluate(id=>saved[id].correct,q.id),null);
  assert.equal(await card.locator('.option.correct,.option.wrong').count(),0);
  assert.equal(await page.evaluate(id=>window.med25ExamReadyPast(QUESTIONS.find(q=>q.id===id)),q.id),false);
  assert(await card.locator('.feedback.ungraded').isVisible());
  const repeated=qs.find(q=>q.question_repeat_count>1&&q.repeated_concepts?.length);
  await page.evaluate(id=>{document.getElementById('search').value=QUESTIONS.find(q=>q.id===id).stem;state.page=1;render()},repeated.id);
  assert.equal(await page.locator('#'+repeated.id+' .questionRepeatPill').textContent(),'Repeated ×'+repeated.question_repeat_count);
  assert(await page.locator('#'+repeated.id+' .hy').isVisible());
  await page.screenshot({path:path.join(root,'test-artifacts','proofread-repeat-phone.png')});
  console.log('PASS preserved progress, ungraded warnings, mock exclusion and separate repeat tags');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
