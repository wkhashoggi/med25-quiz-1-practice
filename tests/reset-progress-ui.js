const {chromium}=require('playwright'),fs=require('fs'),http=require('http'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const root=process.cwd(),server=http.createServer((req,res)=>{const name=path.join(root,decodeURIComponent(new URL(req.url,'http://local').pathname).replace(/^\//,'')||'index.html');if(!name.startsWith(root+path.sep)){res.writeHead(403);res.end();return}fs.readFile(name,(e,data)=>{if(e){res.writeHead(404);res.end();return}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(name)]||'application/octet-stream');res.end(data)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true});
 try{for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.route('https://**.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await p.goto('http://127.0.0.1:'+server.address().port);await p.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.());const notice=p.locator('#updateNoticeClose');if(await notice.isVisible())await notice.click();
  const before=await p.evaluate(()=>{saved={};for(const quiz of [1,2]){const q=QUESTIONS.find(q=>q.quiz===quiz);saved[q.id]={answered:true,selected:q.answer,correct:true,starred:true}}saved.__ai_questions__={test:{answered:true,correct:true}};saved.__lecture_study__={test:{studied:true}};saved.__revision_practice__={test:{revision_attempt:true}};save();hubGo('questions');return JSON.stringify(saved)});
  const open=()=>p.evaluate(()=>document.getElementById('reset').click());
  await open();assert(await p.locator('#resetProgressDialog').isVisible());assert.equal(await p.evaluate(()=>JSON.stringify(saved)),before);assert.equal(await p.evaluate(()=>document.activeElement.id),'resetProgressCancel');
  const copy=await p.locator('#resetProgressDialog').innerText();for(const phrase of ['all past papers in Quiz 1 and Quiz 2','Formative, Physiology Important, RS and CVS','cannot be undone','AI-question progress'])assert(copy.includes(phrase));assert(copy.includes('not signed in'));
  await p.locator('#resetProgressCancel').click();assert.equal(await p.evaluate(()=>JSON.stringify(saved)),before);
  await open();await p.keyboard.press('Escape');assert(!await p.locator('#resetProgressDialog').isVisible());assert.equal(await p.evaluate(()=>JSON.stringify(saved)),before);
  await p.evaluate(()=>{currentUser={id:'reset-confirmation-test'};document.documentElement.dataset.theme='dark'});await open();assert((await p.locator('#resetProgressSync').innerText()).includes('other devices'));
  assert(await p.evaluate(()=>document.getElementById('resetProgressDialog').scrollWidth<=document.getElementById('resetProgressDialog').clientWidth));
  await p.locator('#resetProgressDialog').screenshot({path:'/tmp/med25-reset-'+width+'.png'});
  await p.locator('#resetProgressConfirm').click();assert(!await p.locator('#resetProgressDialog').isVisible());
  assert.deepEqual(await p.evaluate(()=>saved),{__ai_questions__:{test:{answered:true,correct:true}},__lecture_study__:{test:{studied:true}},__revision_practice__:{test:{revision_attempt:true}}});
  assert.deepEqual(errors,[]);await context.close();console.log('PASS '+width+'px: explicit scope, cancel focus, opening/cancel/Escape preserve progress, confirmation clears only past papers, signed-in warning and dark layout');
 }}finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exit(1)});
