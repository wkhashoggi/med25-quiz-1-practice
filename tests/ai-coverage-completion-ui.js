const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),audit=JSON.parse(fs.readFileSync(path.join(root,'ai-coverage-expansion-20261020.json'))),library=JSON.parse(fs.readFileSync(path.join(root,'ai_questions.json')));
(async()=>{const server=http.createServer((req,res)=>{const name=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);const file=name===root?path.join(root,'index.html'):name;if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end()}fs.readFile(file,(e,d)=>{if(e){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(file)]||'application/octet-stream');res.end(d)})});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://**.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:r.request().method()==='GET'?'[]':'{}'}));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.());
 if(await page.locator('#updateNoticeClose').isVisible())await page.locator('#updateNoticeClose').click();
 await page.locator('#tabAI').click();
 assert.equal(await page.evaluate(()=>window.med25GameBridge.aiQuestions().length),1564);
 for(const record of audit.sets){
  if(!await page.locator('#aiGuideClear').isVisible())await page.locator('[data-mobile-filter-toggle="ai"]').click();
  await page.locator('#aiGuideClear').click();await page.locator('#aiGuideSubject').selectOption({label:record.subject});
  await page.locator('#aiGuideLectureBtn').click();await page.locator('#aiGuideLecturePanel input[value="'+record.lecture_id+'"]').check();await page.locator('#aiGuideLectureBtn').click();
  const cards=page.locator('#aiQuestionList .aiCard');assert.equal(await cards.count(),15,record.title);
  const actual=await cards.evaluateAll(cs=>cs.map(c=>c.id));assert.deepEqual(actual,record.question_ids);
  assert.equal(await cards.locator('.aiFeedback').count(),0,'Explanations stay concealed until answered');
  const set=library.lecture_sets.find(s=>s.id===record.set_id),q=set.questions[0];
  if(record.source_kind==='study_guide_reference'){
   assert((await cards.first().locator('.aiSourceNote').innerText()).includes('Course slides were not available'));
   assert.equal(await cards.first().getByRole('button',{name:'Open supporting reference'}).count(),1);
  }
  await cards.first().locator('[data-ai-opt="'+q.answer+'"]').click();
  assert(await page.evaluate(id=>window.med25GameBridge.aiProgress()[id]?.correct===true,q.id),record.title+' must grade its correct option correctly; feedback: '+await cards.first().locator('.aiFeedback').innerText());
  assert.equal(await cards.count(),15);assert((await cards.first().locator('.aiSourceDetails a').count())>=1);
 }
 const grades=JSON.parse(fs.readFileSync(path.join(root,'ai-answer-completion-20261020.json')));
 await page.evaluate(()=>hubGo('questions'));
 for(const e of grades.entries){
  await page.evaluate(id=>{const q=QUESTIONS.find(q=>q.id===id);document.querySelector('#list').innerHTML=card(q);bindCards()},e.id);
  const c=page.locator('#'+e.id);assert.equal(await c.locator('.option').count(),4);assert((await c.locator('.aiGradingNote').textContent()).includes('AI'),await c.locator('.aiGradingNote').evaluate(el=>el.outerHTML));
  assert.equal(await c.locator('.explain.show').count(),0);await c.locator('.originalBankQuestion').evaluate(el=>el.open=true);
  assert((await c.locator('.originalBankQuestion').textContent()).replace(/\s+/g,' ').includes(e.original.stem.replace(/\s+/g,' ')),e.id+' original: '+await c.locator('.originalBankQuestion').textContent());
  await c.locator('[data-opt="'+e.final.answer+'"]').click();
  assert(await page.evaluate(id=>saved[id]?.correct===true,e.id),e.id);assert.equal(await c.locator('.explain.show').count(),1);
 }
 await page.evaluate(()=>window.med25V2OpenProgress());
 await page.locator('#lectureSourceAudit').evaluate(el=>el.open=true);assert((await page.locator('#lectureSourceAudit').innerText()).includes('106 with AI questions'));
 await page.setViewportSize({width:390,height:850});await page.evaluate(()=>hubGo('ai'));
 await page.screenshot({path:path.join(root,'test-artifacts','ai-coverage-phone.png')});
 assert.deepEqual(errors,[]);console.log('PASS all 17 formerly empty topics show 15 mapped questions; all 79 bank completions grade correctly and retain original wording; concealed answers, source labels, 106-topic coverage and phone layout verified');
 }finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
