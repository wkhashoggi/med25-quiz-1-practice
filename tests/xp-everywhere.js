const {chromium}=require('playwright'),assert=require('assert/strict'),fs=require('fs'),http=require('http'),path=require('path');
const root=path.resolve(__dirname,'..');
const user={id:'00000000-0000-4000-8000-000000000007',email:'xp-fixture@example.com'};
const session={user,access_token:'fixture',refresh_token:'fixture'};
const profile={user_id:user.id,username:'XPFixture',points:0,weekly_xp:0,monthly_xp:0,correct_first_attempts:0,wrong_first_attempts:0,current_streak:0,best_streak:0};
const rows=new Map();let fail=false,postCount=0,failConfirmation=false,delayPost=false;
(async()=>{const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://local').pathname);fs.readFile(file===root?path.join(root,'index.html'):file,(e,data)=>{if(e){res.writeHead(404);return res.end()}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css'})[path.extname(file)]||'text/html');res.end(data)})});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(s=>localStorage.setItem('med25-auth-session',JSON.stringify(s)),session);
 await page.route('https://**.supabase.co/**',async route=>{
  const req=route.request(),u=new URL(req.url());let body=[],status=200;
  if(u.pathname==='/auth/v1/user')body=user;
  else if(u.pathname.includes('/auth/v1/token'))body=session;
  else if(u.pathname.endsWith('/game_profiles'))body=[profile];
  else if(u.pathname.endsWith('/game_attempts')){
   if(req.method()==='POST'){
    postCount++;if(delayPost)await new Promise(r=>setTimeout(r,350));
    if(fail){status=503;body={message:'Fixture temporary failure'}}else{
     for(const row of [].concat(req.postDataJSON())){
      const key=row.user_id+':'+row.source+':'+row.question_id;
      if(!rows.has(key)){const delta=row.correct?(row.source==='past'?7:5):1;rows.set(key,{...row,points_delta:delta});profile.points+=delta;profile.weekly_xp+=delta;profile.monthly_xp+=delta;profile[row.correct?'correct_first_attempts':'wrong_first_attempts']++;
       // Reproduce production: INSERT RETURNING still sees the default zero before the AFTER trigger's UPDATE.
       body.push({...row,points_delta:0});}
     }
    }
   }else{const key=[u.searchParams.get('user_id'),u.searchParams.get('source'),u.searchParams.get('question_id')].map(x=>x?.replace(/^eq\./,'')).join(':');body=rows.has(key)?[rows.get(key)]:[];if(failConfirmation){status=503;body={message:'Confirmation unavailable'}}}
  }else if(req.method()!=='GET')body={};
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(process.env.MED25_BASE_URL||'http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.()&&window.med25GameRecordAttempt?.__xpReliable);
 const close=page.locator('#updateNoticeClose');if(await close.isVisible())await close.click();
 await page.waitForFunction(()=>document.querySelector('.gamePoints b'));
 const past=await page.evaluate(()=>QUESTIONS.find(q=>window.med25ExamReadyPast(q)));
 const ai=await page.evaluate(()=>window.med25GameBridge.aiQuestions()[0]);
 const points=()=>profile.points;
 const pickMock=async key=>{const button=page.locator('[data-mock-answer="'+key+'"]');await button.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));await button.click()};
 await page.evaluate(keys=>window.med25Revision.startKeys(keys,'XP revision test'),['past:'+past.id,'ai:'+ai.id]);
 await page.locator('[data-revision-answer="'+past.answer+'"]').click();
 await page.waitForFunction(()=>document.querySelector('#revisionBody .questionXPStatus')?.textContent.includes('+7 XP earned'));
 await page.screenshot({path:path.join(root,'test-artifacts','xp-revision-phone.png')});
 assert.equal(points(),7);assert.equal(await page.locator('#revisionDialog #gameScoreToast.show').count(),1,'XP toast appears in the open modal');
 assert(await page.evaluate(id=>!saved[id]?.answered,past.id),'Revision keeps bank answers unchanged');
 await page.locator('#revisionNext').click();const wrong=Object.keys(ai.options).find(k=>k!==ai.answer);
 await page.locator('[data-revision-answer="'+wrong+'"]').click();
 await page.waitForFunction(()=>document.querySelector('#revisionBody .questionXPStatus')?.textContent.includes('+1 XP earned'));
 assert.equal(points(),8);await page.locator('#revisionClose').click();
 await page.evaluate(key=>window.med25Revision.startKeys([key],'No duplicate XP'), 'past:'+past.id);
 await page.locator('[data-revision-answer="'+past.answer+'"]').click();await page.evaluate(()=>window.med25RetryPendingXP());
 assert.equal(points(),8);assert((await page.locator('#revisionBody .questionXPStatus').textContent()).includes('already awarded'));
 await page.locator('#revisionClose').click();
 await page.evaluate(q=>{hubGo('questions');document.getElementById('search').value=q.stem;state.page=1;render();answer(q.id,q.answer)},past);
 await page.evaluate(()=>window.med25RetryPendingXP());assert.equal(points(),8,'Revision then bank earns once');
 await page.evaluate(()=>document.getElementById('tabMock').click());await page.locator('#mockClearCounts').click();await page.locator('[data-mock-source="past"]').click();
 await page.locator('[data-mock-subject-count]').first().fill('3');await page.locator('#mockStartBtn').click();
 const exam=await page.evaluate(()=>{const e=JSON.parse(sessionStorage.getItem('med25-active-mock-v1')).exam;return {...e,items:e.questions.map(k=>window.med25Revision.all().find(x=>x.key===k))}});
 const beforeMock=points(),beforeRows=rows.size,scoredBefore=new Set(rows.keys());const first=exam.items[0],second=exam.items[1],unanswered=exam.items[2];
 await pickMock(first.q.answer);await page.locator('#mockNext').click();
 await pickMock(Object.keys(second.q.options).find(k=>k!==second.q.answer));
 assert.equal(points(),beforeMock);assert.equal(rows.size,beforeRows,'No scoring or correctness leak during mock');
 assert.equal(await page.locator('#mockStage .questionXPStatus').count(),0);
 await page.reload();await page.waitForFunction(()=>window.med25GameBridge?.studyLibrariesReady?.());await page.locator('.mockExamShell').waitFor();
 page.on('dialog',d=>d.accept());await page.locator('#mockFinishBtn').click();await page.locator('.mockResults').waitFor();
 await page.evaluate(()=>window.med25RetryPendingXP());
 const expected=(scoredBefore.has(user.id+':'+first.key)?0:7)+(scoredBefore.has(user.id+':'+second.key)?0:1);
 assert.equal(points(),beforeMock+expected);assert(!rows.has(user.id+':'+unanswered.key),'Unanswered mock questions earn no XP');
 assert.equal(await page.locator('.mockReviewCard[data-xp-question] .questionXPStatus').count(),2);
 assert(await page.locator('.mockResults').evaluate(el=>el.getBoundingClientRect().right<=innerWidth+1),'Mock results fit the phone width');
 await page.screenshot({path:path.join(root,'test-artifacts','xp-mock-phone.png')});
 const afterMock=points();await page.reload();await page.waitForFunction(()=>window.med25GameRecordAttempt?.__xpReliable);await page.locator('.mockResults').waitFor();await page.evaluate(()=>window.med25RetryPendingXP());
 assert.equal(points(),afterMock,'Restoring submitted results never awards twice');
 await page.evaluate(q=>{hubGo('questions');document.getElementById('search').value=q.stem;state.page=1;render();answer(q.id,q.answer)},first.q);
 await page.evaluate(()=>window.med25RetryPendingXP());assert.equal(points(),afterMock,'Mock then bank earns once');
 // A mock started by one signed-in account cannot credit another account after a switch.
 await page.evaluate(()=>document.getElementById('tabMock').click());await page.locator('#mockBuildAnother').click();await page.locator('#mockClearCounts').click();await page.locator('[data-mock-subject-count]').first().fill('1');await page.locator('#mockStartBtn').click();await pickMock('A');
 const postsBeforeSwitch=postCount;await page.evaluate(()=>{currentUser={id:'00000000-0000-4000-8000-000000000099'};});await page.locator('#mockFinishBtn').click();
 assert.equal(postCount,postsBeforeSwitch,'Do not submit another account’s exam to XP scoring');assert.equal(points(),afterMock);
 await page.evaluate(u=>{currentUser=u},user);await page.locator('#mockBuildAnother').click();
 const mergedFirst=await page.evaluate(()=>{const early={owner:'guest',correct:false,locked_at:'2026-10-19T10:00:00Z'},late={owner:'guest',correct:true,locked_at:'2026-10-20T10:00:00Z'};return mergeStudyProgress({x:{revision_attempt:true,updated_at:early.locked_at,xp_first_attempt:early}},{x:{revision_attempt:true,updated_at:late.locked_at,xp_first_attempt:late}}).x.xp_first_attempt.correct});assert.equal(mergedFirst,false,'Cloud merging preserves the earliest XP attempt');
 // A failed revision award survives reload and retries using the same question identity.
 const fresh=await page.evaluate(()=>QUESTIONS.find(q=>!saved.__revision_practice__?.['past:'+q.id]?.xp_first_attempt&&!saved[q.id]?.answered&&window.med25ExamReadyPast(q)));
 fail=true;await page.evaluate(key=>window.med25Revision.startKeys([key],'Offline XP'), 'past:'+fresh.id);await page.locator('[data-revision-answer="'+fresh.answer+'"]').click();
 await page.waitForFunction(()=>document.querySelector('#revisionBody .questionXPStatus')?.textContent.includes('retrying automatically'));
 await page.reload();await page.waitForFunction(()=>window.med25GameRecordAttempt?.__xpReliable&&currentUser?.id==='00000000-0000-4000-8000-000000000007');fail=false;await page.evaluate(()=>window.med25RetryPendingXP());
 try{await page.waitForFunction(()=>JSON.parse(localStorage.getItem('med25-pending-xp-v4')||'[]').length===0)}catch(e){console.error(await page.evaluate(()=>({owner:currentUser?.id,pending:localStorage.getItem('med25-pending-xp-v4'),status:document.querySelector('#gameProfileStatus')?.textContent})));throw e}
 assert.equal(points(),afterMock+7);assert(rows.has(user.id+':past:'+fresh.id));
 assert.deepEqual(errors,[]);console.log('PASS revision right/wrong XP, visible modal status, bank/revision/mock shared duplicate protection, concealed mock scoring until submission, unanswered exclusion, result reload and offline XP retry');
 }finally{await browser.close();server.close()}})().catch(e=>{console.error(e);process.exit(1)});
