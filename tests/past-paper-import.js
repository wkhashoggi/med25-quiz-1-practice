const fs=require('fs'),assert=require('assert/strict'),path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'past-paper-import-manifest.json')));
const map=JSON.parse(fs.readFileSync(path.join(root,'question-study-guide-map.json')));
const html=fs.readFileSync(path.join(root,'legacy-app.html'),'utf8');
const qs=JSON.parse(html.match(/const QUESTIONS=(\[[\s\S]*?\]);\s*\n/)[1]);
assert.equal(qs.length,1286);assert.equal(new Set(qs.map(q=>q.id)).size,qs.length);
assert.equal(manifest.occurrences.length,720);
for(const ref of manifest.occurrences){
 const q=qs.find(q=>q.id===ref.question_id);assert(q);
 assert(q.past_paper_sources.some(s=>s.source_question_id===ref.source_question_id));
 assert.equal(q.quiz,map.past[q.id].quiz);assert([1,2].includes(q.quiz));
 assert(q.tags.includes('Past paper question'));assert(q.tags.includes('Quiz '+q.quiz));
 assert(fs.existsSync(path.join(root,ref.url.split('#')[0])));
}
for(const src of manifest.sources)assert.equal(manifest.occurrences.filter(x=>x.file===src.file).length,src.occurrences);
const recall=qs.find(q=>q.past_paper_sources?.some(s=>s.file==='Final CVS🫀.pdf'&&s.number===52));
assert.equal(recall.options.B,'Preload (venous return)');
const mechanics=qs.find(q=>q.id.startsWith('rs-med24-mid-p5-q1'));assert.equal(mechanics.quiz,2);
const anticoag=qs.find(q=>q.id.startsWith('rs-med24-final-p94-q5'));assert.equal(anticoag.quiz,1);
assert.equal(map.past[anticoag.id].title,'Drugs affecting hemostasis');
assert(qs.some(q=>q.id.startsWith('rs-med24')&&q.repeated_concepts?.length));
for(const q of qs.filter(q=>q.repeated_concepts?.length))assert(q.high_yield&&q.repeat_count>=3);
console.log('PASS import coverage, source provenance, quiz mapping and parsing regressions');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const context=await browser.newContext({viewport});
   const page=await context.newPage();const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('https://**.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:r.request().method()==='GET'?'[]':'{}'}));
   await page.goto(process.env.MED25_BASE_URL||'http://127.0.0.1:4173');
   await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.()&&document.getElementById('pastGuideQuiz'),null,{timeout:15000});
   const notice=page.locator('#updateNoticeClose');if(await notice.isVisible())await notice.click();
   await page.evaluate(()=>hubGo('questions'));
   for(const quiz of ['1','2']){
    await page.evaluate(value=>{const select=document.getElementById('pastGuideQuiz');select.value=value;select.dispatchEvent(new Event('change'))},quiz);
    assert(await page.evaluate(value=>filtered().length>0&&filtered().every(q=>q.quiz===Number(value)),quiz));
    assert(await page.evaluate(value=>[...document.querySelectorAll('#list .lectureQuizStamp')].every(x=>x.textContent==='Quiz '+value),quiz));
   }
   assert.equal(await page.locator('#bank').isVisible(),false);
   assert(await page.locator('#list .lectureQuizStamp').first().isVisible());
   assert(await page.locator('#list .pastPaperTypePill').first().isVisible());
   assert(await page.locator('#list .pastPaperOriginal').count()>0);
   await page.evaluate(()=>document.getElementById('pastGuideClear').click());
   assert.equal(await page.evaluate(()=>filtered().length),1286);
   assert.equal(await page.evaluate(()=>document.getElementById('pastGuideQuiz').value),'');
   await page.evaluate(()=>{document.getElementById('sort').value='repeated';document.getElementById('sort').dispatchEvent(new Event('change'))});
   assert(await page.locator('#list .hy').first().isVisible());
   assert(await page.locator('#list .hy').filter({hasText:'Repeated concepts'}).first().isVisible()); 
   await page.evaluate(()=>answer(QUESTIONS.find(q=>q.id.startsWith('rs-med24-mid-p5-q1')).id,'A'));
   assert(await page.evaluate(()=>saved[QUESTIONS.find(q=>q.id.startsWith('rs-med24-mid-p5-q1')).id].correct));
   assert.equal(errors.length,0,errors.join('\n'));
   await page.screenshot({path:path.join(root,'test-artifacts','past-import-'+viewport.width+'.png'),fullPage:false});
   await context.close();console.log('PASS quiz filters, reset, tags and answer locking at '+viewport.width+'px');
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
